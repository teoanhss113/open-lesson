import { useState, useEffect, useRef } from 'react';
import type { Project, ChatAttachment } from '../types';

function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
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
  handleSend: (content: string, attachments: ChatAttachment[], commentAttachments?: any[]) => void | Promise<void>,
) {
  const autoSendSeedRef = useRef<string | null>(null);
  const autoSendAttachmentsRef = useRef<ChatAttachment[] | null>(null);
  const autoSendFirstMessageRef = useRef(false);
  const autoSentRef = useRef(false);

  // Reset refs when the project changes so we capture the fresh project values
  useEffect(() => {
    autoSendSeedRef.current = null;
    autoSendAttachmentsRef.current = null;
    autoSendFirstMessageRef.current = false;
    autoSentRef.current = false;
  }, [project.id]);

  if (autoSendSeedRef.current === null) {
    let isAutoSend = false;
    try {
      isAutoSend = Boolean(
        window.sessionStorage.getItem(autoSendFirstMessageKey(project.id)),
      );
    } catch {
      /* sessionStorage may be unavailable; treat as manual flow. */
    }
    autoSendFirstMessageRef.current = isAutoSend;
    autoSendSeedRef.current = isAutoSend ? (project.pendingPrompt ?? '') : '';
    autoSendAttachmentsRef.current = isAutoSend ? readAutoSendAttachments(project.id) : [];
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
    clearAutoSendSession(project.id);
    autoSendAttachmentsRef.current = [];
    void handleSend(seed, attachments, []);
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
