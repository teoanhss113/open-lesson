// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import {
  buildClientPptxPreview,
  extractPptxCoverThumbnail,
} from '../../../src/components/file-viewer/pptxClientPreview';

vi.mock('../../../src/providers/registry', async () => {
  const actual: any = await vi.importActual('../../../src/providers/registry');
  return {
    ...actual,
    projectFileUrl: (_p: string, name: string) => `mock://${name}`,
  };
});

function makePptxArrayBuffer(slideTexts: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  slideTexts.forEach((paragraphs, idx) => {
    // Mirror the structure of a real PowerPoint slide: every text
    // line is one <a:p> paragraph containing one <a:r> run with a
    // single <a:t> text element. The parser walks paragraphs → runs
    // → <a:t>, so a bare <a:t> outside a run would be skipped just
    // like a real-world PPTX would.
    const paras = paragraphs
      .map(
        (line) =>
          `<a:p><a:r><a:rPr lang="vi-VN" sz="2400"/><a:t>${escape(line)}</a:t></a:r></a:p>`,
      )
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="x" xmlns:a="x"><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="6858000"/></a:xfrm></p:spPr><p:txBody>${paras}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${idx + 1}.xml`, xml);
  });
  zip.file('docProps/thumbnail.jpeg', new Uint8Array([1, 2, 3, 4]));
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation xmlns:p="x"><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

describe('buildClientPptxPreview', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('parses slide text runs from a real (in-memory) pptx zip', async () => {
    const buffer = await makePptxArrayBuffer([
      ['Welcome to Unit 2', 'Overview'],
      ['Climate basics'],
    ]);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(buffer, { status: 200 }),
    ) as any;

    const result = await buildClientPptxPreview('proj', 'deck.pptx');
    expect('preview' in result).toBe(true);
    if (!('preview' in result)) throw new Error('expected preview');
    expect(result.preview.kind).toBe('presentation');
    expect(result.preview.sections.length).toBe(2);
    expect(result.preview.sections[0]!.lines).toEqual([
      'Welcome to Unit 2',
      'Overview',
    ]);
    expect(result.preview.sections[1]!.lines).toEqual(['Climate basics']);
    // The rich slideLayout is populated and carries the same runs
    // with their font size (sz="2400" → 24pt) preserved.
    expect(result.preview.slideLayout).toBeDefined();
    const layout = result.preview.slideLayout!;
    expect(layout.slides.length).toBe(2);
    const firstShape = layout.slides[0]!.shapes[0]!;
    expect(firstShape.kind).toBe('text');
    if (firstShape.kind !== 'text') throw new Error('expected text shape');
    expect(firstShape.paragraphs?.[0]?.runs[0]?.text).toBe('Welcome to Unit 2');
    expect(firstShape.paragraphs?.[0]?.runs[0]?.size).toBe(24);
  });

  it('reports UNSUPPORTED when the archive has no slides', async () => {
    const zip = new JSZip();
    zip.file('docProps/core.xml', '<x/>');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(buffer, { status: 200 }),
    ) as any;
    const result = await buildClientPptxPreview('proj', 'deck.pptx');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('UNSUPPORTED');
  });

  it('reports NETWORK when the fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 404 })) as any;
    const result = await buildClientPptxPreview('proj', 'deck.pptx');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('NETWORK');
  });

  it('reports UNZIP when the bytes are not a zip', async () => {
    const buffer = new TextEncoder().encode('not a zip').buffer;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(buffer, { status: 200 }),
    ) as any;
    const result = await buildClientPptxPreview('proj', 'deck.pptx');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.code).toBe('UNZIP');
  });

  it('returns a data url for the cover thumbnail when present', async () => {
    const buffer = await makePptxArrayBuffer([['anything']]);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(buffer, { status: 200 }),
    ) as any;
    const url = await extractPptxCoverThumbnail('proj', 'deck.pptx');
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
  });
});
