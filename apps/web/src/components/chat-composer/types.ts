import type { Dict } from '../../i18n/types';
import type { ResearchOptions } from '@open-design/contracts';

export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import' | 'pet';

export type MentionTab = 'all' | 'plugins' | 'skills' | 'mcp' | 'files';

export interface SlashCommand {
  id: string;
  // Visible label, e.g. `/hatch`. Shown in the popover row.
  label: string;
  // Text inserted into the draft when the user picks the entry.
  insert: string;
  // i18n key of the short description shown next to the label.
  descKey: keyof Dict;
  // Optional argument hint shown after the description.
  argHint?: string;
  // Icon glyph from the project Icon set.
  icon: 'sparkles' | 'eye' | 'sliders';
}

export interface ChatSendMeta {
  research?: ResearchOptions;
  // Per-turn skill ids picked via the @-mention popover.
  skillIds?: string[];
}
