import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { buildSrcdoc } from '../../runtime/srcdoc';
import { buildClientPptxPreview } from './pptxClientPreview';
import type {
  PresentationLayout,
  PresentationSlideLayout,
  PresentationSlideParagraph,
  PresentationSlideRun,
  PresentationSlideShape,
} from '../../providers/registry';

/**
 * Slide viewer that mirrors `DocxViewer` exactly:
 *
 *   - Same sandboxed iframe + `buildSrcdoc(...)` shell, with
 *     `commentBridge`, `inspectBridge`, `paletteBridge` and
 *     `editBridge` enabled, so Comment / Inspect / palette / edit
 *     features all hang off `[data-od-id]` element annotations the
 *     same way they do for `.docx`.
 *   - Real DOM rendered into the iframe (no canvas, no Office Web
 *     viewer iframe) — each shape, paragraph and image is a real
 *     `<div>` / `<p>` / `<img>` element so selection, hover, and
 *     bridge clicks all work natively.
 *   - We do the .pptx parse client-side via `buildClientPptxPreview`
 *     (JSZip → slide XML → shape positions, runs, fonts, embedded
 *     images) and lay shapes out with absolute positioning relative
 *     to the slide canvas. This intentionally throws away the
 *     buggy `compilePptxToHtml` template — including the malformed
 *     `data:image/png;base64,…` MindX logo that produced the
 *     `ERR_INVALID_URL` console spam.
 *
 * The host (`DocumentPreviewViewer`, `SlidePreview`) postMessages
 * `{ type: 'od:slide', action: 'next' | 'prev' | 'go', index? }`
 * to drive the deck and listens for `{ type: 'od:slide-state' }`
 * back. The deck bridge in `runtime/srcdoc.ts` handles those
 * messages by toggling `.active` between `.slide` siblings, exactly
 * like every other deck artifact in the workspace.
 */
