import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { APP_CHROME_FILE_ACTIONS_ID } from '../AppChromeHeader';
import {
  anonymizeArtifactId,
  artifactKindToTracking,
  type TrackingProjectKind,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../../analytics/provider';
import {
  trackArtifactExportResult,
  trackStudioClickShareOption,
} from '../../analytics/events';
import { useT } from '../../i18n';
import {
  fetchProjectFileText,
  writeProjectTextFile,
  fetchProjectDeployments,
  fetchDeployConfig,
  fetchCloudflarePagesZones,
  updateDeployConfig,
  deployProjectFile,
  checkDeploymentLink,
  projectRawUrl,
  projectFileUrl,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DEFAULT_DEPLOY_PROVIDER_ID,
  type WebDeployConfigResponse,
  type WebCloudflarePagesDeploySelection,
  type WebDeploymentInfo,
  type WebDeployProjectFileResponse,
  type WebDeployProviderId,
  type WebUpdateDeployConfigRequest,
} from '../../providers/registry';
import {
  exportAsHtml,
  exportAsImage,
  exportAsMd,
  exportAsPdf,
  exportProjectAsPdf,
  exportProjectAsZip,
  openSandboxedPreviewInNewTab,
  requestPreviewSnapshot,
} from '../../runtime/exports';
import { buildSrcdoc } from '../../runtime/srcdoc';
import {
  hasUrlModeBridge,
  htmlNeedsSandboxShim,
  parseForceInline,
  shouldUrlLoadHtmlPreview,
} from '../file-viewer-render-mode';
import { saveTemplate } from '../../state/projects';
import type {
  ProjectFile,
  ChatCommentAttachment,
  PreviewComment,
  PreviewCommentMember,
  PreviewCommentTarget,
} from '../../types';
import { Icon } from '../Icon';
import { Toast } from '../Toast';
import { PaletteTweaks, type PaletteId } from '../PaletteTweaks';
import { PreviewDrawOverlay, type PreviewDrawMode } from '../PreviewDrawOverlay';
import {
  buildBoardCommentAttachments,
  commentsToAttachments,
  liveSnapshotForComment,
  overlayBoundsFromSnapshot,
  targetFromSnapshot,
  type PreviewCommentSnapshot,
} from '../../comments';
import { ManualEditPanel, emptyManualEditDraft, type ManualEditDraft } from '../ManualEditPanel';
import {
  applyManualEditPatch,
  isManualEditFullHtmlDocument,
  readManualEditAttributes,
  readManualEditFields,
  readManualEditOuterHtml,
  readManualEditStyles,
} from '../../edit-mode/source-patches';
import {
  MANUAL_EDIT_STYLE_PROPS,
  type ManualEditBridgeMessage,
  type ManualEditHistoryEntry,
  type ManualEditPatch,
  type ManualEditStyles,
  type ManualEditTarget,
} from '../../edit-mode/types';
import {
  type SlideState,
  type BoardTool,
  type StrokePoint,
  type ManualEditPendingStyleSave,
  type PreviewViewportId,
  type DeployResultCard,
  type InspectStyleSnapshot,
  type InspectTarget,
  type CloudflarePagesZoneOption,
} from './types';
import {
  MAX_BRIDGE_COORDINATE,
  PREVIEW_VIEWPORT_PRESETS,
  DEPLOY_PROVIDER_OPTIONS,
  mergeManualEditInspectorStyles,
  manualEditInspectorStyleValue,
  manualEditPersistedValueMatchesSavedSnapshot,
  getDeployProviderOption,
  normalizeCloudflareDomainPrefixInput,
  isValidCloudflareDomainPrefixInput,
  deployResultState,
  previewViewportStyle,
  effectivePreviewScale,
  previewScaleShellStyle,
  manualEditPreviewShellStyle,
  cancelManualEditPendingStyleSnapshot,
  usePreviewCanvasSize,
  setSlideStateCached,
  htmlPreviewSlideState,
  serializeInspectOverrides,
  updateInspectOverride,
  parseInspectOverridesFromSource,
  applyInspectOverridesToSource,
  humanSize,
  type InspectOverrideMap,
} from './utils';

import { PreviewViewportControls } from './PreviewViewportControls';
import { BoardComposerPopover } from './BoardComposerPopover';
import { CommentSidePanel } from './CommentSidePanel';
import { InspectPanel } from './InspectPanel';
import { useSpacebarPan } from './useSpacebarPan';

export function HtmlViewer({
  projectId,
  projectKind,
  file,
  liveHtml,
  filesRefreshKey = 0,
  isDeck,
  onExportAsPptx,
  streaming,
  previewComments = [],
  onSavePreviewComment,
  onRemovePreviewComment,
  onSendBoardCommentAttachments,
  onFileSaved,
  onSelectionChange,
}: {
  projectId: string;
  projectKind: TrackingProjectKind;
  file: ProjectFile;
  liveHtml?: string;
  filesRefreshKey?: number;
  isDeck: boolean;
  onExportAsPptx?: ((fileName: string) => void) | undefined;
  streaming: boolean;
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (target: PreviewCommentTarget, note: string, attachAfterSave: boolean) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<void>;
  onSendBoardCommentAttachments?: (attachments: ChatCommentAttachment[]) => Promise<void> | void;
  onFileSaved?: () => Promise<void> | void;
  onSelectionChange?: (text: string) => void;
}) {
  const t = useT();
  const analytics = useAnalytics();
  // Shared helper for the share menu: emit studio_click share_option on
  // entry and artifact_export_result on resolution. Sync exports report
  // success immediately after the call returns; async exports get .then
  // / .catch. The same request_id threads both events so PostHog can
  // stitch click → result via $insert_id correlation.
  const fireShareExport = (
    format:
      | 'pdf'
      | 'pptx'
      | 'zip'
      | 'html'
      | 'markdown'
      | 'template'
      | 'vercel'
      | 'cloudflare_pages',
    fn: () => Promise<unknown> | unknown,
  ) => {
    const requestId = analytics.newRequestId();
    const artifactId = anonymizeArtifactId({ projectId, fileName: file.name });
    trackStudioClickShareOption(
      analytics.track,
      {
        page: 'studio',
        area: 'app_header',
        artifact_id: artifactId,
        element: 'share_option',
        action: 'select_share_option',
        share_context: 'artifact',
        export_format: format,
        project_id: projectId,
        project_kind: projectKind,
      },
      { requestId },
    );
    const started = performance.now();
    const finish = (result: 'success' | 'failed' | 'cancelled', errorCode?: string) => {
      trackArtifactExportResult(
        analytics.track,
        {
          page: 'studio',
          area: 'app_header',
          artifact_id: artifactId,
          project_id: projectId,
          project_kind: projectKind,
          export_format: format,
          result,
          ...(errorCode ? { error_code: errorCode } : {}),
          export_duration_ms: Math.round(performance.now() - started),
        },
        { requestId },
      );
    };
    try {
      const out = fn();
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        (out as Promise<unknown>).then(
          () => finish('success'),
          (err) => finish('failed', err instanceof Error ? err.name : 'UNKNOWN'),
        );
      } else {
        finish('success');
      }
    } catch (err) {
      finish('failed', err instanceof Error ? err.name : 'UNKNOWN');
    }
  };
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [source, setSource] = useState<string | null>(liveHtml ?? null);
  const [inlinedSource, setInlinedSource] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const previewScale = zoom / 100;
  const [previewViewport, setPreviewViewport] = useState<PreviewViewportId>('desktop');
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // Template save UX. We surface a transient "Saved" pill in the share
  // menu so the user gets feedback without a noisy toast layer.
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<WebDeploymentInfo | null>(null);
  const [deploymentsByProvider, setDeploymentsByProvider] = useState<Partial<Record<WebDeployProviderId, WebDeploymentInfo>>>({});
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployConfig, setDeployConfig] = useState<WebDeployConfigResponse | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<'idle' | 'deploying' | 'preparing-link'>('idle');
  const [savingDeployConfig, setSavingDeployConfig] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<WebDeployProjectFileResponse | null>(null);
  const [copiedDeployLink, setCopiedDeployLink] = useState<string | null>(null);
  const [deployProviderId, setDeployProviderId] = useState<WebDeployProviderId>(DEFAULT_DEPLOY_PROVIDER_ID);
  const [deployToken, setDeployToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareZones, setCloudflareZones] = useState<CloudflarePagesZoneOption[]>([]);
  const [cloudflareZonesLoading, setCloudflareZonesLoading] = useState(false);
  const [cloudflareZonesError, setCloudflareZonesError] = useState<string | null>(null);
  const [cloudflareZoneId, setCloudflareZoneId] = useState('');
  const [cloudflareDomainPrefix, setCloudflareDomainPrefix] = useState('');
  const deployProviderLoadSeqRef = useRef(0);
  const [inTabPresent, setInTabPresent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [boardMode, setBoardMode] = useState(false);
  const [boardTool, setBoardTool] = useState<BoardTool>('inspect');
  const [inspectMode, setInspectMode] = useState(false);
  const [palettePopoverOpen, setPalettePopoverOpen] = useState(false);
  const [selectedPalette, setSelectedPalette] = useState<PaletteId | null>(null);
  const [previewPalette, setPreviewPalette] = useState<PaletteId | null>(null);
  const [drawOverlayOpen, setDrawOverlayOpen] = useState(false);
  const [drawOverlayMode, setDrawOverlayMode] = useState<PreviewDrawMode>('click');
  // for hint managing hint box state
  const [openHintBox, setOpenHintBox] = useState(true);
  const [manualEditMode, setManualEditModeRaw] = useState(false);
  const [manualEditFrozenSource, setManualEditFrozenSource] = useState<string | null>(null);
  const [manualEditViewportWidth, setManualEditViewportWidth] = useState<number | null>(null);
  const [previewBodyRef, previewBodySize] = usePreviewCanvasSize<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { isSpacePressed, isDragging, panOffset, resetPanOffset, handlePointerDown } = useSpacebarPan(previewBodyRef, iframeRef, previewScale);
  const previewScrollRestoreRef = useRef<{
    hostLeft: number;
    hostTop: number;
    frameLeft: number;
    frameTop: number;
    canvasLeft: number;
    canvasTop: number;
    expiresAt: number;
  } | null>(null);
  const previewScrollPositionRef = useRef({
    frameLeft: 0,
    frameTop: 0,
    canvasLeft: 0,
    canvasTop: 0,
  });
  const previewScrollRequestAtRef = useRef(0);
  const dcViewportRef = useRef({
    x: 0,
    y: 0,
    scale: 1,
  });
  const dcViewportRestoreAtRef = useRef(0);
  const setManualEditMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setManualEditModeRaw((prev) => {
      const value = typeof next === 'function' ? (next as (p: boolean) => boolean)(prev) : next;
      if (value !== prev && !value) {
        setManualEditFrozenSource(null);
        setManualEditViewportWidth(null);
      }
      return value;
    });
  }, []);
  const capturePreviewScrollPosition = useCallback(() => {
    const host = previewBodyRef.current;
    let frameLeft = 0;
    let frameTop = 0;
    let canvasLeft = 0;
    let canvasTop = 0;
    try {
      const frameDocument = iframeRef.current?.contentWindow?.document;
      const frameScroll = frameDocument?.scrollingElement;
      const canvasScroll = frameDocument?.querySelector<HTMLElement>('.design-canvas');
      frameLeft = frameScroll?.scrollLeft ?? 0;
      frameTop = frameScroll?.scrollTop ?? 0;
      canvasLeft = canvasScroll?.scrollLeft ?? 0;
      canvasTop = canvasScroll?.scrollTop ?? 0;
    } catch {
      frameLeft = 0;
      frameTop = 0;
      canvasLeft = 0;
      canvasTop = 0;
    }
    previewScrollRestoreRef.current = {
      hostLeft: host?.scrollLeft ?? 0,
      hostTop: host?.scrollTop ?? 0,
      frameLeft: frameLeft || previewScrollPositionRef.current.frameLeft,
      frameTop: frameTop || previewScrollPositionRef.current.frameTop,
      canvasLeft: canvasLeft || previewScrollPositionRef.current.canvasLeft,
      canvasTop: canvasTop || previewScrollPositionRef.current.canvasTop,
      expiresAt: Date.now() + 5000,
    };
  }, []);
  const restorePreviewScrollPosition = useCallback(() => {
    const snapshot = previewScrollRestoreRef.current;
    if (!snapshot) return;
    if (Date.now() > snapshot.expiresAt) {
      previewScrollRestoreRef.current = null;
      return;
    }
    const apply = () => {
      const previewBody = previewBodyRef.current;
      if (typeof previewBody?.scrollTo === 'function') {
        previewBody.scrollTo(snapshot.hostLeft, snapshot.hostTop);
      }
      try {
        const frameDocument = iframeRef.current?.contentWindow?.document;
        frameDocument?.scrollingElement?.scrollTo(snapshot.frameLeft, snapshot.frameTop);
        frameDocument?.querySelector<HTMLElement>('.design-canvas')?.scrollTo(snapshot.canvasLeft, snapshot.canvasTop);
        iframeRef.current?.contentWindow?.postMessage({
          type: 'od:preview-scroll-restore',
          frameLeft: snapshot.frameLeft,
          frameTop: snapshot.frameTop,
          canvasLeft: snapshot.canvasLeft,
          canvasTop: snapshot.canvasTop,
        }, '*');
      } catch {}
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        apply();
        window.setTimeout(apply, 80);
        window.setTimeout(() => {
          if (previewScrollRestoreRef.current === snapshot) {
            apply();
          }
        }, 260);
      });
    });
  }, []);
  const [manualEditTargets, setManualEditTargets] = useState<ManualEditTarget[]>([]);
  const [selectedManualEditTarget, setSelectedManualEditTarget] = useState<ManualEditTarget | null>(null);
  const selectedManualEditTargetIdRef = useRef<string | null>(null);
  const [manualEditDraft, setManualEditDraft] = useState<ManualEditDraft>(() => emptyManualEditDraft());
  const [manualEditHistory, setManualEditHistory] = useState<ManualEditHistoryEntry[]>([]);
  const [manualEditUndone, setManualEditUndone] = useState<ManualEditHistoryEntry[]>([]);
  const [manualEditError, setManualEditError] = useState<string | null>(null);
  const [manualEditSaving, setManualEditSaving] = useState(false);
  const manualEditSavingRef = useRef(false);
  const manualEditPendingStyleRef = useRef<ManualEditPendingStyleSave | null>(null);
  const manualEditStyleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualEditPreviewVersionRef = useRef(0);
  const sourceRef = useRef<string | null>(source);
  const sourceFileKeyRef = useRef<string | null>(null);
  const templateNameId = useId();
  const templateDescriptionId = useId();
  // Opt back into the legacy inline-asset srcDoc path via `?forceInline=1`
  // on the host page. Lets users escape-hatch around the URL-load default
  // for non-deck HTML that depends on the in-iframe localStorage shim.
  const forceInline = useMemo(
    () => (typeof window === 'undefined' ? false : parseForceInline(window.location.search)),
    [],
  );
  const [activeCommentTarget, setActiveCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [hoveredCommentTarget, setHoveredCommentTarget] = useState<PreviewCommentSnapshot | null>(null);
  const [activePreviewCommentId, setActivePreviewCommentId] = useState<string | null>(null);
  const [liveCommentTargets, setLiveCommentTargets] = useState<Map<string, PreviewCommentSnapshot>>(() => new Map());
  const liveCommentTargetsRef = useRef(liveCommentTargets);
  const [commentDraft, setCommentDraft] = useState('');
  // Inspect mode shares the iframe selection bridge with comment mode but
  // routes the picked element to a side panel that mutates per-element CSS
  // overrides via postMessage. The host owns the authoritative override map:
  // it is hydrated from the artifact's persisted <style> block on load and
  // mutated only by host-driven onApply / reset actions. Save-to-source
  // serializes that host map directly — iframe od:inspect-overrides messages
  // are preview acknowledgements and never feed save input, so artifact JS
  // forging a postMessage cannot tamper with what gets persisted.
  const [activeInspectTarget, setActiveInspectTarget] = useState<InspectTarget | null>(null);
  const [inspectOverrides, setInspectOverrides] = useState<InspectOverrideMap>(() =>
    typeof source === 'string' ? parseInspectOverridesFromSource(source) : {},
  );
  // Track which `source` value the host map was last hydrated from so the
  // setState-during-render hydration below only fires when the artifact
  // text actually changes (file switch, save round-trip, live edits). The
  // ref is initialised to `source` so the matching useState initialiser
  // above counts as the first hydration.
  const inspectHydratedSourceRef = useRef<string | null | undefined>(source);
  const [savingInspect, setSavingInspect] = useState(false);
  const [inspectSavedAt, setInspectSavedAt] = useState<number | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [queuedBoardNotes, setQueuedBoardNotes] = useState<string[]>([]);
  const [sendingBoardBatch, setSendingBoardBatch] = useState(false);
  const [commentSavedToast, setCommentSavedToast] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const [selectedSideCommentIds, setSelectedSideCommentIds] = useState<Set<string>>(() => new Set());
  const [commentSidePanelCollapsed, setCommentSidePanelCollapsed] = useState(false);
  const [strokePoints, setStrokePoints] = useState<StrokePoint[]>([]);
  const previewStateKey = `${projectId}:${file.name}`;

  function deploymentMapForCurrentFile(items: WebDeploymentInfo[]) {
    const next: Partial<Record<WebDeployProviderId, WebDeploymentInfo>> = {};
    for (const option of DEPLOY_PROVIDER_OPTIONS) {
      const deploymentForProvider = items.find(
        (item) => item.fileName === file.name && item.providerId === option.id && item.url?.trim(),
      );
      if (deploymentForProvider) next[option.id] = deploymentForProvider;
    }
    return next;
  }

  function syncDeployFormFromConfig(
    providerId: WebDeployProviderId,
    config: WebDeployConfigResponse | null,
  ) {
    const matchingConfig = config?.providerId === providerId ? config : null;
    setDeployProviderId(providerId);
    setDeployConfig(matchingConfig);
    setDeployToken(matchingConfig?.tokenMask || '');
    setTeamId(matchingConfig?.teamId || '');
    setTeamSlug(matchingConfig?.teamSlug || '');
    setCloudflareAccountId(matchingConfig?.accountId || '');
    setCloudflareZoneId(matchingConfig?.cloudflarePages?.lastZoneId || '');
    setCloudflareDomainPrefix(matchingConfig?.cloudflarePages?.lastDomainPrefix || '');
  }

  function cloudflareConfigHintsFromForm() {
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    const hints = {
      ...(cloudflareZoneId.trim() ? { lastZoneId: cloudflareZoneId.trim() } : {}),
      ...((zone?.name || deployConfig?.cloudflarePages?.lastZoneName)
        ? { lastZoneName: zone?.name || deployConfig?.cloudflarePages?.lastZoneName }
        : {}),
      ...(cloudflareDomainPrefix.trim()
        ? { lastDomainPrefix: normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix) }
        : {}),
    };
    return Object.keys(hints).length > 0 ? hints : undefined;
  }

  function buildDeployConfigRequest(providerId: WebDeployProviderId): WebUpdateDeployConfigRequest {
    const token = deployToken.trim();
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) {
      return {
        providerId,
        token,
        accountId: cloudflareAccountId.trim(),
        cloudflarePages: cloudflareConfigHintsFromForm(),
      };
    }
    return {
      providerId,
      token,
      teamId: teamId.trim(),
      teamSlug: teamSlug.trim(),
    };
  }

  async function loadDeployProvider(
    providerId: WebDeployProviderId,
    options?: { fallbackToExisting?: boolean },
  ) {
    const requestSeq = ++deployProviderLoadSeqRef.current;
    setDeployProviderId(providerId);
    const deployments = await fetchProjectDeployments(projectId);
    const nextDeploymentsByProvider = deploymentMapForCurrentFile(deployments);
    const exactDeployment = nextDeploymentsByProvider[providerId] ?? null;
    const fallbackDeployment = options?.fallbackToExisting
      ? Object.values(nextDeploymentsByProvider)[0] ?? null
      : null;
    const currentDeployment = exactDeployment ?? fallbackDeployment;
    // Use the explicit providerId for config/form so a fallback deployment from
    // another provider only fills the existing-URL display, never the form/credentials.
    const config = await fetchDeployConfig(providerId);
    if (requestSeq !== deployProviderLoadSeqRef.current) {
      return { config: null, currentDeployment: null };
    }
    syncDeployFormFromConfig(providerId, config);
    setDeploymentsByProvider(nextDeploymentsByProvider);
    setDeployment(currentDeployment ?? null);
    setDeployResult(currentDeployment ?? null);
    if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID && config?.configured) {
      void loadCloudflareZones(config, { requestSeq });
    }
    return { config, currentDeployment };
  }

  async function loadCloudflareZones(
    config: WebDeployConfigResponse | null = deployConfig,
    options?: { requestSeq?: number },
  ) {
    if (!config?.configured || config.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) return;
    const requestSeq = options?.requestSeq ?? deployProviderLoadSeqRef.current;
    setCloudflareZonesLoading(true);
    setCloudflareZonesError(null);
    try {
      const response = await fetchCloudflarePagesZones();
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      const zones = response?.zones ?? [];
      setCloudflareZones(zones);
      const hintedZoneId = response?.cloudflarePages?.lastZoneId || config.cloudflarePages?.lastZoneId || '';
      const nextZoneId = hintedZoneId && zones.some((zone) => zone.id === hintedZoneId)
        ? hintedZoneId
        : zones[0]?.id || '';
      setCloudflareZoneId(nextZoneId);
      const hintedPrefix = response?.cloudflarePages?.lastDomainPrefix || config.cloudflarePages?.lastDomainPrefix || '';
      if (hintedPrefix) setCloudflareDomainPrefix(hintedPrefix);
    } catch (err) {
      if (requestSeq !== deployProviderLoadSeqRef.current) return;
      setCloudflareZones([]);
      setCloudflareZonesError(err instanceof Error ? err.message : t('fileViewer.cloudflareZonesLoadFailed'));
    } finally {
      if (requestSeq === deployProviderLoadSeqRef.current) setCloudflareZonesLoading(false);
    }
  }

  // Slide deck nav state: the iframe posts the active index + total count
  // back to the host every time a slide settles. Host renders prev/next
  // controls in the toolbar and reflects the count beside them.
  const [slideState, setSlideState] = useState<SlideState | null>(
    () => htmlPreviewSlideState.get(previewStateKey) ?? null,
  );
  const overlayPreviewScale = effectivePreviewScale(previewViewport, previewScale, previewBodySize);
  const shareRef = useRef<HTMLDivElement | null>(null);
  const [chromeActionsHost, setChromeActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setChromeActionsHost(document.getElementById(APP_CHROME_FILE_ACTIONS_ID));
  }, []);

  useEffect(() => {
    liveCommentTargetsRef.current = liveCommentTargets;
  }, [liveCommentTargets]);

  useEffect(() => {
    const sourceFileKey = `${projectId}\0${file.name}\0${liveHtml === undefined ? 'raw' : 'live'}`;
    if (liveHtml !== undefined) {
      sourceFileKeyRef.current = sourceFileKey;
      setSource(liveHtml);
      sourceRef.current = liveHtml;
      return;
    }
    const fileChanged = sourceFileKeyRef.current !== sourceFileKey;
    sourceFileKeyRef.current = sourceFileKey;
    if (fileChanged) {
      setSource(null);
      sourceRef.current = null;
    }
    let cancelled = false;
    void fetchProjectFileText(projectId, file.name).then((text) => {
      if (!cancelled) {
        setSource(text);
        sourceRef.current = text;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, file.mtime, liveHtml, reloadKey, filesRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    setDeployResult(null);
    setDeployError(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    void fetchProjectDeployments(projectId).then((items) => {
      if (cancelled) return;
      const nextDeploymentsByProvider = deploymentMapForCurrentFile(items);
      const current = nextDeploymentsByProvider[deployProviderId] ?? null;
      setDeploymentsByProvider(nextDeploymentsByProvider);
      setDeployment(current ?? null);
      setDeployResult(current ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, file.name, deployProviderId]);

  // Detect deck-shaped HTML even when the project's skill didn't declare
  // `mode: deck`. Freeform projects often produce a deck because the user
  // asked for one in plain prose; without this, prev/next and Present
  // never surface and the deck becomes a static, unnavigable preview.
  const looksLikeDeck = useMemo(() => {
    if (!source) return false;
    return /class\s*=\s*['"][^'"]*\bslide\b/i.test(source);
  }, [source]);
  const effectiveDeck = isDeck || looksLikeDeck;
  const livePreviewSource = inlinedSource ?? source;
  // Freeze the iframe input on the snapshot taken at Edit-mode entry. Any
  // source rewrite during edit (1.5s debounced set-style patches) stays
  // invisible to the iframe — live updates flow through od-edit-preview-style
  // postMessage instead, so the canvas never has to reload.
  useEffect(() => {
    if (manualEditMode && manualEditFrozenSource === null && livePreviewSource != null) {
      setManualEditFrozenSource(livePreviewSource);
    }
  }, [manualEditMode, manualEditFrozenSource, livePreviewSource]);
  const previewSource = (manualEditMode && manualEditFrozenSource !== null)
    ? manualEditFrozenSource
    : livePreviewSource;
  const manualEditPageStylesEnabled = typeof source === 'string' && isManualEditFullHtmlDocument(source);
  const drawClickSelectionMode = drawOverlayOpen && drawOverlayMode === 'click' && !manualEditMode;
  const urlModeBridge = hasUrlModeBridge(source);
  // When we URL-load the iframe directly, skip every in-host inlining /
  // srcDoc-rebuilding step. The browser does the asset resolution itself,
  // which is the whole point of the URL-load path.
  // Auto-fall back to the srcDoc path when the artifact will crash under
  // the URL-load iframe's bare `sandbox="allow-scripts"` — Babel-standalone
  // React prototypes and any HTML that reads Web Storage at mount throw
  // SecurityError without `allow-same-origin`. The srcDoc path runs
  // `injectSandboxShim` before any user script, so those artifacts render.
  // Memoized on `source` so HtmlViewer's frequent re-renders (board/inspect/
  // edit mode toggles, slide nav) don't re-scan the HTML each time.
  const needsSandboxShim = useMemo(
    () => source != null && htmlNeedsSandboxShim(source),
    [source],
  );
  const useUrlLoadPreview = shouldUrlLoadHtmlPreview({
    mode,
    isDeck: effectiveDeck,
    commentMode: boardMode || drawClickSelectionMode,
    editMode: manualEditMode,
    urlModeBridge,
    inspectMode,
    paletteActive: palettePopoverOpen || selectedPalette !== null,
    drawMode: drawOverlayOpen,
    forceInline: forceInline || needsSandboxShim,
  });
  const basePreviewSrcUrl = useMemo(
    () => `${projectRawUrl(projectId, file.name)}?v=${Math.round(file.mtime)}&r=${reloadKey}`,
    [projectId, file.name, file.mtime, reloadKey],
  );
  const [previewSrcUrl, setPreviewSrcUrl] = useState(basePreviewSrcUrl);
  useEffect(() => {
    setPreviewSrcUrl(basePreviewSrcUrl);
  }, [basePreviewSrcUrl]);

  useEffect(() => {
    if (!useUrlLoadPreview) return;
    if (filesRefreshKey === 0) return;
    const nextSrc = `${basePreviewSrcUrl}&fr=${filesRefreshKey}`;
    const timeout = window.setTimeout(() => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.location.replace(nextSrc);
      } else {
        setPreviewSrcUrl(nextSrc);
      }
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [basePreviewSrcUrl, filesRefreshKey, useUrlLoadPreview]);

  useEffect(() => {
    setInlinedSource(null);
    if (useUrlLoadPreview) return;
    if (!source || effectiveDeck || !hasRelativeAssetRefs(source)) return;
    let cancelled = false;
    void inlineRelativeAssets(source, projectId, file.name).then((next) => {
      if (!cancelled) setInlinedSource(next);
    });
    return () => {
      cancelled = true;
    };
  }, [source, effectiveDeck, projectId, file.name, useUrlLoadPreview]);

  const srcDoc = useMemo(
    () => (previewSource ? buildSrcdoc(previewSource, {
      deck: effectiveDeck,
      baseHref: projectRawUrl(projectId, baseDirFor(file.name)),
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
      commentBridge: (boardMode && !manualEditMode) || drawClickSelectionMode,
      inspectBridge: inspectMode,
      editBridge: manualEditMode,
      paletteBridge: true,
      initialPalette: selectedPalette,
    }) : ''),
    [previewSource, effectiveDeck, projectId, file.name, previewStateKey, boardMode, manualEditMode, drawClickSelectionMode, inspectMode, selectedPalette],
  );
  useEffect(() => {
    restorePreviewScrollPosition();
  }, [boardMode, manualEditMode, srcDoc, restorePreviewScrollPosition]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as {
        type?: string;
        frameLeft?: number;
        frameTop?: number;
        canvasLeft?: number;
        canvasTop?: number;
        text?: string;
      } | null;
      if (data && data.type === 'od:selection') {
        onSelectionChange?.(data.text || '');
        return;
      }
      if (!data || data.type !== 'od:preview-scroll') return;
      if (previewScrollRestoreRef.current && Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0) return;
      if (
        previewScrollPositionRef.current.canvasLeft !== 0 ||
        previewScrollPositionRef.current.canvasTop !== 0
      ) {
        const isInitialZeroReport = Number(data.canvasLeft || 0) === 0 && Number(data.canvasTop || 0) === 0;
        if (isInitialZeroReport && Date.now() - previewScrollRequestAtRef.current < 1200) return;
      }
      previewScrollPositionRef.current = {
        frameLeft: Number(data.frameLeft || 0),
        frameTop: Number(data.frameTop || 0),
        canvasLeft: Number(data.canvasLeft || 0),
        canvasTop: Number(data.canvasTop || 0),
      };
    }
    function onRestoreRequest(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as { type?: string } | null;
      if (!data || data.type !== 'od:preview-scroll-request') return;
      previewScrollRequestAtRef.current = Date.now();
      const snapshot = previewScrollRestoreRef.current;
      const scroll = snapshot ?? {
        frameLeft: previewScrollPositionRef.current.frameLeft,
        frameTop: previewScrollPositionRef.current.frameTop,
        canvasLeft: previewScrollPositionRef.current.canvasLeft,
        canvasTop: previewScrollPositionRef.current.canvasTop,
      };
      iframeRef.current?.contentWindow?.postMessage({
        type: 'od:preview-scroll-restore',
        frameLeft: scroll.frameLeft,
        frameTop: scroll.frameTop,
        canvasLeft: scroll.canvasLeft,
        canvasTop: scroll.canvasTop,
      }, '*');
    }
    function onDcViewportMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as {
        type?: string;
        x?: number;
        y?: number;
        scale?: number;
      } | null;
      if (!data || !data.type) return;
      if (data.type === '__dc_viewport') {
        const x = Number(data.x || 0);
        const y = Number(data.y || 0);
        const scale = Number(data.scale || 1);
        const hasExistingPosition = dcViewportRef.current.x !== 0 || dcViewportRef.current.y !== 0;
        const isInitialZeroReport = x === 0 && y === 0 && scale === 1;
        if (hasExistingPosition && isInitialZeroReport && Date.now() - dcViewportRestoreAtRef.current < 1500) return;
        dcViewportRef.current = {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
        };
        return;
      }
      if (data.type === '__dc_viewport_request') {
        dcViewportRestoreAtRef.current = Date.now();
        iframeRef.current?.contentWindow?.postMessage({
          type: '__dc_set_viewport',
          ...dcViewportRef.current,
        }, '*');
      }
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('message', onRestoreRequest);
    window.addEventListener('message', onDcViewportMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onRestoreRequest);
      window.removeEventListener('message', onDcViewportMessage);
    };
  }, []);

  useEffect(() => {
    if (!effectiveDeck) {
      setSlideState(null);
      return;
    }
    setSlideState(htmlPreviewSlideState.get(previewStateKey) ?? null);
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev?.data as
        | { type?: string; active?: number; count?: number }
        | null;
      if (!data || data.type !== 'od:slide-state') return;
      if (typeof data.active !== 'number' || typeof data.count !== 'number') return;
      const next = { active: data.active, count: data.count };
      setSlideStateCached(previewStateKey, next);
      setSlideState(next);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [effectiveDeck, previewStateKey]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode || drawClickSelectionMode,
      mode: drawClickSelectionMode ? 'picker' : boardTool,
    }, '*');
  }, [boardMode, boardTool, drawClickSelectionMode, srcDoc]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    postSelectedManualEditTargetToIframe(manualEditMode ? selectedManualEditTarget?.id ?? null : null);
  }, [manualEditMode, selectedManualEditTarget?.id, srcDoc]);

  const previewStyleToIframe = useCallback((id: string, styles: Partial<ManualEditStyles>, version: number) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage({ type: 'od-edit-preview-style', id, styles, version }, '*');
    return true;
  }, []);

  function postSelectedManualEditTargetToIframe(id: string | null) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od-edit-selected-target', id }, '*');
  }

  function syncBridgeModes() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({
      type: 'od:comment-mode',
      enabled: boardMode || drawClickSelectionMode,
      mode: drawClickSelectionMode ? 'picker' : boardTool,
    }, '*');
    win.postMessage({ type: 'od-edit-mode', enabled: manualEditMode }, '*');
    postSelectedManualEditTargetToIframe(manualEditMode ? selectedManualEditTarget?.id ?? null : null);
  }

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-mode', enabled: inspectMode }, '*');
  }, [inspectMode, srcDoc]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const palette = previewPalette ?? selectedPalette;
    win.postMessage({ type: 'od:palette', palette }, '*');
  }, [previewPalette, selectedPalette, srcDoc]);

  // Mirror the bridge's `od:comment-targets` broadcast into
  // `liveCommentTargets` whenever EITHER Inspect or Comments mode is
  // active. The boardMode-only useEffect below still handles its
  // own comment-specific events (hover / click target / pod), but
  // the targets list itself is mode-agnostic — it's just "which
  // elements on the page carry data-od-id / data-screen-label".
  // Without this listener Inspect mode never learns the artifact's
  // annotation count, and the empty-state hint added for #890 would
  // misfire (always firing in Inspect mode, even on annotated
  // artifacts) because the comment-mode listener short-circuits on
  // `!boardMode`. Issue #890.
  useEffect(() => {
    if (!inspectMode && !boardMode && !drawClickSelectionMode) {
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as
        | {
            type?: string;
            targets?: Array<Partial<PreviewCommentSnapshot>>;
          }
        | null;
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
  }, [inspectMode, boardMode, drawClickSelectionMode, file.name]);

  useEffect(() => {
    setActiveCommentTarget(null);
    setHoveredCommentTarget(null);
    setLiveCommentTargets(new Map());
    setCommentDraft('');
    setActiveInspectTarget(null);
    setInspectOverrides({});
    setInspectSavedAt(null);
    setInspectError(null);
    setQueuedBoardNotes([]);
    setStrokePoints([]);
    setManualEditFrozenSource(null);
    setManualEditViewportWidth(null);
    setManualEditTargets([]);
    setSelectedManualEditTarget(null);
    selectedManualEditTargetIdRef.current = null;
    setManualEditDraft(emptyManualEditDraft());
    setManualEditHistory([]);
    setManualEditUndone([]);
    setManualEditError(null);
    setManualEditSaving(false);
    manualEditSavingRef.current = false;
    manualEditPendingStyleRef.current = null;
    clearManualEditStyleTimer();
  }, [file.name]);

  // Selecting a new file or turning inspect off resets the panel target.
  useEffect(() => {
    if (!inspectMode) {
      setActiveInspectTarget(null);
      setInspectError(null);
    }
  }, [inspectMode]);

  // Hydrate the host-authoritative override map from the artifact source
  // synchronously, *before* React commits a render that carries a new
  // `srcDoc` to the iframe. A `useEffect([source])` would commit the new
  // source first and only re-render with the parsed map afterwards — if
  // the iframe finishes loading the new srcDoc in that window, its
  // `onLoad` handler captures the previous file's empty/stale map in its
  // closure and posts that map back over the bridge's freshly DOM-hydrated
  // overrides, leaving the preview without saved inspect styles until the
  // next reload or mode toggle. Setting state during render is React's
  // documented escape hatch for "store a value derived from props"
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // the in-flight render is discarded and React re-renders with the
  // updated state before commit, so the new `srcDoc` and the new
  // `inspectOverrides` always commit together. After hydration the map
  // only mutates from host-driven onApply / reset callbacks below, so
  // artifact JS forging an od:inspect-overrides message cannot tamper
  // with what saveInspectToSource will persist.
  if (inspectHydratedSourceRef.current !== source) {
    inspectHydratedSourceRef.current = source;
    setInspectOverrides(typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
  }

  useEffect(() => {
    sourceRef.current = source;
    if (source == null) return;
    setManualEditDraft((current) => (
      current.fullSource === source ? current : { ...current, fullSource: source }
    ));
  }, [source]);

  useEffect(() => {
    selectedManualEditTargetIdRef.current = selectedManualEditTarget?.id ?? null;
  }, [selectedManualEditTarget?.id]);

  useEffect(() => {
    const selectionMode = boardMode || drawClickSelectionMode;
    if (!selectionMode) {
      setActiveCommentTarget((current) => (current ? null : current));
      setHoveredCommentTarget((current) => (current ? null : current));
      setActivePreviewCommentId((current) => (current ? null : current));
      setLiveCommentTargets((current) => (current.size > 0 ? new Map() : current));
      setQueuedBoardNotes((current) => (current.length > 0 ? [] : current));
      setStrokePoints((current) => (current.length > 0 ? [] : current));
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
        const existing = previewComments.find((comment) =>
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
  }, [boardMode, drawClickSelectionMode, file.name, previewComments]);

  useEffect(() => {
    if (!manualEditMode) {
      setManualEditTargets([]);
      setSelectedManualEditTarget(null);
      setManualEditError(null);
      manualEditPendingStyleRef.current = null;
      if (manualEditStyleTimerRef.current) {
        clearTimeout(manualEditStyleTimerRef.current);
        manualEditStyleTimerRef.current = null;
      }
      return;
    }
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const data = ev.data as ManualEditBridgeMessage | null;
      if (!data?.type) return;
      if (data.type === 'od-edit-targets' && Array.isArray(data.targets)) {
        setManualEditTargets(data.targets);
        // Target broadcasts can be briefly empty while the iframe/save path is
        // settling; keep the user's inspector selection unless a fresh copy is
        // available to update its metadata.
        setSelectedManualEditTarget((current) =>
          current ? data.targets.find((target) => target.id === current.id) ?? current : current,
        );
        const selectedId = selectedManualEditTargetIdRef.current;
        if (selectedId) setTimeout(() => postSelectedManualEditTargetToIframe(selectedId), 0);
        return;
      }
      if (data.type === 'od-edit-select') {
        void selectManualEditTarget(data.target);
        return;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [manualEditMode, source]);

  function nextManualEditPreviewVersion(): number {
    manualEditPreviewVersionRef.current += 1;
    return manualEditPreviewVersionRef.current;
  }

  function inspectorManualEditStyles(target: ManualEditTarget, baseSource: string): ManualEditStyles {
    const inlineStyles = readManualEditStyles(baseSource, target.id);
    return mergeManualEditInspectorStyles(inlineStyles, target.styles);
  }

  function reconcileManualEditStyleSave(
    id: string,
    savedStyles: Partial<ManualEditStyles>,
    savedSource: string,
  ) {
    if (id !== '__body__' && !readManualEditOuterHtml(savedSource, id)) {
      setManualEditError('The selected target no longer exists in the saved source. Refreshing the preview.');
      setSelectedManualEditTarget(null);
      setManualEditFrozenSource(null);
      setReloadKey((key) => key + 1);
      return;
    }
    const sourceStyles = readManualEditStyles(savedSource, id);
    const supersededStyles = manualEditPendingStyleRef.current?.id === id
      ? manualEditPendingStyleRef.current.styles
      : {};
    const repairStyles: Partial<ManualEditStyles> = {};
    for (const key of Object.keys(savedStyles) as Array<keyof ManualEditStyles>) {
      if (Object.prototype.hasOwnProperty.call(supersededStyles, key)) continue;
      const sourceValue = manualEditInspectorStyleValue(key, sourceStyles[key] ?? '');
      const savedValue = savedStyles[key] ?? '';
      if (manualEditPersistedValueMatchesSavedSnapshot(key, sourceValue, savedValue)) continue;
      repairStyles[key] = sourceValue;
    }
    if (Object.keys(repairStyles).length === 0) return;
    previewStyleToIframe(id, repairStyles, nextManualEditPreviewVersion());
    setManualEditDraft((current) => ({
      ...current,
      styles: { ...current.styles, ...repairStyles },
    }));
    setManualEditError('Saved styles differed from the active preview. Reconciled the selected target from source.');
  }

  function scheduleManualEditStyleSave() {
    if (manualEditStyleTimerRef.current) clearTimeout(manualEditStyleTimerRef.current);
    manualEditStyleTimerRef.current = setTimeout(() => {
      manualEditStyleTimerRef.current = null;
      void flushManualEditStyleSave();
    }, 1000);
  }

  function clearManualEditStyleTimer() {
    if (!manualEditStyleTimerRef.current) return;
    clearTimeout(manualEditStyleTimerRef.current);
    manualEditStyleTimerRef.current = null;
  }

  function cancelManualEditPendingStyles(id: string, keys: Array<keyof ManualEditStyles>) {
    const nextPending = cancelManualEditPendingStyleSnapshot(manualEditPendingStyleRef.current, id, keys);
    if (!nextPending) {
      manualEditPendingStyleRef.current = null;
      clearManualEditStyleTimer();
      return;
    }
    manualEditPendingStyleRef.current = nextPending;
  }

  async function handleManualEditStyleChange(id: string, styles: Partial<ManualEditStyles>, label: string) {
    const version = nextManualEditPreviewVersion();
    const currentPending = manualEditPendingStyleRef.current;
    const pendingStyles = currentPending?.id === id
      ? { ...currentPending.styles, ...styles }
      : styles;
    const pending: ManualEditPendingStyleSave = { id, styles: pendingStyles, label, version };
    manualEditPendingStyleRef.current = pending;
    setManualEditError(null);
    previewStyleToIframe(id, styles, version);
    scheduleManualEditStyleSave();
  }

  async function flushManualEditStyleSave(): Promise<boolean> {
    const pending = manualEditPendingStyleRef.current;
    if (!pending) return true;
    if (manualEditSavingRef.current) {
      scheduleManualEditStyleSave();
      return false;
    }
    manualEditPendingStyleRef.current = null;
    return applyManualEdit({ id: pending.id, kind: 'set-style', styles: pending.styles }, pending.label);
  }

  async function exitManualEditModeAfterFlush(): Promise<boolean> {
    const ok = await flushManualEditStyleSave();
    if (!ok) return false;
    setManualEditMode(false);
    return true;
  }

  async function selectManualEditTarget(target: ManualEditTarget) {
    if (!(await flushManualEditStyleSave())) return;
    const base = sourceRef.current ?? '';
    const fields = readManualEditFields(base, target.id);
    setSelectedManualEditTarget(target);
    setManualEditDraft({
      text: fields.text ?? target.fields.text ?? target.text,
      href: fields.href ?? target.fields.href ?? '',
      src: fields.src ?? target.fields.src ?? '',
      alt: fields.alt ?? target.fields.alt ?? '',
      styles: inspectorManualEditStyles(target, base),
      attributesText: JSON.stringify(readManualEditAttributes(base, target.id), null, 2),
      outerHtml: readManualEditOuterHtml(base, target.id) || target.outerHtml,
      fullSource: base,
    });
    setManualEditError(null);
  }

  async function clearManualEditTargetSelection() {
    if (!(await flushManualEditStyleSave())) return;
    setSelectedManualEditTarget(null);
    setManualEditDraft(emptyManualEditDraft(sourceRef.current ?? ''));
    setManualEditError(null);
  }

  async function applyManualEdit(patch: ManualEditPatch, label: string): Promise<boolean> {
    if (manualEditSavingRef.current) return false;
    if (sourceRef.current == null) return false;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    setManualEditError(null);
    try {
      const baseSource = sourceRef.current;
      const result = applyManualEditPatch(baseSource, patch);
      if (!result.ok) {
        setManualEditError(result.error ?? 'Could not apply edit.');
        return false;
      }
      if (!(await confirmManualEditHistorySource(
        baseSource,
        'The file changed outside manual edit mode. Refreshing before applying manual edits.',
      ))) return false;
      const saved = await writeProjectTextFile(projectId, file.name, result.source, {
        artifactManifest: file.artifactManifest,
      });
      if (!saved) {
        setManualEditError('Could not save the edited file.');
        return false;
      }
      const entry: ManualEditHistoryEntry = {
        id: `${Date.now()}-${manualEditHistory.length}`,
        label,
        patch,
        beforeSource: baseSource,
        afterSource: result.source,
        createdAt: Date.now(),
      };
      setSource(result.source);
      sourceRef.current = result.source;
      setInlinedSource(null);
      setManualEditHistory((current) => [entry, ...current]);
      setManualEditUndone([]);
      setManualEditDraft((current) => ({ ...current, fullSource: result.source }));
      if (patch.kind === 'set-style') {
        reconcileManualEditStyleSave(patch.id, patch.styles, result.source);
      }
      await onFileSaved?.();
      return true;
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
      if (manualEditPendingStyleRef.current) scheduleManualEditStyleSave();
    }
  }

  async function confirmManualEditHistorySource(expectedSource: string, message: string): Promise<boolean> {
    const persisted = await fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: Date.now(),
    });
    if (persisted == null || persisted === expectedSource) return true;
    setSource(persisted);
    sourceRef.current = persisted;
    setInlinedSource(null);
    setManualEditHistory([]);
    setManualEditUndone([]);
    manualEditPendingStyleRef.current = null;
    setManualEditDraft((current) => ({ ...current, fullSource: persisted }));
    setManualEditError(message);
    return false;
  }

  async function undoManualEdit() {
    if (manualEditSavingRef.current) return;
    const [latest, ...rest] = manualEditHistory;
    if (!latest) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      if (!(await confirmManualEditHistorySource(
        latest.afterSource,
        'The file changed outside manual edit mode. History was cleared to avoid overwriting newer content.',
      ))) return;
      const saved = await writeProjectTextFile(projectId, file.name, latest.beforeSource, {
        artifactManifest: file.artifactManifest,
      });
      if (!saved) {
        setManualEditError('Could not save the undo result.');
        return;
      }
      setSource(latest.beforeSource);
      sourceRef.current = latest.beforeSource;
      setInlinedSource(null);
      setManualEditHistory(rest);
      setManualEditUndone((current) => [latest, ...current]);
      setManualEditDraft((current) => ({ ...current, fullSource: latest.beforeSource }));
      await onFileSaved?.();
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  async function redoManualEdit() {
    if (manualEditSavingRef.current) return;
    const [latest, ...rest] = manualEditUndone;
    if (!latest) return;
    manualEditSavingRef.current = true;
    setManualEditSaving(true);
    try {
      if (!(await confirmManualEditHistorySource(
        latest.beforeSource,
        'The file changed outside manual edit mode. History was cleared to avoid overwriting newer content.',
      ))) return;
      const saved = await writeProjectTextFile(projectId, file.name, latest.afterSource, {
        artifactManifest: file.artifactManifest,
      });
      if (!saved) {
        setManualEditError('Could not save the redo result.');
        return;
      }
      setSource(latest.afterSource);
      sourceRef.current = latest.afterSource;
      setInlinedSource(null);
      setManualEditUndone(rest);
      setManualEditHistory((current) => [latest, ...current]);
      setManualEditDraft((current) => ({ ...current, fullSource: latest.afterSource }));
      await onFileSaved?.();
    } finally {
      manualEditSavingRef.current = false;
      setManualEditSaving(false);
    }
  }

  // Inspect-mode picker: same `od:comment-target` payload, different sink.
  // The bridge tags the message with a computed-style snapshot so the panel
  // can show real starting values for color / typography / spacing / radius.
  useEffect(() => {
    if (!inspectMode) return;
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

  function postSlide(action: 'next' | 'prev' | 'first' | 'last') {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:slide', action }, '*');
  }

  function postInspectSet(elementId: string, selector: string, prop: string, value: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: 'od:inspect-set', elementId, selector, prop, value },
      '*',
    );
  }

  function postInspectReset(elementId?: string) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'od:inspect-reset', elementId }, '*');
  }

  // Replay the host's authoritative override map into the freshly loaded
  // iframe. The bridge inside the iframe only sees rules persisted in the
  // artifact source via its own hydrateOverridesFromDom() — any unsaved
  // edit lives on the host side until Save-to-source. Without this replay,
  // toggling Inspect off/on, switching to Comment mode, or any other
  // srcdoc rebuild reloads the iframe from previewSource without the
  // unsaved style block, so the preview drops the live edits while
  // saveInspectToSource() can still persist them later from the stale
  // host map. The bridge re-validates each entry under its own allow-list,
  // so a parent that posted a hostile replay can only land overrides the
  // bridge would also have accepted via od:inspect-set.
  //
  // The render-time hydration above keeps `inspectOverrides` aligned with
  // the current `source` whenever React commits, but the iframe `onLoad`
  // callback fires from a separate event-loop turn after the new srcDoc
  // is parsed; if it ever races a stale closure (e.g. an interleaved
  // remount), reading React state would post the previous file's map over
  // the bridge's DOM-hydrated one and silently strip the persisted styles
  // from preview. Re-derive synchronously from `source` whenever the
  // hydration ref disagrees so onLoad never sends a stale snapshot.
  function replayInspectOverridesToIframe() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const overrides = inspectHydratedSourceRef.current === source
      ? inspectOverrides
      : (typeof source === 'string' ? parseInspectOverridesFromSource(source) : {});
    win.postMessage({ type: 'od:inspect-replay', overrides }, '*');
  }

  // Persist accumulated inspect overrides into the artifact source: replace
  // (or insert) a single <style data-od-inspect-overrides> block in <head>.
  // The CSS body is serialized from the host's own override map, hydrated
  // from source on load and updated only by host-driven onApply / reset
  // callbacks. We deliberately do NOT round-trip through the iframe at save
  // time: artifact JS rendered inside the preview shares the same
  // contentWindow as the bridge and could forge an od:inspect-overrides
  // reply that flips allow-listed properties on elements the user never
  // touched. POSTing to /api/projects/:id/files upserts the file via
  // writeProjectFile (multipart-or-JSON; we use JSON).
  async function saveInspectToSource() {
    if (!source) return;
    setSavingInspect(true);
    setInspectError(null);
    try {
      const css = serializeInspectOverrides(inspectOverrides).trim();
      const next = applyInspectOverridesToSource(source, css);
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, content: next }),
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null) as { error?: string; message?: string } | null;
        throw new Error(payload?.error || payload?.message || `Save failed (${resp.status})`);
      }
      setSource(next);
      setInspectSavedAt(Date.now());
      setReloadKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setInspectError(msg);
      // The error banner inside the inspect panel is easy to miss when the
      // user is focused on the iframe preview — surface failures in the
      // console as well so quota/network errors aren't silently lost.
      console.error('[inspect] saveToSource failed:', err);
    } finally {
      setSavingInspect(false);
    }
  }

  // Keyboard nav on the host, so the user can press ←/→ even when focus
  // is on the chat composer or any other host control.
  useEffect(() => {
    if (!effectiveDeck || mode !== 'preview') return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        postSlide('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        postSlide('prev');
      } else if (e.key === 'Home') {
        e.preventDefault();
        postSlide('first');
      } else if (e.key === 'End') {
        e.preventDefault();
        postSlide('last');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [effectiveDeck, mode]);

  useEffect(() => {
    if (!presentMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.present-wrap')) return;
      setPresentMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [presentMenuOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!zoomMenuRef.current) return;
      if (!zoomMenuRef.current.contains(e.target as Node)) setZoomMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [zoomMenuOpen]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!shareRef.current) return;
      if (!shareRef.current.contains(e.target as Node)) setShareMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!inTabPresent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInTabPresent(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inTabPresent]);

  function openInNewTab() {
    if (!source) return;
    openSandboxedPreviewInNewTab(source, exportTitle, {
      deck: effectiveDeck,
      baseHref: projectRawUrl(projectId, baseDirFor(file.name)),
      initialSlideIndex: htmlPreviewSlideState.get(previewStateKey)?.active ?? 0,
    });
  }

  // Snapshot this project as a reusable template. The daemon snapshots
  // EVERY html/text/code file in the project (not just the file open in
  // the viewer), so the template captures the whole design, not a single
  // page. Surfaced here in the Share menu because that's where the user's
  // share / export mental model already lives.
  function openSaveAsTemplateModal() {
    setShareMenuOpen(false);
    const defaultName =
      file.name.replace(/\.html?$/i, '') || t('fileViewer.templateNameDefault');
    setTemplateName(defaultName);
    setTemplateDescription('');
    setTemplateSaveError(null);
    setTemplateModalOpen(true);
  }

  async function handleSaveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setSavingTemplate(true);
    setTemplateNote(null);
    setTemplateSaveError(null);
    let savedName: string | null = null;
    try {
      const tpl = await saveTemplate({
        name,
        description: templateDescription.trim() || undefined,
        sourceProjectId: projectId,
      });
      if (!tpl) {
        setTemplateSaveError(t('fileViewer.savedTemplateFail'));
        return;
      }
      savedName = tpl.name;
      setTemplateModalOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateNote(t('fileViewer.savedTemplate', { name: tpl.name }));
      // Show success toast
      setTemplateSavedToast(t('fileViewer.savedTemplate', { name: tpl.name }));
    } finally {
      setSavingTemplate(false);
      if (savedName) {
        // Auto-clear the note so the menu doesn't keep stale state next open.
        setTimeout(() => setTemplateNote(null), 4000);
      }
    }
  }

  async function openDeployModal(nextProviderId: WebDeployProviderId = deployProviderId) {
    setShareMenuOpen(false);
    setDeployModalOpen(true);
    setDeployError(null);
    setCopiedDeployLink(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId, { fallbackToExisting: true });
  }

  async function changeDeployProvider(nextProviderId: WebDeployProviderId) {
    if (nextProviderId === deployProviderId) return;
    setDeployError(null);
    setDeployPhase('idle');
    await loadDeployProvider(nextProviderId);
  }

  async function saveDeployConfig() {
    setSavingDeployConfig(true);
    setDeployError(null);
    try {
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        if (!deployToken.trim()) {
          throw new Error(t('fileViewer.cloudflareApiTokenRequired'));
        }
        if (!cloudflareAccountId.trim()) {
          throw new Error(t('fileViewer.cloudflareAccountIdRequired'));
        }
      }
      const config = await updateDeployConfig(buildDeployConfigRequest(deployProviderId));
      if (!config || config.providerId !== deployProviderId) {
        throw new Error(t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      }
      syncDeployFormFromConfig(deployProviderId, config);
      if (deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID) {
        await loadCloudflareZones(config);
      }
      return config;
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployProviderConfigSaveFailed', { provider: deployProviderLabel }));
      return null;
    } finally {
      setSavingDeployConfig(false);
    }
  }

  function buildCloudflarePagesDeploySelection(): WebCloudflarePagesDeploySelection | undefined {
    if (deployProviderId !== CLOUDFLARE_PAGES_PROVIDER_ID) return undefined;
    const prefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
    if (!prefix) return undefined;
    if (!isValidCloudflareDomainPrefixInput(prefix)) {
      throw new Error(t('fileViewer.cloudflareDomainPrefixInvalid'));
    }
    const zone = cloudflareZones.find((item) => item.id === cloudflareZoneId);
    if (!zone) {
      throw new Error(t('fileViewer.cloudflareZoneRequired'));
    }
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      domainPrefix: prefix,
    };
  }

  async function deployToSelectedProvider() {
    setDeploying(true);
    setDeployPhase('deploying');
    setDeployError(null);
    setCopiedDeployLink(null);
    try {
      const cloudflarePagesSelection = buildCloudflarePagesDeploySelection();
      const typedToken = deployToken.trim();
      const hasNewToken = typedToken && typedToken !== deployConfig?.tokenMask;
      const cloudflareHints = cloudflareConfigHintsFromForm();
      const cloudflareHintsChanged = deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID && Boolean(
        cloudflareHints?.lastZoneId !== deployConfig?.cloudflarePages?.lastZoneId ||
        cloudflareHints?.lastZoneName !== deployConfig?.cloudflarePages?.lastZoneName ||
        cloudflareHints?.lastDomainPrefix !== deployConfig?.cloudflarePages?.lastDomainPrefix,
      );
      const needsConfigSave =
        hasNewToken ||
        teamId.trim() !== (deployConfig?.teamId || '') ||
        teamSlug.trim() !== (deployConfig?.teamSlug || '') ||
        cloudflareAccountId.trim() !== (deployConfig?.accountId || '') ||
        cloudflareHintsChanged ||
        !deployConfig?.configured;
      if (needsConfigSave) {
        const nextConfig = await saveDeployConfig();
        if (!nextConfig) return;
        if (!nextConfig?.configured) {
          const option = getDeployProviderOption(deployProviderId);
          throw new Error(t(option.tokenRequiredKey, { provider: t(option.labelKey) }));
        }
      }
      setDeployPhase('preparing-link');
      const next = await deployProjectFile(projectId, file.name, deployProviderId, cloudflarePagesSelection);
      setDeploymentsByProvider((current) => ({
        ...current,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      const option = getDeployProviderOption(deployProviderId);
      setDeployError(
        err instanceof Error ? err.message : t('fileViewer.deployProviderFailed', { provider: t(option.labelKey) }),
      );
    } finally {
      setDeploying(false);
      setDeployPhase('idle');
    }
  }

  async function retryDeploymentLink() {
    const current = deployResult || deployment;
    if (!current?.id) return;
    setDeployError(null);
    setDeployPhase('preparing-link');
    try {
      const next = await checkDeploymentLink(projectId, current.id);
      setDeploymentsByProvider((items) => ({
        ...items,
        [next.providerId]: next,
      }));
      setDeployment(next);
      setDeployResult(next);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : t('fileViewer.deployFailed'));
    } finally {
      setDeployPhase('idle');
    }
  }

  async function copyDeployLink(url: string) {
    const safeUrl = url.trim();
    if (!safeUrl) return;
    try {
      await navigator.clipboard.writeText(safeUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = safeUrl;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedDeployLink(safeUrl);
    window.setTimeout(() => {
      setCopiedDeployLink((current) => (current === safeUrl ? null : current));
    }, 1800);
  }

  function presentInThisTab() {
    setPresentMenuOpen(false);
    setInTabPresent(true);
  }

  function presentFullscreen() {
    setPresentMenuOpen(false);
    const el = previewBodyRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setInTabPresent(true));
    } else {
      setInTabPresent(true);
    }
  }

  function presentNewTab() {
    setPresentMenuOpen(false);
    openInNewTab();
  }

  function bumpZoom(delta: number) {
    setZoom((z) => Math.max(25, Math.min(200, z + delta)));
  }

  function activateBoard(nextTool?: BoardTool) {
    setMode('preview');
    setBoardMode(true);
    if (nextTool) setBoardTool(nextTool);
  }

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

  const showPresent = source !== null;
  const canShare = source !== null;
  const exportTitle = file.name.replace(/\.html?$/i, '') || file.name;
  const canPptx = canShare && Boolean(onExportAsPptx) && !streaming;
  const visibleSideComments = useMemo(
    () => previewComments
      .filter((comment) => comment.filePath === file.name && comment.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt),
    [file.name, previewComments],
  );
  useEffect(() => {
    if (!boardMode || !activePreviewCommentId) return;
    const stillOpen = visibleSideComments.some((comment) => comment.id === activePreviewCommentId);
    if (!stillOpen) clearBoardComposer();
  }, [activePreviewCommentId, boardMode, visibleSideComments]);
  const activeDeployment = deployResult || deployment;
  const activeDeployedUrl = activeDeployment?.url?.trim() || '';
  const activeDeploymentDelayed = activeDeployment?.status === 'link-delayed';
  const activeDeploymentProtected = activeDeployment?.status === 'protected';
  const activeCloudflarePages = activeDeployment?.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? activeDeployment.cloudflarePages
    : undefined;
  const activeCloudflareCustomDomain = activeCloudflarePages?.customDomain;
  const deployProvider = getDeployProviderOption(deployProviderId);
  const deployProviderLabel = t(deployProvider.labelKey);
  const selectedCloudflareZone = cloudflareZones.find((zone) => zone.id === cloudflareZoneId) ?? null;
  const normalizedCloudflarePrefix = normalizeCloudflareDomainPrefixInput(cloudflareDomainPrefix);
  const cloudflareHostnamePreview =
    selectedCloudflareZone && normalizedCloudflarePrefix
      ? `${normalizedCloudflarePrefix}.${selectedCloudflareZone.name}`
      : '';
  const deployResultCards: DeployResultCard[] = activeCloudflarePages
    ? (() => {
        const cards: DeployResultCard[] = [];
        const pagesDevUrl = activeCloudflarePages.pagesDev?.url || activeDeployedUrl;
        if (pagesDevUrl) {
          cards.push({
            id: 'pages-dev',
            label: t('fileViewer.cloudflarePagesDevLinkLabel'),
            url: pagesDevUrl,
            status: activeCloudflarePages.pagesDev?.status || activeDeployment?.status || 'link-delayed',
            message: activeCloudflarePages.pagesDev?.statusMessage,
          });
        }
        if (activeCloudflareCustomDomain?.url) {
          cards.push({
            id: 'custom-domain',
            label: t('fileViewer.cloudflareCustomDomainLinkLabel'),
            url: activeCloudflareCustomDomain.url,
            status: activeCloudflareCustomDomain.status,
            message:
              activeCloudflareCustomDomain.errorMessage ||
              activeCloudflareCustomDomain.statusMessage,
          });
        }
        return cards;
      })()
    : activeDeployedUrl
      ? [{
          id: 'default',
          label: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtectedLabel')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkPreparingLabel')
              : t('fileViewer.deployResultLabel'),
          url: activeDeployedUrl,
          status: activeDeployment?.status || 'ready',
          message: activeDeploymentProtected
            ? t('fileViewer.deployLinkProtected')
            : activeDeploymentDelayed
              ? t('fileViewer.deployLinkDelayed')
              : activeDeployment?.statusMessage,
        }]
      : [];
  const deployActionLabelFor = (providerId: WebDeployProviderId) => {
    const option = getDeployProviderOption(providerId);
    const label = t(option.labelKey);
    const hasActiveDeploymentForProvider = Boolean(deploymentsByProvider[providerId]?.url?.trim());
    return hasActiveDeploymentForProvider
      ? t('fileViewer.redeployToProvider', { provider: label })
      : t('fileViewer.deployToProvider', { provider: label });
  };
  const deployCopyLinks = DEPLOY_PROVIDER_OPTIONS.map((option) => ({
    providerId: option.id,
    providerLabel: t(option.labelKey),
    url: deploymentsByProvider[option.id]?.url?.trim() || '',
  })).filter((item) => item.url);
  const deployButtonLabel =
    deployPhase === 'deploying'
      ? t('fileViewer.deployingToProvider', { provider: deployProviderLabel })
      : deployPhase === 'preparing-link'
        ? t('fileViewer.preparingPublicLink')
        : t('fileViewer.deployToProvider', { provider: deployProviderLabel });
  const copyDeployLabel = (url: string) =>
    copiedDeployLink === url.trim()
      ? t('fileViewer.copied')
      : t('fileViewer.copyDeployLink');
  const copyDeployMenuLabel = (providerLabel: string, url: string) =>
    copiedDeployLink === url.trim()
      ? t('fileViewer.copied')
      : `${t('fileViewer.copyDeployLink')} · ${providerLabel}`;
  const statusLabelFor = (state: ReturnType<typeof deployResultState>) => {
    if (state === 'ready') return t('fileViewer.deployLinkReady');
    if (state === 'protected') return t('fileViewer.deployLinkProtectedLabel');
    if (state === 'failed') return t('fileViewer.deployLinkFailed');
    return t('fileViewer.deployLinkPreparingLabel');
  };
  const boardAvailable = mode === 'preview' && source !== null;
  const showPreviewToolbarControls = mode === 'preview';

  return (
    <div className="viewer html-viewer">
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <button
            type="button"
            className="icon-only"
            onClick={() => setReloadKey((n) => n + 1)}
            title={t('fileViewer.reload')}
            aria-label={t('fileViewer.reloadAria')}
          >
            <Icon name="reload" size={14} />
          </button>
          <div className="viewer-tabs">
            <button
              className={`viewer-tab ${mode === 'preview' ? 'active' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('fileViewer.preview')}
            </button>
            <button
              className={`viewer-tab ${mode === 'source' ? 'active' : ''}`}
              onClick={() => {
                setDrawOverlayOpen(false);
                setMode('source');
              }}
            >
              {t('fileViewer.source')}
            </button>
          </div>
          {showPreviewToolbarControls && effectiveDeck ? (
            <span
              className="deck-nav"
              role="group"
              aria-label={t('fileViewer.slideNavAria')}
            >
              <button
                type="button"
                className="icon-only"
                onClick={() => postSlide('prev')}
                title={t('fileViewer.previousSlide')}
                aria-label={t('fileViewer.previousSlide')}
                disabled={slideState !== null && slideState.active <= 0}
              >
                <Icon name="chevron-right" size={14} className="icon-rotate-180" />
              </button>
              <span className="deck-nav-counter">
                {slideState
                  ? `${slideState.active + 1} / ${slideState.count}`
                  : '— / —'}
              </span>
              <button
                type="button"
                className="icon-only"
                onClick={() => postSlide('next')}
                title={t('fileViewer.nextSlide')}
                aria-label={t('fileViewer.nextSlide')}
                disabled={
                  slideState !== null &&
                  slideState.active >= slideState.count - 1
                }
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </span>
          ) : null}
        </div>
        <div className="viewer-toolbar-actions">
          {showPreviewToolbarControls ? (
            <>
              <div className="palette-tweaks-anchor">
                <button
                  type="button"
                  className={`viewer-action${selectedPalette || palettePopoverOpen ? ' active' : ''}`}
                  data-testid="palette-tweaks-toggle"
                  title={t('fileViewer.tweaks')}
                  aria-haspopup="dialog"
                  aria-expanded={palettePopoverOpen}
                  onClick={() => setPalettePopoverOpen((v) => !v)}
                >
                  <Icon name="tweaks" size={13} />
                  <span>{t('fileViewer.tweaks')}</span>
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
              <button
                className={`viewer-action${drawOverlayOpen ? ' active' : ''}`}
                type="button"
                data-testid="draw-overlay-toggle"
                title={t('fileViewer.draw')}
                aria-pressed={drawOverlayOpen}
                onClick={() => {
                  const next = !drawOverlayOpen;
                  if (!next) {
                     setDrawOverlayOpen(false);
                     return;
                  }
                  const activateDraw = () => {
                    setBoardMode(false);
                    clearBoardComposer();
                    setInspectMode(false);
                    setDrawOverlayMode('draw');
                    setMode('preview');
                    setDrawOverlayOpen(true);
                  };
                  if (manualEditMode) {
                    void exitManualEditModeAfterFlush().then((ok) => {
                      if (ok) activateDraw();
                    });
                    return;
                  }
                  activateDraw();
                }}
              >
                <Icon name="draw" size={13} />
                <span>{t('fileViewer.draw')}</span>
              </button>
              <span className="viewer-divider" aria-hidden />
              <PreviewViewportControls
                viewport={previewViewport}
                onViewport={setPreviewViewport}
                t={t}
              />
            </>
          ) : null}
          <button
            type="button"
            className={`viewer-action viewer-comment-toggle${boardMode ? ' active' : ''}`}
            data-testid="board-mode-toggle"
            title={t('fileViewer.comment')}
            aria-pressed={boardMode}
            onClick={() => {
              capturePreviewScrollPosition();
              if (boardMode) {
                setBoardMode(false);
                clearBoardComposer();
                return;
              }
              const activateComment = () => {
                clearBoardComposer();
                setInspectMode(false);
                setDrawOverlayOpen(false);
                setMode('preview');
                activateBoard(boardTool);
              };
              if (manualEditMode) {
                void exitManualEditModeAfterFlush().then((ok) => {
                  if (ok) activateComment();
                });
                return;
              }
              activateComment();
            }}
          >
            <Icon name="comment" size={13} />
            <span>{t('fileViewer.comment')}</span>
          </button>
          {boardMode ? (
            <>
              <button
                className={`viewer-action${boardTool === 'inspect' ? ' active' : ''}`}
                type="button"
                data-testid="comment-mode-toggle"
                title={t('fileViewer.commentPickerTitle')}
                aria-label={t('fileViewer.commentPicker')}
                aria-pressed={boardTool === 'inspect'}
                onClick={() => activateBoard('inspect')}
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
                onClick={() => activateBoard('pod')}
              >
                <Icon name="draw" size={13} />
                <span>{t('fileViewer.commentPods')}</span>
              </button>
            </>
          ) : null}
          <button
            className={`viewer-action${inspectMode ? ' active' : ''}`}
            type="button"
            data-testid="inspect-mode-toggle"
            title={t('fileViewer.inspect')}
            aria-pressed={inspectMode}
            onClick={() => {
              setInspectMode((v) => {
                const next = !v;
                if (next) {
                  setBoardMode(false);
                  clearBoardComposer();
                  setManualEditMode(false);
                  setDrawOverlayOpen(false);
                  setOpenHintBox(true);
                  setMode('preview');
                }
                return next;
              });
            }}
          >
            <Icon name="tweaks" size={13} />
            <span>{t('fileViewer.inspect')}</span>
          </button>
          <button
            className={`viewer-action${manualEditMode ? ' active' : ''}`}
            type="button"
            data-testid="manual-edit-mode-toggle"
            title={t('fileViewer.edit')}
            aria-pressed={manualEditMode}
            onClick={() => {
              capturePreviewScrollPosition();
              if (!manualEditMode) {
                setBoardMode(false);
                clearBoardComposer();
                setInspectMode(false);
                setDrawOverlayOpen(false);
                setMode('preview');
                setManualEditViewportWidth(previewBodyRef.current?.clientWidth ?? null);
                setManualEditMode(true);
                return;
              }
              void exitManualEditModeAfterFlush();
            }}
          >
            <Icon name="edit" size={13} />
            <span>{t('fileViewer.edit')}</span>
          </button>
          <span className="viewer-divider" aria-hidden />
          <button
            type="button"
            className="icon-only"
            onClick={() => bumpZoom(-25)}
            title={t('fileViewer.zoomOut')}
            aria-label={t('fileViewer.zoomOut')}
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
            >
              <span className="tabular-nums">{zoom}%</span>
              <Icon name="chevron-down" size={11} />
            </button>
            {zoomMenuOpen ? (
              <div className="zoom-menu-popover" role="menu">
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
                    <span className="tabular-nums">{level}%</span>
                    {zoom === level ? (
                      <Icon name="check" size={13} />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-only"
            onClick={() => bumpZoom(25)}
            title={t('fileViewer.zoomIn')}
            aria-label={t('fileViewer.zoomIn')}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      {((filePrimaryActions: ReactNode) => (
        chromeActionsHost ? createPortal(filePrimaryActions, chromeActionsHost) : filePrimaryActions
      ))(<>
          {showPresent ? (
            <div className="present-wrap chrome-present-wrap">
              <button
                className="chrome-action chrome-action-secondary present-trigger"
                aria-haspopup="menu"
                aria-expanded={presentMenuOpen}
                onClick={() => setPresentMenuOpen((v) => !v)}
              >
                <Icon name="present" size={13} />
                <span>{t('fileViewer.present')}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {presentMenuOpen ? (
                <div className="present-menu" role="menu">
                  <button role="menuitem" onClick={presentInThisTab}>
                    <span className="present-icon"><Icon name="eye" size={13} /></span>{' '}
                    {t('fileViewer.presentInTab')}
                  </button>
                  <button role="menuitem" onClick={presentFullscreen}>
                    <span className="present-icon"><Icon name="play" size={13} /></span>{' '}
                    {t('fileViewer.presentFullscreen')}
                  </button>
                  <button role="menuitem" onClick={presentNewTab}>
                    <span className="present-icon"><Icon name="share" size={13} /></span>{' '}
                    {t('fileViewer.presentNewTab')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {canShare ? (
            <div className="share-menu chrome-share-menu" ref={shareRef}>
              <button
                className="chrome-action chrome-action-primary"
                aria-haspopup="menu"
                aria-expanded={shareMenuOpen}
                onClick={() => setShareMenuOpen((v) => !v)}
              >
                <Icon name="share" size={13} />
                <span>{t('fileViewer.shareLabel')}</span>
                <Icon name="chevron-down" size={11} />
              </button>
              {shareMenuOpen ? (
                <div className="share-menu-popover" role="menu">
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      fireShareExport('pdf', () => exportProjectAsPdf({
                        deck: effectiveDeck,
                        fallbackPdf: () => exportAsPdf(source ?? '', exportTitle, { deck: effectiveDeck }),
                        filePath: file.name,
                        projectId,
                        title: exportTitle,
                      }));
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file" size={14} /></span>
                    <span>
                      {effectiveDeck
                        ? t('fileViewer.exportPdfAllSlides')
                        : t('fileViewer.exportPdf')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={!canPptx}
                    title={
                      onExportAsPptx
                        ? streaming
                          ? t('fileViewer.exportPptxBusy')
                          : t('fileViewer.exportPptxHint')
                        : t('fileViewer.exportPptxNa')
                    }
                    onClick={() => {
                      setShareMenuOpen(false);
                      fireShareExport('pptx', () => {
                        if (onExportAsPptx) onExportAsPptx(file.name);
                      });
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="present" size={14} /></span>
                    <span>{t('fileViewer.exportPptx') + '…'}</span>
                  </button>
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      fireShareExport('zip', () => exportProjectAsZip({
                        projectId,
                        filePath: file.name,
                        fallbackHtml: source ?? '',
                        fallbackTitle: exportTitle,
                      }));
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="download" size={14} /></span>
                    <span>{t('fileViewer.exportZip')}</span>
                  </button>
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      fireShareExport('html', () => exportAsHtml(source ?? '', exportTitle));
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file-code" size={14} /></span>
                    <span>{t('fileViewer.exportHtml')}</span>
                  </button>
                  {/* Export as Markdown — pass-through download of the
                      artifact source with a `.md` extension. No conversion
                      runs; the file body is identical to the Source view.
                      Useful for piping the artifact into markdown-aware
                      tooling (LLM context windows, vault apps). See
                      issue #279. */}
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setShareMenuOpen(false);
                      fireShareExport('markdown', () => exportAsMd(source ?? '', exportTitle));
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="file" size={14} /></span>
                    <span>{t('fileViewer.exportMd')}</span>
                  </button>
                  {!useUrlLoadPreview ? (
                    <button
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={async () => {
                        setShareMenuOpen(false);
                        const iframe = iframeRef.current;
                        if (!iframe) return;
                        const snap = await requestPreviewSnapshot(iframe);
                        try {
                          if (snap) {
                            exportAsImage(snap.dataUrl, exportTitle);
                          } else {
                            console.warn('[exportAsImage] snapshot capture returned null');
                            alert(t('fileViewer.exportImageFailed'));
                          }
                        } catch (err) {
                          console.warn('[exportAsImage] failed to convert snapshot:', err);
                          alert(t('fileViewer.exportImageFailed'));
                        }
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="image" size={14} /></span>
                      <span>{t('fileViewer.exportImage')}</span>
                    </button>
                  ) : null}
                  <div className="share-menu-divider" />
                  <button
                    type="button"
                    className="share-menu-item"
                    role="menuitem"
                    disabled={savingTemplate}
                    onClick={() => {
                      fireShareExport('template', () => {
                        openSaveAsTemplateModal();
                      });
                    }}
                  >
                    <span className="share-menu-icon"><Icon name="copy" size={14} /></span>
                    <span>
                      {savingTemplate
                        ? t('fileViewer.savingTemplate')
                        : templateNote
                          ? templateNote
                          : t('fileViewer.saveAsTemplate')}
                    </span>
                  </button>
                  <div className="share-menu-divider" />
                  {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        const format =
                          option.id === 'cloudflare-pages'
                            ? 'cloudflare_pages'
                            : option.id === 'vercel-self'
                              ? 'vercel'
                              : 'vercel';
                        fireShareExport(format, () => openDeployModal(option.id));
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="upload" size={14} /></span>
                      <span>{deployActionLabelFor(option.id)}</span>
                    </button>
                  ))}
                  {deployCopyLinks.length > 0 ? (
                    <div className="share-menu-divider" />
                  ) : null}
                  {deployCopyLinks.map((item) => (
                    <button
                      key={`copy-${item.providerId}`}
                      type="button"
                      className="share-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setShareMenuOpen(false);
                        void copyDeployLink(item.url);
                      }}
                    >
                      <span className="share-menu-icon"><Icon name="copy" size={14} /></span>
                      <span>{copyDeployMenuLabel(item.providerLabel, item.url)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>)}
      <div className="viewer-body" ref={previewBodyRef}>
        {isSpacePressed && (
          <div
            className={`preview-pan-overlay${isDragging ? ' is-dragging' : ''}`}
            onPointerDown={handlePointerDown}
          />
        )}
        {source === null ? (
          <div className="viewer-empty">{t('fileViewer.loading')}</div>
        ) : mode === 'preview' ? (
          <div
            className={`${manualEditMode ? 'manual-edit-workspace' : 'comment-preview-layer'} preview-viewport preview-viewport-${previewViewport}`}
            style={{
              ...previewViewportStyle(previewViewport, previewScale, previewBodySize),
              ...(panOffset.x !== 0 || panOffset.y !== 0
                ? { transform: `translate(${panOffset.x}px, ${panOffset.y}px)`, willChange: 'transform' }
                : {}),
            }}
          >
            {manualEditMode ? (
              <ManualEditPanel
                targets={manualEditTargets}
                selectedTarget={selectedManualEditTarget}
                draft={manualEditDraft}
                history={manualEditHistory}
                error={manualEditError}
                canUndo={manualEditHistory.length > 0}
                canRedo={manualEditUndone.length > 0}
                busy={manualEditSaving}
                pageStylesEnabled={manualEditPageStylesEnabled}
                onSelectTarget={selectManualEditTarget}
                onDraftChange={setManualEditDraft}
                onStyleChange={(id, styles, label) => {
                  void handleManualEditStyleChange(id, styles, label);
                }}
                onInvalidStyle={cancelManualEditPendingStyles}
                onApplyPatch={(patch, label) => {
                  void applyManualEdit(patch, label);
                }}
                onError={setManualEditError}
                onClearSelection={() => {
                  void clearManualEditTargetSelection();
                }}
                onCancelDraft={() => {
                  if (selectedManualEditTarget) selectManualEditTarget(selectedManualEditTarget);
                }}
                onUndo={() => {
                  void undoManualEdit();
                }}
                onRedo={() => {
                  void redoManualEdit();
                }}
              />
            ) : null}
            <div className={manualEditMode ? 'manual-edit-canvas' : 'comment-frame-clip'}>
              <div
                style={
                  manualEditMode
                    ? manualEditPreviewShellStyle(previewViewport, previewScale, manualEditViewportWidth)
                    : previewScaleShellStyle(previewViewport, previewScale)
                }
              >
                <PreviewDrawOverlay
                  active={drawOverlayOpen}
                  onActiveChange={setDrawOverlayOpen}
                  onModeChange={setDrawOverlayMode}
                  captureTarget={drawClickSelectionMode ? activeCommentTarget : null}
                  filePath={file.name}
                  sendDisabled={streaming}
                  sendDisabledReason="当前正有任务在执行"
                >
                  {useUrlLoadPreview ? (
                    <iframe
                      ref={iframeRef}
                      data-testid="artifact-preview-frame"
                      data-od-render-mode="url-load"
                      title={file.name}
                      sandbox="allow-scripts allow-downloads"
                      src={previewSrcUrl}
                      onLoad={() => {
                        dcViewportRestoreAtRef.current = Date.now();
                        iframeRef.current?.contentWindow?.postMessage({
                          type: '__dc_set_viewport',
                          ...dcViewportRef.current,
                        }, '*');
                        syncBridgeModes();
                        restorePreviewScrollPosition();
                      }}
                      className="preview-frame-base"
                    />
                  ) : (
                    <iframe
                      ref={iframeRef}
                      data-testid="artifact-preview-frame"
                      data-od-render-mode="srcdoc"
                      title={file.name}
                      sandbox="allow-scripts allow-downloads"
                      srcDoc={srcDoc}
                      onLoad={() => {
                        dcViewportRestoreAtRef.current = Date.now();
                        iframeRef.current?.contentWindow?.postMessage({
                          type: '__dc_set_viewport',
                          ...dcViewportRef.current,
                        }, '*');
                        replayInspectOverridesToIframe();
                        syncBridgeModes();
                        restorePreviewScrollPosition();
                      }}
                      className="preview-frame-base"
                    />
                  )}
                </PreviewDrawOverlay>
              </div>
            </div>
            {(boardMode || drawClickSelectionMode) ? (
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
            {commentSavedToast ? (
              <div className="comment-toast-anchor">
                <Toast
                  message={commentSavedToast}
                  ttlMs={2200}
                  onDismiss={() => setCommentSavedToast(null)}
                />
              </div>
            ) : null}
            {templateSavedToast ? (
              <div className="comment-toast-anchor">
                <Toast
                  message={templateSavedToast}
                  ttlMs={2200}
                  onDismiss={() => setTemplateSavedToast(null)}
                />
              </div>
            ) : null}
            {boardMode && activeCommentTarget ? (
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
                sending={sendingBoardBatch || streaming}
                t={t}
              />
            ) : null}
            {boardMode ? (
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
                  // Reply == edit on a flat-thread model: prefill the
                  // popover with the existing note so the user sees and
                  // mutates the current text. Save runs through the
                  // same upsert path; matching project/conv/file/element
                  // updates note in place rather than creating a new row.
                  const snapshot = liveSnapshotForComment(comment, liveCommentTargets) ?? {
                    filePath: comment.filePath,
                    elementId: comment.elementId,
                    selector: comment.selector,
                    label: comment.label,
                    text: comment.text,
                    position: comment.position,
                    htmlHint: comment.htmlHint,
                    selectionKind: comment.selectionKind ?? 'element',
                    memberCount: comment.memberCount,
                    podMembers: comment.podMembers,
                  };
                  setActiveCommentTarget(snapshot);
                  setHoveredCommentTarget(snapshot);
                  setActivePreviewCommentId(comment.id);
                  setCommentDraft(comment.note);
                  setQueuedBoardNotes([]);
                }}
                onSendSelected={async () => {
                  if (!onSendBoardCommentAttachments) return;
                  const selected = visibleSideComments.filter(
                    (comment) => selectedSideCommentIds.has(comment.id),
                  );
                  if (selected.length === 0) return;
                  setSendingBoardBatch(true);
                  try {
                    await onSendBoardCommentAttachments(commentsToAttachments(selected));
                    setSelectedSideCommentIds(new Set());
                  } finally {
                    setSendingBoardBatch(false);
                  }
                }}
                sending={sendingBoardBatch || streaming}
                t={t}
              />
            ) : null}
            {inspectMode && activeInspectTarget ? (
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
                  setActiveInspectTarget((current) => current && current.elementId === elementId
                    ? current
                    : current);
                }}
                onSaveToSource={() => {
                  void saveInspectToSource();
                }}
                onClose={() => setActiveInspectTarget(null)}
                saving={savingInspect}
                savedAt={inspectSavedAt}
                error={inspectError}
              />
            ) : null}
            {/*
              Hint banner for Inspect / Picker modes. The bridge in
              `apps/web/src/runtime/srcdoc.ts` posts `od:comment-targets`
              with every element annotated with `data-od-id` /
              `data-screen-label`, so `liveCommentTargets.size` is the
              authoritative annotation count for the current artifact.

              Two states:
              - "has targets": the existing copy ("Click any element with
                `data-od-id` to tune its style.") for users who just don't
                see the crosshair cursor.
              - "no targets" (issue #890): a freeform-generated artifact
                (e.g. PRD → HTML through a Claude-Code-compatible CLI
                without a skill) ships zero `data-od-id` annotations. The
                bridge's click handler walks up to <html>, finds nothing,
                and bails — clicks no-op silently. The static copy made
                this look broken; the empty-state copy explains what's
                missing and how to fix it. Mirrored across Inspect and
                Picker because the failure surface is identical.
            */}
            {(inspectMode || (boardMode && boardTool === 'inspect'))
              && openHintBox
              && !activeInspectTarget
              && !activeCommentTarget ? (
              <div
                className={`inspect-empty-hint-container${
                  boardMode && !commentSidePanelCollapsed ? ' comment-side-panel-open' : ''
                }`}
                data-testid="inspect-empty-hint-container"
              >
                {liveCommentTargets.size === 0 ? (
                  <div
                    className="inspect-empty-hint"
                    data-testid="inspect-empty-hint-no-targets"
                  >
                    This artifact has no <code>data-od-id</code>{' '}
                    annotations yet — ask the agent to add them to the
                    sections you want to{' '}
                    {inspectMode ? 'inspect' : 'comment on'}.
                  </div>
                ) : (
                  <div
                    className="inspect-empty-hint"
                    data-testid="inspect-empty-hint"
                  >
                    {t('fileViewer.targetHintPrefix')} <code>data-od-id</code> {' '}
                    {inspectMode ? t('fileViewer.inspectHintAction') : t('fileViewer.commentHintAction')}.
                  </div>
                )}
                <button
                  type="button"
                  title={t('fileViewer.inspectHintClose')}
                  aria-label={t('fileViewer.inspectHintClose')}
                  onClick={() => setOpenHintBox(false)}
                  className="orbit-artifact-ghost"
                >
                  <Icon className="" name="close" size={12} />
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <pre className="viewer-source">{source}</pre>
        )}
      </div>
      {inTabPresent && source ? (
        <div
          className="present-overlay"
          role="dialog"
          aria-label={t('fileViewer.exitPresentation')}
        >
          <button
            className="present-exit"
            onClick={() => setInTabPresent(false)}
            aria-label={t('fileViewer.exitPresentation')}
          >
            <Icon name="close" size={13} /> {t('fileViewer.exitPresentation')}
          </button>
          {useUrlLoadPreview ? (
            <iframe
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="url-load"
              src={previewSrcUrl}
            />
          ) : (
            <iframe
              title="present"
              sandbox="allow-scripts allow-downloads"
              data-od-render-mode="srcdoc"
              srcDoc={srcDoc}
            />
          )}
        </div>
      ) : null}
      {templateModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal deploy-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="kicker">TEMPLATE</div>
              <h2>{t('fileViewer.saveAsTemplate')}</h2>
              <p className="subtitle">{t('fileViewer.templateDescPrompt')}</p>
            </div>
            <div className="deploy-form">
              <label className="field" htmlFor={templateNameId}>
                <span className="field-label">{t('fileViewer.templateNamePrompt')}</span>
                <input
                  id={templateNameId}
                  type="text"
                  value={templateName}
                  placeholder={t('fileViewer.templateNameDefault')}
                  autoFocus
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </label>
              <label className="field" htmlFor={templateDescriptionId}>
                <span className="field-label">{t('fileViewer.templateDescPrompt')}</span>
                <textarea
                  id={templateDescriptionId}
                  rows={3}
                  value={templateDescription}
                  placeholder={t('fileViewer.optional')}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                />
              </label>
              {templateSaveError ? <p className="deploy-error">{templateSaveError}</p> : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                disabled={savingTemplate}
                onClick={() => {
                  setTemplateModalOpen(false);
                  setTemplateSaveError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={savingTemplate || !templateName.trim()}
                onClick={() => {
                  void handleSaveAsTemplate();
                }}
              >
                {savingTemplate ? t('fileViewer.savingTemplate') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deployModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal deploy-modal deploy-flow-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="kicker">{deployProviderLabel}</div>
              <h2>{t('fileViewer.deployToProvider', { provider: deployProviderLabel })}</h2>
              <p className="subtitle">{t('fileViewer.deployModalSubtitle')}</p>
            </div>
            <div className="deploy-form">
              <label className="deploy-provider-field">
                <span>{t('fileViewer.deployProviderLabel')}</span>
                <select
                  value={deployProviderId}
                  onChange={(e) => {
                    void changeDeployProvider(e.target.value as WebDeployProviderId);
                  }}
                >
                  {DEPLOY_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-label-row">
                <label htmlFor="deploy-token">{t(deployProvider.tokenLabelKey)}</label>
                <div className="field-label-note">
                  {deployConfig?.configured ? (
                    <p className="hint">{t(deployProvider.tokenReuseHintKey, { provider: deployProviderLabel })}</p>
                  ) : null}
                  {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                    <p className="hint">{t('fileViewer.cloudflareApiTokenScopeHint')}</p>
                  ) : null}
                  <a
                    href={deployProvider.tokenLink}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t(deployProvider.tokenLinkKey)}
                  </a>
                </div>
              </div>
              <input
                id="deploy-token"
                type="password"
                value={deployToken}
                placeholder={t(deployProvider.tokenPlaceholderKey, { provider: deployProviderLabel })}
                onChange={(e) => setDeployToken(e.target.value)}
              />
              <div className="deploy-config-actions">
                <button
                  type="button"
                  className="ghost-link button-like"
                  disabled={savingDeployConfig}
                  onClick={() => {
                    void saveDeployConfig();
                  }}
                >
                  {savingDeployConfig ? t('fileViewer.savingConfig') : t('fileViewer.save')}
                </button>
              </div>
              {deployProviderId === CLOUDFLARE_PAGES_PROVIDER_ID ? (
                <>
                  <div className="deploy-field-grid single-field">
                    <label>
                      <span>{t('fileViewer.cloudflareAccountId')}</span>
                      <input
                        value={cloudflareAccountId}
                        onChange={(e) => setCloudflareAccountId(e.target.value)}
                      />
                      <span className="field-hint">{t('fileViewer.cloudflareAccountIdHint')}</span>
                    </label>
                  </div>
                  <div className="deploy-field-grid cloudflare-domain-grid">
                    <label>
                      <span>{t('fileViewer.cloudflareDomainPrefixLabel')}</span>
                      <input
                        value={cloudflareDomainPrefix}
                        placeholder={t('fileViewer.cloudflareDomainPrefixPlaceholder')}
                        onChange={(e) => setCloudflareDomainPrefix(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>{t('fileViewer.cloudflareZoneLabel')}</span>
                      <select
                        value={cloudflareZoneId}
                        disabled={cloudflareZonesLoading || (!deployConfig?.configured && !cloudflareZones.length)}
                        onChange={(e) => setCloudflareZoneId(e.target.value)}
                      >
                        {cloudflareZones.length === 0 ? (
                          <option value="">{t('fileViewer.cloudflareZonePlaceholder')}</option>
                        ) : null}
                        {cloudflareZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="deploy-config-actions secondary">
                    <button
                      type="button"
                      className="ghost-link button-like"
                      disabled={cloudflareZonesLoading || !deployConfig?.configured}
                      onClick={() => {
                        void loadCloudflareZones();
                      }}
                    >
                      {cloudflareZonesLoading ? t('fileViewer.cloudflareZonesLoading') : t('fileViewer.cloudflareZonesRefresh')}
                    </button>
                  </div>
                  {cloudflareZonesError ? (
                    <p className="deploy-error">{cloudflareZonesError}</p>
                  ) : cloudflareZonesLoading ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesLoading')}</p>
                  ) : deployConfig?.configured && cloudflareZones.length === 0 ? (
                    <p className="hint">{t('fileViewer.cloudflareZonesEmpty')}</p>
                  ) : (
                    <p className="hint">{t('fileViewer.cloudflareCustomDomainHint')}</p>
                  )}
                  {cloudflareDomainPrefix.trim() && !isValidCloudflareDomainPrefixInput(cloudflareDomainPrefix) ? (
                    <p className="deploy-error">{t('fileViewer.cloudflareDomainPrefixInvalid')}</p>
                  ) : cloudflareHostnamePreview ? (
                    <p className="hint">
                      {t('fileViewer.cloudflareHostnamePreview', { hostname: cloudflareHostnamePreview })}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="deploy-field-grid">
                  <label>
                    <span>{t('fileViewer.vercelTeamId')}</span>
                    <input
                      value={teamId}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamId(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t('fileViewer.vercelTeamSlug')}</span>
                    <input
                      value={teamSlug}
                      placeholder={t('fileViewer.optional')}
                      onChange={(e) => setTeamSlug(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <p className="hint">{t(deployProvider.previewHintKey)}</p>
              {deployError ? <p className="deploy-error">{deployError}</p> : null}
              {deployResultCards.length > 0 ? (
                <div className={`deploy-result-block ${deployResultState(activeDeployment?.status)}`}>
                  <div className="deploy-result-summary">
                    <div className="deploy-result-summary-head">
                      <div className="deploy-result-label">{t('fileViewer.deployResultLabel')}</div>
                      <div className={`deploy-result-badge ${deployResultState(activeDeployment?.status)}`}>
                        {statusLabelFor(deployResultState(activeDeployment?.status))}
                      </div>
                    </div>
                    {activeDeployment?.statusMessage ? (
                      <p className="deploy-result-message">{activeDeployment.statusMessage}</p>
                    ) : null}
                    <div className="deploy-result-links">
                      {deployResultCards.map((card) => {
                        const state = deployResultState(card.status);
                        const canRetry = state === 'delayed' || state === 'protected';
                        const isDisabled = state === 'protected' || state === 'failed';
                        return (
                          <div key={card.id} className={`deploy-result-link ${state}`}>
                            <div className="deploy-result-link-main">
                              <div className="deploy-result-link-head">
                                <span className="deploy-result-link-label">{card.label}</span>
                                <span className={`deploy-result-link-state ${state}`}>{statusLabelFor(state)}</span>
                              </div>
                              {card.message ? (
                                <p className="deploy-result-link-message">{card.message}</p>
                              ) : null}
                              <a
                                className="deploy-result-url"
                                href={card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                {card.url}
                              </a>
                            </div>
                            <div className="deploy-result-actions">
                              {canRetry ? (
                                <button
                                  type="button"
                                  className="viewer-action"
                                  disabled={deployPhase === 'preparing-link'}
                                  onClick={() => {
                                    void retryDeploymentLink();
                                  }}
                                >
                                  {deployPhase === 'preparing-link'
                                    ? t('fileViewer.preparingPublicLink')
                                    : t('fileViewer.retryLink')}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="viewer-action"
                                onClick={() => {
                                  void copyDeployLink(card.url);
                                }}
                              >
                                <Icon name="copy" size={14} />
                                <span>{copyDeployLabel(card.url)}</span>
                              </button>
                              <a
                                className={`ghost-link ${isDisabled ? 'disabled' : ''}`}
                                href={isDisabled ? undefined : card.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-disabled={isDisabled}
                              >
                                <Icon name="upload" size={14} />
                                {t('fileViewer.open')}
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="ghost-link button-like"
                onClick={() => setDeployModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="viewer-action primary"
                disabled={deploying || savingDeployConfig || deployPhase !== 'idle'}
                onClick={() => {
                  void deployToSelectedProvider();
                }}
              >
                {deployButtonLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function baseDirFor(fileName: string): string {
  const idx = fileName.lastIndexOf('/');
  return idx >= 0 ? fileName.slice(0, idx + 1) : '';
}

function hasRelativeAssetRefs(html: string): boolean {
  const attr = /\s(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (!value) continue;
    if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(value)) continue;
    return true;
  }
  return false;
}

async function inlineRelativeAssets(
  html: string,
  projectId: string,
  fileName: string,
): Promise<string> {
  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readHtmlAttr(tag, 'rel');
    const href = readHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, href).then((css) =>
        css == null
          ? null
          : {
              from: tag,
              to:
                `<style data-od-inline-asset="${escapeHtmlAttr(href)}">\n` +
                `${css.replace(/<\/style/gi, '<\\/style')}\n</style>`,
            },
      ),
    );
  }

  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(
      fetchProjectRelativeText(projectId, fileName, src).then((js) => {
        if (js == null) return null;
        const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
        const attrs = open
          .replace(/^<script/i, '')
          .replace(/>$/i, '')
          .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
        return {
          from: tag,
          to: `<script${attrs}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
        };
      }),
    );
  }

  const resolved = (await Promise.all(replacements)).filter(
    (item): item is { from: string; to: string } => item !== null,
  );
  return resolved.reduce((next, { from, to }) => next.replace(from, () => to), html);
}

async function fetchProjectRelativeText(
  projectId: string,
  ownerFileName: string,
  assetRef: string,
): Promise<string | null> {
  const filePath = resolveProjectRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  try {
    const resp = await fetch(projectRawUrl(projectId, filePath));
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function resolveProjectRelativePath(ownerFileName: string, assetRef: string): string | null {
  if (/^(?:https?:|data:|blob:|mailto:|tel:|#|\/)/i.test(assetRef)) return null;
  try {
    const url = new URL(assetRef, `https://od.local/${baseDirFor(ownerFileName)}`);
    if (url.origin !== 'https://od.local') return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    return null;
  }
}

function readHtmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
