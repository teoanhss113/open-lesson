import type { ProjectFile } from '../../types';

/** Relative path from project root; empty string is the project root. */
export type BrowsePath = string;

export interface BrowseFolder {
  /** Single path segment shown in the name column. */
  name: string;
  /** Full relative path used for navigation (e.g. `lessons/unit-1`). */
  path: BrowsePath;
  mtime: number;
  childCount: number;
}

export interface BrowseDirectoryListing {
  folders: BrowseFolder[];
  files: ProjectFile[];
}

export type BrowseRow =
  | { type: 'folder'; folder: BrowseFolder }
  | { type: 'file'; file: ProjectFile };

export function normalizeBrowsePath(path: BrowsePath): BrowsePath {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function parentBrowsePath(path: BrowsePath): BrowsePath {
  const normalized = normalizeBrowsePath(path);
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
}

export function browsePathSegments(path: BrowsePath): string[] {
  const normalized = normalizeBrowsePath(path);
  return normalized ? normalized.split('/') : [];
}

export function joinBrowsePath(parent: BrowsePath, segment: string): BrowsePath {
  const base = normalizeBrowsePath(parent);
  const name = segment.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!name) return base;
  return base ? `${base}/${name}` : name;
}

/** Prefix a relative upload path (file name or folder tree path) with the browsed folder. */
export function joinUploadRelativePath(parent: BrowsePath, relativePath: string): BrowsePath {
  const base = normalizeBrowsePath(parent);
  const rel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel) return base;
  return base ? `${base}/${rel}` : rel;
}

/** List immediate child folders and files for a directory path. */
export function listBrowseDirectory(
  files: ProjectFile[],
  dirPath: BrowsePath,
): BrowseDirectoryListing {
  const current = normalizeBrowsePath(dirPath);
  const prefix = current ? `${current}/` : '';
  const folders = new Map<string, BrowseFolder>();
  const directFiles: ProjectFile[] = [];

  const addFolder = (segment: string, mtime: number, childDelta: number) => {
    const folderPath = joinBrowsePath(current, segment);
    const existing = folders.get(folderPath);
    if (existing) {
      existing.childCount += childDelta;
      existing.mtime = Math.max(existing.mtime, mtime);
      return;
    }
    folders.set(folderPath, {
      name: segment,
      path: folderPath,
      mtime,
      childCount: childDelta,
    });
  };

  for (const file of files) {
    const name = file.name.replace(/\\/g, '/');
    if (current && !name.startsWith(prefix)) continue;
    const remainder = current ? name.slice(prefix.length) : name;
    if (!remainder) continue;

    const slashIdx = remainder.indexOf('/');
    if (file.type === 'dir') {
      if (slashIdx === -1) {
        addFolder(remainder, file.mtime, 0);
      } else {
        addFolder(remainder.slice(0, slashIdx), file.mtime, 1);
      }
      continue;
    }

    if (slashIdx === -1) {
      directFiles.push(file);
      continue;
    }

    const segment = remainder.slice(0, slashIdx);
    addFolder(segment, file.mtime, 1);
  }

  const folderList = [...folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { folders: folderList, files: directFiles };
}

export function mergeBrowseRows(
  folders: BrowseFolder[],
  files: ProjectFile[],
): BrowseRow[] {
  return [
    ...folders.map((folder): BrowseRow => ({ type: 'folder', folder })),
    ...files.map((file): BrowseRow => ({ type: 'file', file })),
  ];
}

export function displayNameForFile(file: ProjectFile, dirPath: BrowsePath): string {
  const current = normalizeBrowsePath(dirPath);
  if (!current) return file.name;
  const prefix = `${current}/`;
  if (file.name.startsWith(prefix)) return file.name.slice(prefix.length);
  const base = file.name.replace(/\\/g, '/');
  const idx = base.lastIndexOf('/');
  return idx === -1 ? base : base.slice(idx + 1);
}
