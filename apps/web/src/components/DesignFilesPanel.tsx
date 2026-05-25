import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DESIGN_FILES_DRAG_MIME } from '../constants';
import { useT } from '../i18n';

import type { Dict } from '../i18n/types';
import { fetchExtractedDocumentMedia, projectFileUrl, triggerExtractDocumentMedia } from '../providers/registry';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind } from '../types';
import type { PluginFolderAgentAction } from './design-files/pluginFolderActions';
import {
  browsePathSegments,
  displayNameForFile,
  joinBrowsePath,
  mergeBrowseRows,
  normalizeBrowsePath,
  type BrowseFolder,
  type BrowsePath,
  type BrowseRow,
} from './design-files/folderBrowse';
import {
  browsePathLabel,
  extractedMediaForSource,
  isExtractedDocumentMediaBrowsePath,
  listDesignFilesDirectory,
  parentDesignFilesBrowsePath,
  resolveDesignFilesBrowsePath,
} from './design-files/extractedMediaBrowse';
import { getPluginFolderCandidates } from './design-files/pluginFolders';
import { Icon } from './Icon';
import { FlexRow, UiActionButton } from './UiPrimitives';
import { LiveArtifactBadges } from './LiveArtifactBadges';
import { humanBytes } from '../utils/format';
import { kindIconName } from '../utils/fileKind';
import { isRenderableSketchJson, SketchPreview } from './SketchPreview';
import { SlidePreview } from './file-viewer/SlidePreview';
import {
  CURRICULUM_STAGE_ORDER,
  KIND_FAMILY_ORDER,
  SIZE_BUCKET_ORDER,
  curriculumStageI18nKey,
  detectCurriculumStage,
  detectKindFamily,
  detectSizeBucket,
  kindFamilyI18nKey,
  sizeBucketI18nKey,
  type CurriculumStage,
  type KindFamily,
  type SizeBucket,
} from './design-files/curriculum';


type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  projectId: string;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactWorkspaceEntry[];
  onRefreshFiles: () => Promise<void> | void;
  onOpenFile: (name: string) => void;
  onOpenLiveArtifact: (tabId: LiveArtifactWorkspaceEntry['tabId']) => void;
  onCreateFolder?: (folderPath: string) => Promise<ProjectFile | null> | ProjectFile | null;
  onMoveFiles?: (names: string[], destinationFolder: string) => Promise<void> | void;
  onRenameFile: (from: string, to: string) => Promise<ProjectFile | null> | ProjectFile | null;
  onDeleteFile: (name: string) => void;
  onDeleteFiles: (names: string[]) => Promise<void> | void;
  onUpload: (browsePath: BrowsePath) => void;
  onUploadFolder: (browsePath: BrowsePath) => void;
  onUploadFiles: (files: File[], browsePath: BrowsePath) => void;
  onPaste: (browsePath: BrowsePath) => void;
  onNewSketch: () => void;
  uploadError?: string | null;
  onClearUploadError?: () => void;
  onPluginFolderAgentAction?: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<void> | void;
}

type DesignFilesGroupMode = 'kind' | 'modified' | 'stage' | 'folder' | 'size';
type ModifiedSection = 'today' | 'yesterday' | 'previous7Days' | 'previous30Days' | 'older';
type SortKey = 'name' | 'kind' | 'mtime';
type SortDir = 'asc' | 'desc';
type FileKindIconKind = ProjectFileKind | 'folder' | 'live-artifact';

function FileKindIcon({ kind }: { kind: FileKindIconKind }) {
  return <Icon name={kindIconName(kind)} size={14} />;
}

/**
 * `null` here is the "All files" sentinel. We use null instead of a
 * dedicated 'all' literal so a quick truthy check is enough to decide
 * whether to filter, and so it's impossible for a stage detector to
 * accidentally produce the same value.
 */
type KindFamilyFilter = KindFamily | null;
type DesignFilesInputModal =
  | { kind: 'newFolder'; value: string }
  | { kind: 'moveSelected'; value: string };




const MODIFIED_SECTION_ORDER: ModifiedSection[] = [
  'today',
  'yesterday',
  'previous7Days',
  'previous30Days',
  'older',
];
const MODIFIED_SECTION_LABEL_KEY: Record<ModifiedSection, keyof Dict> = {
  today: 'designFiles.modifiedToday',
  yesterday: 'designFiles.modifiedYesterday',
  previous7Days: 'designFiles.modifiedPrevious7Days',
  previous30Days: 'designFiles.modifiedPrevious30Days',
  older: 'designFiles.modifiedOlder',
};

/**
 * Full-panel browser for a project's `.od/projects/<id>/` folder. Mirrors
 * Claude Design's "Design Files" surface: grouped sections, hover-revealed
 * row menu, drop-files footer, and (when a row is selected) a right-side
 * preview pane. Triggered as a sticky first tab in FileWorkspace.
 */
