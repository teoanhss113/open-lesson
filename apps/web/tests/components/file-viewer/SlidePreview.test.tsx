// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlidePreview } from '../../../src/components/file-viewer/SlidePreview';
import type { ProjectFile } from '../../../src/types';

// Mock the daemon registry; the sandboxed iframe doesn't run scripts in
// jsdom anyway, so we focus the test on host-side state (thumbnails,
// counter, nav). That keeps the test fast and deterministic.
vi.mock('../../../src/providers/registry', async () => {
  const actual: any = await vi.importActual('../../../src/providers/registry');
  return {
    ...actual,
    fetchProjectFilePreviewResult: vi.fn(),
  };
});
vi.mock('../../../src/components/file-viewer/pptxClientPreview', () => ({
  buildClientPptxPreview: vi.fn(),
}));

import {
  fetchProjectFilePreviewResult,
  type ProjectFilePreview,
} from '../../../src/providers/registry';
import { buildClientPptxPreview } from '../../../src/components/file-viewer/pptxClientPreview';

const mockFetch = fetchProjectFilePreviewResult as unknown as ReturnType<typeof vi.fn>;
const mockClient = buildClientPptxPreview as unknown as ReturnType<typeof vi.fn>;

function makeFile(name = 'unit-2.pptx'): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime: 1,
    kind: 'presentation',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
}

function makePreview(sections: number): ProjectFilePreview {
  return {
    kind: 'presentation',
    title: 'Unit 2',
    sections: Array.from({ length: sections }, (_, i) => ({
      title: `Slide ${i + 1}`,
      lines: [`Outline ${i + 1}`],
    })),
  };
}

describe('SlidePreview', () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    mockClient.mockReset();
  });

  it('shows the loading state while the preview is in flight', () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    // Default mock: never resolves so we don't crash the post-daemon
    // upgrade path during the loading assertion.
    mockClient.mockReturnValue(new Promise(() => {}));
    render(<SlidePreview projectId="p1" file={makeFile()} />);
    expect(screen.getByText(/Loading slides/i)).toBeTruthy();
  });

  it('renders slides when the daemon returns a preview', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, preview: makePreview(3) });
    // The client parser also runs in the background to try to
    // upgrade to a rich layout; leave it pending here so the test
    // sees the daemon-rendered view.
    mockClient.mockReturnValue(new Promise(() => {}));
    render(<SlidePreview projectId="p1" file={makeFile()} />);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(3);
    });
    expect(screen.getByText(/^1 \/ 3$/)).toBeTruthy();
  });

  it('upgrades to the high-fidelity client preview when it finishes', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, preview: makePreview(3) });
    mockClient.mockResolvedValueOnce({ preview: makePreview(4) });

    render(<SlidePreview projectId="p1" file={makeFile()} />);

    // The richer preview has 4 sections, so the daemon's 3-section
    // view is replaced once the client parser resolves.
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(4);
    });
    expect(screen.getByText(/Local preview/i)).toBeTruthy();
  });

  it('falls back to the client-side parser when the daemon refuses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 413,
      message: 'document too large to preview',
    });
    mockClient.mockResolvedValueOnce({ preview: makePreview(2) });

    render(<SlidePreview projectId="p1" file={makeFile()} />);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(2);
    });
    expect(mockClient).toHaveBeenCalledWith('p1', 'unit-2.pptx', expect.any(Object));
    expect(screen.getByText(/Local preview/i)).toBeTruthy();
  });

  it('surfaces the actual error when both daemon and client fail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 413,
      message: 'document too large to preview',
    });
    mockClient.mockResolvedValueOnce({
      error: { code: 'UNZIP', message: 'corrupt central directory' },
    });

    render(<SlidePreview projectId="p1" file={makeFile()} />);

    await waitFor(() => {
      expect(screen.getByTestId('slide-preview-error')).toBeTruthy();
    });
    expect(screen.getByText(/document too large to preview/i)).toBeTruthy();
    expect(screen.getByText(/corrupt central directory/i)).toBeTruthy();
  });

  it('updates the counter when the next-slide button is clicked', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, preview: makePreview(2) });
    mockClient.mockReturnValue(new Promise(() => {}));
    render(<SlidePreview projectId="p1" file={makeFile()} />);

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(2);
    });

    const nextBtn = screen.getByRole('button', { name: /Next slide/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText(/^2 \/ 2$/)).toBeTruthy();
    });
  });
});
