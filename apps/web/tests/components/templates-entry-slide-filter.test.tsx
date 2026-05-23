/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExamplesTab } from '../../src/components/ExamplesTab';
import type { SkillSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(async () => ({ html: '<html></html>' })),
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', t: (key: string) => key }),
}));

function template(
  id: string,
  mode: SkillSummary['mode'],
  category?: string | null,
): SkillSummary {
  return {
    id,
    name: id,
    description: `${id} summary`,
    triggers: [],
    mode,
    category: category ?? null,
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: `Use ${id}`,
    aggregatesExamples: false,
  };
}

describe('Templates entry catalogue', () => {
  it('renders the full design-templates catalogue', () => {
    const catalogue = [
      template('html-ppt-course-module', 'deck'),
      template('live-artifact', 'prototype'),
      template('brief', 'template', 'slides'),
    ];

    render(<ExamplesTab skills={catalogue} onUsePrompt={() => {}} />);

    expect(screen.getByText('html-ppt-course-module')).toBeTruthy();
    expect(screen.getByText('brief')).toBeTruthy();
    expect(screen.getByText('live-artifact')).toBeTruthy();
  });
});
