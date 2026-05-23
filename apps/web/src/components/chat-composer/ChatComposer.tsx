import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '../../i18n';
import { useAnalytics } from '../../analytics/provider';
import {
  trackStudioClickChatComposer,
  trackStudioViewChatPanel,
} from '../../analytics/events';
import { uploadProjectFiles, openFolderDialog } from '../../providers/registry';
import { patchProject } from '../../state/projects';
import { fetchMcpServers } from '../../state/mcp';
import type { McpServerConfig, McpTemplate } from '../../state/mcp';
import { listPlugins } from '../../state/projects';
import type { AppConfig, ChatAttachment, ChatCommentAttachment, ProjectFile, ProjectMetadata, SkillSummary } from '../../types';
import type {
  ContextItem,
  InstalledPluginRecord,
} from '@open-design/contracts';
import { buildVisualAnnotationAttachment } from '../../comments';
import { Icon } from '../Icon';
import { PluginDetailsModal } from '../PluginDetailsModal';
import { PluginsSection, type PluginsSectionHandle } from '../PluginsSection';
import { BUILT_IN_PETS, CUSTOM_PET_ID, resolveActivePet } from '../pet/pets';
import {
  buildInlineMentionParts,
  inlineMentionToken,
} from '../../utils/inlineMentions';
import { ANNOTATION_EVENT, type AnnotationEventDetail } from '../PreviewDrawOverlay';
import { useOutsideClick } from '../../hooks/useOutsideClick';

import type { ChatSendMeta, ToolsTab, SlashCommand } from './types';
import { escapeRegExp, looksLikeImage, buildComposerMentionEntities } from './utils';
import { StagedAttachments, StagedSkills, StagedCommentAttachments } from './StagedAttachments';
import { ToolsPluginsPanel, ToolsMcpPanel, ToolsSkillsPanel, ToolsImportPanel, ToolsPetPanel } from './ToolsPanels';
import { SlashPopover, MentionPopover } from './Popovers';

interface Props {
  projectId: string | null;
  projectFiles: ProjectFile[];
  streaming: boolean;
  sendDisabled?: boolean;
  initialDraft?: string;
  selectedText?: string;
  onClearSelection?: () => void;
  onEnsureProject: () => Promise<string | null>;
  commentAttachments?: ChatCommentAttachment[];
  onRemoveCommentAttachment?: (id: string) => void;
  skills?: SkillSummary[];
  designTemplates?: SkillSummary[];
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
    meta?: ChatSendMeta,
  ) => void;
  onStop: () => void;
  onOpenSettings?: () => void;
  onOpenMcpSettings?: () => void;
  petConfig?: AppConfig['pet'];
  onAdoptPet?: (petId: string) => void;
  onTogglePet?: () => void;
  onOpenPetSettings?: () => void;
  researchAvailable?: boolean;
  projectMetadata?: ProjectMetadata;
  onProjectMetadataChange?: (metadata: ProjectMetadata) => void;
  currentSkillId?: string | null;
  onProjectSkillChange?: (skillId: string | null) => void;
  pinnedPluginId?: string | null;
}

export interface ChatComposerHandle {
  setDraft: (text: string) => void;
  focus: () => void;
}