export function PptxViewer({
  projectId,
  fileName,
  iframeRef,
  selectedPalette,
  onLoad,
  initialSlideIndex,
}: {
  projectId: string;
  fileName: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null> | any;
  selectedPalette: string | null;
  onLoad?: (info: { slideCount: number }) => void;
  initialSlideIndex?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Track blob URLs we minted for embedded slide images so we can
  // revoke them when the file (or component) goes away. Without
  // this, opening 10 decks in a session leaks ~10×N image blobs.
  const blobUrlsRef = useRef<Set<string>>(new Set());
  // Snapshot the initial slide index at mount time. Subsequent host
  // updates to the `initialSlideIndex` prop are routed via
  // postMessage instead of by rebaking the srcDoc (see the memo
  // below). Both the rendered DOM and the bridge use this mount
  // snapshot so they always agree on which slide starts active.
  const mountSlideIndexRef = useRef(initialSlideIndex ?? 0);

  // CRITICAL: `srcDoc` MUST be stable per (project, file, palette).
  // The original implementation interpolated `initialSlideIndex`
  // into `buildSrcdoc`, so every host-side `setActiveSlide(n)` call
  // produced a brand-new srcDoc string. React then propagated that
  // change to the live <iframe srcDoc=...> attribute, which forces
  // the browser to throw away the iframe's current document and
  // reload from the new srcDoc — wiping the rendered slides, the
  // deck bridge state, and our shape DOM. The iframe element keeps
  // its `data-pptx-loaded="true"` attribute across that reload, so
  // `handleIframeLoad` short-circuits and the user is left staring
  // at the dark body background of an empty iframe — exactly the
  // "next slide is black" bug. We instead bake initialSlideIndex
  // into the bridge once at boot and rely on `od:slide` postMessage
  // for every subsequent navigation, which is what the deck bridge
  // is designed for.
  const srcDoc = useMemo(
    () =>
      buildSrcdoc(
        `<div id="pptx-viewer-root" class="pptx-viewer-root" data-pptx-empty="1"></div>`,
        {
          commentBridge: true,
          inspectBridge: true,
          paletteBridge: true,
          editBridge: true,
          deck: true,
          initialSlideIndex: mountSlideIndexRef.current,
          initialPalette: selectedPalette,
        },
      ),
    // Intentionally exclude `initialSlideIndex` — see the comment
    // above. We snapshot it via `mountSlideIndexRef` on the very
    // first render and replay any subsequent host-driven changes
    // through postMessage instead of through srcDoc churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPalette],
  );

  useEffect(() => {
    return () => {
      revokeBlobs(blobUrlsRef.current);
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    revokeBlobs(blobUrlsRef.current);

    const iframe = iframeRef.current;
    if (iframe) {
      // The iframe element is keyed on (project, file, palette) so
      // changing any of those remounts it; we still defensively
      // clear the loaded flag here so a `forceReload` (e.g. the
      // reload button in the host toolbar) re-renders cleanly.
      iframe.removeAttribute('data-pptx-loaded');
      if ((iframe as any)._pptxMutationObserver) {
        try {
          (iframe as any)._pptxMutationObserver.disconnect();
          delete (iframe as any)._pptxMutationObserver;
        } catch (e) {
          console.error('Error disconnecting pptx observer', e);
        }
      }
    }
  }, [projectId, fileName]);

  // Forward host-driven `initialSlideIndex` changes through
  // postMessage instead of srcDoc, which keeps the iframe content
  // alive across navigations. Without this, the only way the host
  // could move slides was by changing srcDoc — which reloaded the
  // iframe and produced the "black slide 2" bug. The deck bridge
  // listens for `{ type: 'od:slide', action: 'go', index: N }` and
  // toggles `.active` between `.slide` siblings.
  useEffect(() => {
    if (loading) return;
    if (typeof initialSlideIndex !== 'number') return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'od:slide', action: 'go', index: initialSlideIndex },
      '*',
    );
  }, [initialSlideIndex, loading]);

  const handleIframeLoad = async (event?: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = (event?.currentTarget || iframeRef.current) as HTMLIFrameElement | null;
    if (!iframe || !iframe.contentDocument) return;
    if (iframe.getAttribute('data-pptx-loaded') === 'true') return;

    const root = iframe.contentDocument.getElementById('pptx-viewer-root');
    if (!root) return;

    iframe.setAttribute('data-pptx-loaded', 'true');

    try {
      // Inject styles before rendering shapes so absolute-positioned
      // boxes don't flash unstyled while the parser is still
      // running. We could put these into the source srcDoc, but
      // keeping them out of the bridge-template stays consistent
      // with how DocxViewer injects its docx-specific styles.
      const doc = iframe.contentDocument;
      const style = doc.createElement('style');
      style.textContent = PPTX_VIEWER_CSS;
      doc.head.appendChild(style);

      const result = await buildClientPptxPreview(projectId, fileName);
      if ('error' in result) {
        throw new Error(result.error.message);
      }
      const layout = result.preview.slideLayout;
      if (!layout || layout.slides.length === 0) {
        throw new Error('This presentation has no readable slides.');
      }

      root.removeAttribute('data-pptx-empty');
      // Same mount snapshot the srcDoc was baked with — both must
      // agree on which slide starts visible so the bridge's
      // restoreInitialSlide() pass and the React-side render
      // converge on the same `.active` slide.
      renderDeck(
        doc,
        root,
        layout,
        mountSlideIndexRef.current,
        blobUrlsRef.current,
      );

      // After the initial paint, watch for any later DOM tweaks
      // (e.g. the bridges adding their own annotations) and re-tag
      // any newly-introduced elements so Comment / Inspect can hover
      // / click them too. This mirrors the docx viewer's observer.
      const observer = new MutationObserver(() => {
        annotateForBridges(root);
      });
      observer.observe(root, { childList: true, subtree: true });
      (iframe as any)._pptxMutationObserver = observer;

      setLoading(false);
      if (onLoad) onLoad({ slideCount: layout.slides.length });
    } catch (err) {
      console.error(err);
      iframe.removeAttribute('data-pptx-loaded');
      setError(err instanceof Error ? err.message : 'Failed to render presentation');
      setLoading(false);
    }
  };

  // Belt-and-suspenders: if the onLoad attribute fires before
  // `iframeRef` resolves we want to retry once the ref is real.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentDocument) {
      const root = iframe.contentDocument.getElementById('pptx-viewer-root');
      if (root && iframe.getAttribute('data-pptx-loaded') !== 'true') {
        void handleIframeLoad();
      }
    }
    // We intentionally do not include `handleIframeLoad` in the
    // deps; it's recreated every render and would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileName, loading]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        // White, not the near-black `--bg-panel` we used to fall
        // back to. When the iframe takes a moment to render its
        // slides, users now see a clean canvas instead of a flat
        // dark rectangle that masquerades as a broken viewer.
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--text-muted, #6b7280)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
            zIndex: 10,
          }}
        >
          Đang chuẩn bị slide...
        </div>
      )}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--text-danger, #ef4444)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
            zIndex: 10,
            textAlign: 'center',
            maxWidth: 360,
            padding: '0 16px',
          }}
        >
          {error}
        </div>
      )}
      <iframe
        key={`${projectId}-${fileName}-${selectedPalette}`}
        ref={iframeRef}
        data-testid="artifact-preview-frame"
        data-od-render-mode="srcdoc"
        title={fileName}
        sandbox="allow-scripts allow-downloads allow-same-origin"
        srcDoc={srcDoc}
        onLoad={handleIframeLoad}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#ffffff',
        }}
      />
    </div>
  );
}

