/** Map a file kind or live-artifact to an Icon name. */
export function kindIconName(kind?: string): 'file-code' | 'image' | 'pencil' | 'file' {
  if (!kind) return 'file';
  if (kind === 'live-artifact') return 'file-code';
  if (kind === 'html') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  if (kind === 'code') return 'file-code';
  if (kind === 'text') return 'file';
  return 'file';
}

