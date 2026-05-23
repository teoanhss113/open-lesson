import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type {
  ProjectFile,
  PreviewComment,
  ChatCommentAttachment,
  PreviewCommentTarget,
  PreviewCommentMember,
} from '../../types';
import type {
  BoardTool,
  StrokePoint,
  InspectTarget,
  InspectStyleSnapshot,
} from './types';
import { useT } from '../../i18n';
import {
  fetchProjectFilePreviewResult,
  projectFileUrl,
  type ProjectFilePreview,
  type ProjectFilePreviewSection,
} from '../../providers/registry';
import { buildClientPptxPreview } from './pptxClientPreview';
import {
  documentMetaLabel,
  usePreviewCanvasSize,
  previewScaleShellStyle,
  previewViewportStyle,
  effectivePreviewScale,
  MAX_BRIDGE_COORDINATE,
  updateInspectOverride,
} from './utils';
import { FileActions } from './FileActions';
import { Icon } from '../Icon';
import { Toast } from '../Toast';
import { buildSrcdoc } from '../../runtime/srcdoc';
import { PreviewViewportControls } from './PreviewViewportControls';
import { PaletteTweaks, type PaletteId } from '../PaletteTweaks';
import { PreviewDrawOverlay, type PreviewDrawMode } from '../PreviewDrawOverlay';
import { DocxViewer } from './DocxViewer';
import { PptxViewer } from './PptxViewer';
import { BoardComposerPopover } from './BoardComposerPopover';
import { CommentSidePanel } from './CommentSidePanel';
import { InspectPanel } from './InspectPanel';
import {
  buildBoardCommentAttachments,
  commentsToAttachments,
  liveSnapshotForComment,
  overlayBoundsFromSnapshot,
  targetFromSnapshot,
  type PreviewCommentSnapshot,
} from '../../comments';

