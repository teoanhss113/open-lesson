import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('GET /api/projects/:id/files', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('returns 200 with empty files for a new UUID curriculum project', async () => {
    const id = '47fbbac2-7f98-4cb6-9bd7-429069c031cb';
    const create = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        name: 'Grade 6 Ecosystems',
        skillId: 'lesson-plan-generator',
        designSystemId: 'clay',
        metadata: {
          kind: 'prototype',
          intent: 'live-artifact',
          fidelity: 'high-fidelity',
          curriculumStatus: 'draft',
        },
      }),
    });
    expect(create.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/projects/${id}/files`);
    const text = await list.text();
    expect(list.status, text).toBe(200);
    expect(JSON.parse(text).files).toEqual([]);
  });

  it('returns 404 when the project id is unknown', async () => {
    const resp = await fetch(`${baseUrl}/api/projects/does-not-exist-${Date.now()}/files`);
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 200 with empty files when the project directory is missing', async () => {
    const id = `proj-missing-dir-${Date.now()}`;
    const create = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: 'Missing dir', skillId: null, designSystemId: null }),
    });
    expect(create.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/projects/${id}/files`);
    expect(list.status).toBe(200);
    const body = (await list.json()) as { files: unknown[] };
    expect(body.files).toEqual([]);
  });
});
