import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDocumentPreview } from '../src/document-preview.js';

const EXTRACTED_DOCUMENT_MEDIA_DIR = '_document_media';
const roots: string[] = [];
type PreviewSection = { title: string; lines: string[] };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'od-preview-media-'));
  roots.push(root);
  return root;
}

describe('document preview media extraction', () => {
  it('extracts DOCX images into a source-specific media folder', async () => {
    const projectDir = await makeRoot();
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>');
    zip.file('word/media/image1.png', Buffer.from('png-data'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const preview = await buildDocumentPreview({ name: 'Lesson 1.docx', buffer }, projectDir);

    const extractedPath = path.join(projectDir, EXTRACTED_DOCUMENT_MEDIA_DIR, 'Lesson_1', 'image1.png');
    expect(await readFile(extractedPath, 'utf8')).toBe('png-data');
    const sections = preview.sections as PreviewSection[];
    const mediaSection = sections.find((section) => section.title === 'Extracted Reference Images');
    expect(mediaSection?.lines.join('\n')).toContain(`${EXTRACTED_DOCUMENT_MEDIA_DIR}/Lesson_1/image1.png`);
  });

  it('extracts XLSX images into a source-specific media folder', async () => {
    const projectDir = await makeRoot();
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Sheet 1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c t="inlineStr"><is><t>Hello</t></is></c></row></sheetData></worksheet>');
    zip.file('xl/media/image1.png', Buffer.from('xlsx-png'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    const preview = await buildDocumentPreview({ name: 'Workbook.xlsx', buffer }, projectDir);

    const extractedPath = path.join(projectDir, EXTRACTED_DOCUMENT_MEDIA_DIR, 'Workbook', 'image1.png');
    expect(await readFile(extractedPath, 'utf8')).toBe('xlsx-png');
    const sections = preview.sections as PreviewSection[];
    expect(sections.some((section) => section.title === 'Extracted Reference Images')).toBe(true);
  });
});