export function DocumentPreviewViewer({
  projectId,
  file,
  streaming,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onSelectionChange,
}: {
  projectId: string;
  file: ProjectFile;
  streaming?: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => Promise<void> | void;
  onSelectionChange?: (text: string) => void;
}) {
  const t = useT();
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  // States for tabs and viewport controls
  const [pdfTab, setPdfTab] = useState<'visual' | 'text'>('visual');
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeSheet, setActiveSheet] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  // Unified toolbar & layout states
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  // States for reviews and drawing overlay
  const [boardMode, setBoardMode] = useState(false);
  const [boardTool, setBoardTool] = useState<BoardTool>('inspect');
  const [inspectMode, setInspectMode] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const [palettePopoverOpen, setPalettePopoverOpen] = useState(false);
  const [selectedPalette, setSelectedPalette] = useState<PaletteId | null>(null);
  const [previewPalette, setPreviewPalette] = useState<PaletteId | null>(null);
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false);
  const [drawOverlayMode, setDrawOverlayMode] = useState<PreviewDrawMode>('click');

  // Interactive comment & inspect specific states
  const [activeCommentTarget, setActiveCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [hoveredCommentTarget, setHoveredCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [liveCommentTargets, setLiveCommentTargets] = useState<Map<string, PreviewCommentSnapshot>>(new Map());
  const [activePreviewCommentId, setActivePreviewCommentId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [queuedBoardNotes, setQueuedBoardNotes] = useState<string[]>([]);
  const [commentSidePanelCollapsed, setCommentSidePanelCollapsed] = useState(false);
  const [strokePoints, setStrokePoints] = useState<StrokePoint[]>([]);
  const [selectedSideCommentIds, setSelectedSideCommentIds] = useState<Set<string>>(new Set());
  const [sendingBoardBatch, setSendingBoardBatch] = useState(false);
  const [commentSavedToast, setCommentSavedToast] = useState<string | null>(null);

  const [activeInspectTarget, setActiveInspectTarget] = useState<InspectTarget | null>(null);
  const [inspectOverrides, setInspectOverrides] = useState<Record<string, any>>({});
  const [inspectSavedAt, setInspectSavedAt] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();

  const liveCommentTargetsRef = useRef(liveCommentTargets);
  useEffect(() => {
    liveCommentTargetsRef.current = liveCommentTargets;
  }, [liveCommentTargets]);

  const effectiveKind = preview?.kind || (file.kind as any);
  const isDeck = effectiveKind === 'presentation';
  const isDoc = effectiveKind === 'document';

  // Dynamic zoom scale calculation
  const calculatedScale = useMemo(() => {
    if (!previewBodySize?.width) return 100;
    const availableWidth = previewBodySize.width - 48;
    const targetWidth = isDeck ? 1000 : 850;
    return Math.max(25, Math.min(200, Math.round((availableWidth / targetWidth) * 100)));
  }, [previewBodySize?.width, isDeck]);

  const actualZoom = zoom === 'fit' ? calculatedScale : zoom;

  const overlayPreviewScale = useMemo(() => {
    return effectivePreviewScale(previewViewport, actualZoom / 100, previewBodySize);
  }, [previewViewport, actualZoom, previewBodySize]);

  // Reset page/slide/sheet/review indices when switching files
  useEffect(() => {
    setActiveSlide(0);
    setActiveSheet(0);
    setPdfTab('visual');
    setMode('preview');
    setZoom('fit');
    setPreviewViewport('desktop');
    setBoardMode(false);
    setInspectMode(false);
    setManualEditMode(false);
    setPalettePopoverOpen(false);
    setSelectedPalette(null);
    setPreviewPalette(null);
    setDrawOverlayOpen(false);
    clearBoardComposer();
  }, [file.name]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setPreview(null);
    const isPresentation =
      (file.kind as string) === 'presentation' || /\.pptx?$/i.test(file.name);
    void (async () => {
      const daemonResult = await fetchProjectFilePreviewResult(projectId, file.name);
      if (cancelled) return;
      if (daemonResult.ok) {
        // Render the daemon's text-only result immediately so the
        // user sees actual slide content right away. For
        // presentations we still kick off the client parser below
        // and silently upgrade to the rich slideLayout when it
        // finishes — that's what carries the shape positions /
        // fonts / images the renderer needs for fidelity.
        setPreview(daemonResult.preview);
        setLoading(false);
        if (!isPresentation) return;
      } else if (!isPresentation) {
        setPreview(null);
        setLoading(false);
        return;
      }
      const clientResult = await buildClientPptxPreview(projectId, file.name, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if ('preview' in clientResult) {
        setPreview(clientResult.preview);
      } else if (!daemonResult.ok) {
        setPreview(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId, file.name, file.mtime, file.kind, reloadKey]);

  // Sync slide navigation message responses from inside the iframe's deck bridge
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev?.data as { type?: string; active?: number; count?: number } | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number') return;
      setActiveSlide(data.active);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [file.name]);

  // Selection tracker listener
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string; text?: string } | null;
      if (!data || data.type !== 'od:selection') return;
      onSelectionChange?.(data.text || '');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelectionChange]);

  const rawUrl = `${projectFileUrl(projectId, file.name)}?v=${Math.round(file.mtime)}`;

  const bumpZoom = (delta: number) => {
    const currentVal = zoom === 'fit' ? calculatedScale : zoom;
    const nextVal = Math.max(25, Math.min(200, Math.round((currentVal + delta) / 25) * 25));
    setZoom(nextVal);
  };

  const postSlide = (action: 'next' | 'prev' | 'first' | 'last' | 'go', index?: number) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:slide', action, index }, '*');
  };

  const handleNextSlide = () => {
    if (!preview) return;
    const next = Math.min(preview.sections.length - 1, activeSlide + 1);
    setActiveSlide(next);
    postSlide('go', next);
  };

  const handlePrevSlide = () => {
    const prev = Math.max(0, activeSlide - 1);
    setActiveSlide(prev);
    postSlide('go', prev);
  };

  // Click outside listener for the zoom dropdown menu
  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(event.target as Node)) {
        setZoomMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [zoomMenuOpen]);

  // State synchronization with iframe
  function syncBridgeModes() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
    const palette = previewPalette || selectedPalette;
    win.postMessage({ type: 'od:palette', palette }, '*');
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
  }

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode,
      mode: boardTool,
    }, '*');
  }, [boardMode, boardTool]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
  }, [inspectMode]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const palette = previewPalette || selectedPalette;
    win.postMessage({ type: 'od:palette', palette }, '*');
  }, [previewPalette, selectedPalette]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
  }, [manualEditMode]);

  // Comments interaction postMessage listeners
  useEffect(() => {
    const selectionMode = boardMode;
    if (!selectionMode) {
      setActiveCommentTarget(null);
      setHoveredCommentTarget(null);
      setActivePreviewCommentId(null);
      setLiveCommentTargets(new Map());
      setQueuedBoardNotes([]);
      setStrokePoints([]);
      return;
    }
    const snapshotFromData = (data: Partial<PreviewCommentSnapshot>): PreviewCommentSnapshot => ({
      filePath: file.name,
      elementId: String(data.elementId || ''),
      selector: String(data.selector || ''),
      label: String(data.label || ''),
      text: String(data.text || ''),
      position: {
        x: clampBridgeCoordinate(data.position?.x),
        y: clampBridgeCoordinate(data.position?.y),
        width: clampBridgeCoordinate(data.position?.width),
        height: clampBridgeCoordinate(data.position?.height),
      },
      htmlHint: String(data.htmlHint || ''),
      selectionKind: data.selectionKind === 'pod' ? 'pod' : 'element',
      memberCount: finiteBridgeInteger(data.memberCount),
      podMembers: Array.isArray(data.podMembers) ? data.podMembers : undefined,
    });
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as (Partial<PreviewCommentSnapshot> & {
        type?: string;
        targets?: Array<Partial<PreviewCommentSnapshot>>;
        points?: StrokePoint[];
      }) | null;
      if (!data?.type) return;
      if (data.type === 'od:comment-targets' && Array.isArray(data.targets)) {
        const next = new Map<string, PreviewCommentSnapshot>();
        data.targets.forEach((item) => {
          const snapshot = snapshotFromData(item);
          if (snapshot.elementId) next.set(snapshot.elementId, snapshot);
        });
        setLiveCommentTargets(next);
        setActiveCommentTarget((current) => (
          current
            ? current.selectionKind === 'pod'
              ? current
              : next.get(current.elementId) ?? null
            : null
        ));
        setHoveredCommentTarget((current) => (
          current
            ? current.selectionKind === 'pod'
              ? current
              : next.get(current.elementId) ?? null
            : null
        ));
        return;
      }
      if (data.type === 'od:comment-leave') {
        setHoveredCommentTarget(null);
        return;
      }
      if (data.type === 'od:comment-hover') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId) return;
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => new Map(current).set(snapshot.elementId, snapshot));
        return;
      }
      if (data.type === 'od:comment-target') {
        const snapshot = snapshotFromData(data);
        if (!snapshot.elementId) return;
        const existing = (previewComments || []).find((comment) =>
          comment.filePath === file.name &&
          comment.status === 'open' &&
          comment.elementId === snapshot.elementId,
        );
        setActiveCommentTarget(snapshot);
        setHoveredCommentTarget(snapshot);
        setLiveCommentTargets((current) => new Map(current).set(snapshot.elementId, snapshot));
        if (boardMode) {
          setActivePreviewCommentId(existing?.id ?? null);
          setCommentDraft(existing?.note ?? '');
          setQueuedBoardNotes([]);
        }
        return;
      }
      if (data.type === 'od:pod-clear') {
        setStrokePoints([]);
        return;
      }
      if (data.type === 'od:pod-stroke' && Array.isArray(data.points)) {
        setStrokePoints(
          data.points.map((point) => ({
            x: clampBridgeCoordinate(point.x),
            y: clampBridgeCoordinate(point.y),
          })),
        );
        return;
      }
      if (data.type === 'od:pod-select' && Array.isArray(data.points)) {
        const points = data.points.map((point) => ({
          x: clampBridgeCoordinate(point.x),
          y: clampBridgeCoordinate(point.y),
        }));
        setStrokePoints(points);
        const nextTarget = buildPodSnapshot({
          filePath: file.name,
          strokePoints: points,
          liveTargets: liveCommentTargetsRef.current,
        });
        if (!nextTarget) {
          setStrokePoints([]);
          return;
        }
        setActiveCommentTarget(nextTarget);
        setHoveredCommentTarget(nextTarget);
        setActivePreviewCommentId(null);
        setQueuedBoardNotes([]);
        setCommentDraft('');
        setStrokePoints([]);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [boardMode, file.name, previewComments]);

  // Mirror comment-targets for either comment or inspect mode
  useEffect(() => {
    if (!inspectMode && !boardMode) {
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string; targets?: Array<Partial<PreviewCommentSnapshot>> } | null;
      if (data?.type !== 'od:comment-targets' || !Array.isArray(data.targets)) return;
      const next = new Map<string, PreviewCommentSnapshot>();
      data.targets.forEach((item) => {
        const elementId = String(item?.elementId || '');
        if (!elementId) return;
        next.set(elementId, {
          filePath: file.name,
          elementId,
          selector: String(item?.selector || ''),
          label: String(item?.label || ''),
          text: String(item?.text || ''),
          position: {
            x: clampBridgeCoordinate(item?.position?.x),
            y: clampBridgeCoordinate(item?.position?.y),
            width: clampBridgeCoordinate(item?.position?.width),
            height: clampBridgeCoordinate(item?.position?.height),
          },
          htmlHint: String(item?.htmlHint || ''),
          selectionKind: 'element',
          memberCount: undefined,
        });
      });
      setLiveCommentTargets(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode, boardMode, file.name]);

  // Inspect mode event receiver
  useEffect(() => {
    if (!inspectMode) {
      setActiveInspectTarget(null);
      setInspectError(null);
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as
        | { type?: string; elementId?: string; selector?: string; label?: string; text?: string; style?: InspectStyleSnapshot }
        | null;
      if (!data || data.type !== 'od:comment-target') return;
      if (!data.elementId || !data.selector) return;
      setActiveInspectTarget({
        elementId: String(data.elementId),
        selector: String(data.selector),
        label: String(data.label || ''),
        text: String(data.text || ''),
        style: data.style && typeof data.style === 'object' ? data.style : {},
      });
      setInspectError(null);
      setInspectSavedAt(null);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [inspectMode]);

  // Inspect post messages
  function postInspectSet(elementId: string, selector: string, prop: string, value: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-set', elementId, selector, prop, value }, '*');
  }

  function postInspectReset(elementId?: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-reset', elementId }, '*');
  }

  // Comment batch side panel sorting
  const visibleSideComments = useMemo(
    () => (previewComments || [])
      .filter((comment) => comment.filePath === file.name && comment.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt),
    [file.name, previewComments],
  );

  function clearBoardComposer() {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setActivePreviewCommentId(null);
    setCommentDraft('');
    setQueuedBoardNotes([]);
    setStrokePoints([]);
  }

  function queueCurrentDraft() {
    const note = commentDraft.trim();
    if (!note) return;
    setQueuedBoardNotes((current) => [...current, note]);
    setCommentDraft('');
  }

  async function sendBoardBatch() {
    if (!activeCommentTarget || !onSendBoardCommentAttachments) return;
    const nextNotes = [...queuedBoardNotes];
    if (commentDraft.trim()) nextNotes.push(commentDraft.trim());
    if (nextNotes.length === 0) return;
    setSendingBoardBatch(true);
    try {
      await onSendBoardCommentAttachments(
        buildBoardCommentAttachments({
          target: targetFromSnapshot(activeCommentTarget),
          notes: nextNotes,
        }),
      );
      clearBoardComposer();
    } finally {
      setSendingBoardBatch(false);
    }
  }

  async function savePersistentComment() {
    if (!activeCommentTarget || !commentDraft.trim() || !onSavePreviewComment) return;
    const isFreePin = activeCommentTarget.elementId.startsWith('pin-');
    const saved = await onSavePreviewComment(
      targetFromSnapshot(activeCommentTarget),
      commentDraft.trim(),
      false,
    );
    if (saved) {
      clearBoardComposer();
      setCommentSavedToast(isFreePin ? t('chat.comments.pinSavedToast') : t('chat.comments.savedToast'));
    }
  }

  // 1. PDF Renderer
  const renderPdf = (previewData: ProjectFilePreview | null) => {
    return pdfTab === 'visual' ? (
      <div
        className="pdf-iframe-container"
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg-subtle)',
          overflow: 'hidden',
        }}
      >
        <iframe
          src={`${rawUrl}#toolbar=0`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title={file.name}
        />
      </div>
    ) : (
      <div
        className="document-preview"
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-panel)',
          padding: 'var(--spacing-xxl) var(--spacing-xl)'
        }}
      >
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>
          {previewData ? (
            previewData.sections.map((section: ProjectFilePreviewSection, idx: number) => (
              <section
                key={`${section.title}-${idx}`}
                style={{
                  borderTop: idx > 0 ? '1px solid var(--border-soft)' : 'none',
                  marginTop: idx > 0 ? 'var(--spacing-md)' : '0',
                  paddingTop: idx > 0 ? 'var(--spacing-md)' : '0'
                }}
              >
                <h3 style={{ margin: '0 0 var(--spacing-sm)', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {section.title}
                </h3>
                {section.lines.map((line: string, lineIdx: number) => (
                  <p key={`${lineIdx}-${line}`} style={{ margin: '0 0 var(--spacing-xs)', fontSize: '14px', lineHeight: 1.6, color: 'var(--text)' }}>
                    {line}
                  </p>
                ))}
              </section>
            ))
          ) : (
            <div className="viewer-empty">No text content available.</div>
          )}
        </div>
      </div>
    );
  };

  // 2. XLSX Grid Spreadsheet Renderer
  const renderXlsx = (previewData: ProjectFilePreview) => {
    if (!previewData.sections || previewData.sections.length === 0) {
      return <div className="viewer-empty">No worksheets found in this spreadsheet.</div>;
    }

    const currentWorksheet = previewData.sections[activeSheet] || previewData.sections[0]!;

    return (
      <div
        className="xlsx-viewer-layout"
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          background: 'var(--bg-panel)'
        }}
      >
        {currentWorksheet.lines.length === 0 ? (
          <div className="viewer-empty" style={{ padding: 'var(--spacing-xxl)' }}>
            No readable cell values found.
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--bg-subtle)',
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}
              >
                <th
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    color: 'var(--text-muted)',
                    fontWeight: 'bold',
                    width: '45px',
                    textAlign: 'center',
                    borderRight: '1px solid var(--border-soft)',
                    background: 'var(--bg-subtle)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 11
                  }}
                >
                  #
                </th>
                {(() => {
                  let maxCols = 1;
                  currentWorksheet.lines.forEach((r) => {
                    const count = r.split(' | ').length;
                    if (count > maxCols) maxCols = count;
                  });

                  const headers = [];
                  for (let c = 0; c < maxCols; c++) {
                    let label = '';
                    let temp = c;
                    while (temp >= 0) {
                      label = String.fromCharCode((temp % 26) + 65) + label;
                      temp = Math.floor(temp / 26) - 1;
                    }
                    headers.push(
                      <th
                        key={c}
                        style={{
                          padding: 'var(--spacing-sm) var(--spacing-md)',
                          fontWeight: '600',
                          color: 'var(--text)',
                          textAlign: 'left',
                          borderRight: '1px solid var(--border-soft)'
                        }}
                      >
                        {label}
                      </th>
                    );
                  }
                  return headers;
                })()}
              </tr>
            </thead>
            <tbody>
              {currentWorksheet.lines.map((line: string, rIdx: number) => {
                const cells = line.split(' | ');
                return (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: '1px solid var(--border-soft)',
                      background: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'var(--bg-panel)',
                      transition: 'background-color 100ms ease'
                    }}
                  >
                    <td
                      style={{
                        padding: 'var(--spacing-xs) var(--spacing-sm)',
                        color: 'var(--text-muted)',
                        textAlign: 'center',
                        borderRight: '1px solid var(--border-soft)',
                        fontWeight: '500',
                        background: 'var(--bg-subtle)',
                        userSelect: 'none',
                        position: 'sticky',
                        left: 0,
                        zIndex: 2
                      }}
                    >
                      {rIdx + 1}
                    </td>
                    {cells.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: 'var(--spacing-sm) var(--spacing-md)',
                          color: 'var(--text)',
                          borderRight: '1px solid var(--border-soft)',
                          whiteSpace: 'nowrap',
                          minWidth: '120px',
                          maxWidth: '300px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={cell}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderSource = () => {
    if (!preview) {
      return <div className="viewer-empty">No source content available.</div>;
    }
    return (
      <div
        className="source-viewer"
        style={{
          padding: 'var(--spacing-xl)',
          background: '#1e1e1e',
          color: '#d4d4d4',
          height: '100%',
          overflowY: 'auto',
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: '14px',
          lineHeight: '1.6'
        }}
      >
        <pre style={{ margin: 0 }}>{JSON.stringify(preview, null, 2)}</pre>
      </div>
    );
  };

  // Per-kind viewers (DocxViewer, PptxViewer) own their srcDoc /
  // rendering. The legacy `compilePptxToHtml` / `compileDocxToHtml`
  // templating pipeline produced static HTML — including the
  // malformed `data:image/png;base64,...` MindX logo that triggered
  // ERR_INVALID_URL spam and a brand template that ignored the
  // user's real slide content. The new viewers render real DOM
  // (docx-preview for .docx, pptxClientPreview for .pptx) into
  // sandboxed iframes that already carry the Comment / Inspect /
  // palette / edit bridges via `buildSrcdoc`, so every interactive
  // feature works against true slide elements instead of a brand
  // mock-up. We no longer need a srcDoc fallback at this layer.
  const srcDoc = '';

  const renderBody = () => {
    if (loading) {
      return <div className="viewer-empty">{t('fileViewer.loading')}</div>;
    }

    if (!preview && file.kind !== 'pdf') {
      return <div className="viewer-empty">{t('fileViewer.previewUnavailable')}</div>;
    }

    if (effectiveKind === 'pdf') {
      return (
        <PreviewDrawOverlay
          active={drawOverlayOpen}
          onActiveChange={setDrawOverlayOpen}
          onModeChange={setDrawOverlayMode}
          filePath={file.name}
        >
          {renderPdf(preview)}
        </PreviewDrawOverlay>
      );
    }
    if (effectiveKind === 'spreadsheet') {
      return (
        <PreviewDrawOverlay
          active={drawOverlayOpen}
          onActiveChange={setDrawOverlayOpen}
          onModeChange={setDrawOverlayMode}
          filePath={file.name}
        >
          {renderXlsx(preview!)}
        </PreviewDrawOverlay>
      );
    }
    // Render interactive compiled iframe for presentation or document
    return (
      <div
        className={`comment-preview-layer preview-viewport preview-viewport-${previewViewport}`}
        style={previewViewportStyle(previewViewport, actualZoom / 100, previewBodySize)}
      >
        <div className="comment-frame-clip">
          <div style={previewScaleShellStyle(previewViewport, actualZoom / 100)}>
            <PreviewDrawOverlay
              active={drawOverlayOpen}
              onActiveChange={setDrawOverlayOpen}
              onModeChange={setDrawOverlayMode}
              filePath={file.name}
            >
              {effectiveKind === 'document' ? (
                <DocxViewer
                  projectId={projectId}
                  fileName={file.name}
                  iframeRef={iframeRef}
                  selectedPalette={selectedPalette}
                  onLoad={syncBridgeModes}
                />
              ) : effectiveKind === 'presentation' ? (
                <PptxViewer
                  projectId={projectId}
                  fileName={file.name}
                  iframeRef={iframeRef}
                  selectedPalette={selectedPalette}
                  initialSlideIndex={activeSlide}
                  onLoad={syncBridgeModes}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  data-testid="artifact-preview-frame"
                  data-od-render-mode="srcdoc"
                  title={file.name}
                  sandbox="allow-scripts allow-downloads"
                  srcDoc={srcDoc}
                  onLoad={syncBridgeModes}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                />
              )}
            </PreviewDrawOverlay>
          </div>
        </div>
        {boardMode ? (
          <CommentPreviewOverlays
            comments={boardMode ? visibleSideComments : []}
            liveTargets={liveCommentTargets}
            hoveredTarget={hoveredCommentTarget}
            activeTarget={activeCommentTarget}
            boardTool={boardTool}
            scale={overlayPreviewScale}
            strokePoints={strokePoints}
            onOpenComment={(comment, snapshot) => {
              setActiveCommentTarget(snapshot);
              setHoveredCommentTarget(snapshot);
              setActivePreviewCommentId(comment.id);
              setCommentDraft(comment.note);
              setQueuedBoardNotes([]);
            }}
          />
        ) : null}
      </div>
    );
  };

  const showNav = mode === 'preview' && isDeck && preview && preview.sections?.length > 0;

  return (
    <div className="viewer document-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          {/* Reload trigger */}
          <button
            type="button"
            className="icon-only"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reload')}
            aria-label={t('fileViewer.reloadAria') || 'Reload'}
          >
            <Icon name="reload" size={14} />
          </button>

          {/* Unified Preview vs Source tabs for presentations & documents */}
          {(isDeck || isDoc) ? (
            <div className="viewer-tabs">
              <button
                type="button"
                className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
                onClick={() => setMode('preview')}
              >
                {t('fileViewer.preview') || 'Preview'}
              </button>
              <button
                type="button"
                className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
                onClick={() => setMode('source')}
              >
                {t('fileViewer.source') || 'Source'}
              </button>
            </div>
          ) : null}

          {/* PDF visual vs text tabs switch in toolbar */}
          {file.kind === 'pdf' && (
            <div className="viewer-tabs" style={{ display: 'inline-flex' }}>
              <button
                type="button"
                className={`viewer-tab ${pdfTab === 'visual' ? 'active' : ''}`}
                onClick={() => setPdfTab('visual')}
              >
                {t('fileViewer.visualPreview')}
              </button>
              <button
                type="button"
                className={`viewer-tab ${pdfTab === 'text' ? 'active' : ''}`}
                onClick={() => setPdfTab('text')}
              >
                {t('fileViewer.textView')}
              </button>
            </div>
          )}

          {/* PPTX slide switcher pagination in toolbar */}
          {showNav && preview ? (
            <span className="deck-nav" role="group" aria-label="Slide navigation">
              <button
                type="button"
                className="icon-only"
                onClick={handlePrevSlide}
                disabled={activeSlide <= 0}
                style={{ opacity: activeSlide <= 0 ? 0.4 : 1, cursor: activeSlide <= 0 ? 'not-allowed' : 'pointer' }}
                title="Previous Slide"
              >
                <Icon name="chevron-right" size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="deck-nav-counter">
                {activeSlide + 1} / {preview.sections.length}
              </span>
              <button
                type="button"
                className="icon-only"
                onClick={handleNextSlide}
                disabled={activeSlide >= preview.sections.length - 1}
                style={{ opacity: activeSlide >= preview.sections.length - 1 ? 0.4 : 1, cursor: activeSlide >= preview.sections.length - 1 ? 'not-allowed' : 'pointer' }}
                title="Next Slide"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </span>
          ) : null}

          {/* XLSX worksheets tab switcher in toolbar */}
          {preview?.kind === 'spreadsheet' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', borderLeft: '1px solid var(--border-soft)', paddingLeft: 'var(--spacing-md)' }}>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Sheets:
              </span>
              <div className="viewer-tabs" style={{ display: 'inline-flex' }}>
                {preview.sections.map((sheet, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`viewer-tab ${activeSheet === idx ? 'active' : ''}`}
                    onClick={() => setActiveSheet(idx)}
                  >
                    {sheet.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <span className="viewer-meta">
            {documentMetaLabel(file, t)}
          </span>
        </div>

        {/* Viewport, zoom and file actions on the right side */}
        <div className="viewer-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          {mode === 'preview' ? (
            <>
              {/* Tweaks */}
              {(isDeck || isDoc) && (
                <div className="palette-tweaks-anchor" style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className={`viewer-action${selectedPalette || palettePopoverOpen ? ' active' : ''}`}
                    data-testid="palette-tweaks-toggle"
                    title="Tweaks"
                    aria-haspopup="dialog"
                    aria-expanded={palettePopoverOpen}
                    onClick={() => setPalettePopoverOpen((v) => !v)}
                  >
                    <Icon name="tweaks" size={13} />
                    <span>Tweaks</span>
                    {selectedPalette ? (
                      <span
                        className="palette-tweaks-badge"
                        aria-hidden
                        style={{
                          backgroundColor:
                            selectedPalette === 'coral' ? '#ff5a3c' :
                            selectedPalette === 'electric' ? '#7c3aed' :
                            selectedPalette === 'acid-forest' ? '#16a34a' :
                            selectedPalette === 'risograph' ? '#e11d48' :
                            '#0a0a0a',
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          marginLeft: '4px'
                        }}
                      />
                    ) : null}
                  </button>
                  <PaletteTweaks
                    open={palettePopoverOpen}
                    selected={selectedPalette}
                    onChange={setSelectedPalette}
                    onPreview={setPreviewPalette}
                    onClose={() => setPalettePopoverOpen(false)}
                  />
                </div>
              )}

              {/* Draw */}
              <button
                className={`viewer-action${drawOverlayOpen ? ' active' : ''}`}
                type="button"
                data-testid="draw-overlay-toggle"
                title={t('fileViewer.draw') || 'Draw'}
                aria-pressed={drawOverlayOpen}
                onClick={() => {
                  setDrawOverlayOpen(!drawOverlayOpen);
                  if (!drawOverlayOpen) {
                    setBoardMode(false);
                    setInspectMode(false);
                    setManualEditMode(false);
                  }
                }}
              >
                <Icon name="draw" size={13} />
                <span>{t('fileViewer.draw') || 'Draw'}</span>
              </button>

              {/* Viewport controls */}
              {(isDeck || isDoc) && (
                <>
                  <span className="viewer-divider" aria-hidden />
                  <PreviewViewportControls viewport={previewViewport} onViewport={setPreviewViewport} t={t} />
                </>
              )}

              {/* Comment */}
              <button
                type="button"
                className={`viewer-action viewer-comment-toggle${boardMode ? ' active' : ''}`}
                data-testid="board-mode-toggle"
                title={t('fileViewer.comment') || 'Comment'}
                aria-pressed={boardMode}
                onClick={() => {
                  if (boardMode) {
                    setBoardMode(false);
                  } else {
                    setBoardMode(true);
                    setInspectMode(false);
                    setDrawOverlayOpen(false);
                    setManualEditMode(false);
                  }
                }}
              >
                <Icon name="comment" size={13} />
                <span>{t('fileViewer.comment') || 'Comment'}</span>
              </button>

              {/* Comment Sub-modes (Picker & Pods) */}
              {boardMode && (
                <>
                  <button
                    className={`viewer-action${boardTool === 'inspect' ? ' active' : ''}`}
                    type="button"
                    data-testid="comment-mode-toggle"
                    title={t('fileViewer.commentPickerTitle')}
                    aria-label={t('fileViewer.commentPicker')}
                    aria-pressed={boardTool === 'inspect'}
                    onClick={() => setBoardTool('inspect')}
                  >
                    <Icon name="edit" size={13} />
                    <span>{t('fileViewer.commentPicker')}</span>
                  </button>
                  <button
                    className={`viewer-action${boardTool === 'pod' ? ' active' : ''}`}
                    type="button"
                    title={t('fileViewer.commentPodsTitle')}
                    aria-label={t('fileViewer.commentPods')}
                    aria-pressed={boardTool === 'pod'}
                    onClick={() => setBoardTool('pod')}
                  >
                    <Icon name="draw" size={13} />
                    <span>{t('fileViewer.commentPods')}</span>
                  </button>
                </>
              )}

              {/* Inspect */}
              <button
                className={`viewer-action${inspectMode ? ' active' : ''}`}
                type="button"
                data-testid="inspect-mode-toggle"
                title={t('fileViewer.inspect')}
                aria-pressed={inspectMode}
                onClick={() => {
                  if (inspectMode) {
                    setInspectMode(false);
                  } else {
                    setInspectMode(true);
                    setBoardMode(false);
                    setManualEditMode(false);
                    setDrawOverlayOpen(false);
                  }
                }}
              >
                <Icon name="tweaks" size={13} />
                <span>{t('fileViewer.inspect')}</span>
              </button>

              {/* Edit */}
              {(isDeck || isDoc) && (
                <button
                  className={`viewer-action${manualEditMode ? ' active' : ''}`}
                  type="button"
                  data-testid="manual-edit-mode-toggle"
                  title={t('fileViewer.edit') || 'Edit'}
                  aria-pressed={manualEditMode}
                  onClick={() => {
                    if (manualEditMode) {
                      setManualEditMode(false);
                    } else {
                      setManualEditMode(true);
                      setBoardMode(false);
                      setInspectMode(false);
                      setDrawOverlayOpen(false);
                    }
                  }}
                >
                  <Icon name="edit" size={13} />
                  <span>{t('fileViewer.edit') || 'Edit'}</span>
                </button>
              )}

              {/* Zoom Controls */}
              {(isDeck || isDoc) && (
                <>
                  <span className="viewer-divider" aria-hidden />
                  <button
                    type="button"
                    className="icon-only"
                    onClick={() => bumpZoom(-25)}
                    title={t('fileViewer.zoomOut') || 'Zoom out'}
                    aria-label={t('fileViewer.zoomOut') || 'Zoom out'}
                  >
                    <Icon name="minus" size={14} />
                  </button>

                  <div className="zoom-menu" ref={zoomMenuRef}>
                    <button
                      type="button"
                      className="viewer-action zoom-trigger"
                      aria-haspopup="menu"
                      aria-expanded={zoomMenuOpen}
                      onClick={() => setZoomMenuOpen((v) => !v)}
                      style={{ minWidth: 64 }}
                    >
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {zoom === 'fit' ? `${calculatedScale}%` : `${zoom}%`}
                      </span>
                      <Icon name="chevron-down" size={11} />
                    </button>
                    {zoomMenuOpen ? (
                      <div className="zoom-menu-popover" role="menu" style={{ display: 'block', position: 'absolute', right: 0, zIndex: 100 }}>
                        <button
                          type="button"
                          className={`zoom-menu-item${zoom === 'fit' ? ' active' : ''}`}
                          role="menuitem"
                          onClick={() => {
                            setZoom('fit');
                            setZoomMenuOpen(false);
                          }}
                        >
                          <span>{t('fileViewer.zoomFit') || 'Fit to screen'}</span>
                          {zoom === 'fit' ? <Icon name="check" size={13} /> : null}
                        </button>
                        <div className="zoom-menu-divider" style={{ height: '1px', background: 'var(--border-soft, #e5e7eb)', margin: '4px 0' }} />
                        {[50, 75, 100, 125, 150, 200].map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`zoom-menu-item${zoom === level ? ' active' : ''}`}
                            role="menuitem"
                            onClick={() => {
                              setZoom(level);
                              setZoomMenuOpen(false);
                            }}
                          >
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{level}%</span>
                            {zoom === level ? <Icon name="check" size={13} /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="icon-only"
                    onClick={() => bumpZoom(25)}
                    title={t('fileViewer.zoomIn') || 'Zoom in'}
                    aria-label={t('fileViewer.zoomIn') || 'Zoom in'}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </>
              )}

              <span className="viewer-divider" aria-hidden />
            </>
          ) : null}
          <FileActions projectId={projectId} file={file} />
        </div>
      </div>

      <div className="viewer-body" ref={previewBodyRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {mode === 'preview' ? renderBody() : renderSource()}
        {mode === 'preview' && boardMode && activeCommentTarget ? (
          <BoardComposerPopover
            target={activeCommentTarget}
            existing={visibleSideComments.find((comment) => comment.elementId === activeCommentTarget.elementId) ?? null}
            draft={commentDraft}
            notes={queuedBoardNotes}
            onDraft={setCommentDraft}
            onAddDraft={queueCurrentDraft}
            onRemoveQueuedNote={(index) =>
              setQueuedBoardNotes((current) => current.filter((_, currentIndex) => currentIndex !== index))
            }
            onClose={clearBoardComposer}
            onSaveComment={savePersistentComment}
            onSendBatch={sendBoardBatch}
            onRemove={async (commentId) => {
              if (!onRemovePreviewComment) return;
              await onRemovePreviewComment(commentId);
              clearBoardComposer();
            }}
            sending={sendingBoardBatch || !!streaming}
            t={t}
          />
        ) : null}
        {mode === 'preview' && boardMode ? (
          <CommentSidePanel
            comments={visibleSideComments}
            selectedIds={selectedSideCommentIds}
            collapsed={commentSidePanelCollapsed}
            onCollapsedChange={setCommentSidePanelCollapsed}
            onToggleSelect={(commentId) => {
              setSelectedSideCommentIds((current) => {
                const next = new Set(current);
                if (next.has(commentId)) next.delete(commentId);
                else next.add(commentId);
                return next;
              });
            }}
            onClearSelection={() => setSelectedSideCommentIds(new Set())}
            onReply={(comment) => {
              const snapshot = liveSnapshotForComment(comment, liveCommentTargets) ?? {
                filePath: file.name,
                elementId: comment.elementId,
                selector: comment.selector,
                label: comment.label || comment.elementId,
                text: comment.text || '',
                position: comment.position || { x: 0, y: 0, width: 0, height: 0 },
                htmlHint: comment.htmlHint || '',
                selectionKind: comment.selectionKind || 'element',
              };
              setActiveCommentTarget(snapshot);
              setHoveredCommentTarget(snapshot);
              setActivePreviewCommentId(comment.id);
              setCommentDraft(comment.note);
              setQueuedBoardNotes([]);
            }}
            onSendSelected={async () => {
              const selected = visibleSideComments.filter(
                (comment) => selectedSideCommentIds.has(comment.id),
              );
              if (selected.length === 0) return;
              setSendingBoardBatch(true);
              try {
                await onSendBoardCommentAttachments?.(commentsToAttachments(selected));
                setSelectedSideCommentIds(new Set());
              } finally {
                setSendingBoardBatch(false);
              }
            }}
            sending={sendingBoardBatch || !!streaming}
            t={t}
          />
        ) : null}
        {mode === 'preview' && inspectMode && activeInspectTarget ? (
          <InspectPanel
            target={activeInspectTarget}
            onApply={(prop, value) => {
              const target = activeInspectTarget;
              setInspectOverrides((current) =>
                updateInspectOverride(current, target.elementId, target.selector, prop, value),
              );
              postInspectSet(target.elementId, target.selector, prop, value);
            }}
            onResetElement={(elementId) => {
              setInspectOverrides((current) => {
                if (!(elementId in current)) return current;
                const next = { ...current };
                delete next[elementId];
                return next;
              });
              postInspectReset(elementId);
            }}
            onClose={() => setActiveInspectTarget(null)}
            onSaveToSource={() => {}}
            saving={false}
            savedAt={inspectSavedAt}
            error={inspectError}
          />
        ) : null}
        {commentSavedToast ? (
          <div className="comment-toast-anchor">
            <Toast
              message={commentSavedToast}
              ttlMs={2200}
              onDismiss={() => setCommentSavedToast(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Geometric overlay helper subcomponents copied from HtmlViewer.tsx
function CommentPreviewOverlays({
  comments,
  liveTargets,
  hoveredTarget,
  activeTarget,
  boardTool,
  scale,
  strokePoints,
  onOpenComment,
}: {
  comments: PreviewComment[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
  hoveredTarget: PreviewCommentSnapshot | null;
  activeTarget: PreviewCommentSnapshot | null;
  boardTool: BoardTool;
  scale: number;
  strokePoints: StrokePoint[];
  onOpenComment: (comment: PreviewComment, snapshot: PreviewCommentSnapshot) => void;
}) {
  const visibleComments = comments
    .map((comment, index) => ({
      comment,
      index,
      snapshot: liveSnapshotForComment(comment, liveTargets),
    }))
    .filter((item): item is { comment: PreviewComment; index: number; snapshot: PreviewCommentSnapshot } =>
      Boolean(item.snapshot),
    );
  const targetOverlay = activeTarget ?? hoveredTarget;
  return (
    <div className="comment-overlay-layer" aria-hidden={false}>
      {visibleComments.map(({ comment, index, snapshot }) => {
        const bounds = overlayBoundsFromSnapshot(snapshot, scale);
        return (
          <div
            key={comment.id}
            className="comment-saved-marker"
            style={{
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            }}
            data-testid={`comment-saved-marker-${comment.elementId}`}
          >
            <div className="comment-saved-outline" />
            <button
              type="button"
              className="comment-saved-pin"
              onClick={() => onOpenComment(comment, snapshot)}
              title={`${comment.elementId}: ${comment.note}`}
              aria-label={`Open comment for ${comment.elementId}`}
            >
              {index + 1}
            </button>
          </div>
        );
      })}
      {targetOverlay ? (
        <CommentTargetOverlay
          snapshot={targetOverlay}
          scale={scale}
          selected={Boolean(activeTarget)}
        />
      ) : null}
      {boardTool === 'pod' && strokePoints.length > 1 ? (
        <svg className="board-pod-stroke">
          <polyline
            points={strokePoints.map((point) => `${point.x * scale},${point.y * scale}`).join(' ')}
          />
        </svg>
      ) : null}
    </div>
  );
}

function CommentTargetOverlay({
  snapshot,
  scale,
  selected,
}: {
  snapshot: PreviewCommentSnapshot;
  scale: number;
  selected: boolean;
}) {
  const displayMembers = podDisplayMembers(snapshot);
  if (displayMembers.length > 0) {
    const overlayWeights = podOverlayWeights(displayMembers);
    return (
      <>
        {displayMembers.map((member, index) => {
          const bounds = overlayBoundsFromSnapshot(member, scale);
          const overlayWeight = overlayWeights[index] ?? {
            backgroundOpacity: 0.24,
            outlineOpacity: 0.72,
            ringOpacity: 0.18,
          };
          const overlayStyle: CSSProperties & Record<string, string | number> = {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            '--comment-overlay-bg': `rgba(22, 119, 255, ${overlayWeight.backgroundOpacity})`,
            '--comment-overlay-ring': `rgba(22, 119, 255, ${overlayWeight.ringOpacity})`,
            '--comment-overlay-border': `rgba(22, 119, 255, ${overlayWeight.outlineOpacity})`,
          };
          return (
            <div
              key={`${member.elementId}-${index}`}
              className={`comment-target-overlay comment-target-overlay--member${selected ? ' selected' : ''}`}
              style={overlayStyle}
              data-testid="comment-target-overlay"
            >
              <span className="comment-target-overlay-label">{snapshot.elementId}</span>
            </div>
          );
        })}
      </>
    );
  }
  const bounds = overlayBoundsFromSnapshot(snapshot, scale);
  return (
    <div
      className={`comment-target-overlay${selected ? ' selected' : ''}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      data-testid="comment-target-overlay"
    >
      <span className="comment-target-overlay-label">{snapshot.elementId}</span>
    </div>
  );
}

function podDisplayMembers(snapshot: PreviewCommentSnapshot): PreviewCommentSnapshot[] {
  if (snapshot.selectionKind !== 'pod' || !Array.isArray(snapshot.podMembers)) return [];
  const memberSnapshots = snapshot.podMembers.map((member) => ({
    filePath: snapshot.filePath,
    elementId: member.elementId,
    selector: member.selector,
    label: member.label,
    text: member.text,
    position: member.position,
    htmlHint: member.htmlHint,
    selectionKind: 'element' as const,
  }));
  const refined = pruneContainerSelections(memberSnapshots);
  return refined.length > 0 ? refined : memberSnapshots;
}

function podOverlayWeights(
  members: PreviewCommentSnapshot[],
): Array<{ backgroundOpacity: number; outlineOpacity: number; ringOpacity: number }> {
  const areas = members.map((member) =>
    Math.max(1, member.position.width * member.position.height),
  );
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  return areas.map((area) => {
    const normalized =
      maxArea === minArea ? 1 : 1 - (area - minArea) / (maxArea - minArea);
    const emphasis = Math.pow(normalized, 0.9);
    return {
      backgroundOpacity: roundOverlayOpacity(0.1 + emphasis * 0.6),
      outlineOpacity: roundOverlayOpacity(0.34 + emphasis * 0.36),
      ringOpacity: roundOverlayOpacity(0.08 + emphasis * 0.18),
    };
  });
}

function roundOverlayOpacity(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildPodSnapshot(input: {
  filePath: string;
  strokePoints: StrokePoint[];
  liveTargets: Map<string, PreviewCommentSnapshot>;
}): PreviewCommentSnapshot | null {
  if (input.strokePoints.length < 2) return null;
  const closedLoop = isClosedLoop(input.strokePoints);
  const intersected = Array.from(input.liveTargets.values()).filter((snapshot) =>
    selectionHitsSnapshot({
      points: input.strokePoints,
      snapshot,
      closedLoop,
    }),
  );
  const refined = pruneContainerSelections(intersected);
  const selected = refined.length > 0 ? refined : intersected;
  if (selected.length === 0) return null;
  const bounds = selected.reduce(
    (acc, snapshot) => {
      const rect = snapshot.position;
      return {
        left: Math.min(acc.left, rect.x),
        top: Math.min(acc.top, rect.y),
        right: Math.max(acc.right, rect.x + rect.width),
        bottom: Math.max(acc.bottom, rect.y + rect.height),
      };
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    },
  );
  const podMembers: PreviewCommentMember[] = selected.map((snapshot) => ({
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: snapshot.text,
    position: snapshot.position,
    htmlHint: snapshot.htmlHint,
  }));
  const summary = selected
    .slice(0, 3)
    .map((snapshot) => summarizeSnapshot(snapshot))
    .join(' · ');
  const htmlHint = selected
    .slice(0, 4)
    .map((snapshot) => snapshot.htmlHint)
    .filter(Boolean)
    .join(' ');
  const combinedSelector = selected
    .slice(0, 8)
    .map((snapshot) => snapshot.selector)
    .filter(Boolean)
    .join(', ');
  return {
    filePath: input.filePath,
    elementId: `pod-${Date.now()}`,
    selector: combinedSelector || 'body *',
    label: summary || `Pod of ${intersected.length} items`,
    text: intersected
      .slice(0, 4)
      .map((snapshot) => snapshot.text)
      .filter(Boolean)
      .join(' · '),
    position: {
      x: Math.round(bounds.left),
      y: Math.round(bounds.top),
      width: Math.max(1, Math.round(bounds.right - bounds.left)),
      height: Math.max(1, Math.round(bounds.bottom - bounds.top)),
    },
    htmlHint: htmlHint.slice(0, 180),
    selectionKind: 'pod',
    memberCount: selected.length,
    podMembers,
  };
}

function pruneContainerSelections(
  snapshots: PreviewCommentSnapshot[],
): PreviewCommentSnapshot[] {
  if (snapshots.length < 2) return snapshots;
  return snapshots.filter((candidate) => {
    const candidateArea = Math.max(1, candidate.position.width * candidate.position.height);
    const contained = snapshots.filter(
      (other) =>
        other.elementId !== candidate.elementId &&
        rectContains(candidate.position, other.position),
    );
    if (contained.length === 0) return true;
    const union = contained.reduce(
      (acc, other) => ({
        left: Math.min(acc.left, other.position.x),
        top: Math.min(acc.top, other.position.y),
        right: Math.max(acc.right, other.position.x + other.position.width),
        bottom: Math.max(acc.bottom, other.position.y + other.position.height),
      }),
      {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: Number.NEGATIVE_INFINITY,
        bottom: Number.NEGATIVE_INFINITY,
      },
    );
    const unionArea = Math.max(1, (union.right - union.left) * (union.bottom - union.top));
    return !(contained.length >= 2 && candidateArea > unionArea * 2.4);
  });
}

function summarizeSnapshot(snapshot: PreviewCommentSnapshot): string {
  const text = snapshot.text.trim();
  if (text) {
    const trimmed = text.length > 28 ? `${text.slice(0, 25)}...` : text;
    return `${snapshot.label || snapshot.elementId} · ${trimmed}`;
  }
  return snapshot.label || snapshot.elementId;
}

function selectionHitsSnapshot(input: {
  points: StrokePoint[];
  snapshot: PreviewCommentSnapshot;
  closedLoop: boolean;
}): boolean {
  const bounds = {
    left: input.snapshot.position.x,
    top: input.snapshot.position.y,
    width: input.snapshot.position.width,
    height: input.snapshot.position.height,
  };
  if (pathIntersectsRect(input.points, bounds)) return true;
  if (!input.closedLoop) return false;
  const center = {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  if (pointInPolygon(center, input.points)) return true;
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top },
    { x: bounds.left + bounds.width, y: bounds.top + bounds.height },
    { x: bounds.left, y: bounds.top + bounds.height },
  ];
  return corners.some((corner) => pointInPolygon(corner, input.points));
}

function isClosedLoop(points: StrokePoint[]): boolean {
  if (points.length < 4) return false;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return Math.hypot(first.x - last.x, first.y - last.y) <= 28;
}

function rectContains(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

function pathIntersectsRect(
  points: StrokePoint[],
  rect: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.length === 0) return false;
  const x1 = rect.left;
  const y1 = rect.top;
  const x2 = rect.left + rect.width;
  const y2 = rect.top + rect.height;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
      return true;
    }
    const next = points[index + 1];
    if (!next) continue;
    if (
      lineIntersectsLine(point, next, { x: x1, y: y1 }, { x: x2, y: y1 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y1 }, { x: x2, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x2, y: y2 }, { x: x1, y: y2 }) ||
      lineIntersectsLine(point, next, { x: x1, y: y2 }, { x: x1, y: y1 })
    ) {
      return true;
    }
  }
  return false;
}

function pointInPolygon(point: StrokePoint, polygon: StrokePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function lineIntersectsLine(a1: StrokePoint, a2: StrokePoint, b1: StrokePoint, b2: StrokePoint): boolean {
  const denominator =
    (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (denominator === 0) return false;
  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) / denominator;
  const ub =
    ((a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x)) / denominator;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function finiteBridgeInteger(value: unknown): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return clampBridgeCoordinate(value);
}

function clampBridgeCoordinate(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-MAX_BRIDGE_COORDINATE, Math.min(MAX_BRIDGE_COORDINATE, Math.round(numeric)));
}
