// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PptxViewer } from '../../../src/components/file-viewer/PptxViewer';

vi.mock('../../../src/components/file-viewer/pptxFetch', () => ({
  fetchPptxArrayBuffer: vi.fn(),
}));

const mockGoToSlide = vi.fn(async (index: number) => {
  mockEngine.currentSlideIndex = index;
});

const mockEngine = {
  slideCount: 3,
  currentSlideIndex: 0,
  goToSlide: mockGoToSlide,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('@aiden0z/pptx-renderer', () => ({
  PptxViewer: {
    open: vi.fn(async (_buffer: ArrayBuffer, container: HTMLElement) => {
      const doc = container.ownerDocument;
      const slide = doc.createElement('div');
      slide.className = 'pptx-rendered-slide';
      slide.textContent = 'Rendered slide';
      container.appendChild(slide);
      mockEngine.currentSlideIndex = 0;
      return mockEngine;
    }),
  },
}));

import { fetchPptxArrayBuffer } from '../../../src/components/file-viewer/pptxFetch';
import { PptxViewer as PptxRendererEngine } from '@aiden0z/pptx-renderer';

const mockFetch = fetchPptxArrayBuffer as unknown as ReturnType<typeof vi.fn>;
const mockOpen = PptxRendererEngine.open as unknown as ReturnType<typeof vi.fn>;

function primeIframeDocument(iframe: HTMLIFrameElement): Document {
  const doc = document.implementation.createHTMLDocument('pptx');
  const root = doc.createElement('div');
  root.id = 'pptx-viewer-root';
  root.setAttribute('data-pptx-empty', '1');
  doc.body.appendChild(root);
  Object.defineProperty(iframe, 'contentDocument', {
    configurable: true,
    get: () => doc,
  });
  const parentWin = window;
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () =>
      ({
        innerWidth: 800,
        innerHeight: 600,
        parent: parentWin,
        addEventListener: (type: string, fn: EventListener) => parentWin.addEventListener(type, fn),
        removeEventListener: (type: string, fn: EventListener) =>
          parentWin.removeEventListener(type, fn),
        postMessage: vi.fn(),
      }) as unknown as Window,
  });
  return doc;
}

describe('PptxViewer', () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    mockOpen.mockClear();
    mockGoToSlide.mockClear();
    mockEngine.currentSlideIndex = 0;
  });

  it('keeps srcDoc stable across initialSlideIndex changes', async () => {
    mockFetch.mockResolvedValue({ buffer: new ArrayBuffer(8) });
    const iframeRef = createRef<HTMLIFrameElement>();

    const { rerender, container } = render(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={0}
      />,
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    const initialSrcDoc = iframe.getAttribute('srcdoc');
    expect(initialSrcDoc).toBeTruthy();

    rerender(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={1}
      />,
    );

    expect(iframe.getAttribute('srcdoc')).toBe(initialSrcDoc);
  });

  it('opens the high-fidelity renderer and annotates DOM for bridges', async () => {
    mockFetch.mockResolvedValue({ buffer: new ArrayBuffer(8) });
    const iframeRef = createRef<HTMLIFrameElement>();

    const { container } = render(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={0}
      />,
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    const doc = primeIframeDocument(iframe);

    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled();
      expect(doc.querySelector('.pptx-rendered-slide')).toBeTruthy();
    });

    const annotated = doc.querySelectorAll('[data-od-id]');
    expect(annotated.length).toBeGreaterThan(0);
  });

  it('calls goToSlide when the host changes initialSlideIndex', async () => {
    mockFetch.mockResolvedValue({ buffer: new ArrayBuffer(8) });
    const iframeRef = createRef<HTMLIFrameElement>();

    const { container, rerender } = render(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={0}
      />,
    );

    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    primeIframeDocument(iframe);

    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(mockOpen).toHaveBeenCalled());

    mockGoToSlide.mockClear();

    rerender(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={2}
      />,
    );

    await waitFor(() => {
      expect(mockGoToSlide).toHaveBeenCalledWith(2);
    });
  });
});
