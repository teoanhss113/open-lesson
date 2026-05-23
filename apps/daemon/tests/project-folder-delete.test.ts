import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createProjectFolder,
  deleteProjectFile,
  ensureProject,
  listFiles,
} from '../src/projects.js';

describe('project folder create and delete (storage)', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function makeRoot() {
    const root = await mkdtemp(path.join(tmpdir(), 'od-folder-del-'));
    roots.push(root);
    return root;
  }

  it('creates an empty folder and deletes it by project-relative path', async () => {
    const projectsRoot = await makeRoot();
    const projectId = 'test-proj';
    await ensureProject(projectsRoot, projectId);

    const created = await createProjectFolder(projectsRoot, projectId, 'New folder');
    expect(created.name).toBe('New folder');
    expect(created.type).toBe('dir');

    const listed = await listFiles(projectsRoot, projectId);
    expect(listed.some((f) => f.name === 'New folder' && f.type === 'dir')).toBe(true);

    await deleteProjectFile(projectsRoot, projectId, 'New folder');

    const after = await listFiles(projectsRoot, projectId);
    expect(after.some((f) => f.name === 'New folder')).toBe(false);
  });

  it('deletes extracted document media when deleting the source file', async () => {
    const projectsRoot = await makeRoot();
    const projectId = 'test-proj';
    await ensureProject(projectsRoot, projectId);
    const projectDir = path.join(projectsRoot, projectId);

    await writeFile(path.join(projectDir, 'Lesson 1.docx'), Buffer.from('docx'));
    await mkdir(path.join(projectDir, '_document_media', 'Lesson_1'), { recursive: true });
    await writeFile(path.join(projectDir, '_document_media', 'Lesson_1', 'image1.png'), Buffer.from('png'));
    await writeFile(path.join(projectDir, 'Lesson_1-media-image2.png'), Buffer.from('png'));

    await deleteProjectFile(projectsRoot, projectId, 'Lesson 1.docx');

    const after = await listFiles(projectsRoot, projectId);
    expect(after.some((f) => f.name === 'Lesson 1.docx')).toBe(false);
    expect(after.some((f) => f.name.startsWith('_document_media/Lesson_1'))).toBe(false);
    expect(after.some((f) => f.name === 'Lesson_1-media-image2.png')).toBe(false);
  });
});