function revokeBlobs(set: Set<string>): void {
  for (const url of set) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  set.clear();
}

/**
 * Render the deck into the iframe's container as honest DOM (each
 * shape is a real element). Slide 0 receives `.active`; the
 * `injectDeckBridge` in runtime/srcdoc.ts handles prev/next.
 */
function renderDeck(
  doc: Document,
  root: HTMLElement,
  layout: PresentationLayout,
  initialIndex: number,
  blobUrls: Set<string>,
): void {
  root.innerHTML = '';

  // Compute a "stage" wrapper sized to the slide canvas. The bridge
  // and the host both expect `.deck-stage` with one `.slide` per
  // section; matching the convention used by every other deck-style
  // artifact in this codebase keeps the deck-fix CSS in srcdoc.ts
  // applicable verbatim.
  const shell = doc.createElement('div');
  shell.className = 'deck-shell';

  const stage = doc.createElement('div');
  stage.className = 'deck-stage';
  stage.id = 'deck-stage';
  stage.style.setProperty('--slide-w', `${layout.width}px`);
  stage.style.setProperty('--slide-h', `${layout.height}px`);
  stage.style.width = `${layout.width}px`;
  stage.style.height = `${layout.height}px`;

  layout.slides.forEach((slide, idx) => {
    stage.appendChild(renderSlide(doc, slide, idx, layout, initialIndex, blobUrls));
  });

  shell.appendChild(stage);
  root.appendChild(shell);

  // Initial annotation pass. The mutation observer above keeps it
  // current if a bridge or palette swap later mutates the tree.
  annotateForBridges(root);

  installStageFitter(doc, stage, layout);
}

/**
 * The PPTX canvas is a fixed-size rectangle (typically 1280×720 or
 * the actual slide size in the deck). To make it fit the iframe
 * regardless of the user's window / preview-pane size we scale the
 * stage with `transform: scale(N)` on every resize. The math is the
 * same as every other fixed-canvas deck artifact in the codebase —
 * we keep it inline so the parent host doesn't need to know slide
 * geometry to drive the scale.
 */