export function DesignFilesPanel({
  projectId,
  files,
  liveArtifacts,
  onRefreshFiles,
  onOpenFile,
  onOpenLiveArtifact,
  onCreateFolder,
  onMoveFiles,
  onRenameFile,
  onDeleteFile,
  onDeleteFiles,
  onUpload,
  onUploadFolder,
  onUploadFiles,
  onPaste,
  onNewSketch,
  uploadError = null,
  onClearUploadError,
  onPluginFolderAgentAction,
}: Props) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [draggingMove, setDraggingMove] = useState(false);
  const [folderDropTarget, setFolderDropTarget] = useState<BrowsePath | null>(null);
  /** Browsers only expose custom drag MIME data on `drop`, not during `dragover`. */
  const draggingFileNamesRef = useRef<string[]>([]);
  const dragDepthRef = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  const MENU_ESTIMATED_HEIGHT = 145;
  const MENU_SAFE_PADDING = 8;
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('mtime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const lastKeyPress = useRef<Map<string, number>>(new Map());
  const [deleting, setDeleting] = useState(false);
  const [installingFolder, setInstallingFolder] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<string | null>(null);
  const [installNotice, setInstallNotice] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<DesignFilesGroupMode>('kind');
  const [kindFamilyFilter, setKindFamilyFilter] = useState<KindFamilyFilter>(null);
  const [collapsedModifiedSections, setCollapsedModifiedSections] = useState<
    Set<ModifiedSection>
  >(new Set());
  const [renaming, setRenaming] = useState<{ name: string; draft: string; saving: boolean } | null>(null);
  const [inputModal, setInputModal] = useState<DesignFilesInputModal | null>(null);
  const [dayBoundary, setDayBoundary] = useState(() => Date.now());
  const [browsePath, setBrowsePath] = useState<BrowsePath>('');
  const uploadBrowsePath = resolveDesignFilesBrowsePath(browsePath);
  const inExtractedMediaBrowse = isExtractedDocumentMediaBrowsePath(browsePath);

  const directoryListing = useMemo(
    () => listDesignFilesDirectory(files, browsePath),
    [files, browsePath],
  );

  const sortedBrowseRows = useMemo(() => {
    const rows = mergeBrowseRows(directoryListing.folders, directoryListing.files);
    return [...rows].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') {
        const aName =
          a.type === 'folder' ? a.folder.name : displayNameForFile(a.file, browsePath);
        const bName =
          b.type === 'folder' ? b.folder.name : displayNameForFile(b.file, browsePath);
        cmp = aName.localeCompare(bName);
      } else if (sortKey === 'kind') {
        const aKind = a.type === 'folder' ? -1 : kindSortPriority(a.file.kind);
        const bKind = b.type === 'folder' ? -1 : kindSortPriority(b.file.kind);
        cmp = aKind - bKind;
      } else {
        const aMtime = a.type === 'folder' ? a.folder.mtime : a.file.mtime;
        const bMtime = b.type === 'folder' ? b.folder.mtime : b.file.mtime;
        cmp = aMtime - bMtime;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [browsePath, directoryListing.files, directoryListing.folders, sortDir, sortKey]);

  /**
   * Filter chips operate on the file rows only — folder rows are kept
   * even when a kind-family chip is active, because hiding the way
   * back to a parent folder would trap the user. Counters in the chip
   * row still reflect the pre-filter file population so the chips read
   * as "what's available", not "what's currently showing".
   */
  const filteredBrowseRows = useMemo(() => {
    if (!kindFamilyFilter) return sortedBrowseRows;
    return sortedBrowseRows.filter((row) => {
      if (row.type === 'folder') return true;
      return detectKindFamily(row.file) === kindFamilyFilter;
    });
  }, [sortedBrowseRows, kindFamilyFilter]);

  const sortedFiles = useMemo(
    () => filteredBrowseRows
      .filter((row): row is BrowseRow & { type: 'file' } => row.type === 'file')
      .map((row) => row.file),
    [filteredBrowseRows],
  );

  /**
   * Counts of each kind family across the un-filtered directory, used
   * to render the badge next to each chip and decide which chips to
   * even show (an empty family hides its chip).
   */
  const kindFamilyCounts = useMemo(() => {
    const counts = new Map<KindFamily, number>();
    for (const row of sortedBrowseRows) {
      if (row.type !== 'file') continue;
      const family = detectKindFamily(row.file);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return counts;
  }, [sortedBrowseRows]);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number | 'all'>(30);

  const effectivePageSize = pageSize === 'all' ? Math.max(1, filteredBrowseRows.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredBrowseRows.length / effectivePageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageBrowseRows = useMemo(
    () =>
      filteredBrowseRows.slice(
        safePage * effectivePageSize,
        (safePage + 1) * effectivePageSize,
      ),
    [effectivePageSize, safePage, filteredBrowseRows],
  );
  const pageFiles = useMemo(
    () =>
      pageBrowseRows
        .filter((row): row is BrowseRow & { type: 'file' } => row.type === 'file')
        .map((row) => row.file),
    [pageBrowseRows],
  );
  const pageItems = useMemo(
    () =>
      pageBrowseRows.map((row) =>
        row.type === 'folder' ? row.folder.path : row.file.name,
      ),
    [pageBrowseRows],
  );
  const modifiedGroups = useMemo(() => {
    const groups: Record<ModifiedSection, ProjectFile[]> = {
      today: [],
      yesterday: [],
      previous7Days: [],
      previous30Days: [],
      older: [],
    };
    const thresholds = modifiedSectionThresholds(dayBoundary);
    for (const f of pageFiles) {
      groups[modifiedSectionFor(f.mtime, thresholds)].push(f);
    }
    return groups;
  }, [dayBoundary, pageFiles]);
  const visibleModifiedSections = MODIFIED_SECTION_ORDER.filter(
    (section) => modifiedGroups[section].length > 0,
  );
  const rangeStart = safePage * effectivePageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * effectivePageSize, filteredBrowseRows.length);
  const allPageSelected = pageItems.length > 0 && pageItems.every((item) => selected.has(item));
  const somePageSelected = !allPageSelected && pageItems.some((item) => selected.has(item));

  useEffect(() => {
    setPage(0);
  }, [pageSize, browsePath]);

  useEffect(() => {
    if (Number.isFinite(totalPages)) setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    const now = Date.now();
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => setDayBoundary(Date.now()),
      Math.max(1, startOfTomorrow.getTime() - now),
    );
    return () => window.clearTimeout(timer);
  }, [dayBoundary]);

  const pluginFolders = useMemo(() => getPluginFolderCandidates(files), [files]);

  // Prune selections that no longer exist in the current file list
  // (e.g. after a refresh or delete within the same project).
  // Cross-project leaks are handled by the parent remounting this
  // component via key={projectId}.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const names = new Set(files.map((f) => f.name));
      const folderPaths = new Set(directoryListing.folders.map((f) => f.path));
      const next = new Set(prev);
      let changed = false;
      for (const n of next) {
        if (!names.has(n) && !folderPaths.has(n)) {
          next.delete(n);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files, directoryListing.folders]);

  const previewFile = useMemo(
    () => files.find((f) => f.name === preview) ?? null,
    [preview, files],
  );
  const previewExtractedMedia = useMemo(
    () => (previewFile ? extractedMediaForSource(files, previewFile.name) : []),
    [files, previewFile],
  );

  // When the user selects a document/PDF/PPTX/XLSX file, trigger media
  // extraction eagerly so the df-preview media grid is populated immediately.
  // Fire-and-forget: run the extract-media endpoint, then refresh files so
  // any newly-written _document_media images appear in the grid.
  const extractionTriggeredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!previewFile || !projectId) return;
    const kind = previewFile.kind;
    if (!['document', 'pdf', 'presentation', 'spreadsheet'].includes(kind)) return;
    // Only trigger once per file per mount to avoid hammering the daemon.
    if (extractionTriggeredRef.current.has(previewFile.name)) return;
    extractionTriggeredRef.current.add(previewFile.name);
    triggerExtractDocumentMedia(projectId, previewFile.name).then(() => {
      if (onRefreshFiles) onRefreshFiles();
    }).catch(() => {});
  }, [previewFile, projectId, onRefreshFiles]);

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshFiles();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSort(key: SortKey) {
    return () => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    };
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const item of pageItems) next.delete(item);
      } else {
        for (const item of pageItems) next.add(item);
      }
      return next;
    });
  }

  function selectAllFiles() {
    const allNames = sortedFiles.map((f) => f.name);
    const allFolderPaths = directoryListing.folders.map((f) => f.path);
    setSelected(new Set([...allNames, ...allFolderPaths]));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openMenuFor(name: string, el: HTMLElement) {
    const rect = el.closest('.df-row-menu')?.getBoundingClientRect();
    if (!rect) return;

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.bottom + 4;
    } else if (spaceAbove >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
      top = rect.top - MENU_ESTIMATED_HEIGHT - 4;
    } else {
      top = Math.max(
        MENU_SAFE_PADDING,
        viewportHeight - MENU_ESTIMATED_HEIGHT - MENU_SAFE_PADDING,
      );
    }

    const left = Math.max(MENU_SAFE_PADDING, rect.right - 160);

    setMenuPos({ name, top, left });
  }

  function startRename(name: string) {
    setMenuPos(null);
    setPreview(name);
    setRenaming({ name, draft: name, saving: false });
  }

  async function commitRename(name: string, draft: string) {
    const nextName = draft.trim();
    if (!nextName || nextName === name) {
      setRenaming(null);
      return;
    }
    setRenaming({ name, draft, saving: true });
    try {
      const renamed = await onRenameFile(name, nextName);
      if (!renamed) throw new Error('Rename failed');
      setPreview((curr) => (curr === name ? renamed.name : curr));
      setSelected((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        next.add(renamed.name);
        return next;
      });
      setRenaming(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setRenaming({ name, draft, saving: false });
    }
  }

  async function handleBatchDelete() {
    if (deleting) return;
    const fileList = [...selected];
    if (fileList.length === 0) return;
    setDeleting(true);
    try {
      await onDeleteFiles(fileList);
      // Don't clear `selected` here: confirm-cancel and all-fail paths
      // should leave the user's selection intact for retry. The
      // `useEffect` above prunes successfully-deleted names automatically
      // once `files` refreshes.
    } finally {
      setDeleting(false);
    }
  }

  function toggleModifiedSection(section: ModifiedSection) {
    setCollapsedModifiedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  function openBrowseFolder(path: BrowsePath) {
    setBrowsePath(path);
    setPreview(null);
    setMenuPos(null);
    setRenaming(null);
    setPage(0);
  }

  function openCreateFolderModal() {
    if (!onCreateFolder) return;
    setInputModal({ kind: 'newFolder', value: t('designFiles.newFolderDefault') });
  }

  function openMoveSelectedModal() {
    if (!onMoveFiles || selected.size === 0) return;
    setInputModal({ kind: 'moveSelected', value: uploadBrowsePath });
  }

  function closeInputModal() {
    setInputModal(null);
  }

  async function submitInputModal() {
    if (!inputModal) return;
    if (inputModal.kind === 'newFolder') {
      if (!onCreateFolder) return;
      const trimmed = inputModal.value.trim();
      if (!trimmed) return;
      const folderPath = joinBrowsePath(uploadBrowsePath, trimmed);
      closeInputModal();
      try {
        const folder = await onCreateFolder(folderPath);
        if (!folder) throw new Error('Folder creation failed');
        await onRefreshFiles();
        openBrowseFolder(folder.name);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    if (!onMoveFiles) return;
    const fileList = [...selected];
    if (fileList.length === 0) return;
    const destination = inputModal.value;
    closeInputModal();
    await moveFilesTo(fileList, destination);
  }

  const inputModalTitle =
    inputModal?.kind === 'newFolder'
      ? t('designFiles.newFolder')
      : inputModal?.kind === 'moveSelected'
        ? t('designFiles.moveSelected', { n: selected.size })
        : '';
  const inputModalLabel =
    inputModal?.kind === 'newFolder'
      ? t('designFiles.newFolderPrompt')
      : inputModal?.kind === 'moveSelected'
        ? t('designFiles.moveSelectedPrompt')
        : '';
  const inputModalSubmitLabel =
    inputModal?.kind === 'newFolder' ? t('common.create') : t('designFiles.moveSelected', { n: selected.size });
  const inputModalSubmitDisabled =
    inputModal?.kind === 'newFolder' ? !inputModal.value.trim() : false;

  function draggedFileNamesFromEvent(ev: React.DragEvent<HTMLElement>): string[] {
    if (typeof ev.dataTransfer.getData === 'function') {
      const raw = ev.dataTransfer.getData(DESIGN_FILES_DRAG_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const names = parsed.filter((name): name is string => typeof name === 'string');
            if (names.length > 0) return names;
          }
        } catch {
          /* fall through to ref */
        }
      }
    }
    return draggingFileNamesRef.current;
  }

  async function moveFilesTo(names: string[], destinationFolder: BrowsePath) {
    if (!onMoveFiles || isExtractedDocumentMediaBrowsePath(destinationFolder)) return;
    const normalizedDestination = resolveDesignFilesBrowsePath(destinationFolder);
    const uniqueNames = [...new Set(names)];
    if (uniqueNames.length === 0) return;
    await onMoveFiles(uniqueNames, normalizedDestination);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const name of uniqueNames) next.delete(name);
      return next;
    });
    setPreview((curr) => (curr && uniqueNames.includes(curr) ? null : curr));
    await onRefreshFiles();
  }

  function startFileDrag(ev: React.DragEvent<HTMLTableRowElement>, name: string) {
    const names = selected.has(name) ? [...selected] : [name];
    draggingFileNamesRef.current = names;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData(DESIGN_FILES_DRAG_MIME, JSON.stringify(names));
    ev.dataTransfer.setData('text/plain', names.join('\n'));
    setDraggingMove(true);

    // Create a beautiful, compact custom drag ghost image matching the Design System
    const ghost = document.createElement('div');
    ghost.className = 'df-drag-ghost';

    const icon = document.createElement('span');
    icon.className = 'df-drag-ghost-icon';
    const firstName = names[0] || name;
    const firstFile = files.find((f) => f.name === firstName);
    const kind = firstFile ? firstFile.kind : 'file';
    icon.textContent = kind === 'image' ? '🖼️' : '📄';
    ghost.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'df-drag-ghost-label';
    const baseName = firstName.split('/').pop() || firstName;
    label.textContent = names.length > 1 ? `${baseName} (+${names.length - 1})` : baseName;
    ghost.appendChild(label);

    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    document.body.appendChild(ghost);

    if (typeof ev.dataTransfer.setDragImage === 'function') {
      ev.dataTransfer.setDragImage(ghost, 16, 16);
    }

    setTimeout(() => {
      if (document.body.contains(ghost)) {
        document.body.removeChild(ghost);
      }
    }, 0);
  }

  function endFileDrag() {
    draggingFileNamesRef.current = [];
    setDraggingMove(false);
    setFolderDropTarget(null);
  }

  function handleFolderDragOver(ev: React.DragEvent<HTMLTableRowElement>, folderPath: BrowsePath) {
    if (isExtractedDocumentMediaBrowsePath(folderPath)) return;
    const names = draggedFileNamesFromEvent(ev);
    if (names.length === 0) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    setFolderDropTarget(folderPath);
  }

  async function handleFolderDrop(ev: React.DragEvent<HTMLTableRowElement>, folderPath: BrowsePath) {
    if (isExtractedDocumentMediaBrowsePath(folderPath)) return;
    const names = draggedFileNamesFromEvent(ev);
    if (names.length === 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    setFolderDropTarget(null);
    setDraggingMove(false);
    await moveFilesTo(names, folderPath);
  }

  function folderRowTestId(folderPath: BrowsePath): string {
    return `design-folder-row-${folderPath.replace(/\//g, '--')}`;
  }

  function renderFolderRow(folder: BrowseFolder) {
    const rowKey = `folder:${folder.path}`;
    const isHovered = hover === rowKey;
    const isDropTarget = folderDropTarget === folder.path;
    return (
      <tr
        key={rowKey}
        data-testid={folderRowTestId(folder.path)}
        className={`df-file-row df-folder-row ${isHovered ? 'active' : ''} ${isDropTarget ? 'drag-over' : ''}`}
        onMouseEnter={() => setHover(rowKey)}
        onMouseLeave={() => setHover((c) => (c === rowKey ? null : c))}
        onDragOver={(ev) => handleFolderDragOver(ev, folder.path)}
        onDragLeave={(ev) => {
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
            setFolderDropTarget((curr) => (curr === folder.path ? null : curr));
          }
        }}
        onDrop={(ev) => void handleFolderDrop(ev, folder.path)}
      >
        <td className="df-cell-check">
          <span
            className="df-row-check"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(folder.path);
            }}
            role="checkbox"
            aria-checked={selected.has(folder.path)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                toggleSelect(folder.path);
              }
            }}
          >
            {selected.has(folder.path) ? '\u2611' : '\u2610'}
          </span>
        </td>
        <td
          className="df-cell-icon df-cell-openable"
          onClick={() => openBrowseFolder(folder.path)}
          onDoubleClick={() => openBrowseFolder(folder.path)}
        >
          <span className="df-row-icon" data-kind="folder" aria-hidden>
            <FileKindIcon kind="folder" />
          </span>
        </td>
        <td
          className="df-cell-name df-cell-openable"
          onClick={() => openBrowseFolder(folder.path)}
          onDoubleClick={() => openBrowseFolder(folder.path)}
        >
          <button
            type="button"
            className="df-row-name-btn"
            onClick={() => openBrowseFolder(folder.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openBrowseFolder(folder.path);
              }
            }}
          >
            <span className="df-row-name-wrap">
              <span className="df-row-name">
                {browsePathLabel(folder.path, {
                  extractedMediaFolder: t('designFiles.extractedMediaFolder'),
                })}
              </span>
              <span className="df-row-sub">
                {t('designFiles.folderItemCount', { n: folder.childCount })}
              </span>
            </span>
          </button>
        </td>
        <td
          className="df-cell-kind df-cell-openable"
          onClick={() => openBrowseFolder(folder.path)}
          onDoubleClick={() => openBrowseFolder(folder.path)}
        >
          <span className="df-kind-label">{t('designFiles.kindFolder')}</span>
        </td>
        <td
          className="df-cell-time df-cell-openable"
          onClick={() => openBrowseFolder(folder.path)}
          onDoubleClick={() => openBrowseFolder(folder.path)}
        >
          {relativeTime(folder.mtime, t)}
        </td>
        <td className="df-cell-menu" />
      </tr>
    );
  }

  function renderBrowseRow(row: BrowseRow) {
    return row.type === 'folder' ? renderFolderRow(row.folder) : renderFileRow(row.file);
  }

  function renderFileRow(f: ProjectFile) {
    const displayName = displayNameForFile(f, browsePath);
    const active = preview === f.name;
    const isHovered = hover === f.name;
    const renameState = renaming?.name === f.name ? renaming : null;
    return (
      <tr
        key={f.name}
        data-testid={`design-file-row-${f.name}`}
        className={`df-file-row ${active ? 'active' : ''} ${selected.has(f.name) ? 'selected' : ''}`}
        draggable={!renameState}
        onDragStart={(ev) => startFileDrag(ev, f.name)}
        onDragEnd={endFileDrag}
        onMouseEnter={() => setHover(f.name)}
        onMouseLeave={() => setHover((c) => (c === f.name ? null : c))}
      >
        <td className="df-cell-check">
          <span
            className="df-row-check"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(f.name);
            }}
            role="checkbox"
            aria-checked={selected.has(f.name)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                toggleSelect(f.name);
              }
            }}
          >
            {selected.has(f.name) ? '\u2611' : '\u2610'}
          </span>
        </td>
        <td
          className="df-cell-icon df-cell-openable"
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          <span className="df-row-icon" data-kind={f.kind} aria-hidden>
            <FileKindIcon kind={f.kind} />
          </span>
        </td>
        <td
          className="df-cell-name df-cell-openable"
          onClick={() => {
            if (!renameState) setPreview(f.name);
          }}
          onDoubleClick={() => {
            if (!renameState) onOpenFile(f.name);
          }}
        >
          {renameState ? (
            <input
              autoFocus
              className="df-rename-input"
              value={renameState.draft}
              disabled={renameState.saving}
              onChange={(e) => setRenaming({ ...renameState, draft: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                if (e.currentTarget.dataset.skipRenameCommit === '1') return;
                void commitRename(f.name, renameState.draft);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.dataset.skipRenameCommit = '1';
                  void commitRename(f.name, renameState.draft);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget.dataset.skipRenameCommit = '1';
                  setRenaming(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="df-row-name-btn"
              onClick={() => setPreview(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const now = Date.now();
                  const last = lastKeyPress.current.get(f.name) ?? 0;
                  if (now - last < 300) {
                    lastKeyPress.current.delete(f.name);
                    onOpenFile(f.name);
                  } else {
                    lastKeyPress.current.set(f.name, now);
                    setPreview(f.name);
                  }
                }
              }}
            >
              <span className="df-row-name-wrap">
                <span className="df-row-name">{displayName}</span>
                <span className="df-row-sub">{humanBytes(f.size)}</span>
              </span>
            </button>
          )}
        </td>
        <td
          className="df-cell-kind df-cell-openable"
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          <span className="df-kind-label">{kindLabel(f.kind, t)}</span>
        </td>
        <td
          className="df-cell-time df-cell-openable"
          onClick={() => setPreview(f.name)}
          onDoubleClick={() => onOpenFile(f.name)}
        >
          {relativeTime(f.mtime, t)}
        </td>
        <td className="df-cell-menu">
          <span
            data-testid={`design-file-menu-${f.name}`}
            className="df-row-menu"
            style={isHovered || active ? { opacity: 1 } : undefined}
            role="button"
            tabIndex={0}
            aria-label={t('designFiles.rowMenu')}
            onClick={(e) => {
              e.stopPropagation();
              openMenuFor(f.name, e.target as HTMLElement);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                openMenuFor(f.name, e.currentTarget as HTMLElement);
              }
            }}
          >
            ⋯
          </span>
        </td>
      </tr>
    );
  }

  function renderModifiedSections() {
    const folderSection = renderFolderSectionRows(pageBrowseRows);
    const sectionRows = visibleModifiedSections.flatMap((section) => {
      const sectionFiles = modifiedGroups[section];
      const collapsed = collapsedModifiedSections.has(section);
      const label = t(MODIFIED_SECTION_LABEL_KEY[section]);
      return [
        <tr className="df-section-row" key={`${section}-label`}>
          <td colSpan={6}>
            <button
              type="button"
              className="df-section-toggle"
              aria-expanded={!collapsed}
              aria-label={`${collapsed ? t('designFiles.expandGroup') : t('designFiles.collapseGroup')} ${label}`}
              onClick={() => toggleModifiedSection(section)}
            >
              <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} />
              <span>{label}</span>
              <span className="df-section-count">{sectionFiles.length}</span>
            </button>
          </td>
        </tr>,
        ...(collapsed ? [] : sectionFiles.map(renderFileRow)),
      ];
    });
    return [...folderSection, ...sectionRows];
  }

  function renderFolderSectionRows(rows: BrowseRow[]) {
    const folders = rows.filter((row): row is BrowseRow & { type: 'folder' } => row.type === 'folder');
    if (folders.length === 0) return [];
    return [
      <tr className="df-section-row" key="browse-folders-label">
        <td colSpan={6}>
          <div className="df-section-label">
            <span>{t('designFiles.sectionFolders')}</span>
            <span className="df-section-count">{folders.length}</span>
          </div>
        </td>
      </tr>,
      ...folders.map((row) => renderFolderRow(row.folder)),
    ];
  }

  type UnifiedItem =
    | { type: 'file'; file: ProjectFile }
    | { type: 'live-artifact'; artifact: LiveArtifactWorkspaceEntry };

  function renderLiveArtifactRow(artifact: LiveArtifactWorkspaceEntry) {
    const isHovered = hover === artifact.tabId;
    return (
      <tr
        key={artifact.tabId}
        data-testid={`design-file-row-${artifact.tabId}`}
        className="df-file-row df-row-live-artifact"
        onMouseEnter={() => setHover(artifact.tabId)}
        onMouseLeave={() => setHover((c) => (c === artifact.tabId ? null : c))}
      >
        <td className="df-cell-check">
          <span className="df-row-check df-row-check--disabled">
            {"\u2610"}
          </span>
        </td>
        <td
          className="df-cell-icon df-cell-openable"
          onClick={() => onOpenLiveArtifact(artifact.tabId)}
          onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
        >
          <span className="df-row-icon" data-kind="live-artifact" aria-hidden>
            <FileKindIcon kind="live-artifact" />
          </span>
        </td>
        <td
          className="df-cell-name df-cell-openable"
          onClick={() => onOpenLiveArtifact(artifact.tabId)}
          onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
        >
          <button
            type="button"
            className="df-row-name-btn"
            onClick={() => onOpenLiveArtifact(artifact.tabId)}
          >
            <span className="df-row-name-wrap">
              <span className="df-row-name df-row-name--live">{artifact.title}</span>
              <span className="df-row-sub">
                <LiveArtifactBadges
                  compact
                  status={artifact.status}
                  refreshStatus={artifact.refreshStatus}
                />
              </span>
            </span>
          </button>
        </td>
        <td
          className="df-cell-kind df-cell-openable"
          onClick={() => onOpenLiveArtifact(artifact.tabId)}
          onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
        >
          <span className="df-kind-label">{t('designFiles.kindLiveArtifact')}</span>
        </td>
        <td
          className="df-cell-time df-cell-openable"
          onClick={() => onOpenLiveArtifact(artifact.tabId)}
          onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
        >
          {relativeTime(Date.parse(artifact.updatedAt) || Date.now(), t)}
        </td>
        <td className="df-cell-menu" />
      </tr>
    );
  }

  function renderKindSections() {
    const categories = {
      'lesson-plans': {
        label: t('curriculum.sidebar.lessonPlans' as any),
        items: [] as UnifiedItem[],
      },
      'teaching-guides': {
        label: t('curriculum.sidebar.teachingGuides' as any),
        items: [] as UnifiedItem[],
      },
      'slides': {
        label: t('curriculum.sidebar.slides' as any),
        items: [] as UnifiedItem[],
      },
      'feedback': {
        label: t('curriculum.sidebar.feedback' as any),
        items: [] as UnifiedItem[],
      },
      'analysis': {
        label: t('curriculum.sidebar.analysis' as any),
        items: [] as UnifiedItem[],
      },
      'risk-reviews': {
        label: t('curriculum.sidebar.riskReviews' as any),
        items: [] as UnifiedItem[],
      },
      'other': {
        label: t('designFiles.sectionOther'),
        items: [] as UnifiedItem[],
      },
    };

    function classify(name: string, slug?: string): keyof typeof categories {
      const n = name.toLowerCase();
      const s = (slug || '').toLowerCase();
      
      if (n.includes('lesson-plan') || n.includes('lessonplan') || n.includes('giáo án') || n.includes('bài dạy') || s.includes('lesson-plan')) {
        return 'lesson-plans';
      }
      if (n.includes('teaching-guide') || n.includes('teacher-guide') || n.includes('hướng dẫn') || s.includes('teaching-guide')) {
        return 'teaching-guides';
      }
      if (n.includes('slide') || n.includes('deck') || n.includes('trình chiếu') || n.includes('.pptx') || n.includes('.ppt') || s.includes('slide')) {
        return 'slides';
      }
      if (n.includes('feedback') || n.includes('survey') || n.includes('phản hồi') || n.includes('khảo sát') || s.includes('feedback') || s.includes('survey')) {
        return 'feedback';
      }
      if (n.includes('review') || n.includes('analysis') || n.includes('phân tích') || n.includes('đánh giá') || s.includes('curriculum-review')) {
        return 'analysis';
      }
      if (n.includes('rollout') || n.includes('validation') || n.includes('rủi ro') || s.includes('rollout-validation')) {
        return 'risk-reviews';
      }
      return 'other';
    }

    for (const f of pageFiles) {
      const cat = classify(f.name);
      categories[cat].items.push({ type: 'file', file: f });
    }
    if (!browsePath) {
      for (const art of liveArtifacts) {
        const cat = classify(art.title, art.slug);
        categories[cat].items.push({ type: 'live-artifact', artifact: art });
      }
    }

    const folderSection = renderFolderSectionRows(pageBrowseRows);
    const categoryRows = Object.entries(categories)
      .filter(([_, cat]) => cat.items.length > 0)
      .flatMap(([key, cat]) => [
        <tr className="df-section-row" key={`${key}-label`}>
          <td colSpan={6}>
            <div className="df-section-label">
              <span>{cat.label}</span>
              <span className="df-section-count">{cat.items.length}</span>
            </div>
          </td>
        </tr>,
        ...cat.items.map((item) =>
          item.type === 'file'
            ? renderFileRow(item.file)
            : renderLiveArtifactRow(item.artifact)
        ),
      ]);
    return [...folderSection, ...categoryRows];
  }

  function renderStageSections() {
    const buckets = new Map<CurriculumStage, UnifiedItem[]>();
    for (const stage of CURRICULUM_STAGE_ORDER) buckets.set(stage, []);
    for (const f of pageFiles) {
      const stage = detectCurriculumStage(f);
      buckets.get(stage)!.push({ type: 'file', file: f });
    }
    if (!browsePath) {
      for (const art of liveArtifacts) {
        const stage = detectStageFromLiveArtifact(art);
        buckets.get(stage)!.push({ type: 'live-artifact', artifact: art });
      }
    }
    const folderSection = renderFolderSectionRows(pageBrowseRows);
    const sectionRows = CURRICULUM_STAGE_ORDER.flatMap((stage) => {
      const items = buckets.get(stage)!;
      if (items.length === 0) return [];
      const label = t(curriculumStageI18nKey(stage));
      return [
        <tr className="df-section-row" key={`stage-${stage}-label`}>
          <td colSpan={6}>
            <div className="df-section-label">
              <span>{label}</span>
              <span className="df-section-count">{items.length}</span>
            </div>
          </td>
        </tr>,
        ...items.map((item) =>
          item.type === 'file'
            ? renderFileRow(item.file)
            : renderLiveArtifactRow(item.artifact)
        ),
      ];
    });
    return [...folderSection, ...sectionRows];
  }

  function renderFolderGroupingSections() {
    // When grouped by folder, every file is bucketed by its parent
    // directory relative to the current browse path. Files directly in
    // the browsed directory live under the "root" bucket. Folder rows
    // (subdirectories) still render in their own section at the top so
    // the user can drill into nested folders alongside their grouping.
    const folderSection = renderFolderSectionRows(pageBrowseRows);
    const buckets = new Map<string, ProjectFile[]>();
    for (const f of pageFiles) {
      const dir = parentDirRelative(f.name, browsePath);
      const bucket = buckets.get(dir) ?? [];
      bucket.push(f);
      buckets.set(dir, bucket);
    }
    const orderedKeys = [...buckets.keys()].sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });
    const sectionRows = orderedKeys.flatMap((key) => {
      const items = buckets.get(key)!;
      const label = key || t('designFiles.rootFolder');
      return [
        <tr className="df-section-row" key={`folder-group-${key || 'root'}-label`}>
          <td colSpan={6}>
            <div className="df-section-label">
              <span>{label}</span>
              <span className="df-section-count">{items.length}</span>
            </div>
          </td>
        </tr>,
        ...items.map(renderFileRow),
      ];
    });
    return [...folderSection, ...sectionRows];
  }

  function renderSizeSections() {
    const buckets = new Map<SizeBucket, ProjectFile[]>();
    for (const bucket of SIZE_BUCKET_ORDER) buckets.set(bucket, []);
    for (const f of pageFiles) {
      const bucket = detectSizeBucket(f.size);
      buckets.get(bucket)!.push(f);
    }
    const folderSection = renderFolderSectionRows(pageBrowseRows);
    const sectionRows = SIZE_BUCKET_ORDER.flatMap((bucket) => {
      const items = buckets.get(bucket)!;
      if (items.length === 0) return [];
      const label = t(sizeBucketI18nKey(bucket));
      return [
        <tr className="df-section-row" key={`size-${bucket}-label`}>
          <td colSpan={6}>
            <div className="df-section-label">
              <span>{label}</span>
              <span className="df-section-count">{items.length}</span>
            </div>
          </td>
        </tr>,
        ...items.map(renderFileRow),
      ];
    });
    return [...folderSection, ...sectionRows];
  }

  async function handleBatchDownload() {
    const fileList = [...selected];
    if (fileList.length === 0) return;
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/archive/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileList }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `request failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const header = resp.headers.get('content-disposition') || '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
      let filename = 'project.zip';
      if (star && star[1]) {
        try {
          filename = decodeURIComponent(star[1]);
        } catch {
          filename = star[1];
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.warn('[batchDownload] failed:', err);
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    setDraggingMove(false);
    const movingNames = draggedFileNamesFromEvent(ev);
    if (movingNames.length > 0) {
      void moveFilesTo(movingNames, uploadBrowsePath);
      return;
    }
    const dropped = Array.from(ev.dataTransfer.files ?? []);
    if (dropped.length > 0) onUploadFiles(dropped, uploadBrowsePath);
  }

  async function handlePluginFolderAgentAction(
    relativePath: string,
    action: PluginFolderAgentAction,
  ) {
    if (!onPluginFolderAgentAction || installingFolder || sharingFolder) return;
    setInstallNotice(null);
    if (action === 'install') {
      setInstallingFolder(relativePath);
    } else {
      setSharingFolder(`${action}:${relativePath}`);
    }
    try {
      await onPluginFolderAgentAction(relativePath, action);
      setInstallNotice('Sent to the agent. The CLI run will continue in chat.');
    } finally {
      setInstallingFolder(null);
      setSharingFolder(null);
    }
  }

  return (
    <div className={`df-panel ${preview ? '' : 'no-preview'}`}>
      <div className="df-main">
        <div className="df-head">
          <button
            type="button"
            className="icon-only"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            title={t('designFiles.refresh')}
            aria-label={t('designFiles.refresh')}
          >
            <Icon name={refreshing ? 'spinner' : 'reload'} size={14} />
          </button>
          {browsePath ? (
            <button
              type="button"
              className="icon-only"
              onClick={() => openBrowseFolder(parentDesignFilesBrowsePath(browsePath))}
              title={t('designFiles.up')}
              aria-label={t('designFiles.up')}
            >
              <Icon name="chevron-left" size={14} />
            </button>
          ) : null}
          <nav className="df-crumbs" aria-label={t('designFiles.crumbs')}>
            <button
              type="button"
              className="df-crumb"
              onClick={() => openBrowseFolder('')}
              aria-current={browsePath ? undefined : 'page'}
            >
              {t('designFiles.crumbs')}
            </button>
            {browsePathSegments(browsePath).map((segment, index, segments) => {
              const path = segments.slice(0, index + 1).join('/');
              const isLast = index === segments.length - 1;
              return (
                <span key={path} className="df-crumb-wrap">
                  <span className="df-crumb-sep">/</span>
                  <button
                    type="button"
                    className="df-crumb"
                    onClick={() => openBrowseFolder(path)}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {browsePathLabel(path, {
                      extractedMediaFolder: t('designFiles.extractedMediaFolder'),
                    })}
                  </button>
                </span>
              );
            })}
          </nav>
          {selected.size > 0 ? (
            <div className="df-actions">
              {onMoveFiles ? (
                <button
                  type="button"
                  onClick={openMoveSelectedModal}
                  title={t('designFiles.moveSelected', { n: selected.size })}
                >
                  <Icon name="folder" size={13} />
                  <span>{t('designFiles.moveSelected', { n: selected.size })}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleBatchDownload()}
                title={t('designFiles.downloadSelected', { n: selected.size })}
              >
                <Icon name="download" size={13} />
                <span>{t('designFiles.downloadSelected', { n: selected.size })}</span>
              </button>
              <button
                type="button"
                className="danger"
                data-testid="design-files-batch-delete"
                disabled={deleting}
                onClick={() => void handleBatchDelete()}
                title={t('designFiles.deleteSelected', { n: selected.size })}
              >
                <span>{t('designFiles.deleteSelected', { n: selected.size })}</span>
              </button>
            </div>
          ) : (
            <div className="df-actions">
            {onCreateFolder && !inExtractedMediaBrowse ? (
              <button
                type="button"
                data-testid="design-files-new-folder"
                onClick={openCreateFolderModal}
                title={t('designFiles.newFolder')}
              >
                <Icon name="plus" size={13} />
                <span>{t('designFiles.newFolder')}</span>
              </button>
            ) : null}
            <button type="button" onClick={onNewSketch} title={t('designFiles.newSketch')}>
              <Icon name="pencil" size={13} />
              <span>{t('designFiles.newSketch')}</span>
            </button>
            <button
              type="button"
              onClick={() => onPaste(uploadBrowsePath)}
              title={t('designFiles.paste.title')}
            >
              <Icon name="copy" size={13} />
              <span>{t('designFiles.paste.label')}</span>
            </button>
            <button
              type="button"
              data-testid="design-files-upload-trigger"
              onClick={() => onUpload(uploadBrowsePath)}
              title={t('designFiles.upload.title')}
            >
              <Icon name="upload" size={13} />
              <span>{t('designFiles.upload.label')}</span>
            </button>
            <button
              type="button"
              data-testid="design-files-upload-folder-trigger"
              onClick={() => onUploadFolder(uploadBrowsePath)}
              title={t('designFiles.uploadFolder.title')}
            >
              <Icon name="folder" size={13} />
              <span>{t('designFiles.uploadFolder.label')}</span>
            </button>
          </div>
          )}
        </div>
        <div className="df-body">
          {uploadError && !preview ? (
            <div className="df-upload-banner" data-testid="upload-error-banner">
              <span>{uploadError}</span>
              {onClearUploadError ? (
                <button
                  type="button"
                  data-testid="upload-error-dismiss"
                  onClick={onClearUploadError}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
          {directoryListing.folders.length === 0 &&
          directoryListing.files.length === 0 &&
          (browsePath || liveArtifacts.length === 0) ? (
            <div className="df-empty" data-testid="design-files-empty">
              <div className="df-empty-pill">
                <span className="df-empty-title">
                  {t('designFiles.empty')}
                </span>
                <button
                  type="button"
                  className="df-empty-cta"
                  data-testid="design-files-empty-new-sketch"
                  onClick={onNewSketch}
                  title={t('designFiles.newSketch')}
                >
                  <Icon name="pencil" size={13} />
                  <span>{t('designFiles.newSketch')}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {files.length > 0 || (!browsePath && liveArtifacts.length > 0) ? (
                <>
                  <div
                    className="df-group-toggle"
                    role="group"
                    aria-label={t('designFiles.groupBy')}
                  >
                    <span>{t('designFiles.groupBy')}</span>
                    <button
                      type="button"
                      className={groupMode === 'kind' ? 'active' : ''}
                      aria-pressed={groupMode === 'kind'}
                      onClick={() => setGroupMode('kind')}
                    >
                      {t('designFiles.groupByKind')}
                    </button>
                    <button
                      type="button"
                      data-testid="design-files-group-stage"
                      className={groupMode === 'stage' ? 'active' : ''}
                      aria-pressed={groupMode === 'stage'}
                      onClick={() => setGroupMode('stage')}
                    >
                      {t('designFiles.groupByStage')}
                    </button>
                    <button
                      type="button"
                      className={groupMode === 'modified' ? 'active' : ''}
                      aria-pressed={groupMode === 'modified'}
                      onClick={() => setGroupMode('modified')}
                    >
                      {t('designFiles.groupByModified')}
                    </button>
                    <button
                      type="button"
                      data-testid="design-files-group-folder"
                      className={groupMode === 'folder' ? 'active' : ''}
                      aria-pressed={groupMode === 'folder'}
                      onClick={() => setGroupMode('folder')}
                    >
                      {t('designFiles.groupByFolder')}
                    </button>
                    <button
                      type="button"
                      data-testid="design-files-group-size"
                      className={groupMode === 'size' ? 'active' : ''}
                      aria-pressed={groupMode === 'size'}
                      onClick={() => setGroupMode('size')}
                    >
                      {t('designFiles.groupBySize')}
                    </button>
                  </div>
                  {kindFamilyCounts.size > 0 ? (
                    <div
                      className="df-filter-chips"
                      role="group"
                      aria-label={t('designFiles.filterByLabel')}
                      data-testid="design-files-filter-chips"
                    >
                      <span>{t('designFiles.filterByLabel')}</span>
                      <button
                        type="button"
                        data-testid="design-files-filter-all"
                        className={`df-filter-chip ${kindFamilyFilter === null ? 'active' : ''}`}
                        aria-pressed={kindFamilyFilter === null}
                        onClick={() => setKindFamilyFilter(null)}
                      >
                        {t('designFiles.filterAll')}
                      </button>
                      {KIND_FAMILY_ORDER.filter((family) => (kindFamilyCounts.get(family) ?? 0) > 0).map((family) => {
                        const isActive = kindFamilyFilter === family;
                        const labelKey = kindFamilyI18nKey(family);
                        return (
                          <button
                            key={family}
                            type="button"
                            data-testid={`design-files-filter-${family}`}
                            className={`df-filter-chip ${isActive ? 'active' : ''}`}
                            aria-pressed={isActive}
                            onClick={() => setKindFamilyFilter(isActive ? null : family)}
                          >
                            <span>{t(labelKey)}</span>
                            <span className="df-filter-chip-count">{kindFamilyCounts.get(family)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
              {!browsePath && liveArtifacts.length > 0 && groupMode !== 'kind' ? (
                <div className="df-section" key="live-artifacts">
                  <div className="df-section-label">{t('designFiles.sectionLiveArtifacts')}</div>
                  {liveArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      type="button"
                      data-testid={`design-file-row-${artifact.tabId}`}
                      className="df-row df-row-live-artifact"
                      onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
                      onClick={() => onOpenLiveArtifact(artifact.tabId)}
                    >
                      <span className="df-row-icon" data-kind="live-artifact" aria-hidden>
                        <FileKindIcon kind="live-artifact" />
                      </span>
                      <span className="df-row-name-wrap">
                        <span className="df-row-name">{artifact.title}</span>
                        <span className="df-row-sub">
                          <span>{t('designFiles.kindLiveArtifact')}</span>
                          <LiveArtifactBadges
                            compact
                            status={artifact.status}
                            refreshStatus={artifact.refreshStatus}
                          />
                        </span>
                      </span>
                      <span className="df-row-time">
                        {relativeTime(Date.parse(artifact.updatedAt) || Date.now(), t)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {!browsePath && pluginFolders.length > 0 ? (
                <div className="df-section" key="plugin-folders">
                  <div className="df-section-label">
                    Plugin folders
                    <span className="df-section-count">{pluginFolders.length}</span>
                  </div>
                  {installNotice ? (
                    <div className="df-inline-notice" role="status">{installNotice}</div>
                  ) : null}
                  {pluginFolders.map((folder) => (
                    <div
                      key={folder.path}
                      className="df-row df-row-plugin-folder"
                      data-testid={`design-plugin-folder-${folder.path}`}
                    >
                      <button
                        type="button"
                        className="df-row-folder-main"
                        onClick={() => setPreview(folder.manifestPath)}
                      >
                        <span className="df-row-icon" data-kind="folder" aria-hidden>
                          <FileKindIcon kind="folder" />
                        </span>
                        <span className="df-row-name-wrap">
                          <span className="df-row-name">{folder.path}</span>
                          <span className="df-row-sub">
                            {t('plugins.filesReadyForMine', { n: folder.fileCount })}
                          </span>
                        </span>
                      </button>
                      <span className="df-row-time">{relativeTime(folder.updatedAt, t)}</span>
                      {onPluginFolderAgentAction ? (
                        <div className="df-plugin-actions">
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-install-${folder.path}`}
                            disabled={installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'install')
                            }
                          >
                            {installingFolder === folder.path ? t('plugins.sending') : t('plugins.addToMine')}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-publish-${folder.path}`}
                            disabled={installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'publish')
                            }
                          >
                            {sharingFolder === `publish:${folder.path}` ? 'Sending…' : 'Publish repo'}
                          </button>
                          <button
                            type="button"
                            className="df-plugin-install"
                            data-testid={`design-plugin-folder-contribute-${folder.path}`}
                            disabled={installingFolder !== null || sharingFolder !== null}
                            onClick={() =>
                              void handlePluginFolderAgentAction(folder.path, 'contribute')
                            }
                          >
                            {sharingFolder === `contribute:${folder.path}` ? 'Sending…' : 'Contribution PR'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {sortedBrowseRows.length > 0 || (!browsePath && liveArtifacts.length > 0) ? (
                <>
                  <div className="df-pagination df-pagination-start">
                    <label>
                      {t('designFiles.perPage')}:
                      <select
                        value={pageSize === 'all' ? 'all' : pageSize}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPageSize(val === 'all' ? 'all' : Number(val));
                        }}
                      >
                        <option value={15}>15</option>
                        <option value={30}>30</option>
                        <option value={45}>45</option>
                        <option value={60}>60</option>
                        <option value="all">{t('designFiles.all')}</option>
                      </select>
                    </label>
                    <span className="df-page-info">
                      {t('designFiles.pageInfo', { start: rangeStart, end: rangeEnd, total: filteredBrowseRows.length })}
                    </span>
                    <div className="df-select-bar">
                      {selected.size < sortedFiles.length ? (
                        <button type="button" className="df-select-all" onClick={selectAllFiles}>
                          {t('designFiles.selectAll', { n: sortedFiles.length })}
                        </button>
                      ) : null}
                      {selected.size > 0 ? (
                        <button type="button" className="df-select-all" onClick={clearSelection}>
                          {t('designFiles.clearSelection')}
                        </button>
                      ) : null}
                    </div>
                    <div className="df-pagination-right">
                      <button
                        type="button"
                        className="df-page-btn"
                        disabled={safePage <= 0}
                        onClick={() => setPage(Math.max(0, safePage - 1))}
                      >
                        {t('designFiles.prev')}
                      </button>
                      <button
                        type="button"
                        className="df-page-btn"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                      >
                        {t('designFiles.next')}
                      </button>
                    </div>
                  </div>
                  <table className="df-table">
                    <thead>
                      <tr>
                        <th className="df-th-check">
                          <span
                            className="df-row-check"
                            onClick={toggleSelectPage}
                            role="checkbox"
                            aria-checked={allPageSelected}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSelectPage();
                              }
                            }}
                            ref={(el) => {
                              if (el) (el as HTMLElement).ariaChecked = allPageSelected ? 'true' : somePageSelected ? 'mixed' : 'false';
                            }}
                          >
                            {allPageSelected ? '\u2611' : somePageSelected ? '\u25A3' : '\u2610'}
                          </span>
                        </th>
                        <th className="df-th-icon" />
                        <th
                          className="df-th-name df-th-sortable"
                          aria-sort={sortKey === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('name')}>
                            {t('designFiles.colName')}
                            {sortKey === 'name' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th
                          className="df-th-kind df-th-sortable"
                          aria-sort={sortKey === 'kind' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('kind')}>
                            {t('designFiles.colKind')}
                            {sortKey === 'kind' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th
                          className="df-th-time df-th-sortable"
                          aria-sort={sortKey === 'mtime' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" className="df-th-btn" onClick={toggleSort('mtime')}>
                            {t('designFiles.colModified')}
                            {sortKey === 'mtime' ? <span className="df-sort-arrow">{sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span> : null}
                          </button>
                        </th>
                        <th className="df-th-menu" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupMode === 'modified'
                        ? renderModifiedSections()
                        : groupMode === 'kind'
                          ? renderKindSections()
                          : groupMode === 'stage'
                            ? renderStageSections()
                            : groupMode === 'folder'
                              ? renderFolderGroupingSections()
                              : groupMode === 'size'
                                ? renderSizeSections()
                                : pageBrowseRows.map(renderBrowseRow)}
                    </tbody>
                  </table>
                  <div className="df-pagination df-pagination-center">
                    <button
                      type="button"
                      className="df-page-btn"
                      disabled={safePage <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      {t('designFiles.prev')}
                    </button>
                    <label>
                      {t('designFiles.jumpToPage')}:
                      <select
                        value={safePage}
                        onChange={(e) => setPage(Number(e.target.value))}
                      >
                        {Array.from({ length: totalPages }, (_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="df-page-btn"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      {t('designFiles.next')}
                    </button>
                    <span className="df-page-info">
                      {t('designFiles.pageInfo', { start: rangeStart, end: rangeEnd, total: filteredBrowseRows.length })}
                    </span>
                  </div>
                </>
              ) : null}
            </>
          )}
          <div
            className={`df-drop ${draggingFiles || draggingMove ? 'dragging' : ''}`}
            data-testid="design-files-drop-zone"
            role="button"
            tabIndex={0}
            title={t('designFiles.upload.title')}
            aria-label={`${t('designFiles.dropTitle')} ${t('designFiles.dropDesc')}`}
            onClick={() => onUpload(uploadBrowsePath)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onUpload(uploadBrowsePath);
              }
            }}
            onDragEnter={(ev) => {
              ev.preventDefault();
              if (draggedFileNamesFromEvent(ev).length > 0) {
                setDraggingMove(true);
                return;
              }
              dragDepthRef.current += 1;
              setDraggingFiles(true);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = draggedFileNamesFromEvent(ev).length > 0 ? 'move' : 'copy';
            }}
            onDragLeave={(ev) => {
              if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
                dragDepthRef.current = 0;
                setDraggingFiles(false);
                setDraggingMove(false);
                return;
              }
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDraggingFiles(false);
            }}
            onDrop={handleDrop}
          >
            <span className="label">
              {draggingMove ? t('designFiles.dropMoveTitle') : t('designFiles.dropTitle')}
            </span>
            <span className="desc">
              {draggingMove
                ? t('designFiles.dropMoveDesc', { folder: browsePath || t('designFiles.rootFolder') })
                : t('designFiles.dropDesc')}
            </span>
          </div>
        </div>
      </div>
      {preview && previewFile ? (
        <DfPreview
          key={previewFile.name}
          projectId={projectId}
          file={previewFile}
          extractedMedia={previewExtractedMedia}
          onOpen={() => onOpenFile(previewFile.name)}
          onClose={() => setPreview(null)}
          onRefreshFiles={onRefreshFiles}
        />
      ) : null}
      {menuPos ? (
        <div
          data-testid="design-file-menu-popover"
          className="df-row-popover"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const name = menuPos.name;
              setMenuPos(null);
              onOpenFile(name);
            }}
          >
            {t('designFiles.openInTab')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startRename(menuPos.name);
            }}
          >
            {t('common.rename')}
          </button>
          <button
            type="button"
            className="df-row-popover-link-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuPos(null);
            }}
          >
            <a
              className="text-decoration-none download-menu-link"
              href={projectFileUrl(projectId, menuPos.name)}
              download={menuPos.name}
            >
              {t('designFiles.download')}
            </a>
          </button>
          <button
            type="button"
            className="danger"
            data-testid={`design-file-delete-${menuPos.name}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const name = menuPos.name;
              setMenuPos(null);
              onDeleteFile(name);
            }}
          >
            {t('designFiles.delete')}
          </button>
        </div>
      ) : null}
      {inputModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeInputModal}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="design-files-input-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="design-files-input-modal-title">{inputModalTitle}</h2>
            </div>
            <label htmlFor="design-files-input-modal-field">
              <span>{inputModalLabel}</span>
              <input
                id="design-files-input-modal-field"
                type="text"
                value={inputModal.value}
                autoFocus
                onChange={(e) =>
                  setInputModal((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !inputModalSubmitDisabled) {
                    e.preventDefault();
                    void submitInputModal();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeInputModal();
                  }
                }}
              />
            </label>
            <div className="modal-foot">
              <UiActionButton type="button" tone="secondary" onClick={closeInputModal}>
                {t('common.cancel')}
              </UiActionButton>
              <UiActionButton
                type="button"
                tone="primary"
                disabled={inputModalSubmitDisabled}
                onClick={() => void submitInputModal()}
              >
                {inputModalSubmitLabel}
              </UiActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DfPreview({
  projectId,
  file,
  extractedMedia,
  onOpen,
  onClose,
  onRefreshFiles,
}: {
  projectId: string;
  file: ProjectFile;
  extractedMedia: ProjectFile[];
  onOpen: () => void;
  onClose: () => void;
  onRefreshFiles?: () => Promise<void> | void;
}) {
  const t = useT();
  const url = projectFileUrl(projectId, file.name);
  const rendersSketchJson = isRenderableSketchJson(file);
  const [extracting, setExtracting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [dynamicMedia, setDynamicMedia] = useState<ProjectFile[]>(extractedMedia);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    setDynamicMedia(extractedMedia);
  }, [extractedMedia]);

  const loadDynamicMedia = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const extractedPaths = await fetchExtractedDocumentMedia(projectId, file.name);
    if (seq !== requestSeqRef.current) return;
    if (extractedPaths.length > 0) {
      const mapped = extractedPaths.map((p) => {
        const existing = extractedMedia.find((f) => f.name === p);
        if (existing) return existing;
        return {
          name: p,
          path: p,
          type: 'file' as const,
          size: 0,
          mtime: Date.now(),
          kind: 'image' as const,
          mime: 'image/png',
        };
      });
      setDynamicMedia(mapped);
    }
  }, [projectId, file.name, extractedMedia]);

  useEffect(() => {
    void loadDynamicMedia();
  }, [loadDynamicMedia]);

  const handleExtract = async () => {
    setExtracting(true);
    try {
      await triggerExtractDocumentMedia(projectId, file.name);
      if (onRefreshFiles) {
        await onRefreshFiles();
      }
      await loadDynamicMedia();
    } catch (err) {
      console.error('Manual extraction failed:', err);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <aside className="df-preview">
      <div className="df-preview-thumb">
        {rendersSketchJson ? (
          <SketchPreview projectId={projectId} file={file} />
        ) : file.kind === 'image' || file.kind === 'sketch' ? (
          <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />
        ) : file.kind === 'html' ? (
          <iframe title={file.name} src={url} sandbox="allow-scripts" />
        ) : file.kind === 'video' ? (
          <video
            src={`${url}?v=${Math.round(file.mtime)}`}
            controls
            playsInline
            preload="metadata"
          />
        ) : file.kind === 'audio' ? (
          <audio src={`${url}?v=${Math.round(file.mtime)}`} controls preload="metadata" />
        ) : file.kind === 'presentation' ? (
          <SlidePreview projectId={projectId} file={file} compact onOpenInTab={onOpen} />
        ) : (
          <FlexRow
            className="df-preview-glyph"
            gap={0}
            align="center"
            justify="center"
          >
            <span className="df-row-icon df-preview-kind-icon" data-kind={file.kind} aria-hidden>
              <FileKindIcon kind={file.kind} />
            </span>
          </FlexRow>
        )}
      </div>
      <div className="df-preview-meta" data-testid="design-file-preview">
          <button
            type="button"
            className="ghost self-flex-start"
            onClick={onOpen}
          >
          <Icon name="eye" size={13} />
          <span>{t('designFiles.previewOpen')}</span>
        </button>
        <div className="df-preview-name">{file.name}</div>
        <div className="df-preview-kind">{kindLabel(file.kind, t)}</div>
        <div className="df-preview-stats">
          {t('designFiles.modified', {
            time: relativeTime(file.mtime, t),
            size: humanBytes(file.size),
          })}
        </div>

        {['document', 'pdf', 'presentation', 'spreadsheet'].includes(file.kind) ? (
          <div className="df-preview-assets" data-testid="design-file-preview-assets">
            <FlexRow
              className="df-preview-assets-header"
              gap={0}
              align="center"
              justify="space-between"
            >
              <div className="df-preview-assets-title">
                {t('designFiles.extractedMediaFolder')} · {dynamicMedia.length}
              </div>
              <button
                type="button"
                className="ghost mini df-preview-extract-btn"
                disabled={extracting}
                onClick={handleExtract}
              >
                {extracting ? (
                  <>
                    <Icon name="spinner" size={10} />
                    <span>Extracting...</span>
                  </>
                ) : (
                  <>
                    <Icon name="reload" size={10} />
                    <span>{dynamicMedia.length > 0 ? 'Re-extract' : 'Extract images'}</span>
                  </>
                )}
              </button>
            </FlexRow>
            
            {extracting ? (
              <FlexRow className="df-preview-extract-running" align="center" justify="center">
                <Icon name="spinner" size={16} />
                <span>Running image extraction...</span>
              </FlexRow>
            ) : dynamicMedia.length > 0 ? (
              <>
                <div className="df-preview-assets-grid">
                  {(showAll ? dynamicMedia : dynamicMedia.slice(0, 12)).map((asset) => {
                    const assetUrl = projectFileUrl(projectId, asset.name);
                    return (
                      <a
                        key={asset.name}
                        href={assetUrl}
                        download={asset.name}
                        title={asset.name}
                        className="df-preview-asset"
                      >
                        <img src={`${assetUrl}?v=${Math.round(asset.mtime)}`} alt={asset.name} />
                      </a>
                    );
                  })}
                </div>
                {dynamicMedia.length > 12 && (
                  <button
                    type="button"
                    className="ghost mini df-preview-media-toggle"
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? 'Show less' : `Show all ${dynamicMedia.length} images`}
                  </button>
                )}
              </>
            ) : (
              <div className="df-preview-media-empty">
                No images extracted yet. Click "Extract images" above to retrieve graphics from this document.
              </div>
            )}
          </div>
        ) : null}

        <DfPreviewActions
          url={url}
          fileName={file.name}
          onClose={onClose}
        />
      </div>
    </aside>
  );
}

