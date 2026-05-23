import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { EXTRACTED_DOCUMENT_MEDIA_DIR } from '@open-design/contracts';
import { kindFor } from './projects.js';

const execFileP = promisify(execFile);
// These ceilings cap how much memory the daemon will allocate per preview
// request. Real curriculum slide decks routinely run 150–250 MB once
// video / poster art is embedded, so the old 100 MB cap rejected the
// most common large-PPTX case and forced clients into a graceless
// "preview unavailable" state. Raise to 500 MB compressed / 1 GB
// uncompressed; anything bigger still falls back to the client-side
// JSZip parser on the web app, so the daemon doesn't become the only
// path to a slide preview.
const MAX_COMPRESSED_PREVIEW_BYTES = 500 * 1024 * 1024;
const MAX_UNCOMPRESSED_PREVIEW_BYTES = 1024 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_PDF_PREVIEW_CONCURRENCY = 2;
const pdfPreviewQueue = createLimiter(MAX_PDF_PREVIEW_CONCURRENCY);

type PreviewKind = 'pdf' | 'document' | 'presentation' | 'spreadsheet';
type PreviewSection = { title: string; lines: string[] };
type PreviewFile = { name: string; buffer: Buffer };
type XmlAttrs = Record<string, string>;
type WorkbookSheet = { name: string; path: string };
type ZipEntryWithSize = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: number };
};

class PreviewHttpError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'PreviewHttpError';
  }
}

async function extractAndSaveZipImages(
  zip: JSZip,
  originalFilename: string,
  projectDir: string,
  mediaFolder: string,
): Promise<string[]> {
  const extractedFiles: string[] = [];
  const sourceSlug = sourceMediaSlug(originalFilename);
  const targetDir = path.join(projectDir, EXTRACTED_DOCUMENT_MEDIA_DIR, sourceSlug);

  const mediaEntries = Object.keys(zip.files).filter((name) => {
    const entry = zip.files[name];
    const lowerName = name.toLowerCase();
    const isTargetMedia =
      lowerName.startsWith(mediaFolder.toLowerCase()) ||
      lowerName.startsWith('media/');
    return isTargetMedia && entry !== undefined && !entry.dir;
  });

  if (mediaEntries.length === 0) {
    return [];
  }

  await rm(targetDir, { recursive: true, force: true }).catch(() => {});

  for (const entryName of mediaEntries) {
    const entry = zip.file(entryName);
    if (!entry) continue;

    const baseName = sanitizeMediaAssetName(path.basename(entryName));
    const targetFileName = await uniqueMediaAssetName(targetDir, baseName);
    const targetPath = path.join(targetDir, targetFileName);
    const relativeTarget = path.posix.join(EXTRACTED_DOCUMENT_MEDIA_DIR, sourceSlug, targetFileName);

    try {
      const buffer = await entry.async('nodebuffer');
      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, buffer);
      extractedFiles.push(relativeTarget);
    } catch (err) {
      console.error(`Failed to extract zip media entry ${entryName}:`, err);
    }
  }

  return extractedFiles;
}

