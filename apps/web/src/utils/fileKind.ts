import type { IconName } from '../components/Icon';

/** Map a file kind or live-artifact to a shared Icon name. */
export function kindIconName(kind?: string): IconName {
  if (!kind) return 'file';
  if (kind === 'folder') return 'folder';
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'presentation') return 'present';
  if (kind === 'spreadsheet') return 'grid';
  if (kind === 'audio') return 'mic';
  if (kind === 'video') return 'play';
  if (kind === 'text') return 'file';
  return 'file';
}
