import { useState, useEffect, useRef } from 'react';
import type { Project, ChatAttachment } from '../types';

function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

function autoSendPromptKey(projectId: string): string {
  return `od:auto-send-prompt:${projectId}`;
}

function autoSendSkillIdsKey(projectId: string): string {
  return `od:auto-send-skill-ids:${projectId}`;
}

export function stageProjectAutoSend(
  projectId: string,
  prompt: string,
  options?: { attachments?: ChatAttachment[]; skillIds?: string[] },
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(autoSendFirstMessageKey(projectId), '1');
    window.sessionStorage.setItem(autoSendPromptKey(projectId), prompt);
    const attachments = options?.attachments ?? [];
    if (attachments.length > 0) {
      window.sessionStorage.setItem(autoSendAttachmentsKey(projectId), JSON.stringify(attachments));
    } else {
      window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
    }
    const skillIds = options?.skillIds?.filter((id) => id.length > 0) ?? [];
    if (skillIds.length > 0) {
      window.sessionStorage.setItem(autoSendSkillIdsKey(projectId), JSON.stringify(skillIds));
    } else {
      window.sessionStorage.removeItem(autoSendSkillIdsKey(projectId));
    }
  } catch {
    /* sessionStorage may be unavailable; callers can still navigate normally. */
  }
}

function readAutoSendAttachments(projectId: string): ChatAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(autoSendAttachmentsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredChatAttachment);
  } catch {
    return [];
  }
}

function readAutoSendPrompt(projectId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(autoSendPromptKey(projectId)) ?? '';
  } catch {
    return '';
  }
}

function readAutoSendSkillIds(projectId: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(autoSendSkillIdsKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function isStoredChatAttachment(value: unknown): value is ChatAttachment {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.kind === 'image' || record.kind === 'file') &&
    (record.size === undefined || typeof record.size === 'number')
  );
}

function clearAutoSendSession(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(autoSendFirstMessageKey(projectId));
    window.sessionStorage.removeItem(autoSendAttachmentsKey(projectId));
    window.sessionStorage.removeItem(autoSendPromptKey(projectId));
    window.sessionStorage.removeItem(autoSendSkillIdsKey(projectId));
  } catch {
    /* ignore */
  }
}

export function useProjectAutoSend(
  project: Project,
  activeConversationId: string | null,
  messagesInitialized: boolean,
  streaming: boolean,
  messagesCount: number,
  onClearPendingPrompt: () => void,
  handleSend: (
    content: string,
    attachments: ChatAttachment[],
    commentAttachments?: any[],
    meta?: { skillIds?: string[] },
  ) => void | Promise<void>,
) {
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const autoSendSkillIdsRef = useRef<string[]>([]);
  const autoSendFirstMessageRef = useRef(false);
  const autoSentRef = useRef(false);

  const lastProjectIdRef = useRef<string | null>(null);
  // Reset refs when the project changes so we capture the fresh project values
  if (lastProjectIdRef.current !== project.id) {
    lastProjectIdRef.current = project.id;
    autoSendSeedRef.current = null;
    autoSendAttachmentsRef.current = null;
    autoSendFirstMessageRef.current = false;
    autoSendSkillIdsRef.current = [];
    autoSentRef.current = false;
  }

  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    try {
      const storageKey = autoSendFirstMessageKey(project.id);
      const storageVal = window.sessionStorage.getItem(storageKey);
      isAutoSend = Boolean(storageVal);
    } catch {
      isAutoSend = false;
    }
    autoSendFirstMessageRef.current = isAutoSend;
    const stagedPrompt = isAutoSend ? readAutoSendPrompt(project.id) : '';
    autoSendSeedRef.current = isAutoSend ? (stagedPrompt || project.pendingPrompt || '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
    autoSendSkillIdsRef.current = isAutoSend ? readAutoSendSkillIds(project.id) : [];
  }

  const [initialDraft, setInitialDraft] = useState<{ projectId: string; value: string } | undefined>(
    autoSendSeedRef.current || !project.pendingPrompt
      ? undefined
      : { projectId: project.id, value: project.pendingPrompt },
  );

  useEffect(() => {
    const pendingPrompt = project.pendingPrompt;
    if (!pendingPrompt) return;
    if (autoSendFirstMessageRef.current) {
      onClearPendingPrompt();
      return;
    }
    setInitialDraft((current) =>
      current?.projectId === project.id
        ? current
        : { projectId: project.id, value: pendingPrompt },
    );
    onClearPendingPrompt();
  }, [project.id, project.pendingPrompt, onClearPendingPrompt]);

  useEffect(() => {
    if (initialDraft && messagesCount > 0) {
      setInitialDraft(undefined);
    }
  }, [initialDraft, messagesCount]);

  useEffect(() => {
    if (autoSentRef.current) return;
    if (!activeConversationId) return;
    if (!messagesInitialized) return;
    if (streaming) return;
    if (messagesCount > 0) return;
    let flag: string | null = null;
    try {
      flag = window.sessionStorage.getItem(autoSendFirstMessageKey(project.id));
    } catch {
      flag = null;
    }
    if (!flag) return;

    const seed = (
      autoSendSeedRef.current ||
      (initialDraft?.projectId === project.id ? initialDraft.value : '') ||
      project.pendingPrompt ||
      ''
    ).trim();
    const attachments = autoSendAttachmentsRef.current ?? [];
    if (!seed && attachments.length === 0) {
      autoSentRef.current = true;
      clearAutoSendSession(project.id);
      return;
    }
    autoSentRef.current = true;
    const skillIds = autoSendSkillIdsRef.current;
    clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    autoSendSkillIdsRef.current = [];
    void handleSend(seed, attachments, [], skillIds.length > 0 ? { skillIds } : undefined);
  }, [
    activeConversationId,
    messagesInitialized,
    streaming,
    messagesCount,
    project.id,
    initialDraft,
    project.pendingPrompt,
    handleSend,
  ]);

  const chatInitialDraft =
    initialDraft?.projectId === project.id ? initialDraft.value : undefined;

  return {
    chatInitialDraft,
    clearInitialDraft: () => setInitialDraft(undefined),
  };
}
