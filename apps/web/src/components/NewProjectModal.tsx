// Modal wrapper around NewProjectPanel.
//
// Triggered by the "+" button on the entry nav rail. Reuses the
// NewProjectPanel workspace starter surface so project creation stays
// focused on the curriculum folder. Artifact-level tabs live inside the
// project workspace after creation. The modal closes itself when the panel
// calls onCreate (success path) or when the user clicks the backdrop / Esc.

import { useEffect, useRef, useState } from 'react';
import type { ConnectorDetail, ImportFolderResponse } from '@open-design/contracts';
import type {
  DesignSystemSummary,
  MediaProviderCredentials,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';
import { useT } from '../i18n';

interface Props {
  open: boolean;
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  mediaProviders?: Record<string, MediaProviderCredentials>;
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
  loading?: boolean;
  onCreate: (
    input: CreateInput & { requestId?: string },
  ) => boolean | void | Promise<boolean | void>;
  onImportClaudeDesign?: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<boolean> | boolean;
  onImportFolderResponse?: (response: ImportFolderResponse) => Promise<void> | void;
  onOpenConnectorsTab?: () => void;
  onClose: () => void;
}

export function NewProjectModal({
  open,
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  promptTemplates,
  mediaProviders,
  connectors,
  connectorsLoading,
  loading,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenConnectorsTab,
  onClose,
}: Props) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="new-project-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('newproj.titleCurriculumWorkspace')}
      data-testid="new-project-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="new-project-modal">
        <header className="new-project-modal__head">
          <h2 className="new-project-modal__title">{t('newproj.titleCurriculumWorkspace')}</h2>
          <button
            ref={closeRef}
            type="button"
            className="new-project-modal__close"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="new-project-modal__body">
          <NewProjectPanel
            skills={skills}
            designSystems={designSystems}
            defaultDesignSystemId={defaultDesignSystemId}
            templates={templates}
            promptTemplates={promptTemplates}
            {...(mediaProviders ? { mediaProviders } : {})}
            {...(connectors ? { connectors } : {})}
            {...(typeof connectorsLoading === 'boolean' ? { connectorsLoading } : {})}
            loading={Boolean(loading) || creating}
            onCreate={async (input) => {
              if (creating) return false;
              setCreating(true);
              try {
                const result = await onCreate(input);
                if (result === false) {
                  setCreating(false);
                  return false;
                }
                onClose();
                return result;
              } catch (err) {
                console.error('Create project failed', err);
                setCreating(false);
                return false;
              }
            }}
            {...(onImportClaudeDesign ? { onImportClaudeDesign } : {})}
            {...(onImportFolder ? { onImportFolder } : {})}
            {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
            {...(onOpenConnectorsTab ? { onOpenConnectorsTab } : {})}
          />
        </div>
      </div>
    </div>
  );
}