function installStageFitter(
  doc: Document,
  stage: HTMLElement,
  layout: PresentationLayout,
): void {
  const win = doc.defaultView;
  if (!win) return;
  const fit = () => {
    const availW = win.innerWidth || doc.documentElement.clientWidth || 1;
    const availH = win.innerHeight || doc.documentElement.clientHeight || 1;
    const scale = Math.min(availW / layout.width, availH / layout.height);
    stage.style.transform = `scale(${scale})`;
    stage.style.transformOrigin = 'top left';
    // The deck-bridge style fix in runtime/srcdoc.ts force-sets the
    // stage to `position: absolute; top: 0 !important; left: 0
    // !important`, so we can't rely on `top/left` for centering.
    // Use a translate inside the same transform — the !important
    // top/left still parks the box at the iframe origin but the
    // translate moves it into the centre.
    const offsetX = Math.max(0, (availW - layout.width * scale) / 2);
    const offsetY = Math.max(0, (availH - layout.height * scale) / 2);
    stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  };
  fit();
  win.addEventListener('resize', fit);
  // The host may toggle zoom / sidebar / present mode without firing
  // a window resize; observe the documentElement so we still rescale.
  if (typeof win.ResizeObserver !== 'undefined') {
    try {
      const ro = new win.ResizeObserver(() => fit());
      ro.observe(doc.documentElement);
    } catch {
      /* ignore — the bridge will fire a fallback resize too */
    }
  }
  // Slide navigation should never need a re-fit (the stage is
  // identical), but as a safety net re-fit on every od:slide
  // postMessage. This also catches the case where the iframe was
  // 0x0 when the deck booted (sandbox preview, hidden tab) — once
  // the host posts the first slide message the canvas resizes.
  win.addEventListener('message', (ev) => {
    const data = (ev as MessageEvent).data;
    if (data && data.type === 'od:slide') fit();
  });
}

function renderSlide(
  doc: Document,
  slide: PresentationSlideLayout,
  idx: number,
  layout: PresentationLayout,
  initialIndex: number,
  blobUrls: Set<string>,
): HTMLElement {
  const section = doc.createElement('section');
  section.className = `slide${idx === initialIndex ? ' active' : ''}`;
  section.setAttribute('data-slide-index', String(idx));
  section.setAttribute('data-screen-label', slide.title || `Slide ${idx + 1}`);
  if (slide.background) section.style.background = `#${slide.background}`;

  const shapes = (slide.shapes || []).slice().sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const shape of shapes) {
    const node = renderShape(doc, shape, layout, blobUrls);
    if (node) section.appendChild(node);
  }

  const counter = doc.createElement('div');
  counter.className = 'slide-counter';
  counter.textContent = `${idx + 1} / ${layout.slides.length}`;
  section.appendChild(counter);

  return section;
}

function renderShape(
  doc: Document,
  shape: PresentationSlideShape,
  layout: PresentationLayout,
  blobUrls: Set<string>,
): HTMLElement | null {
  const x = clamp(shape.x, -layout.width, layout.width * 2);
  const y = clamp(shape.y, -layout.height, layout.height * 2);
  const w = Math.max(0, shape.w);
  const h = Math.max(0, shape.h);
  const el = doc.createElement('div');
  el.className = `slide-shape ${shape.kind}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  if (shape.rot) el.style.transform = `rotate(${shape.rot}deg)`;

  if (shape.kind === 'image') {
    if (!shape.src) return null;
    const img = doc.createElement('img');
    img.src = shape.src;
    img.alt = '';
    if (shape.src.startsWith('blob:')) blobUrls.add(shape.src);
    el.appendChild(img);
    return el;
  }

  if (shape.fill) el.style.background = `#${shape.fill}`;
  const paragraphs = shape.paragraphs ?? [];
  if (paragraphs.length === 0) return null;
  for (const p of paragraphs) {
    el.appendChild(renderParagraph(doc, p));
  }
  return el;
}

function renderParagraph(doc: Document, p: PresentationSlideParagraph): HTMLElement {
  const align = alignFor(p.align);
  const isBullet = p.bullet != null;
  const level = Math.min(2, Math.max(0, p.bullet ?? 0));
  const para = doc.createElement('p');
  if (isBullet) para.className = `bullet lvl-${level}`;
  if (align) para.style.textAlign = align;

  const runs = p.runs ?? [];
  if (runs.length === 0) {
    para.appendChild(doc.createTextNode('\u00A0'));
    return para;
  }
  for (const run of runs) {
    para.appendChild(renderRun(doc, run));
  }
  return para;
}

