import { describe, expect, it } from 'vitest';

import { EXTRACTED_DOCUMENT_MEDIA_DIR, isExtractedDocumentMediaFileName } from '@open-design/contracts';
import {
  EXTRACTED_DOCUMENT_MEDIA_BROWSE_PATH,
  extractedMediaForSource,
  isExtractedDocumentMediaPath,
  isExtractedDocumentMediaBrowsePath,
  listDesignFilesDirectory,
  parentDesignFilesBrowsePath,
  resolveDesignFilesBrowsePath,
} from '../../../src/components/design-files/extractedMediaBrowse';
import type { ProjectFile } from '../../../src/types';

function file(name: string, mtime = 1): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 10,
    mtime,
    kind: 'image',
    mime: 'image/png',
  };
}

describe('extractedMediaBrowse', () => {
  it('detects DOCX/PPTX extracted media filenames', () => {
    expect(isExtractedDocumentMediaFileName('Lesson_TG-media-image13.png')).toBe(true);
    expect(isExtractedDocumentMediaFileName('nested/Lesson_TG-media-image13.png')).toBe(false);
    expect(isExtractedDocumentMediaFileName('notes.txt')).toBe(false);
  });

  it('hides extracted files at root and exposes them from the source preview model', () => {
    const files = [
      file('lesson.docx', 100),
      file(`${EXTRACTED_DOCUMENT_MEDIA_DIR}/lesson/image13.png`, 200),
      file(`${EXTRACTED_DOCUMENT_MEDIA_DIR}/lesson/image14.png`, 150),
    ];
    const root = listDesignFilesDirectory(files, '');
    expect(root.files.map((f) => f.name)).toEqual(['lesson.docx']);
    expect(root.folders).toEqual([]);

    expect(extractedMediaForSource(files, 'lesson.docx').map((f) => f.name)).toEqual([
      `${EXTRACTED_DOCUMENT_MEDIA_DIR}/lesson/image13.png`,
      `${EXTRACTED_DOCUMENT_MEDIA_DIR}/lesson/image14.png`,
    ]);
  });

  it('maps virtual browse paths to project root for uploads', () => {
    expect(resolveDesignFilesBrowsePath('__od_extracted_media__')).toBe('');
    expect(parentDesignFilesBrowsePath('__od_extracted_media__')).toBe('');
    expect(resolveDesignFilesBrowsePath('lessons/unit-1')).toBe('lessons/unit-1');
  });
});
