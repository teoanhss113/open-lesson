import { useEffect, useRef, useState, SyntheticEvent } from 'react';
import { useT } from '../../i18n';
import { projectFileUrl } from '../../providers/registry';
import { buildSrcdoc } from '../../runtime/srcdoc';
import { FlexCol } from '../UiPrimitives';

export function DocxViewer({
  projectId,
  fileName,
  iframeRef,
  selectedPalette,
  onLoad,
}: {
  projectId: string;
  fileName: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null> | any;
  selectedPalette: string | null;
  onLoad?: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate srcDoc with selection tracker, snapshot, palette, comment, inspect, etc. bridges.
  const srcDoc = buildSrcdoc(
    `
    <div id="docx-container" class="docx-viewer-content" style="
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      padding: var(--spacing-xl, 24px);
      box-sizing: border-box;
      opacity: 0.3;
      transition: opacity 150ms ease;
    "></div>
    `,
    {
      commentBridge: true,
      inspectBridge: true,
      paletteBridge: true,
      editBridge: true,
      initialPalette: selectedPalette,
    }
  );

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Disconnect and clean up the observer from a previous render
    const iframe = iframeRef.current;
    if (iframe && (iframe as any)._docxMutationObserver) {
      try {
        (iframe as any)._docxMutationObserver.disconnect();
        delete (iframe as any)._docxMutationObserver;
      } catch (e) {
        console.error('Error disconnecting observer', e);
      }
    }
  }, [projectId, fileName]);

  // Disconnect the observer on unmount
  useEffect(() => {
    return () => {
      const iframe = iframeRef.current;
      if (iframe && (iframe as any)._docxMutationObserver) {
        try {
          (iframe as any)._docxMutationObserver.disconnect();
          delete (iframe as any)._docxMutationObserver;
        } catch (e) {
          console.error('Error disconnecting observer on unmount', e);
        }
      }
    };
  }, []);

  const handleIframeLoad = (event?: SyntheticEvent<HTMLIFrameElement>) => {
    const iframe = event?.currentTarget || iframeRef.current;
    if (!iframe || !iframe.contentDocument) return;

    // Avoid duplicate renders
    if (iframe.getAttribute('data-docx-loaded') === 'true') return;

    const docxContainer = iframe.contentDocument.getElementById('docx-container');
    if (!docxContainer) return;

    const fileUrl = projectFileUrl(projectId, fileName);

    // Mark as loaded immediately to prevent double triggers during download
    iframe.setAttribute('data-docx-loaded', 'true');

    Promise.all([
      fetch(fileUrl).then((res) => {
        if (!res.ok) throw new Error(t('fileViewer.previewUnavailable'));
        return res.arrayBuffer();
      }),
      import('docx-preview'),
    ])
      .then(([buffer, docx]) => {
        const currentIframe = event?.currentTarget || iframeRef.current;
        if (!currentIframe || !currentIframe.contentDocument) return;

        const currentContainer = currentIframe.contentDocument.getElementById('docx-container');
        if (!currentContainer) return;
        
        currentContainer.innerHTML = '';

        // Add some nice styling for docx pages in the iframe's head
        const style = currentIframe.contentDocument.createElement('style');
        style.textContent = `
          body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-panel);
            font-family: Inter, system-ui, -apple-system, sans-serif;
            overflow: auto !important;
          }
          #docx-container {
            background-color: var(--bg-panel) !important;
            width: 100%;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          .docx-wrapper {
            background-color: var(--bg-panel) !important;
            padding: 24px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            width: fit-content !important;
            min-width: 100% !important;
            box-sizing: border-box !important;
            margin: 0 auto !important;
          }
          .docx {
            background: white !important;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) !important;
            margin-bottom: 24px !important;
            border-radius: var(--rounded-lg, 8px) !important;
            box-sizing: border-box !important;
            max-width: none !important;
          }
        `;
        currentIframe.contentDocument.head.appendChild(style);

        return docx.renderAsync(buffer, currentContainer, undefined, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          experimental: true,
        });
      })
      .then(() => {
        setLoading(false);
        const currentIframe = event?.currentTarget || iframeRef.current;
        if (currentIframe && currentIframe.contentDocument) {
          const currentContainer = currentIframe.contentDocument.getElementById('docx-container');
          if (currentContainer) {
            currentContainer.style.opacity = '1';

            let fallbackIndex = 0;
            const skipTags = new Set(['script', 'style', 'template', 'noscript', 'br']);
            
            const measureWidth = () => {
              if (!currentContainer) return;
              const docxElements = currentContainer.querySelectorAll('.docx');
              let maxWidth = 0;
              docxElements.forEach((el: any) => {
                // Measure both the bounding rect and the scroll width to capture any overflowing tables or content.
                const w = Math.max(el.getBoundingClientRect().width, el.scrollWidth);
                if (w > maxWidth) maxWidth = w;
              });

              // docx-preview can size the wrapper wider than the iframe viewport
              // without making scrollWidth exceed clientWidth. Include its border
              // box so "fit" scales against the real rendered page stack width.
              const wrapper = currentContainer.querySelector('.docx-wrapper');
              if (wrapper) {
                const wrapperWidth = Math.max(wrapper.getBoundingClientRect().width, wrapper.scrollWidth);
                const wrapperContentWidth = Math.max(0, wrapperWidth - 48);
                if (wrapperContentWidth > maxWidth) {
                  maxWidth = wrapperContentWidth;
                }
              }

              if (maxWidth > 0) {
                window.parent.postMessage({
                  type: 'od:docx-width',
                  width: maxWidth + 48,
                }, '*');
              }
            };

            const annotate = () => {
              if (!currentContainer) return;
              const allElements = currentContainer.querySelectorAll('*');
              let changed = false;
              allElements.forEach((el: any) => {
                if (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label')) return;
                const tag = el.tagName.toLowerCase();
                if (skipTags.has(tag)) return;
                el.setAttribute('data-od-id', `docx-${tag}-${fallbackIndex++}`);
                changed = true;
              });
              measureWidth();
              if (changed && onLoad) {
                onLoad();
              }
            };

            // Run immediate annotation pass
            annotate();

            // Set up MutationObserver to catch progressive/asynchronous child node attachments from docx-preview
            const observer = new MutationObserver((mutations) => {
              let shouldAnnotate = false;
              for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                  shouldAnnotate = true;
                  break;
                }
              }
              if (shouldAnnotate) {
                annotate();
              }
            });

            observer.observe(currentContainer, {
              childList: true,
              subtree: true,
            });

            // Store the observer instance on the iframe for cleanup on file change/unmount
            (currentIframe as any)._docxMutationObserver = observer;

            // Extra safety checks for progressive layout passes
            setTimeout(annotate, 100);
            setTimeout(annotate, 500);
            setTimeout(annotate, 1500);
          }
        }
        if (onLoad) onLoad();
      })
      .catch((err) => {
        console.error(err);
        const currentIframe = event?.currentTarget || iframeRef.current;
        if (currentIframe) {
          currentIframe.removeAttribute('data-docx-loaded');
        }
        setError(err.message || t('fileViewer.previewUnavailable'));
        setLoading(false);
      });
  };

  // Fallback useEffect to cover cases where onLoad doesn't fire or ref matches late
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe && iframe.contentDocument) {
      const docxContainer = iframe.contentDocument.getElementById('docx-container');
      if (docxContainer && iframe.getAttribute('data-docx-loaded') !== 'true') {
        handleIframeLoad();
      }
    }
  }, [projectId, fileName, loading]);

  return (
    <FlexCol
      className="srcdoc-viewer-shell"
      gap={0}
    >
      {loading && (
        <div className="srcdoc-viewer-status">
          {t('docxViewer.preparing')}
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
