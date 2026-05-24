import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchProjectFilePreviewResult,
  type ProjectFilePreview,
  type ProjectFilePreviewSection,
} from '../../providers/registry';
import { useT } from '../../i18n';
import { buildClientPptxPreview } from './pptxClientPreview';
import { PptxViewer } from './PptxViewer';
import { Icon } from '../Icon';
import type { ProjectFile } from '../../types';

type Props = {
  projectId: string;
  file: ProjectFile;
  /**
   * When true the layout collapses to a vertical-stacked compact
   * mode (used inside the right-hand DfPreview rail). When false
   * the layout is full-width with the thumbnail strip on the left.
   */
  compact?: boolean;
  /** Optional secondary action — surfaced as a small toolbar link. */
  onOpenInTab?: () => void;
};

type LoadStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; stage: 'daemon' | 'client' }
  | { phase: 'ready'; preview: ProjectFilePreview; source: 'daemon' | 'client' }
  | { phase: 'error'; message: string };

/**
 * Compact slide preview used by `DfPreview` (and any other surface
 * that needs a thumbnail strip + main slide + navigation without
 * the full `DocumentPreviewViewer` toolbar). Internally this is a
 * thin shell around `PptxViewer`, which itself mirrors the docx
 * viewer pattern (sandboxed iframe + commentBridge / inspectBridge
 * / paletteBridge / editBridge, real DOM rendered into the iframe
 * by `pptxClientPreview`). The buggy `compilePptxToHtml` srcDoc
 * pipeline — including the malformed data:image/png base64 logo
 * that produced ERR_INVALID_URL spam — has been removed.
 *
 * The compact rail still benefits from running the daemon's
 * text-only preview in parallel: it gives us thumbnail titles for
 * each slide right away while the heavier client parse / DOM
 * render finishes. Once the rail is wired into the host viewer
 * (via Open in tab), the same Comment / Inspect interactions kick
 * in because every shape, paragraph and image carries a
 * `data-od-id` annotation the bridges already understand.
 */
