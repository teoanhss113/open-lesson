// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PptxViewer } from '../../../src/components/file-viewer/PptxViewer';
import type {
  PresentationLayout,
  ProjectFilePreview,
} from '../../../src/providers/registry';

vi.mock('../../../src/components/file-viewer/pptxClientPreview', () => ({
  buildClientPptxPreview: vi.fn(),
}));

import { buildClientPptxPreview } from '../../../src/components/file-viewer/pptxClientPreview';

const mockClient = buildClientPptxPreview as unknown as ReturnType<typeof vi.fn>;

function buildLayout(slideCount: number): PresentationLayout {
  return {
    width: 1280,
    height: 720,
    slides: Array.from({ length: slideCount }, (_, idx) => ({
      title: `Slide ${idx + 1}`,
      shapes: [
        {
          kind: 'text',
          x: 100,
          y: 100,
          w: 800,
          h: 80,
          z: 0,
          paragraphs: [
            {
              runs: [{ text: `Heading for slide ${idx + 1}` }],
            },
          ],
        },
      ],
    })),
  };
}

function buildPreview(slideCount: number): ProjectFilePreview {
  return {
    kind: 'presentation',
    title: 'Multi-slide test deck',
    sections: Array.from({ length: slideCount }, (_, idx) => ({
      title: `Slide ${idx + 1}`,
      lines: [`Heading for slide ${idx + 1}`],
    })),
    slideLayout: buildLayout(slideCount),
  };
}

/**
 * Drive jsdom's iframe loading by hand: jsdom doesn't actually
 * parse srcDoc content the way Chrome does, so we shim a real
 * `contentDocument` with a fresh root container before firing the
 * synthetic `load` event the viewer listens for.
 */
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
  Object.defineProperty(iframe, 'contentWindow', {
    configurable: true,
    get: () =>
      ({
        innerWidth: 800,
        innerHeight: 600,
        addEventListener: () => {},
        removeEventListener: () => {},
        postMessage: vi.fn(),
      }) as unknown as Window,
  });
  return doc;
}

describe('PptxViewer', () => {
  afterEach(() => {
    cleanup();
    mockClient.mockReset();
  });

  // The bug under test: the previous implementation baked
  // initialSlideIndex into the srcDoc, so every slide change
  // rewrote the srcDoc attribute, which forced the browser to
  // reload the iframe and show its empty body background — the
  // "next slide is black" failure.
  it('keeps srcDoc stable across initialSlideIndex changes', async () => {
    mockClient.mockResolvedValue({ preview: buildPreview(3) });
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

    const nextSrcDoc = iframe.getAttribute('srcdoc');
    expect(nextSrcDoc).toBe(initialSrcDoc);

    rerender(
      <PptxViewer
        projectId="p1"
        fileName="deck.pptx"
        iframeRef={iframeRef}
        selectedPalette={null}
        initialSlideIndex={2}
      />,
    );
    expect(iframe.getAttribute('srcdoc')).toBe(initialSrcDoc);
  });

  it('renders one .slide element per parsed slide', async () => {
    mockClient.mockResolvedValue({ preview: buildPreview(3) });
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
    expect(iframe).toBeTruthy();
    const doc = primeIframeDocument(iframe);

    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
      // Allow the parser promise + DOM render to flush.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      const slides = doc.querySelectorAll('.slide');
      expect(slides.length).toBe(3);
    });

    const slides = Array.from(doc.querySelectorAll<HTMLElement>('.slide'));
    expect(slides[0]?.classList.contains('active')).toBe(true);
    expect(slides[1]?.classList.contains('active')).toBe(false);
    expect(slides[2]?.classList.contains('active')).toBe(false);

    // Every shape carries a data-od-id so Comment / Inspect bridges
    // can pick them up — the same way DocxViewer annotates docx
    // elements after render.
    const annotated = doc.querySelectorAll('[data-od-id]');
    expect(annotated.length).toBeGreaterThan(0);
  });

  it('posts od:slide when the host changes initialSlideIndex', async () => {
    mockClient.mockResolvedValue({ preview: buildPreview(3) });
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
    expect(iframe).toBeTruthy();
    const postMessage = vi.fn();
    const win = {
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: () => {},
      removeEventListener: () => {},
      postMessage,
    } as unknown as Window;
    primeIframeDocument(iframe);
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      get: () => win,
    });

    await act(async () => {
      iframe.dispatchEvent(new Event('load'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    postMessage.mockClear();

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
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'od:slide', action: 'go', index: 2 },
        '*',
      );
    });
  });
});
