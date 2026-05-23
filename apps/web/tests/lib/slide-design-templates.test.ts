import { describe, expect, it } from 'vitest';

import {
  SLIDE_TEMPLATE_CATEGORY_SLUGS,
  filterSlideDesignTemplates,
  isSlideDesignTemplate,
} from '../../src/lib/slide-design-templates';
import type { SkillSummary } from '../../src/types';

function sample(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'sample',
    name: 'sample',
    description: 'Sample template',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    ...overrides,
  };
}

describe('slide-design-templates', () => {
  // EntryShell → Templates applies this filter to /api/design-templates. Counts
  // track repo-root design-templates/ (~59 deck entries after upstream sync).

  it('keeps templates tagged slide/slides or in deck mode', () => {
    const templates = [
      sample({ id: 'course-module', mode: 'deck' }),
      sample({ id: 'pptx', category: 'slides', mode: 'template' }),
      sample({ id: 'landing', mode: 'prototype' }),
      sample({ id: 'live', mode: 'prototype', scenario: 'live' }),
    ];

    expect(filterSlideDesignTemplates(templates).map((t) => t.id)).toEqual([
      'course-module',
      'pptx',
    ]);
  });

  it('matches explicit slide category slugs', () => {
    for (const slug of SLIDE_TEMPLATE_CATEGORY_SLUGS) {
      expect(isSlideDesignTemplate(sample({ id: slug, category: slug, mode: 'template' }))).toBe(
        true,
      );
    }
  });
});
