import type { SkillSummary } from '../types';

// Slide template counts are data-driven from repo-root `design-templates/` (see
// `scripts/sync-design-templates.ts` and daemon `listAllDesignTemplates`).
// After a full upstream sync, expect ~59 deck entries in /api/design-templates
// and the same count on EntryShell → Templates when surface/type filters are "All".

/** `od.category` slugs for slide deck templates (daemon `normalizeCategory`). */
export const SLIDE_TEMPLATE_CATEGORY_SLUGS = ['slide', 'slides'] as const;

export function isSlideDesignTemplate(template: SkillSummary): boolean {
  const slug = template.category?.trim().toLowerCase();
  if (
    slug &&
    (SLIDE_TEMPLATE_CATEGORY_SLUGS as readonly string[]).includes(slug)
  ) {
    return true;
  }
  // html-ppt deck templates often omit od.category; deck mode is the catalogue signal.
  return template.mode === 'deck';
}

export function filterSlideDesignTemplates(
  templates: SkillSummary[],
): SkillSummary[] {
  return templates.filter(isSlideDesignTemplate);
}
