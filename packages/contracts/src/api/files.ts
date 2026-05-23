import type { OkResponse } from '../common.js';
import type { ArtifactKind, ArtifactManifest } from './artifacts.js';

export type ProjectFileKind =
  | 'html'
  | 'image'
  | 'video'
  | 'audio'
  | 'sketch'
  | 'text'
  | 'code'
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'binary';

// Surfaced when the daemon's stub-guard runs in `warn` mode and detects a
// likely regression (the agent emitted a placeholder body that is much
// smaller than a prior artifact sharing the same `metadata.identifier`).
// In `reject` mode the daemon returns `422 ARTIFACT_REGRESSION` instead and
// no `ProjectFile` is produced.
export interface ProjectFileStubGuardWarning {
  code: 'ARTIFACT_REGRESSION';
  message: string;
  identifier: string;
  newSize: number;
  priorSize: number;
  priorName: string;
}

export interface ProjectFile {
  name: string;
  path?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: ProjectFileKind;
  mime: string;
  artifactKind?: ArtifactKind;
  artifactManifest?: ArtifactManifest;
  stubGuardWarning?: ProjectFileStubGuardWarning;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
}

export interface ProjectFileResponse {
  file: ProjectFile;
}

export interface UploadProjectFilesResponse extends ProjectFilesResponse {}

export interface DeleteProjectFileResponse extends OkResponse {}

export interface CreateProjectFolderRequest {
  path: string;
}

export interface CreateProjectFolderResponse extends ProjectFileResponse {}

export interface RenameProjectFileRequest {
  from: string;
  to: string;
}

export interface RenameProjectFileResponse {
  file: ProjectFile;
  oldName: string;
  newName: string;
}

/** Project folder that stores media extracted from uploaded source documents. */
export const EXTRACTED_DOCUMENT_MEDIA_DIR = '_document_media';

/** Virtual browse path for legacy DOCX/PPTX reference images in Design Files (not on disk). */
export const EXTRACTED_DOCUMENT_MEDIA_BROWSE_PATH = '__od_extracted_media__';

/**
 * Images saved by document preview extraction.
 * New extractions live under `_document_media/{sourceSlug}/`; legacy
 * extractions used `{docPrefix}-media-{zipName}` at project root.
 */
export function isExtractedDocumentMediaFileName(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  if (normalized === EXTRACTED_DOCUMENT_MEDIA_DIR || normalized.startsWith(`${EXTRACTED_DOCUMENT_MEDIA_DIR}/`)) {
    return true;
  }
  if (normalized.includes('/')) return false;
  return /-media-/i.test(normalized);
}

export function isExtractedDocumentMediaBrowsePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized === EXTRACTED_DOCUMENT_MEDIA_BROWSE_PATH;
}
