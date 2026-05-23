import {
  EXTRACTED_DOCUMENT_MEDIA_DIR,
  EXTRACTED_DOCUMENT_MEDIA_BROWSE_PATH,
  isExtractedDocumentMediaBrowsePath,
  isExtractedDocumentMediaFileName,
} from '@open-design/contracts';
import type { ProjectFile } from '../../types';
import {
  listBrowseDirectory,
  normalizeBrowsePath,
  parentBrowsePath,
  type BrowseDirectoryListing,
  type BrowsePath,
} from './folderBrowse';

export {
  EXTRACTED_DOCUMENT_MEDIA_DIR,
  EXTRACTED_DOCUMENT_MEDIA_BROWSE_PATH,
  isExtractedDocumentMediaBrowsePath,
  isExtractedDocumentMediaFileName,
};

/** Map virtual browse paths to a real upload/move destination (project root). */
export function resolveDesignFilesBrowsePath(path: BrowsePath): BrowsePath {
  return isExtractedDocumentMediaBrowsePath(path) ? '' : normalizeBrowsePath(path);
}

export function parentDesignFilesBrowsePath(path: BrowsePath): BrowsePath {
  if (isExtractedDocumentMediaBrowsePath(path)) return '';
  return parentBrowsePath(path);
}

export function browsePathLabel(
  path: BrowsePath,
  labels: { extractedMediaFolder: string },
): string {
  if (isExtractedDocumentMediaBrowsePath(path)) return labels.extractedMediaFolder;
  const normalized = normalizeBrowsePath(path);
  const segment = normalized.slice(normalized.lastIndexOf('/') + 1);
  return segment;
}

function sourceMediaSlug(sourceName: string): string {
  const normalized = sourceName.replace(/\\/g, '/');
  const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = baseName.lastIndexOf('.');
  const ext = dot > 0 ? baseName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const cleanStem = stem.normalize('NFC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '');
  if (cleanStem) return ext ? `${cleanStem}-${ext}` : cleanStem;
  return ext || 'document';
}

function sourceMediaSlugLegacy(sourceName: string): string {
  const normalized = sourceName.replace(/\\/g, '/');
  const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  return stem.normalize('NFC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+|_+$/g, '') || 'document';
}

export function isExtractedDocumentMediaPath(name: string): boolean {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  return (
    normalized === EXTRACTED_DOCUMENT_MEDIA_DIR ||
    normalized.startsWith(`${EXTRACTED_DOCUMENT_MEDIA_DIR}/`) ||
    isExtractedDocumentMediaFileName(normalized)
  );
}

export function extractedMediaForSource(
  files: ProjectFile[],
  sourceFileName: string,
): ProjectFile[] {
  const sourceSlug = sourceMediaSlug(sourceFileName);
  const legacySlug = sourceMediaSlugLegacy(sourceFileName);
  const folderPrefix = `${EXTRACTED_DOCUMENT_MEDIA_DIR}/${sourceSlug}/`;
  const legacyFolderPrefix = `${EXTRACTED_DOCUMENT_MEDIA_DIR}/${legacySlug}/`;
  const oldPrefix = `${sourceSlug}-media-`.toLowerCase();
  const oldLegacyPrefix = `${legacySlug}-media-`.toLowerCase();
  return files
    .filter((file) => {
      if (file.type === 'dir') return false;
      const normalized = file.name.replace(/\\/g, '/');
      return (
        normalized.startsWith(folderPrefix) ||
        normalized.startsWith(legacyFolderPrefix) ||
        (!normalized.includes('/') &&
          (normalized.toLowerCase().startsWith(oldPrefix) ||
           normalized.toLowerCase().startsWith(oldLegacyPrefix)))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listDesignFilesDirectory(
  files: ProjectFile[],
  dirPath: BrowsePath,
): BrowseDirectoryListing {
  if (isExtractedDocumentMediaBrowsePath(dirPath)) {
    const extracted = files.filter(
      (file) => file.type !== 'dir' && isExtractedDocumentMediaFileName(file.name),
    );
    return { folders: [], files: extracted };
  }

  const visibleFiles = files.filter((file) => !isExtractedDocumentMediaPath(file.name));
  const listing = listBrowseDirectory(visibleFiles, dirPath);
  if (normalizeBrowsePath(dirPath) !== '') {
    return listing;
  }

  return listing;
}