function sourceMediaSlug(originalFilename: string): string {
  const ext = path.extname(originalFilename).toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = path.basename(originalFilename, path.extname(originalFilename));
  const stem = base.normalize('NFC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
  if (stem) return ext ? `${stem}-${ext}` : stem;
  return ext || 'document';
}

/** Backward-compatible slug without extension — used to find media
 *  created before the ext-suffix was added. */
function sourceMediaSlugLegacy(originalFilename: string): string {
  const base = path.basename(originalFilename, path.extname(originalFilename));
  return base.normalize('NFC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'document';
}

function sanitizeMediaAssetName(raw: string): string {
  const parsed = path.parse(raw);
  const name = (parsed.name || 'image')
    .normalize('NFC')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+|_+$/g, '') || 'image';
  const ext = parsed.ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  return `${name}${ext || '.bin'}`;
}

async function uniqueMediaAssetName(dir: string, preferredName: string): Promise<string> {
  const parsed = path.parse(preferredName);
  let candidate = preferredName;
  for (let i = 2; ; i += 1) {
    try {
      await readFile(path.join(dir, candidate));
      candidate = `${parsed.name}-${i}${parsed.ext}`;
    } catch (err: any) {
      if (err?.code === 'ENOENT') return candidate;
      return candidate;
    }
  }
}

async function extractAndSavePdfImages(
  buffer: Buffer,
  originalFilename: string,
  projectDir: string,
): Promise<string[]> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'od-pdf-media-'));
  const inputFile = path.join(tmpDir, 'input.pdf');
  const extractedFiles: string[] = [];
  const sourceSlug = sourceMediaSlug(originalFilename);
  const targetDir = path.join(projectDir, EXTRACTED_DOCUMENT_MEDIA_DIR, sourceSlug);

  try {
    await writeFile(inputFile, buffer, { flag: 'wx' });

    // Strategy 1: pdfimages extracts embedded image objects (photos, logos).
    let entries: string[] = [];
    try {
      const prefix = path.join(tmpDir, 'image');
      await execFileP('pdfimages', ['-png', inputFile, prefix], {
        timeout: 15_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      entries = (await readdir(tmpDir))
        .filter((name) => /^image-\d+\.(?:png|ppm|pbm|jpg|jpeg)$/i.test(name))
        .sort(numericPathSort);
    } catch {
      // pdfimages not available — try pdftoppm (also from poppler-utils)
    }

    // Strategy 2: pdftoppm renders each page as a PNG (great for slide previews).
    if (entries.length === 0) {
      try {
        const prefix = path.join(tmpDir, 'slide');
        await execFileP('pdftoppm', ['-png', '-r', '150', inputFile, prefix], {
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        entries = (await readdir(tmpDir))
          .filter((name) => /slide-\d+\.\w+/.test(name))
          .sort(numericPathSort);
      } catch {
        console.warn(
          'PDF image extraction requires poppler-utils.\n' +
          '  Install it with:  brew install poppler   (macOS)\n' +
          '  or:               apt install poppler-utils  (Linux)\n' +
          '  Will skip PDF image extraction for:', originalFilename,
        );
      }
    }

    if (entries.length > 0) {
      await rm(targetDir, { recursive: true, force: true }).catch(() => {});
    }

    for (const entry of entries) {
      const parsed = path.parse(entry);
      const ext = parsed.ext.toLowerCase().replace(/\.ppm$|\.pbm$/, '.png');
      const preferredName = sanitizeMediaAssetName(`${parsed.name}${ext}`);
      const targetFileName = await uniqueMediaAssetName(targetDir, preferredName);
      const targetPath = path.join(targetDir, targetFileName);
      const relativeTarget = path.posix.join(EXTRACTED_DOCUMENT_MEDIA_DIR, sourceSlug, targetFileName);
      await mkdir(targetDir, { recursive: true });
      await writeFile(targetPath, await readFile(path.join(tmpDir, entry)));
      extractedFiles.push(relativeTarget);
    }
  } catch {
    return [];
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return extractedFiles;
}

function extractedMediaSection(sourceKind: string, extracted: string[]): PreviewSection {
  return {
    title: 'MANDATORY Extracted Assets & Images — MUST USE',
    lines: [
      `CRITICAL INSTRUCTION FOR GENERATING HTML/LESSONS:`,
      `This source ${sourceKind} contains actual images/diagrams/slides that have been extracted and saved to the project directory.`,
      `When generating HTML/CSS materials for this document, you MUST include and embed ALL these images in the generated HTML.`,
      `DO NOT use placeholders, DO NOT use blank divs, and DO NOT ignore them.`,
      `To use them, insert these exact <img> tags directly into your HTML:`,
      '',
      ...extracted.map((img) => `- <img src="${img}" alt="${path.basename(img)}" />`),
      '',
      `Each of these images corresponds to a page, slide, or diagram in the original file. Ensure they are displayed in a clean, logical grid or flow in the final output so teachers and students can see them.`,
    ],
  };
}

/**
 * Lightweight extraction-only path: extracts embedded images from a document
 * and writes them to `_document_media/{slug}/` without building or returning
 * any text-preview sections. Safe to call fire-and-forget at upload time so
 * the `.df-preview` media grid is populated immediately.
 *
 * Returns the list of relative paths written (empty if extraction fails or the
 * file type has no embedded images).
 */
export async function extractDocumentMediaOnly(
  file: PreviewFile,
  projectDir: string,
): Promise<string[]> {
  const kind = kindFor(file.name);
  if (kind === 'pdf') {
    return extractAndSavePdfImages(file.buffer, file.name, projectDir).catch(() => []);
  }
  if (!['document', 'presentation', 'spreadsheet'].includes(kind)) return [];
  try {
    assertPreviewInputSize(file.buffer.length);
    const zip = await JSZip.loadAsync(file.buffer);
    assertZipPreviewSize(zip);
    const mediaFolder =
      kind === 'document' ? 'word/media/' :
      kind === 'presentation' ? 'ppt/media/' :
      'xl/media/';
    return extractAndSaveZipImages(zip, file.name, projectDir, mediaFolder).catch(() => []);
  } catch {
    return [];
  }
}

export async function buildDocumentPreview(file: PreviewFile, projectDir?: string) {
  const kind = kindFor(file.name);
  if (!['pdf', 'document', 'presentation', 'spreadsheet'].includes(kind)) {
    throw new PreviewHttpError('unsupported preview type', 415);
  }
  const previewKind = kind as PreviewKind;

  if (previewKind === 'pdf') {
    return {
      kind: previewKind,
      title: path.basename(file.name),
      sections: await pdfPreviewQueue(() => previewPdf(file.buffer, projectDir, file.name)),
    };
  }

  assertPreviewInputSize(file.buffer.length);
  const zip = await JSZip.loadAsync(file.buffer);
  assertZipPreviewSize(zip);
  if (previewKind === 'document') {
    return {
      kind: previewKind,
      title: path.basename(file.name),
      sections: await previewDocx(zip, projectDir, file.name),
    };
  }
  if (previewKind === 'presentation') {
    return {
      kind: previewKind,
      title: path.basename(file.name),
      sections: await previewPptx(zip, projectDir, file.name),
    };
  }
  return {
    kind: previewKind,
    title: path.basename(file.name),
    sections: await previewXlsx(zip, projectDir, file.name),
  };
}

async function previewPdf(
  buffer: Buffer,
  projectDir?: string,
  originalFilename?: string,
): Promise<PreviewSection[]> {
  assertPreviewInputSize(buffer.length);
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'od-preview-'));
  const tmpFile = path.join(tmpDir, 'input.pdf');
  await writeFile(tmpFile, buffer, { flag: 'wx' });
  try {
    const { stdout } = await execFileP('pdftotext', ['-layout', tmpFile, '-'], {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    const sections: PreviewSection[] = [
      {
        title: 'PDF',
        lines: lines.length > 0 ? lines : ['No readable text found.'],
      },
    ];
    if (projectDir && originalFilename) {
      const extracted = await extractAndSavePdfImages(buffer, originalFilename, projectDir);
      if (extracted.length > 0) {
        sections.push(extractedMediaSection('PDF', extracted));
      }
    }
    return sections;
  } catch {
    return [
      {
        title: 'PDF',
        lines: ['Text preview is unavailable. Use Open or Download to inspect the PDF.'],
      },
    ];
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function previewDocx(
  zip: JSZip,
  projectDir?: string,
  originalFilename?: string,
): Promise<PreviewSection[]> {
  const xml = await readZipText(zip, 'word/document.xml');
  const paragraphs = extractParagraphs(xml, /<w:p\b[\s\S]*?<\/w:p>/g);
  const sections: PreviewSection[] = [
    {
      title: 'Document',
      lines: paragraphs.length > 0 ? paragraphs : ['No readable text found.'],
    },
  ];

  if (projectDir && originalFilename) {
    const extracted = await extractAndSaveZipImages(zip, originalFilename, projectDir, 'word/media/');
    if (extracted.length > 0) {
      sections.push(extractedMediaSection('document', extracted));
    }
  }

  return sections;
}

async function previewPptx(
  zip: JSZip,
  projectDir?: string,
  originalFilename?: string,
): Promise<PreviewSection[]> {
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(numericPathSort);
  const sections: PreviewSection[] = [];
  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = await readZipText(zip, slideNames[i] ?? '');
    const lines = extractTextRuns(xml);
    sections.push({
      title: `Slide ${i + 1}`,
      lines: lines.length > 0 ? lines : ['No readable text found.'],
    });
  }

  const finalSections = sections.length > 0
    ? sections
    : [{ title: 'Presentation', lines: ['No readable slides found.'] }];

  if (projectDir && originalFilename) {
    const extracted = await extractAndSaveZipImages(zip, originalFilename, projectDir, 'ppt/media/');
    if (extracted.length > 0) {
      finalSections.push(extractedMediaSection('presentation', extracted));
    }
  }

  return finalSections;
}

async function previewXlsx(
  zip: JSZip,
  projectDir?: string,
  originalFilename?: string,
): Promise<PreviewSection[]> {
  const sharedStrings = await readSharedStrings(zip);
  const workbook = await readWorkbook(zip);
  const sections: PreviewSection[] = [];
  for (const sheet of workbook) {
    const xml = await readZipText(zip, sheet.path).catch(() => '');
    const lines = extractWorksheetRows(xml, sharedStrings);
    sections.push({
      title: sheet.name,
      lines: lines.length > 0 ? lines : ['No readable cell values found.'],
    });
  }
  const finalSections = sections.length > 0
    ? sections
    : [{ title: 'Spreadsheet', lines: ['No readable sheets found.'] }];

  if (projectDir && originalFilename) {
    const extracted = await extractAndSaveZipImages(zip, originalFilename, projectDir, 'xl/media/');
    if (extracted.length > 0) {
      finalSections.push(extractedMediaSection('spreadsheet', extracted));
    }
  }

  return finalSections;
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await readZipText(zip, 'xl/sharedStrings.xml').catch(() => '');
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((m) =>
    extractTextRuns(m[0]).join(''),
  );
}

async function readWorkbook(zip: JSZip): Promise<WorkbookSheet[]> {
  const workbookXml = await readZipText(zip, 'xl/workbook.xml').catch(() => '');
  const relsXml = await readZipText(zip, 'xl/_rels/workbook.xml.rels').catch(() => '');
  const rels = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(rel[1] ?? '');
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target);
  }
  const sheets: WorkbookSheet[] = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(sheet[1] ?? '');
    const relId = attrs['r:id'];
    const target = relId ? rels.get(relId) : null;
    if (!target) continue;
    sheets.push({
      name: attrs.name || `Sheet ${sheets.length + 1}`,
      path: `xl/${target.replace(/^\/?xl\//, '')}`,
    });
  }
  if (sheets.length > 0) return sheets;
  return Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(numericPathSort)
    .map((name, i) => ({ name: `Sheet ${i + 1}`, path: name }));
}

function colLetterToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i += 1) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function extractWorksheetRows(xml: string, sharedStrings: string[]): string[] {
  const rows: string[] = [];
  for (const row of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const values: string[] = [];
    let currentCellIdx = 0;
    for (const cell of row[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseAttrs(cell[1] ?? '');
      const body = cell[2] ?? '';
      let value = '';
      if (attrs.t === 's') {
        const idx = Number(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
        value = Number.isInteger(idx) ? sharedStrings[idx] ?? '' : '';
      } else if (attrs.t === 'inlineStr') {
        value = extractTextRuns(body).join('');
      } else {
        value = decodeXml(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
      }

      // Determine actual column index from cell reference e.g. "C5"
      let targetColIdx = currentCellIdx;
      if (attrs.r) {
        const colMatch = attrs.r.match(/^([A-Z]+)/i);
        if (colMatch && colMatch[1]) {
          targetColIdx = colLetterToIndex(colMatch[1].toUpperCase());
        }
      }

      // Pad empty cells up to targetColIdx
      while (values.length < targetColIdx) {
        values.push('');
      }
      values[targetColIdx] = value.trim();
      currentCellIdx = targetColIdx + 1;
    }
    if (values.some((v) => v.length > 0)) {
      rows.push(values.join(' | '));
    }
  }
  return rows;
}

function extractParagraphs(xml: string, paragraphPattern: RegExp): string[] {
  return Array.from(xml.matchAll(paragraphPattern))
    .map((m) => extractTextRuns(m[0]).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractTextRuns(xml: string): string[] {
  return Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>|<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((m) => decodeXml(m[1] ?? m[2] ?? m[3] ?? '').trim())
    .filter(Boolean);
}

async function readZipText(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) throw new Error(`missing ${name}`);
  const size = (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
  if (size > MAX_XML_ENTRY_BYTES) {
    throw new PreviewHttpError('document section too large to preview', 413);
  }
  const xml = await entry.async('text');
  assertSafeXml(xml);
  return xml;
}

function parseAttrs(raw: string): XmlAttrs {
  const attrs: XmlAttrs = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    const name = m[1];
    if (!name) throw new Error('XML attribute match invariant violated');
    attrs[name] = decodeXml(m[2] ?? '');
  }
  return attrs;
}

function extractFirst(raw: string, pattern: RegExp): string {
  const m = raw.match(pattern);
  return m ? m[1] ?? '' : '';
}

function decodeXml(raw: unknown): string {
  return String(raw)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function assertPreviewInputSize(size: number): void {
  if (size > MAX_COMPRESSED_PREVIEW_BYTES) {
    throw new PreviewHttpError('document too large to preview', 413);
  }
}

function assertZipPreviewSize(zip: JSZip): void {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total += (entry as ZipEntryWithSize)._data?.uncompressedSize ?? 0;
    if (total > MAX_UNCOMPRESSED_PREVIEW_BYTES) {
      throw new PreviewHttpError('document too large to preview', 413);
    }
  }
}

function assertSafeXml(xml: string): void {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    throw new PreviewHttpError('unsupported XML entities', 415);
  }
}

function createLimiter<T>(limit: number): (task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const pending: Array<{
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  const runNext = () => {
    if (active >= limit || pending.length === 0) return;
    active += 1;
    const next = pending.shift();
    if (!next) throw new Error('preview limiter queue invariant violated');
    const { task, resolve, reject } = next;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      pending.push({ task, resolve, reject });
      runNext();
    });
}

function numericPathSort(a: string, b: string): number {
  const an = Number(a.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  const bn = Number(b.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  return an - bn || a.localeCompare(b);
}
