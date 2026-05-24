import { projectFileUrl } from '../../providers/registry';

export type PptxFetchError = {
  code: 'NETWORK' | 'ABORTED';
  message: string;
};

/** Stream the raw .pptx bytes for high-fidelity client-side rendering. */
export async function fetchPptxArrayBuffer(
  projectId: string,
  fileName: string,
  options?: { signal?: AbortSignal },
): Promise<{ buffer: ArrayBuffer } | { error: PptxFetchError }> {
  try {
    const url = projectFileUrl(projectId, fileName);
    const resp = await fetch(url, { signal: options?.signal });
    if (!resp.ok) {
      return {
        error: {
          code: 'NETWORK',
          message: `Failed to download file (HTTP ${resp.status}).`,
        },
      };
    }
    return { buffer: await resp.arrayBuffer() };
  } catch (err) {
    if ((err as DOMException | null)?.name === 'AbortError') {
      return { error: { code: 'ABORTED', message: 'Local preview was cancelled.' } };
    }
    return {
      error: {
        code: 'NETWORK',
        message: err instanceof Error ? err.message : 'Failed to download file.',
      },
    };
  }
}
