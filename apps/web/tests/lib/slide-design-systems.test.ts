import { describe, expect, it } from 'vitest';

import {
  SLIDE_DESIGN_SYSTEM_CATEGORY,
  filterSlideDesignSystems,
  isSlideDesignSystem,
} from '../../src/lib/slide-design-systems';
import type { DesignSystemSummary } from '../../src/types';

function sample(overrides: Partial<DesignSystemSummary>): DesignSystemSummary {
  return {
    id: 'sample',
    title: 'Sample',
    category: 'Productivity & SaaS',
    summary: 'Summary',
    swatches: [],
    surface: 'web',
    ...overrides,
  };
}

describe('slide design system filters', () => {
  it('keeps only DESIGN.md Category: Slide entries', () => {
    const systems = [
      sample({ id: 'default', category: SLIDE_DESIGN_SYSTEM_CATEGORY, surface: 'deck' }),
      sample({ id: 'stripe', category: 'Fintech & Crypto', surface: 'web' }),
      sample({
        id: 'orphan-slide',
        category: SLIDE_DESIGN_SYSTEM_CATEGORY,
        surface: 'web',
      }),
    ];

    expect(filterSlideDesignSystems(systems).map((s) => s.id)).toEqual([
      'default',
      'orphan-slide',
    ]);
    expect(isSlideDesignSystem(systems[0]!)).toBe(true);
    expect(isSlideDesignSystem(systems[1]!)).toBe(false);
  });
});
