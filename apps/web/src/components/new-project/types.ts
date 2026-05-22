import type { ConnectorDetail, ImportFolderResponse } from '@open-design/contracts';
import type { Dict } from '../../i18n/types';
import type {
  DesignSystemSummary,
  ProjectMetadata,
  ProjectPlatform,
  ProjectTemplate,
  MediaProviderCredentials,
  PromptTemplateSummary,
  SkillSummary,
} from '../../types';

export type CreateTab = 'prototype' | 'live-artifact' | 'deck' | 'template' | 'media' | 'other';
export type MediaSurface = 'image' | 'video' | 'audio';

export interface CreateInput {
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata: ProjectMetadata;
}

export type NewProjectPlatform = Exclude<ProjectPlatform, 'auto'>;

export type PromptTemplatePick = {
  summary: PromptTemplateSummary;
  prompt: string;
};

export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export interface NewProjectPanelProps {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  onCreate: (input: CreateInput & { requestId?: string }) => void;
  onImportClaudeDesign?: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<boolean> | boolean;
  onImportFolderResponse?: (response: ImportFolderResponse) => Promise<void> | void;
  mediaProviders?: Record<string, MediaProviderCredentials>;
  connectors?: ConnectorDetail[];
  connectorsLoading?: boolean;
  onOpenConnectorsTab?: () => void;
  loading?: boolean;
}