interface DfPreviewActionsProps {
  url: string;
  fileName: string;
  onClose: () => void;
}

export function DfPreviewActions({
  url,
  fileName,
  onClose,
}: DfPreviewActionsProps) {
  const t = useT();
  return (
    <div className="df-preview-actions">
      <a
        className="ghost-link text-decoration-none"
        href={url}
        download={fileName}
      >
        {t('designFiles.download')}
      </a>
      <button type="button" onClick={onClose}>
        {t('designFiles.previewClose')}
      </button>
    </div>
  );
}

/**
 * Returns the parent directory of a file path relative to the current
 * browse path. Files directly in `browsePath` produce an empty string
 * (rendered as "Project root" by the caller).
 */
function parentDirRelative(name: string, browsePath: BrowsePath): string {
  const file = name.replace(/\\/g, '/');
  const base = browsePath ? `${browsePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')}/` : '';
  const rel = base && file.startsWith(base) ? file.slice(base.length) : file;
  const slash = rel.lastIndexOf('/');
  return slash === -1 ? '' : rel.slice(0, slash);
}

/**
 * Curriculum-stage classification for live artifacts. Reuses the file
 * classifier so the same heuristic vocabulary applies to docx / pdf
 * uploads and to AI-produced live documents.
 */
function detectStageFromLiveArtifact(art: LiveArtifactWorkspaceEntry): CurriculumStage {
  const synthetic: ProjectFile = {
    name: art.title || art.slug || '',
    size: 0,
    mtime: Date.parse(art.updatedAt) || Date.now(),
    kind: 'text',
    mime: 'text/plain',
  };
  return detectCurriculumStage(synthetic, art.slug);
}