export function SlidePreview({ projectId, file, compact = false, onOpenInTab }: Props) {
  const t = useT();
  const [status, setStatus] = useState<LoadStatus>({ phase: 'idle' });
  const [active, setActive] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setActive(0);
    setStatus({ phase: 'loading', stage: 'daemon' });

    void (async () => {
      // Strategy: pull the daemon's text-only summary first so the
      // thumbnail strip has slide titles right away while the
      // client-side JSZip parser is still running. The renderer in
      // the iframe is driven by `PptxViewer`, which calls
      // `buildClientPptxPreview` on its own — but we also call it
      // here so the thumbnail strip can show counts that match
      // exactly what the viewer will render (handles the case
      // where the daemon refuses big files entirely).
      const daemonResult = await fetchProjectFilePreviewResult(projectId, file.name);
      if (cancelled) return;

      let daemonFailure: string | null = null;
      if (daemonResult.ok) {
        setStatus({ phase: 'ready', preview: daemonResult.preview, source: 'daemon' });
      } else {
        daemonFailure = daemonResult.message;
        setStatus({ phase: 'loading', stage: 'client' });
      }

      const clientResult = await buildClientPptxPreview(projectId, file.name, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if ('preview' in clientResult) {
        setStatus({ phase: 'ready', preview: clientResult.preview, source: 'client' });
        return;
      }
      if (daemonFailure) {
        setStatus({
          phase: 'error',
          message: formatPreviewError(daemonFailure, clientResult.error.message),
        });
      }
      // Daemon succeeded; client parser failed — keep daemon's
      // text-only view so the rail at least shows slide titles.
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, file.name, file.mtime]);

  // Sync the host counter with whatever slide the deck bridge has
  // marked active inside the iframe. PptxViewer enables the deck
  // bridge in `buildSrcdoc({ deck: true })`, which postMessages
  // `od:slide-state` after every navigation.
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string; active?: number } | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active === 'number') setActive(data.active);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [file.name]);

  const preview = status.phase === 'ready' ? status.preview : null;
  const total = preview?.sections.length ?? 0;

  function postSlide(index: number) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:slide', action: 'go', index }, '*');
  }

  function goRelative(delta: number) {
    if (!preview) return;
    const totalSlides = preview.sections.length;
    if (!totalSlides) return;
    const next = Math.max(0, Math.min(totalSlides - 1, active + delta));
    if (next === active) return;
    setActive(next);
    postSlide(next);
  }

  function goTo(index: number) {
    if (!preview) return;
    setActive(index);
    postSlide(index);
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function onKey(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goRelative(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goRelative(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End' && preview) {
        e.preventDefault();
        goTo(preview.sections.length - 1);
      }
    }
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [preview, active]);

  const counter = useMemo(
    () => (total > 0 ? t('slideViewer.position', { current: active + 1, total }) : '0 / 0'),
    [t, total, active],
  );

  return (
    <div
      ref={containerRef}
      className={`slide-preview ${compact ? 'slide-preview-compact' : ''}`}
      tabIndex={0}
      role="region"
      aria-label={file.name}
    >
      {status.phase === 'loading' ? (
        <div className="slide-preview-loading" data-testid="slide-preview-loading">
          {status.stage === 'client'
            ? t('slideViewer.fallback')
            : t('slideViewer.loading')}
        </div>
      ) : status.phase === 'error' ? (
        <div className="slide-preview-empty" data-testid="slide-preview-error">
          <div>{t('slideViewer.unavailable')}</div>
          <div className="slide-preview-error-detail">{status.message}</div>
        </div>
      ) : !preview || preview.sections.length === 0 ? (
        <div className="slide-preview-empty">{t('slideViewer.unavailable')}</div>
      ) : (
        <>
          <ThumbnailStrip
            sections={preview.sections}
            active={active}
            onSelect={goTo}
            compact={compact}
            t={t}
          />
          <div className="slide-preview-stage">
            <PptxViewer
              projectId={projectId}
              fileName={file.name}
              iframeRef={iframeRef}
              selectedPalette={null}
              initialSlideIndex={active}
            />
            <div className="slide-preview-nav" role="group" aria-label="Slide navigation">
              <button
                type="button"
                className="icon-only"
                onClick={() => goRelative(-1)}
                disabled={active <= 0}
                aria-label={t('slideViewer.prev')}
                title={t('slideViewer.prev')}
              >
                <Icon name="chevron-right" size={14} className="icon-rotate-180" />
              </button>
              <span className="slide-preview-counter">{counter}</span>
              <button
                type="button"
                className="icon-only"
                onClick={() => goRelative(1)}
                disabled={active >= total - 1}
                aria-label={t('slideViewer.next')}
                title={t('slideViewer.next')}
              >
                <Icon name="chevron-right" size={14} />
              </button>
              {status.phase === 'ready' && status.source === 'client' ? (
                <span
                  className="slide-preview-source"
                  title={t('slideViewer.parsedLocallyTitle')}
                >
                  {t('slideViewer.parsedLocally')}
                </span>
              ) : null}
              {onOpenInTab ? (
                <button
                  type="button"
                  className="slide-preview-open"
                  onClick={onOpenInTab}
                  title={t('slideViewer.openInTab')}
                >
                  <Icon name="eye" size={13} />
                  <span>{t('slideViewer.openInTab')}</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThumbnailStrip({
  sections,
  active,
  onSelect,
  compact,
  t,
}: {
  sections: ProjectFilePreviewSection[];
  active: number;
  onSelect: (index: number) => void;
  compact: boolean;
  t: ReturnType<typeof useT>;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = stripRef.current?.querySelector<HTMLElement>(
      `[data-slide-index="${active}"]`,
    );
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active]);
  return (
    <div
      ref={stripRef}
      className="slide-preview-thumbs"
      role="listbox"
      aria-label={t('slideViewer.openInTab')}
    >
      {sections.map((section, idx) => {
        const slideTitle = section.title?.trim() || t('slideViewer.slideTitle', { n: idx + 1 });
        const ariaLabel = t('slideViewer.thumbnailAria', { n: idx + 1 });
        return (
          <button
            key={`${idx}-${section.title}`}
            type="button"
            role="option"
            aria-selected={idx === active}
            data-slide-index={idx}
            className={`slide-thumb ${idx === active ? 'active' : ''}`}
            onClick={() => onSelect(idx)}
            title={ariaLabel}
            aria-label={ariaLabel}
          >
            <span className="slide-thumb-num">{String(idx + 1).padStart(2, '0')}</span>
            <span className="slide-thumb-title">{slideTitle}</span>
            {!compact && section.lines && section.lines[0] ? (
              <span className="slide-thumb-sub">{section.lines[0]}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function formatPreviewError(daemonMessage: string, clientMessage: string): string {
  const parts: string[] = [];
  if (daemonMessage) parts.push(`Server: ${daemonMessage}`);
  if (clientMessage) parts.push(`Local: ${clientMessage}`);
  return parts.join(' · ');
}
