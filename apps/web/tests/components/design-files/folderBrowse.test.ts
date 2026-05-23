import { describe, expect, it } from 'vitest';

import {
  browsePathSegments,
  displayNameForFile,
  joinBrowsePath,
  listBrowseDirectory,
  mergeBrowseRows,
  parentBrowsePath,
} from '../../../src/components/design-files/folderBrowse';
import type { ProjectFile } from '../../../src/types';

function file(name: string, mtime = 1): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 10,
    mtime,
    kind: 'html',
    mime: 'text/html',
  };
}

describe('folderBrowse', () => {
  it('lists root-level files and first-level folders', () => {
    const listing = listBrowseDirectory(
      [
        file('index.html', 100),
        file('lessons/plan.html', 200),
        file('lessons/assets/logo.png', 150),
        file('guides/readme.txt', 50),
      ],
      '',
    );

    expect(listing.files.map((f) => f.name)).toEqual(['index.html']);
    expect(listing.folders.map((f) => f.path)).toEqual(['guides', 'lessons']);
    expect(listing.folders.find((f) => f.path === 'lessons')).toMatchObject({
      childCount: 2,
      mtime: 200,
    });
  });

  it('lists nested directory contents', () => {
    const listing = listBrowseDirectory(
      [
        file('lessons/plan.html', 200),
        file('lessons/unit-1/plan.html', 300),
        file('lessons/unit-1/slides.html', 250),
      ],
      'lessons',
    );

    expect(listing.files.map((f) => f.name)).toEqual(['lessons/plan.html']);
    expect(listing.folders.map((f) => f.path)).toEqual(['lessons/unit-1']);
    expect(listing.folders[0]).toMatchObject({ name: 'unit-1', childCount: 2, mtime: 300 });
  });

  it('computes parent paths and breadcrumb segments', () => {
    expect(parentBrowsePath('lessons/unit-1')).toBe('lessons');
    expect(parentBrowsePath('lessons')).toBe('');
    expect(browsePathSegments('lessons/unit-1')).toEqual(['lessons', 'unit-1']);
    expect(joinBrowsePath('lessons', 'unit-2')).toBe('lessons/unit-2');
  });

  it('shows basenames inside nested folders', () => {
    expect(displayNameForFile(file('lessons/unit-1/plan.html'), 'lessons/unit-1')).toBe(
      'plan.html',
    );
    expect(displayNameForFile(file('index.html'), '')).toBe('index.html');
  });

  it('merges folders before files for table pagination', () => {
    const listing = listBrowseDirectory([file('a.html'), file('nested/b.html')], '');
    const rows = mergeBrowseRows(listing.folders, listing.files);
    expect(rows[0]?.type).toBe('folder');
    expect(rows[1]?.type).toBe('file');
  });
});