function kindSortPriority(kind: ProjectFileKind): number {
  if (kind === 'html') return 0;
  if (kind === 'text') return 1;
  if (kind === 'code') return 2;
  if (kind === 'sketch') return 3;
  if (kind === 'image') return 4;
  if (kind === 'document') return 5;
  if (kind === 'pdf') return 6;
  if (kind === 'presentation') return 7;
  if (kind === 'spreadsheet') return 8;
  if (kind === 'video') return 9;
  if (kind === 'audio') return 10;
  return 11;
}

interface ModifiedSectionThresholds {
  todayStart: number;
  yesterdayStart: number;
  previous7DaysStart: number;
  previous30DaysStart: number;
}

function modifiedSectionThresholds(now: number): ModifiedSectionThresholds {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return {
    todayStart: startOfToday.getTime(),
    yesterdayStart: dateDaysBefore(startOfToday, 1).getTime(),
    previous7DaysStart: dateDaysBefore(startOfToday, 7).getTime(),
    previous30DaysStart: dateDaysBefore(startOfToday, 30).getTime(),
  };
}

function modifiedSectionFor(ts: number, thresholds: ModifiedSectionThresholds): ModifiedSection {
  const { todayStart, yesterdayStart, previous7DaysStart, previous30DaysStart } = thresholds;
  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= previous7DaysStart) return 'previous7Days';
  if (ts >= previous30DaysStart) return 'previous30Days';
  return 'older';
}

function dateDaysBefore(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function kindLabel(kind: ProjectFileKind, t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'text') return t('designFiles.kindText');
  if (kind === 'code') return t('designFiles.kindCode');
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

function relativeTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  if (diff < 30 * day)
    return t('designFiles.weeksAgo', { n: Math.floor(diff / (7 * day)) });
  return new Date(ts).toLocaleDateString();
}
