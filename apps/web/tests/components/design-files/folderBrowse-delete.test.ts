import { describe, expect, it } from 'vitest';

import { listBrowseDirectory } from '../../../src/components/design-files/folderBrowse';
import type { ProjectFile } from '../../../src/types';

function dir(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'dir',
    size: 0,
    mtime: 1,
    kind: 'binary',
    mime: 'inode/directory',
  };
}

describe('listBrowseDirectory folder paths for delete', () => {
  it('uses full project-relative path for an empty app-created folder at root', () => {
    const listing = listBrowseDirectory([dir('New folder')], '');
    expect(listing.folders).toHaveLength(1);
    expect(listing.folders[0]?.path).toBe('New folder');
    expect(listing.folders[0]?.name).toBe('New folder');
  });

  it('uses full project-relative path for an empty folder inside a browse path', () => {
    const listing = listBrowseDirectory([dir('lessons/unit-1')], 'lessons');
    expect(listing.folders).toHaveLength(1);
    expect(listing.folders[0]?.path).toBe('lessons/unit-1');
    expect(listing.folders[0]?.name).toBe('unit-1');
  });
});
