import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { listFiles } from '../src/projects.js';

describe('listFiles ENOTDIR resilience', () => {
  it('returns empty when metadata.baseDir points at a file', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'od-enotdir-'));
    const filePath = path.join(root, 'single-file.txt');
    writeFileSync(filePath, 'hello');
    try {
      const files = await listFiles('/unused/projects', 'proj-enotdir', {
        metadata: { kind: 'prototype', baseDir: filePath },
      });
      expect(files).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
