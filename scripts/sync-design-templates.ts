#!/usr/bin/env node
// Sync design-templates/* from an Open Design checkout (or any directory tree
// with the same layout). The Templates tab and /api/design-templates are
// data-driven from this folder — open-lesson ships the full slide catalogue
// here so /templates matches upstream deck counts (~59 slides).
//
// Usage:
//   node --experimental-strip-types scripts/sync-design-templates.ts [SOURCE]
//
// Default SOURCE (when omitted):
//   ../reference/open-design-main/design-templates
//   (sibling of this repo under Project/reference/)

import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'design-templates');

const defaultSource = path.resolve(
  ROOT,
  '../../reference/open-design-main/design-templates',
);
const SOURCE = path.resolve(process.argv[2] || defaultSource);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function syncDir(srcRoot: string, destRoot: string): number {
  let copied = 0;
  for (const name of readdirSync(srcRoot)) {
    if (name.startsWith('.')) continue;
    const src = path.join(srcRoot, name);
    const dest = path.join(destRoot, name);
    const st = statSync(src);
    if (!st.isDirectory()) continue;
    if (!existsSync(dest)) {
      cpSync(src, dest, { recursive: true });
      copied += 1;
    }
  }
  return copied;
}

function main(): void {
  if (!existsSync(SOURCE)) {
    console.error(
      `Source not found: ${SOURCE}\nPass an explicit path: node scripts/sync-design-templates.ts /path/to/design-templates`,
    );
    process.exit(1);
  }
  const added = syncDir(SOURCE, DEST);
  const total = readdirSync(DEST).filter((n) => {
    try {
      return statSync(path.join(DEST, n)).isDirectory();
    } catch {
      return false;
    }
  }).length;
  console.log(`Synced design-templates from ${SOURCE}`);
  console.log(`  added ${added} new template folder(s)`);
  console.log(`  total ${total} template folder(s) under ${DEST}`);
}

try {
  main();
} catch (err) {
  console.error(errorMessage(err));
  process.exit(1);
}