export const ChatComposer = forwardRef<ChatComposerHandle, Props>(
  function ChatComposer(
    {
      projectId,
      projectFiles,
      streaming,
      sendDisabled = false,
      initialDraft,
      selectedText,
      onClearSelection,
      onEnsureProject,
      commentAttachments = [],
      onRemoveCommentAttachment,
      skills = [],
      onSend,
      onStop,
      onOpenSettings,
      onOpenMcpSettings,
      petConfig,
      onAdoptPet,
      onTogglePet,
      onOpenPetSettings,
      researchAvailable = false,
      projectMetadata,
      onProjectMetadataChange,
      currentSkillId = null,
      onProjectSkillChange,
      pinnedPluginId = null,
    },
    ref
  ) {
    const t = useT();
    const analytics = useAnalytics();
    const [draft, setDraft] = useState(initialDraft ?? '');

    const studioViewFiredRef = useRef<string | null>(null);
    useEffect(() => {
      if (studioViewFiredRef.current === projectId) return;
      studioViewFiredRef.current = projectId;
      trackStudioViewChatPanel(analytics.track, {
        page: 'studio',
        area: 'chat_panel',
        element: 'chat_tab',
        view_type: 'panel',
        source: 'open_project',
        conversation_id: null,
      });
    }, [projectId, analytics.track]);

    const [staged, setStaged] = useState<ChatAttachment[]>([]);
    const [stagedVisualComments, setStagedVisualComments] = useState<ChatCommentAttachment[]>([]);
    const [stagedSkills, setStagedSkills] = useState<SkillSummary[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [mention, setMention] = useState<{
      q: string;
      cursor: number;
    } | null>(null);
    const [composerScrollTop, setComposerScrollTop] = useState(0);
    const [slash, setSlash] = useState<{
      q: string;
      cursor: number;
    } | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
    const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
    const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
    const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
    const pluginsSectionRef = useRef<PluginsSectionHandle | null>(null);
    const [toolsOpen, setToolsOpen] = useState(false);
    const [toolsTab, setToolsTab] = useState<ToolsTab>('plugins');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const toolsMenuRef = useRef<HTMLDivElement | null>(null);
    const toolsTriggerRef = useRef<HTMLButtonElement | null>(null);
    const petEnabled = Boolean(onAdoptPet && onTogglePet);
    const linkedDirs = projectMetadata?.linkedDirs ?? [];
    const seededRef = useRef(Boolean(initialDraft));

    useEffect(() => {
      if (seededRef.current) return;
      if (initialDraft && initialDraft !== draft) {
        setDraft(initialDraft);
        seededRef.current = true;
      }
    }, [initialDraft, draft]);

    useOutsideClick(
      toolsMenuRef,
      (e) => {
        if (toolsTriggerRef.current?.contains(e.target as Node)) return;
        setToolsOpen(false);
      },
      toolsOpen,
      () => setToolsOpen(false),
    );

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        const data = await fetchMcpServers();
        if (cancelled || !data) return;
        setMcpServers(data.servers);
        setMcpTemplates(data.templates);
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      if (!projectId) return;
      let cancelled = false;
      void listPlugins().then((rows) => {
        if (cancelled) return;
        setInstalledPlugins(rows);
      });
      return () => {
        cancelled = true;
      };
    }, [projectId]);

    const pluginsForComposer = useMemo<InstalledPluginRecord[]>(() => {
      const allowedKinds = new Set(['skill', 'scenario', 'bundle']);
      return installedPlugins.filter((p) => {
        const k = p.manifest?.od?.kind;
        return !k || allowedKinds.has(k);
      });
    }, [installedPlugins]);

    const enabledMcpServers = useMemo(
      () => mcpServers.filter((s) => s.enabled),
      [mcpServers],
    );

    const composerMentionEntities = useMemo(
      () =>
        buildComposerMentionEntities({
          files: projectFiles,
          mcpServers: enabledMcpServers,
          plugins: pluginsForComposer,
          skills,
          staged,
        }),
      [enabledMcpServers, pluginsForComposer, projectFiles, skills, staged],
    );

    const composerMentionParts = useMemo(
      () => buildInlineMentionParts(draft, composerMentionEntities),
      [composerMentionEntities, draft],
    );

    useEffect(() => {
      setComposerScrollTop(textareaRef.current?.scrollTop ?? 0);
    }, [composerMentionParts, draft]);

    const availableTabs = useMemo<ToolsTab[]>(() => {
      const tabs: ToolsTab[] = [];
      if (projectId) {
        tabs.push('plugins');
        tabs.push('skills');
      }
      if (onOpenMcpSettings) tabs.push('mcp');
      tabs.push('import');
      if (petEnabled) tabs.push('pet');
      return tabs;
    }, [projectId, onOpenMcpSettings, petEnabled]);

    useEffect(() => {
      if (!toolsOpen) return;
      if (!availableTabs.includes(toolsTab)) {
        const first = availableTabs[0];
        if (first) setToolsTab(first);
      }
    }, [toolsOpen, availableTabs, toolsTab]);

    const slashCommands = useMemo<SlashCommand[]>(() => {
      const list: SlashCommand[] = [];
      if (onOpenMcpSettings) {
        list.push({
          id: 'mcp',
          label: '/mcp',
          insert: '/mcp ',
          descKey: 'pet.slashPet',
          icon: 'sliders',
          argHint: 'open settings · <server-id> to insert hint',
        });
      }
      for (const s of enabledMcpServers) {
        list.push({
          id: `mcp-${s.id}`,
          label: `/mcp ${s.id}`,
          insert: `Use the \`${s.id}\` MCP server tools. `,
          descKey: 'pet.slashPet',
          icon: 'sparkles',
          argHint: s.label || s.transport,
        });
      }
      if (researchAvailable) {
        list.push({
          id: 'search',
          label: '/search',
          insert: '/search ',
          descKey: 'pet.slashSearch',
          icon: 'sparkles',
          argHint: t('pet.slashSearchArg'),
        });
      }
      if (petEnabled) {
        list.push(
          {
            id: 'pet',
            label: '/pet',
            insert: '/pet ',
            descKey: 'pet.slashPet',
            icon: 'sparkles',
            argHint: 'wake | tuck | <petId>',
          },
          {
            id: 'pet-wake',
            label: '/pet wake',
            insert: '/pet wake',
            descKey: 'pet.slashPetWake',
            icon: 'eye',
          },
          {
            id: 'pet-tuck',
            label: '/pet tuck',
            insert: '/pet tuck',
            descKey: 'pet.slashPetTuck',
            icon: 'eye',
          },
          {
            id: 'hatch',
            label: '/hatch',
            insert: '/hatch ',
            descKey: 'pet.slashHatch',
            icon: 'sparkles',
            argHint: t('pet.slashHatchArg'),
          },
        );
      }
      return list;
    }, [petEnabled, researchAvailable, t, enabledMcpServers, onOpenMcpSettings]);

    const filteredSlash = useMemo(() => {
      if (!slash) return [] as SlashCommand[];
      const q = slash.q.toLowerCase();
      if (!q) return slashCommands;
      return slashCommands.filter((c) => c.label.toLowerCase().includes(q));
    }, [slash, slashCommands]);

    function pickSlash(cmd: SlashCommand) {
      const ta = textareaRef.current;
      if (!ta || !slash) return;
      const before = draft.slice(0, slash.cursor);
      const after = draft.slice(slash.cursor);
      const replaced = before.replace(/\/[^\s/]*$/, cmd.insert);
      const next = replaced + after;
      setDraft(next);
      setSlash(null);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
    }

    function expandHatchCommand(input: string): string | null {
      const m = /^\/hatch(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const concept = m[1]?.trim() ?? '';
      const intro = concept
        ? `Hatch a Codex-compatible animated pet for me. Concept: ${concept}.`
        : 'Hatch a Codex-compatible animated pet for me.';
      return [
        intro,
        '',
        'Use the @hatch-pet skill end-to-end:',
        '1. Generate the base look with $imagegen.',
        '2. Generate every row strip (idle, running-right, waving, jumping, failed, waiting, running, review).',
        '3. Mirror running-left from running-right only when the design is symmetric.',
        '4. Run the deterministic scripts (extract / compose / validate / contact-sheet / videos).',
        '5. Package the result into ${CODEX_HOME:-$HOME/.codex}/pets/<pet-name>/ with pet.json + spritesheet.webp.',
        '',
        'When the spritesheet is saved, tell me the absolute path and the pet folder name. I will adopt it from Settings → Pets → Recently hatched.',
      ].join('\n');
    }

    function tryHandleMcpSlash(): boolean {
      if (!onOpenMcpSettings) return false;
      const trimmed = draft.trim();
      if (!/^\/mcp\s*$/i.test(trimmed)) return false;
      onOpenMcpSettings();
      setDraft('');
      return true;
    }

    function expandSearchCommand(input: string): { prompt: string; query: string } | null {
      const m = /^\/search(?:\s+([\s\S]*))?$/i.exec(input.trim());
      if (!m) return null;
      const query = m[1]?.trim() ?? '';
      if (!query) return null;
      return {
        query,
        prompt: [
          `Search for: ${query}`,
          '',
          'Before answering, your first tool action must be the OD research command for your shell.',
          'POSIX: "$OD_NODE_BIN" "$OD_BIN" research search --query "<search query>" --max-sources 5',
          'PowerShell: & $env:OD_NODE_BIN $env:OD_BIN research search --query "<search query>" --max-sources 5',
          'cmd.exe: "%OD_NODE_BIN%" "%OD_BIN%" research search --query "<search query>" --max-sources 5',
          'Use the canonical query below as the exact search query, with safe quoting for your shell.',
          '',
          'Canonical query:',
          '',
          '```text',
          query.replace(/```/g, '`\u200b`\u200b`'),
          '```',
          'If the OD command fails because Tavily is not configured or unavailable, report that error, then use your own search capability as fallback and label the fallback clearly.',
          'After the command returns JSON or fallback search results, write a reusable Markdown report into Design Files at `research/<safe-query-slug>.md` or another fresh project-relative path.',
          'The report must include the query, fetched time, short summary, key findings, source list with [1], [2] citations, and a note that source content is external untrusted evidence.',
          'Then summarize the findings with citations by source index and mention the Markdown report path.',
        ].join('\n'),
      };
    }

    function tryHandlePetSlash(): boolean {
      if (!petEnabled) return false;
      const trimmed = draft.trim();
      const match = /^\/pet(?:\s+(\S+))?$/i.exec(trimmed);
      if (!match) return false;
      const arg = match[1]?.toLowerCase();
      if (!arg || arg === 'toggle') {
        onTogglePet?.();
      } else if (arg === 'wake' || arg === 'show') {
        if (petConfig?.adopted) {
          if (!petConfig.enabled) onTogglePet?.();
        } else {
          onOpenPetSettings?.();
        }
      } else if (arg === 'tuck' || arg === 'hide') {
        if (petConfig?.enabled) onTogglePet?.();
      } else if (arg === 'adopt' || arg === 'settings' || arg === 'change') {
        onOpenPetSettings?.();
      } else if (arg === CUSTOM_PET_ID) {
        onAdoptPet?.(CUSTOM_PET_ID);
      } else {
        const pet = BUILT_IN_PETS.find((p) => p.id === arg);
        if (pet) {
          onAdoptPet?.(pet.id);
        } else {
          return false;
        }
      }
      setDraft('');
      return true;
    }

    useImperativeHandle(
      ref,
      () => ({
        setDraft: (text: string) => {
          setDraft(text);
          seededRef.current = true;
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            const pos = text.length;
            ta.setSelectionRange(pos, pos);
          });
        },
        focus: () => {
          textareaRef.current?.focus();
        },
      }),
      []
    );

    function reset() {
      setDraft('');
      setStaged([]);
      setStagedVisualComments([]);
      setStagedSkills([]);
      setUploadError(null);
      setMention(null);
      setSlash(null);
    }

    function currentCommentAttachments(extra: ChatCommentAttachment[] = []): ChatCommentAttachment[] {
      return [...commentAttachments, ...stagedVisualComments, ...extra];
    }

    async function insertSkillMention(skill: SkillSummary) {
      const applied = await applyProjectSkill(skill);
      if (!applied) return;
      replaceMentionWithText(`${inlineMentionToken(skill.name)} `);
    }

    function removeStagedSkill(id: string) {
      setStagedSkills((prev) => prev.filter((s) => s.id !== id));
      setDraft((d) =>
        d
          .replace(new RegExp(`(^|\\s)@${escapeRegExp(id)}(\\s|$)`, 'g'), '$1$2')
          .replace(/\s{2,}/g, ' '),
      );
    }

    async function ensureProject(): Promise<string | null> {
      if (projectId) return projectId;
      return onEnsureProject();
    }

    async function uploadFiles(files: File[]) {
      if (files.length === 0) return;
      const id = await ensureProject();
      if (!id) return;
      setUploading(true);
      setUploadError(null);
      try {
        const result = await uploadProjectFiles(id, files);
        if (result.uploaded.length > 0) {
          setStaged((s) => [...s, ...result.uploaded]);
        }
        if (result.failed.length > 0) {
          const failedCount = result.failed.length;
          const uploadedCount = result.uploaded.length;
          const detail = result.error ? ` (${result.error})` : '';
          setUploadError(
            uploadedCount > 0
              ? `Attached ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
              : `Attachment upload failed for ${failedCount} file(s)${detail}.`,
          );
          console.warn('Some attachments failed to upload', result.failed);
        }
      } finally {
        setUploading(false);
      }
    }

    useEffect(() => {
      function onAnnotation(e: Event) {
        const detail = (e as CustomEvent<AnnotationEventDetail>).detail;
        if (!detail) return;
        void (async () => {
          let uploaded: ChatAttachment[] = [];
          let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
          let visualAttachment: ChatCommentAttachment | null = null;
          if (detail.file) {
            const id = await ensureProject();
            if (!id) return;
            setUploading(true);
            try {
              const result = await uploadProjectFiles(id, [detail.file]);
              if (result.uploaded.length > 0) {
                uploaded = result.uploaded;
                if (detail.action !== 'send') {
                  setStaged((s) => [...s, ...uploaded]);
                }
                const screenshot = uploaded[0];
                if (screenshot && detail.markKind && detail.bounds) {
                  visualAttachmentInput = {
                    order: 1,
                    idSeed: screenshot.path,
                    screenshotPath: screenshot.path,
                    markKind: detail.markKind,
                    note: detail.note,
                    bounds: detail.bounds,
                    target: detail.target
                      ? {
                          filePath: detail.target.filePath || detail.filePath || screenshot.path,
                          elementId: detail.target.elementId,
                          selector: detail.target.selector,
                          label: detail.target.label,
                          text: detail.target.text,
                          position: detail.target.position,
                          htmlHint: detail.target.htmlHint,
                        }
                      : {
                          filePath: detail.filePath || screenshot.path,
                          position: detail.bounds,
                        },
                  };
                  if (detail.action !== 'send') {
                    setStagedVisualComments((current) => [
                      ...current,
                      buildVisualAnnotationAttachment({
                        ...visualAttachmentInput!,
                        order: commentAttachments.length + current.length + 1,
                      }),
                    ]);
                  }
                }
              }
              if (result.failed.length > 0) {
                const detailText = result.error ? ` (${result.error})` : '';
                setUploadError(`Attachment upload failed for ${result.failed.length} file(s)${detailText}.`);
              }
            } finally {
              setUploading(false);
            }
          }

          if (detail.action === 'send') {
            if (streaming) {
              if (uploaded.length > 0) setStaged((s) => [...s, ...uploaded]);
              if (visualAttachmentInput) {
                setStagedVisualComments((current) => [
                  ...current,
                  buildVisualAnnotationAttachment({
                    ...visualAttachmentInput!,
                    order: commentAttachments.length + current.length + 1,
                  }),
                ]);
              }
              if (detail.note) setDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
              textareaRef.current?.focus();
              return;
            }
            if (visualAttachmentInput) {
              visualAttachment = buildVisualAnnotationAttachment({
                ...visualAttachmentInput,
                order: commentAttachments.length + stagedVisualComments.length + 1,
              });
            }
            const prompt = [draft.trim(), detail.note].filter(Boolean).join('\n');
            const attachments = [...staged, ...uploaded];
            const nextCommentAttachments = currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
            if (!prompt && attachments.length === 0 && nextCommentAttachments.length === 0) return;
            const skillIds = stagedSkills.map((s) => s.id);
            const skillMeta = skillIds.length > 0 ? { skillIds } : undefined;
            onSend(prompt, attachments, nextCommentAttachments, skillMeta);
            reset();
            return;
          }

          if (detail.note) {
            setDraft((d) => (d ? `${d}\n${detail.note}` : detail.note));
            textareaRef.current?.focus();
          }
        })();
      }
      window.addEventListener(ANNOTATION_EVENT, onAnnotation);
      return () => window.removeEventListener(ANNOTATION_EVENT, onAnnotation);
    }, [commentAttachments, draft, onSend, projectId, staged, stagedSkills, stagedVisualComments, streaming]);

    function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void uploadFiles(files);
      }
    }

    function handleDrop(e: React.DragEvent<HTMLDivElement>) {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) void uploadFiles(files);
    }

    async function handleLinkFolder() {
      if (!projectId) return;
      const selected = await openFolderDialog();
      if (!selected) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      if (existing.includes(selected)) return;
      const metadata: ProjectMetadata = { ...base, linkedDirs: [...existing, selected] };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    async function handleUnlinkFolder(dir: string) {
      if (!projectId) return;
      const base = projectMetadata ?? { kind: 'prototype' as const };
      const existing = base.linkedDirs ?? [];
      const metadata: ProjectMetadata = { ...base, linkedDirs: existing.filter((d) => d !== dir) };
      const result = await patchProject(projectId, { metadata });
      if (result?.metadata) onProjectMetadataChange?.(result.metadata);
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const value = e.target.value;
      const cursor = e.target.selectionStart;
      setDraft(value);
      setStagedSkills((prev) =>
        prev.filter((s) =>
          new RegExp(`(^|\\s)@${escapeRegExp(s.id)}(\\s|$)`).test(value),
        ),
      );
      const before = value.slice(0, cursor);
      const m = /(^|\s)@([^\s@]*)$/.exec(before);
      if (m) setMention({ q: m[2] ?? '', cursor });
      else setMention(null);
      const slashMatch = /^\/([^\s/]*)$/.exec(before);
      if (slashMatch) {
        setSlash({ q: slashMatch[1] ?? '', cursor });
        setSlashIndex(0);
      } else {
        setSlash(null);
      }
    }

    function insertMention(filePath: string) {
      if (!mention) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const cursor = mention.cursor;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const replaced = before.replace(/@([^\s@]*)$/, `@${filePath} `);
      const next = replaced + after;
      setDraft(next);
      setMention(null);
      if (!staged.some((s) => s.path === filePath)) {
        setStaged((s) => [
          ...s,
          {
            path: filePath,
            name: filePath.split('/').pop() || filePath,
            kind: looksLikeImage(filePath) ? 'image' : 'file',
          },
        ]);
      }
      requestAnimationFrame(() => {
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
    }

    async function insertPluginMention(record: InstalledPluginRecord) {
      const inserted = replaceMentionWithText(`${inlineMentionToken(record.title)} `);
      if (!inserted) return;
      await pluginsSectionRef.current?.applyById(record.id, record);
    }

    function replaceMentionWithText(text: string): boolean {
      if (!mention) return false;
      const ta = textareaRef.current;
      const cursor = mention.cursor;
      const before = draft.slice(0, cursor);
      const after = draft.slice(cursor);
      const replaced = before.replace(/(^|\s)@([^\s@]*)$/, `$1${text}`);
      const next = replaced + after;
      setDraft(next);
      setMention(null);
      requestAnimationFrame(() => {
        if (!ta) return;
        ta.focus();
        const pos = replaced.length;
        ta.setSelectionRange(pos, pos);
      });
      return true;
    }

    function insertMcpMention(server: McpServerConfig) {
      replaceMentionWithText(`${inlineMentionToken(server.label || server.id)} `);
    }

    async function applyProjectSkill(skill: SkillSummary): Promise<boolean> {
      if (!projectId) return false;
      const result = await patchProject(projectId, { skillId: skill.id });
      if (!result) return false;
      onProjectSkillChange?.(result.skillId ?? skill.id);
      return true;
    }

    function removeStaged(p: string) {
      setStaged((s) => s.filter((a) => a.path !== p));
      setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== p));
    }

    function removeCommentAttachment(id: string) {
      setStagedVisualComments((current) => current.filter((attachment) => attachment.id !== id));
      if (!stagedVisualComments.some((attachment) => attachment.id === id)) {
        onRemoveCommentAttachment?.(id);
      }
    }

    async function submit() {
      const prompt = draft.trim();
      if (sendDisabled) return;
      if (tryHandlePetSlash()) return;
      if (tryHandleMcpSlash()) return;
      const skillIds = stagedSkills.map((s) => s.id);
      const skillMeta = skillIds.length > 0 ? { skillIds } : undefined;
      const hatched = expandHatchCommand(prompt);
      const nextCommentAttachments = currentCommentAttachments();
      if (hatched) {
        if (streaming) return;
        const finalPrompt = selectedText ? `[Context: "${selectedText}"]\n\n${hatched}` : hatched;
        onSend(finalPrompt, staged, nextCommentAttachments, skillMeta);
        onClearSelection?.();
        reset();
        return;
      }
      const search = researchAvailable ? expandSearchCommand(prompt) : null;
      if (search) {
        if (streaming) return;
        const finalPrompt = selectedText ? `[Context: "${selectedText}"]\n\n${search.prompt}` : search.prompt;
        onSend(finalPrompt, staged, nextCommentAttachments, {
          ...skillMeta,
          research: { enabled: true, query: search.query },
        });
        onClearSelection?.();
        reset();
        return;
      }
      if ((!prompt && staged.length === 0 && nextCommentAttachments.length === 0) || streaming) return;
      const finalPrompt = selectedText ? `[Context: "${selectedText}"]\n\n${prompt}` : prompt;
      onSend(finalPrompt, staged, nextCommentAttachments, skillMeta);
      onClearSelection?.();
      reset();
    }

    const mentionQuery = mention ? mention.q.toLowerCase() : '';
    const filteredFiles = mention
      ? projectFiles
          .filter((f) => f.type === undefined || f.type === 'file')
          .filter((f) => {
            const key = f.path ?? f.name;
            return key.toLowerCase().includes(mentionQuery);
          })
          .slice(0, 12)
      : [];
    const filteredPlugins = mention
      ? pluginsForComposer
          .filter((p) => {
            if (!mentionQuery) return true;
            return (
              p.title.toLowerCase().includes(mentionQuery) ||
              p.id.toLowerCase().includes(mentionQuery) ||
              (p.manifest?.description ?? '').toLowerCase().includes(mentionQuery) ||
              (p.manifest?.tags ?? []).join(' ').toLowerCase().includes(mentionQuery)
            );
          })
          .slice(0, 8)
      : [];
    const filteredMcpServers = mention
      ? enabledMcpServers
          .filter((s) => {
            if (!mentionQuery) return true;
            return [
              s.id,
              s.label ?? '',
              s.transport,
              s.url ?? '',
              s.command ?? '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(mentionQuery);
          })
          .slice(0, 8)
      : [];
    const stagedSkillIds = new Set(stagedSkills.map((s) => s.id));
    const filteredSkills = mention
      ? skills
          .filter((s) => !stagedSkillIds.has(s.id))
          .filter((s) => {
            if (!mentionQuery) return true;
            return [
              s.id,
              s.name,
              s.description,
              s.mode,
              s.surface ?? '',
              ...s.triggers,
            ]
              .join(' ')
              .toLowerCase()
              .includes(mentionQuery);
          })
          .slice(0, 8)
      : [];

    return (
      <div
        className={`composer${dragActive ? ' drag-active' : ''}`}
        data-testid="chat-composer"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="composer-shell">
          {stagedSkills.length > 0 ? (
            <StagedSkills
              skills={stagedSkills}
              onRemove={removeStagedSkill}
              t={t}
            />
          ) : null}
          {staged.length > 0 ? (
            <StagedAttachments
              attachments={staged}
              projectId={projectId}
              onRemove={removeStaged}
              t={t}
            />
          ) : null}
          {linkedDirs.length > 0 ? (
            <div className="linked-dirs-row" data-testid="linked-dirs">
              {linkedDirs.map((dir) => (
                <div key={dir} className="linked-dir-chip">
                  <Icon name="folder" size={13} />
                  <span className="linked-dir-name" title={dir}>
                    {dir.split('/').pop() || dir}
                  </span>
                  <button
                    className="staged-remove"
                    onClick={() => handleUnlinkFolder(dir)}
                    title={t('chat.linkedFolderRemoveAria', { path: dir })}
                    aria-label={t('chat.linkedFolderRemoveAria', { path: dir })}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {currentCommentAttachments().length > 0 ? (
            <StagedCommentAttachments
              attachments={currentCommentAttachments()}
              onRemove={removeCommentAttachment}
              t={t}
            />
          ) : null}
          {selectedText ? (
            <div className="linked-dirs-row" data-testid="selection-context" style={{ marginTop: 'var(--spacing-xxs)' }}>
              <div className="linked-dir-chip" style={{ border: '1px solid var(--green-border)', background: 'var(--green-bg)', borderRadius: 'var(--rounded-full, 9999px)', display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-xs)', padding: 'var(--spacing-xxs) var(--spacing-xs)' }}>
                <Icon name="link" size={13} style={{ color: 'var(--green)' }} />
                <span className="linked-dir-name" style={{ maxWidth: '280px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--green)' }} title={selectedText}>
                  {selectedText.length > 60 ? `${selectedText.substring(0, 60)}...` : selectedText}
                </span>
                <button
                  className="staged-remove"
                  onClick={onClearSelection}
                  title="Clear selection"
                  aria-label="Clear selection"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--green)' }}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            </div>
          ) : null}
          {projectId ? (
            <PluginsSection
              ref={pluginsSectionRef}
              projectId={projectId}
              showRail={false}
              onApplied={(brief) => {
                if (typeof brief === 'string' && brief.length > 0) {
                  setDraft((cur) => (cur.trim().length === 0 ? brief : cur));
                }
              }}
              onChipDetails={(item: ContextItem) => {
                if (item.kind !== 'plugin') return;
                const record = installedPlugins.find((p) => p.id === item.id);
                if (record) setDetailsRecord(record);
              }}
            />
          ) : null}
          <div
            className={`composer-input-wrap${
              composerMentionParts ? ' has-mention-overlay' : ''
            }`}
          >
            <div className="composer-textarea-layer">
              {composerMentionParts ? (
                <div
                  className="composer-input-overlay"
                  data-testid="chat-composer-mention-overlay"
                  aria-hidden="true"
                  style={{ ['--composer-input-scroll' as string]: `${composerScrollTop}px` }}
                >
                  <div className="composer-input-overlay-inner">
                    {composerMentionParts.map((part, index) =>
                      part.kind === 'mention' ? (
                        <span
                          key={`${part.entity.kind}-${part.entity.id}-${index}`}
                          className={`composer-inline-mention composer-inline-mention--${part.entity.kind}`}
                          title={part.entity.title ?? part.text}
                        >
                          {part.text}
                        </span>
                      ) : (
                        <span key={`text-${index}`}>{part.text}</span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                data-testid="chat-composer-input"
                className="ph-no-capture"
                value={draft}
                placeholder={t('chat.composerPlaceholder')}
                spellCheck={false}
                onChange={handleChange}
                onPaste={handlePaste}
                onScroll={(event) => {
                  setComposerScrollTop(event.currentTarget.scrollTop);
                }}
                onKeyDown={(e) => {
                  if (slash && filteredSlash.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSlashIndex((i) => (i + 1) % filteredSlash.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSlashIndex(
                        (i) => (i - 1 + filteredSlash.length) % filteredSlash.length,
                      );
                      return;
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
                      e.preventDefault();
                      const safe = Math.min(slashIndex, filteredSlash.length - 1);
                      pickSlash(filteredSlash[safe]!);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setSlash(null);
                      return;
                    }
                  }
                  if (mention && e.key === 'Escape') {
                    setMention(null);
                    return;
                  }
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
            </div>
            {mention ? (
              <MentionPopover
                files={filteredFiles}
                plugins={filteredPlugins}
                skills={filteredSkills}
                mcpServers={filteredMcpServers}
                query={mention.q}
                currentSkillId={currentSkillId}
                t={t}
                onPickFile={insertMention}
                onPickPlugin={(record) => void insertPluginMention(record)}
                onPickSkill={(skill) => void insertSkillMention(skill)}
                onPickMcp={insertMcpMention}
              />
            ) : null}
            {slash && filteredSlash.length > 0 ? (
              <SlashPopover
                commands={filteredSlash}
                activeIndex={Math.min(slashIndex, filteredSlash.length - 1)}
                onPick={pickSlash}
                onHover={(i) => setSlashIndex(i)}
                t={t}
              />
            ) : null}
          </div>
          <div className="composer-row">
            <input
              ref={fileInputRef}
              data-testid="chat-file-input"
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void uploadFiles(files);
                e.target.value = '';
              }}
            />
            <div className="composer-tools-wrap">
              <button
                ref={toolsTriggerRef}
                type="button"
                className={`icon-btn composer-tools-trigger${toolsOpen ? ' active' : ''}`}
                onClick={() => setToolsOpen((v) => !v)}
                title={t('chat.cliSettingsTitle')}
                aria-haspopup="menu"
                aria-expanded={toolsOpen}
                aria-label={t('chat.cliSettingsAria')}
              >
                <Icon name="sliders" size={15} />
              </button>
              {toolsOpen ? (
                <div
                  ref={toolsMenuRef}
                  className="composer-tools-menu"
                  role="menu"
                >
                  <div className="composer-tools-tabs" role="tablist">
                    {availableTabs.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={toolsTab === tab}
                        className={`composer-tools-tab${toolsTab === tab ? ' active' : ''}`}
                        onClick={() => setToolsTab(tab)}
                      >
                        {tab === 'plugins' ? (
                          <>
                            <Icon name="sparkles" size={12} />
                            <span>Plugins</span>
                          </>
                        ) : null}
                        {tab === 'skills' ? (
                          <>
                            <Icon name="file" size={12} />
                            <span>Skills</span>
                          </>
                        ) : null}
                        {tab === 'mcp' ? (
                          <>
                            <Icon name="link" size={12} />
                            <span>MCP</span>
                          </>
                        ) : null}
                        {tab === 'import' ? (
                          <>
                            <Icon name="import" size={12} />
                            <span>{t('chat.importLabel')}</span>
                          </>
                        ) : null}
                        {tab === 'pet' ? (
                          <>
                            <span className="composer-tools-tab-glyph" aria-hidden>
                              {resolveActivePet(petConfig)?.glyph ?? '🐾'}
                            </span>
                            <span>{t('pet.composerMenuTitle')}</span>
                          </>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="composer-tools-content">
                    {toolsTab === 'plugins' ? (
                      <ToolsPluginsPanel
                        plugins={pluginsForComposer}
                        activePluginId={pinnedPluginId}
                        onApply={async (record) => {
                          const result = await pluginsSectionRef.current?.applyById(
                            record.id,
                            record,
                          );
                          if (result) setToolsOpen(false);
                        }}
                        onShowDetails={(record) => {
                          setDetailsRecord(record);
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                    {toolsTab === 'skills' ? (
                      <ToolsSkillsPanel
                        skills={skills}
                        currentSkillId={currentSkillId}
                        onPick={async (skill) => {
                          const applied = await applyProjectSkill(skill);
                          if (applied) setToolsOpen(false);
                        }}
                      />
                    ) : null}
                    {toolsTab === 'mcp' && onOpenMcpSettings ? (
                      <ToolsMcpPanel
                        servers={enabledMcpServers}
                        templates={mcpTemplates}
                        onInsert={(serverId) => {
                          const ta = textareaRef.current;
                          const server = enabledMcpServers.find((item) => item.id === serverId);
                          const insert = `${inlineMentionToken(server?.label || serverId)} `;
                          const cursor = ta?.selectionStart ?? draft.length;
                          const before = draft.slice(0, cursor);
                          const after = draft.slice(cursor);
                          const next = before + insert + after;
                          setDraft(next);
                          setToolsOpen(false);
                          requestAnimationFrame(() => {
                            const el = textareaRef.current;
                            if (!el) return;
                            el.focus();
                            const pos = before.length + insert.length;
                            el.setSelectionRange(pos, pos);
                          });
                        }}
                        onManage={() => {
                          setToolsOpen(false);
                          onOpenMcpSettings?.();
                        }}
                      />
                    ) : null}
                    {toolsTab === 'import' ? (
                      <ToolsImportPanel
                        t={t}
                        onLinkFolder={async () => {
                          setToolsOpen(false);
                          await handleLinkFolder();
                        }}
                      />
                    ) : null}
                    {toolsTab === 'pet' && petEnabled ? (
                      <ToolsPetPanel
                        t={t}
                        petConfig={petConfig}
                        onTogglePet={() => {
                          onTogglePet?.();
                          setToolsOpen(false);
                        }}
                        onAdoptPet={(id) => {
                          onAdoptPet?.(id);
                          setToolsOpen(false);
                        }}
                        onOpenPetSettings={() => {
                          onOpenPetSettings?.();
                          setToolsOpen(false);
                        }}
                      />
                    ) : null}
                  </div>

                  {onOpenSettings ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="composer-tools-settings"
                      onClick={() => {
                        setToolsOpen(false);
                        onOpenSettings?.();
                      }}
                    >
                      <Icon name="settings" size={13} />
                      <span>{t('pet.composerOpenSettings')}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn"
              data-testid="chat-attach"
              onClick={() => {
                trackStudioClickChatComposer(analytics.track, {
                  page: 'studio',
                  area: 'chat_composer',
                  element: 'attachment_button',
                  action: 'click_composer_control',
                  user_query_tokens: Math.ceil(draft.length / 4),
                  has_attachment: staged.length > 0 || commentAttachments.length > 0,
                });
                fileInputRef.current?.click();
              }}
              title={t('chat.attachTitle')}
              disabled={uploading}
              aria-label={t('chat.attachAria')}
            >
              {uploading ? (
                <Icon name="spinner" size={15} />
              ) : (
                <Icon name="attach" size={15} />
              )}
            </button>
            <span className="composer-spacer" />
            {streaming ? (
              <button
                type="button"
                className="composer-send stop"
                onClick={onStop}
              >
                <Icon name="stop" size={13} />
                <span>{t('chat.stop')}</span>
              </button>
            ) : (
              <button
                type="button"
                className="composer-send"
                data-testid="chat-send"
                onClick={() => {
                  trackStudioClickChatComposer(analytics.track, {
                    page: 'studio',
                    area: 'chat_composer',
                    element: 'send_button',
                    action: 'click_composer_control',
                    user_query_tokens: Math.ceil(draft.length / 4),
                    has_attachment:
                      staged.length > 0 || currentCommentAttachments().length > 0,
                  });
                  void submit();
                }}
                disabled={
                  sendDisabled ||
                  (!draft.trim() && staged.length === 0 && currentCommentAttachments().length === 0)
                }
              >
                <Icon name="send" size={13} />
                <span>{t('chat.send')}</span>
              </button>
            )}
          </div>
        </div>
        {uploadError ? <span className="composer-hint">{uploadError}</span> : null}
        <span className="composer-hint">{t('chat.composerHint')}</span>
        {detailsRecord ? (
          <PluginDetailsModal
            record={detailsRecord}
            onClose={() => setDetailsRecord(null)}
            onUse={async (record) => {
              await pluginsSectionRef.current?.applyById(record.id, record);
              setDetailsRecord(null);
            }}
          />
        ) : null}
      </div>
    );
  }
);
