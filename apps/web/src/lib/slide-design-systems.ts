import type { DesignSystemSummary } from '../types';

/** Matches `> Category: Slide` in design-systems/[id]/DESIGN.md (see daemon extractCategory). */
export const SLIDE_DESIGN_SYSTEM_CATEGORY = 'Slide' as const;

export function isSlideDesignSystem(system: DesignSystemSummary): boolean {
  return system.category === SLIDE_DESIGN_SYSTEM_CATEGORY;
}

export function filterSlideDesignSystems(
  systems: DesignSystemSummary[],
): DesignSystemSummary[] {
  return systems.filter(isSlideDesignSystem);
}
