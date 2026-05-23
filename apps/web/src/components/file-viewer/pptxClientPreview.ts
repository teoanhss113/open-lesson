import JSZip from 'jszip';
import {
  projectFileUrl,
  type PresentationLayout,
  type PresentationSlideLayout,
  type PresentationSlideParagraph,
  type PresentationSlideRun,
  type PresentationSlideShape,
  type ProjectFilePreview,
  type ProjectFilePreviewSection,
} from '../../providers/registry';

/**
 * Client-side PPTX preview parser. Used both as a fallback when the
 * daemon refuses a large file and — more importantly now — as the
 * source of truth for high-fidelity slide rendering. The daemon's
 * preview JSON only carries text-run summaries, which forced the
 * renderer to fall back to a hardcoded MindX-branded template that
 * ignored real slide content. By parsing the zip in the browser we
 * have direct access to:
 *
 *   - `ppt/presentation.xml` for slide canvas size,
 *   - `ppt/slides/slide{N}.xml` for shapes, paragraphs, runs and
 *     their inline font / size / bold / italic / colour,
 *   - `ppt/slides/_rels/slide{N}.xml.rels` to resolve picture refs,
 *   - `ppt/media/*` for the actual image bytes (mounted as blob URLs
 *     so the iframe doesn't choke on multi-MB inline data URIs).
 *
 * Trade-offs:
 *
 *   - The user pays the bandwidth of streaming the .pptx down once.
 *   - The browser holds the file in memory while JSZip parses it.
 *   - We don't (yet) walk slide masters / layouts; theme colours and
 *     placeholder text inherited from masters fall through as plain
 *     defaults rather than the deck's actual styling. The common
 *     authored "title / bullets / image" slides come through fine.
 */
export type ClientPreviewError = {
  code: 'NETWORK' | 'UNZIP' | 'EMPTY' | 'UNSUPPORTED' | 'ABORTED';
  message: string;
};

const EMU_PER_PIXEL = 9525;
const DEFAULT_SLIDE_WIDTH_PX = 1280; // 13.33in @ 96dpi (PPTX widescreen)
const DEFAULT_SLIDE_HEIGHT_PX = 720;