function renderRun(doc: Document, run: PresentationSlideRun): Node {
  if (run.text === '\n') {
    return doc.createElement('br');
  }
  const span = doc.createElement('span');
  if (run.font) span.style.fontFamily = `${quoteFontFamily(run.font)}, ${SLIDE_FONT_STACK}`;
  if (run.size) span.style.fontSize = `${run.size}px`;
  if (run.color) span.style.color = `#${run.color}`;
  if (run.bold) span.style.fontWeight = '700';
  if (run.italic) span.style.fontStyle = 'italic';
  if (run.underline) span.style.textDecoration = 'underline';
  span.appendChild(doc.createTextNode(run.text));
  return span;
}

/**
 * Walk the rendered DOM and annotate every meaningful element with
 * `data-od-id="pptx-{tag}-{index}"`. The bridge selectors in
 * runtime/srcdoc.ts pick up these annotations for hover, click
 * (Comment), and Inspect overrides. Matches the docx pattern so
 * Comment / Inspect work without bespoke pptx code paths.
 */
function annotateForBridges(root: HTMLElement): void {
  const skip = new Set([
    'script', 'style', 'template', 'noscript', 'br', 'meta', 'link',
  ]);
  let counter = 0;
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    if (el.hasAttribute('data-od-id')) return;
    const tag = el.tagName.toLowerCase();
    if (skip.has(tag)) return;
    el.setAttribute('data-od-id', `pptx-${tag}-${counter++}`);
  });
}

function alignFor(a: PresentationSlideParagraph['align']): string | null {
  if (!a) return null;
  if (a === 'ctr') return 'center';
  if (a === 'r') return 'right';
  if (a === 'just') return 'justify';
  return 'left';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function quoteFontFamily(name: string): string {
  const cleaned = name.replace(/["';{}]/g, '').trim();
  if (!cleaned) return 'inherit';
  return /\s/.test(cleaned) ? `'${cleaned}'` : cleaned;
}

const SLIDE_FONT_STACK =
  "'Be Vietnam Pro', 'Inter', 'Segoe UI', 'Helvetica Neue', 'Arial', 'Noto Sans', sans-serif";

// Styles injected into the iframe's `<head>` after render. Kept in a
// constant for easy diffing against the docx viewer's equivalent.
const PPTX_VIEWER_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  /* White, not the near-black panel colour from the host theme.
     The previous dark default leaked through whenever the deck
     bridge couldn't show a slide (e.g. mid-reload), which the user
     interpreted as a broken next-slide screen. */
  background: #ffffff;
  color: #1f2937;
  font: 16px/1.5 ${SLIDE_FONT_STACK};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.pptx-viewer-root {
  width: 100%;
  height: 100%;
  position: relative;
}
.pptx-viewer-root[data-pptx-empty="1"]::before {
  content: '';
  position: absolute;
  inset: 0;
}
.deck-shell {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.deck-stage {
  background: #ffffff;
  position: relative;
  transform-origin: top left;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  flex-shrink: 0;
}
.slide {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #ffffff;
}
.slide:not(.active) { display: none !important; }
.slide.active { display: block; }
.slide-shape {
  position: absolute;
  word-break: break-word;
  white-space: pre-wrap;
  overflow: hidden;
}
.slide-shape.text {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 4px 6px;
}
.slide-shape.image img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
.slide-shape p {
  line-height: 1.25;
  margin: 0;
}
.slide-shape p + p { margin-top: 4px; }
.slide-shape .bullet { position: relative; padding-left: 1.1em; }
.slide-shape .bullet::before { content: "\\2022"; position: absolute; left: 0; top: 0; color: currentColor; opacity: 0.7; }
.slide-shape .bullet.lvl-1 { padding-left: 2em; }
.slide-shape .bullet.lvl-1::before { left: 0.9em; content: "\\25E6"; }
.slide-shape .bullet.lvl-2 { padding-left: 2.9em; }
.slide-shape .bullet.lvl-2::before { left: 1.8em; content: "\\25AA"; }
.slide-counter {
  position: absolute;
  bottom: 14px;
  right: 18px;
  font-size: 12px;
  color: rgba(0,0,0,0.45);
  z-index: 10;
  pointer-events: none;
}

/* Fit-stage helper — scale the fixed-size canvas to the iframe. */
.deck-stage {
  /* Re-applied by the deck bridge's stage fitter, but we provide a
     fallback transform so even a single repaint shows the deck. */
  transform: none;
}
`;
