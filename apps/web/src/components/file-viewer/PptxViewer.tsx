import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { PptxViewer as PptxRendererEngine } from '@aiden0z/pptx-renderer';
import { useT } from '../../i18n';
import { buildSrcdoc } from '../../runtime/srcdoc';
import { fetchPptxArrayBuffer } from './pptxFetch';
import { FlexCol } from '../UiPrimitives';

type OdSlideMessage = {
  type: 'od:slide';
  action: 'next' | 'prev' | 'first' | 'last' | 'go';
  index?: number;
};

/**
 * High-fidelity PPTX slide viewer.
 *
 * Uses `@aiden0z/pptx-renderer` (OOXML → HTML/SVG) instead of the legacy
 * JSZip/XML shape parser. That engine resolves theme colours, slide masters,
 * embedded fonts, gradients, dashed borders, groups, and backgrounds — the
 * pieces that made the old `.deck-stage` + manual DOM renderer look nothing
 * like PowerPoint / Google Slides.
 *
 * The sandboxed iframe still hosts Comment / Inspect / palette / edit bridges
 * via `buildSrcdoc`. Slide navigation is wired to the renderer's
 * `goToSlide()` API (deck bridge is off — it targeted `.slide` siblings the
 * old renderer created).
 */
export function PptxViewer({
  projectId,
  fileName,
  iframeRef,
  selectedPalette,
  onLoad,
  initialSlideIndex,
}: {
  projectId: string;
  fileName: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null> | any;
  selectedPalette: string | null;
  onLoad?: (info: { slideCount: number }) => void;
  initialSlideIndex?: number;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const engineRef = useRef<PptxRendererEngine | null>(null);
  const teardownNavRef = useRef<(() => void) | null>(null);
  const mountSlideIndexRef = useRef(initialSlideIndex ?? 0);

  const srcDoc = useMemo(
    () =>
      buildSrcdoc(
        `<div id="pptx-viewer-root" class="pptx-viewer-root" data-pptx-empty="1"></div>`,
        {
          commentBridge: true,
          inspectBridge: true,
          paletteBridge: true,
          editBridge: true,
          deck: false,
          initialPalette: selectedPalette,
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPalette],
  );

  useEffect(() => {
    return () => {
      teardownNavRef.current?.();
      teardownNavRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    teardownNavRef.current?.();
    teardownNavRef.current = null;
    engineRef.current?.destroy();
    engineRef.current = null;

    const iframe = iframeRef.current;
    if (iframe) {
      iframe.removeAttribute('data-pptx-loaded');
      if ((iframe as any)._pptxMutationObserver) {
        try {
          (iframe as any)._pptxMutationObserver.disconnect();
          delete (iframe as any)._pptxMutationObserver;
        } catch (e) {
          console.error('Error disconnecting pptx observer', e);
        }
      }
    }
  }, [projectId, fileName]);

  useEffect(() => {
    if (loading) return;
    if (typeof initialSlideIndex !== 'number') return;
    const engine = engineRef.current;
    if (!engine) return;
    void engine.goToSlide(initialSlideIndex);
  }, [initialSlideIndex, loading]);

  const handleIframeLoad = async (event?: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = (event?.currentTarget || iframeRef.current) as HTMLIFrameElement | null;
    if (!iframe || !iframe.contentDocument) return;
    if (iframe.getAttribute('data-pptx-loaded') === 'true') return;

    const root = iframe.contentDocument.getElementById('pptx-viewer-root');
    if (!root) return;

    iframe.setAttribute('data-pptx-loaded', 'true');

    try {
      const doc = iframe.contentDocument;
      const style = doc.createElement('style');
      style.textContent = PPTX_VIEWER_CSS;
      doc.head.appendChild(style);

      const fetched = await fetchPptxArrayBuffer(projectId, fileName);
      if ('error' in fetched) {
        throw new Error(fetched.error.message);
      }

      root.removeAttribute('data-pptx-empty');
      root.innerHTML = '';

      const mountIndex = mountSlideIndexRef.current;
      const engine = await PptxRendererEngine.open(fetched.buffer, root, {
        renderMode: 'slide',
        fitMode: 'contain',
      });
      engineRef.current = engine;

      teardownNavRef.current = installSlideNavigationBridge(iframe, engine, mountIndex);

      const observer = new MutationObserver(() => {
        annotateForBridges(root);
      });
      observer.observe(root, { childList: true, subtree: true });
      (iframe as any)._pptxMutationObserver = observer;

      const onRendered = () => annotateForBridges(root);
      engine.addEventListener('rendercomplete', onRendered);
      engine.addEventListener('sliderendered', onRendered);
      onRendered();

      if (engine.slideCount === 0) {
        throw new Error(t('pptxViewer.noSlides'));
      }

      setLoading(false);
      if (onLoad) onLoad({ slideCount: engine.slideCount });
    } catch (err) {
      console.error(err);
      iframe.removeAttribute('data-pptx-loaded');
      teardownNavRef.current?.();
      teardownNavRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      setError(err instanceof Error ? err.message : t('pptxViewer.renderFailed'));
      setLoading(false);
    }
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentDocument) {
      const root = iframe.contentDocument.getElementById('pptx-viewer-root');
      if (root && iframe.getAttribute('data-pptx-loaded') !== 'true') {
        void handleIframeLoad();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileName, loading]);

  return (
    <FlexCol
      className="srcdoc-viewer-shell canvas"
      gap={0}
    >
      {loading && (
        <div className="srcdoc-viewer-status">
          {t('pptxViewer.preparing')}
        </div>
      )}
      {error && (
        <div className="srcdoc-viewer-status error">
          {error}
        </div>
      )}
      <iframe
        key={`${projectId}-${fileName}-${selectedPalette}`}
        ref={iframeRef}
        data-testid="artifact-preview-frame"
        data-od-render-mode="srcdoc"
        title={fileName}
        sandbox="allow-scripts allow-downloads allow-same-origin"
        srcDoc={srcDoc}
        onLoad={handleIframeLoad}
        className="preview-frame-base"
      />
    </FlexCol>
  );
}

function installSlideNavigationBridge(
  iframe: HTMLIFrameElement,
  engine: PptxRendererEngine,
  initialIndex: number,
): () => void {
  const win = iframe.contentWindow;
  if (!win) return () => {};

  const postState = () => {
    try {
      win.parent.postMessage(
        {
          type: 'od:slide-state',
          active: engine.currentSlideIndex,
          count: engine.slideCount,
        },
        '*',
      );
    } catch {
      /* ignore */
    }
  };

  const onHostSlide = (ev: MessageEvent) => {
    if (ev.source !== win.parent) return;
    const data = ev.data as OdSlideMessage | null;
    if (!data || data.type !== 'od:slide') return;
    void handleOdSlideAction(engine, data).then(postState);
  };

  const onSlideChange = () => postState();

  win.addEventListener('message', onHostSlide);
  engine.addEventListener('slidechange', onSlideChange);

  void engine.goToSlide(initialIndex).then(postState);

  return () => {
    win.removeEventListener('message', onHostSlide);
    engine.removeEventListener('slidechange', onSlideChange);
  };
}

async function handleOdSlideAction(
  engine: PptxRendererEngine,
  data: OdSlideMessage,
): Promise<void> {
  const count = engine.slideCount;
  if (count <= 0) return;
  const current = engine.currentSlideIndex;
  let target = current;
  if (data.action === 'go' && typeof data.index === 'number') {
    target = data.index;
  } else if (data.action === 'next') {
    target = current + 1;
  } else if (data.action === 'prev') {
    target = current - 1;
  } else if (data.action === 'first') {
    target = 0;
  } else if (data.action === 'last') {
    target = count - 1;
  }
  const clamped = Math.max(0, Math.min(count - 1, target));
  await engine.goToSlide(clamped);
}

function annotateForBridges(root: HTMLElement): void {
  const skip = new Set([
    'script', 'style', 'template', 'noscript', 'br', 'meta', 'link',
  ]);
  let counter = 0;
  root.querySelectorAll('*').forEach((el) => {
    if (el.hasAttribute('data-od-id')) return;
    const tag = el.tagName.toLowerCase();
    if (skip.has(tag)) return;
    el.setAttribute('data-od-id', `pptx-${tag}-${counter++}`);
  });
}

const PPTX_VIEWER_CSS = `
* { box-sizing: border-box; }
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #ffffff;
  color: #1f2937;
}
.pptx-viewer-root {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.pptx-viewer-root[data-pptx-empty="1"]::before {
  content: '';
  position: absolute;
  inset: 0;
}
`;