export async function buildClientPptxPreview(
  projectId: string,
  fileName: string,
  options?: { signal?: AbortSignal },
): Promise<{ preview: ProjectFilePreview } | { error: ClientPreviewError }> {
  let buffer: ArrayBuffer;
  try {
    const url = projectFileUrl(projectId, fileName);
    const resp = await fetch(url, { signal: options?.signal });
    if (!resp.ok) {
      return {
        error: {
          code: 'NETWORK',
          message: `Failed to download file (HTTP ${resp.status}).`,
        },
      };
    }
    buffer = await resp.arrayBuffer();
  } catch (err) {
    if ((err as DOMException | null)?.name === 'AbortError') {
      return { error: { code: 'ABORTED', message: 'Local preview was cancelled.' } };
    }
    return {
      error: {
        code: 'NETWORK',
        message: err instanceof Error ? err.message : 'Failed to download file.',
      },
    };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    return {
      error: {
        code: 'UNZIP',
        message: err instanceof Error ? err.message : 'Could not unzip the .pptx archive.',
      },
    };
  }

  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(numericPathSort);
  if (slideEntries.length === 0) {
    return {
      error: { code: 'UNSUPPORTED', message: 'No slides were found inside this file.' },
    };
  }

  const dims = await readSlideDimensions(zip);

  const sections: ProjectFilePreviewSection[] = [];
  const slides: PresentationSlideLayout[] = [];
  for (let i = 0; i < slideEntries.length; i += 1) {
    const entryName = slideEntries[i];
    if (!entryName) continue;
    const file = zip.file(entryName);
    if (!file) continue;

    let xml = '';
    try {
      xml = await file.async('text');
    } catch {
      xml = '';
    }

    // Slide-local relationships, used to dereference picture rIds.
    const slideNumber = /(\d+)\.xml$/.exec(entryName)?.[1];
    const relsEntry = slideNumber
      ? zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`)
      : null;
    let relsXml = '';
    if (relsEntry) {
      try {
        relsXml = await relsEntry.async('text');
      } catch {
        relsXml = '';
      }
    }
    const rels = parseRels(relsXml);

    const { shapes, title, lines } = await parseSlide(xml, rels, zip);

    sections.push({
      title: title || `Slide ${i + 1}`,
      lines: lines.length > 0 ? lines : ['No readable text found.'],
    });
    slides.push({ title: title || `Slide ${i + 1}`, shapes });
  }

  if (sections.length === 0) {
    return { error: { code: 'EMPTY', message: 'Slides were found but had no text.' } };
  }

  const layout: PresentationLayout = {
    width: dims.width,
    height: dims.height,
    slides,
  };

  return {
    preview: {
      kind: 'presentation',
      title: basename(fileName),
      sections,
      slideLayout: layout,
    },
  };
}

/**
 * Pull the .pptx's built-in cover thumbnail (every Microsoft-saved
 * deck includes `docProps/thumbnail.jpeg`). Returned as a data URL
 * so callers can drop it into an <img> without managing object
 * URL lifecycle. Used as a quick poster while the heavier slide
 * parse is still running.
 */
export async function extractPptxCoverThumbnail(
  projectId: string,
  fileName: string,
): Promise<string | null> {
  try {
    const resp = await fetch(projectFileUrl(projectId, fileName));
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const candidates = [
      'docProps/thumbnail.jpeg',
      'docProps/thumbnail.jpg',
      'docProps/thumbnail.png',
    ];
    for (const name of candidates) {
      const entry = zip.file(name);
      if (!entry) continue;
      const blob = await entry.async('base64');
      const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${blob}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function readSlideDimensions(zip: JSZip): Promise<{ width: number; height: number }> {
  const entry = zip.file('ppt/presentation.xml');
  if (!entry) return { width: DEFAULT_SLIDE_WIDTH_PX, height: DEFAULT_SLIDE_HEIGHT_PX };
  try {
    const xml = await entry.async('text');
    const m = /<p:sldSz\b[^>]*>/.exec(xml);
    if (!m) return { width: DEFAULT_SLIDE_WIDTH_PX, height: DEFAULT_SLIDE_HEIGHT_PX };
    const cx = Number(/cx="(\d+)"/.exec(m[0])?.[1] ?? 0);
    const cy = Number(/cy="(\d+)"/.exec(m[0])?.[1] ?? 0);
    if (!cx || !cy) return { width: DEFAULT_SLIDE_WIDTH_PX, height: DEFAULT_SLIDE_HEIGHT_PX };
    return {
      width: Math.round(cx / EMU_PER_PIXEL),
      height: Math.round(cy / EMU_PER_PIXEL),
    };
  } catch {
    return { width: DEFAULT_SLIDE_WIDTH_PX, height: DEFAULT_SLIDE_HEIGHT_PX };
  }
}

type RelsMap = Record<string, { target: string; type: string }>;

function parseRels(xml: string): RelsMap {
  const map: RelsMap = {};
  if (!xml) return map;
  const re = /<Relationship\b([^>]*)\/?>/g;
  for (const m of xml.matchAll(re)) {
    const attrs = parseAttrs(m[1] ?? '');
    if (attrs.Id) {
      map[attrs.Id] = { target: attrs.Target ?? '', type: attrs.Type ?? '' };
    }
  }
  return map;
}

async function parseSlide(
  xml: string,
  rels: RelsMap,
  zip: JSZip,
): Promise<{ shapes: PresentationSlideShape[]; title: string; lines: string[] }> {
  const shapes: PresentationSlideShape[] = [];
  let title = '';
  const lines: string[] = [];

  // Walk shapes in document order so z-index follows source ordering
  // (later shapes paint on top). Both <p:sp> (text/auto-shape) and
  // <p:pic> (picture) live inside <p:spTree>, sometimes nested inside
  // <p:grpSp> groups; a global match across the slide XML preserves
  // visual order without depth-first traversal.
  const shapeRe = /<(p:sp|p:pic)\b[\s\S]*?<\/\1>/g;
  let z = 0;
  for (const sm of xml.matchAll(shapeRe)) {
    const tag = sm[1];
    const block = sm[0];
    const xfrm = parseXfrm(block);
    if (tag === 'p:pic') {
      const embed = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(block)?.[1];
      if (!embed) continue;
      const rel = rels[embed];
      if (!rel) continue;
      const target = rel.target;
      if (!target) continue;
      // Targets are normally `../media/image1.png`; normalise to the
      // archive root so we can look the entry up.
      const resolved = resolveRelTarget(target);
      const src = await readImageAsBlobUrl(zip, resolved);
      if (!src) continue;
      shapes.push({
        kind: 'image',
        x: xfrm.x,
        y: xfrm.y,
        w: xfrm.w,
        h: xfrm.h,
        rot: xfrm.rot,
        src,
        z: z++,
      });
      continue;
    }

    // Text shape — extract paragraphs and runs with inline styling.
    const txBodyMatch = /<p:txBody\b[\s\S]*?<\/p:txBody>/.exec(block);
    if (!txBodyMatch) continue;
    const paragraphs = parseParagraphs(txBodyMatch[0]);
    if (!paragraphs.length) continue;

    // Capture plain-text lines for the daemon-compatible sections
    // summary, and pick the first non-empty line as the slide title
    // heuristic (matches what the daemon does today).
    for (const p of paragraphs) {
      const text = p.runs.map((r) => r.text).join('').trim();
      if (!text) continue;
      if (!title) title = text;
      lines.push(text);
    }

    const fill = parseShapeFill(block);
    shapes.push({
      kind: 'text',
      x: xfrm.x,
      y: xfrm.y,
      w: xfrm.w,
      h: xfrm.h,
      rot: xfrm.rot,
      paragraphs,
      fill,
      z: z++,
    });
  }

  return { shapes, title, lines };
}

function parseXfrm(block: string): { x: number; y: number; w: number; h: number; rot?: number } {
  const xfrm = /<a:xfrm\b([^>]*)>([\s\S]*?)<\/a:xfrm>/.exec(block);
  if (!xfrm) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
  const inner = xfrm[2] ?? '';
  const offM = /<a:off\b([^/>]*)\/?>/.exec(inner);
  const extM = /<a:ext\b([^/>]*)\/?>/.exec(inner);
  const offAttrs = parseAttrs(offM?.[1] ?? '');
  const extAttrs = parseAttrs(extM?.[1] ?? '');
  const rotAttr = parseAttrs(xfrm[1] ?? '').rot;
  const rot = rotAttr ? Number(rotAttr) / 60000 : undefined;
  return {
    x: emuToPx(Number(offAttrs.x ?? 0)),
    y: emuToPx(Number(offAttrs.y ?? 0)),
    w: emuToPx(Number(extAttrs.cx ?? 0)),
    h: emuToPx(Number(extAttrs.cy ?? 0)),
    rot,
  };
}

function parseShapeFill(block: string): string | undefined {
  // Only pick fills declared directly on the shape's spPr; ignore
  // any fills inside child txBody / runs.
  const spPr = /<p:spPr\b[\s\S]*?<\/p:spPr>/.exec(block);
  if (!spPr) return undefined;
  const inner = spPr[0];
  const solid = /<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/.exec(inner);
  return solid?.[1];
}

function parseParagraphs(txBody: string): PresentationSlideParagraph[] {
  const paragraphs: PresentationSlideParagraph[] = [];
  const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  for (const pm of txBody.matchAll(pRe)) {
    const body = pm[1] ?? '';
    const pPrM = /<a:pPr\b([^/>]*)(?:\/>|>([\s\S]*?)<\/a:pPr>)/.exec(body);
    const pPrAttrs = parseAttrs(pPrM?.[1] ?? '');
    const pPrBody = pPrM?.[2] ?? '';
    const alignRaw = pPrAttrs.algn as 'l' | 'ctr' | 'r' | 'just' | undefined;
    const lvlNum = pPrAttrs.lvl ? Number(pPrAttrs.lvl) : 0;
    // Bullet detection: explicit <a:buChar>/<a:buAutoNum> = bullet,
    // <a:buNone/> = no bullet. Default depends on level, but most
    // authored decks set this explicitly. Treat presence of any
    // bullet element (other than buNone) as a bullet line.
    let bullet: number | null = null;
    if (pPrBody) {
      if (/<a:buNone\b/.test(pPrBody)) bullet = null;
      else if (/<a:buChar\b|<a:buAutoNum\b/.test(pPrBody)) bullet = lvlNum;
    }

    const runs: PresentationSlideRun[] = [];
    const rRe = /<a:r\b[^>]*>([\s\S]*?)<\/a:r>|<a:br\b[^>]*\/>/g;
    for (const rm of body.matchAll(rRe)) {
      if (rm[0].startsWith('<a:br')) {
        runs.push({ text: '\n' });
        continue;
      }
      const runBody = rm[1] ?? '';
      const rPrM = /<a:rPr\b([^/>]*)(?:\/>|>([\s\S]*?)<\/a:rPr>)/.exec(runBody);
      const rPrAttrs = parseAttrs(rPrM?.[1] ?? '');
      const rPrBody = rPrM?.[2] ?? '';
      const textM = /<a:t[^>]*>([\s\S]*?)<\/a:t>/.exec(runBody);
      if (!textM) continue;
      const text = decodeXml(textM[1] ?? '');
      const run: PresentationSlideRun = { text };
      if (rPrAttrs.sz) run.size = Number(rPrAttrs.sz) / 100;
      if (rPrAttrs.b === '1' || rPrAttrs.b === 'true') run.bold = true;
      if (rPrAttrs.i === '1' || rPrAttrs.i === 'true') run.italic = true;
      if (rPrAttrs.u && rPrAttrs.u !== 'none') run.underline = true;
      const latin = /<a:latin\s+typeface="([^"]+)"/.exec(rPrBody)?.[1];
      if (latin) run.font = latin;
      const colorHex = /<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/.exec(rPrBody)?.[1];
      if (colorHex) run.color = colorHex;
      runs.push(run);
    }
    if (runs.length === 0) {
      // Empty paragraph — keep as a blank line for spacing.
      paragraphs.push({ runs: [{ text: '' }], align: alignRaw, bullet });
      continue;
    }
    paragraphs.push({ runs, align: alignRaw, bullet });
  }
  return paragraphs;
}

async function readImageAsBlobUrl(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  try {
    // Use a blob URL rather than a data URL — large images encoded
    // as data URIs in `<img src>` were the source of the original
    // `ERR_INVALID_URL` console spam (Chrome refuses URLs that
    // exceed ~2 MB and the previous template inlined the same
    // bogus base64 logo on every slide). Blob URLs are arbitrarily
    // large and stream from memory, and they survive the iframe
    // sandbox the same way `data:image/*` URLs do for <img>.
    const blob = await entry.async('blob');
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function resolveRelTarget(target: string): string {
  // PPTX rels paths are relative to `ppt/slides/`, e.g.
  // `../media/image1.png` → `ppt/media/image1.png`.
  const parts = `ppt/slides/${target}`.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    if (m[1]) attrs[m[1]] = decodeXml(m[2] ?? '');
  }
  return attrs;
}

function decodeXml(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function emuToPx(emu: number): number {
  return Math.round(emu / EMU_PER_PIXEL);
}

function numericPathSort(a: string, b: string): number {
  const an = Number(/(\d+)(?=\.xml$)/.exec(a)?.[1] ?? 0);
  const bn = Number(/(\d+)(?=\.xml$)/.exec(b)?.[1] ?? 0);
  return an - bn || a.localeCompare(b);
}

function basename(name: string): string {
  const slash = name.replace(/\\/g, '/').lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}
