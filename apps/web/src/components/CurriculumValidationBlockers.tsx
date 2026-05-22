import { useT } from '../i18n';
import { Icon } from './Icon';

export interface ValidationBlocker {
  area: string;
  description: string;
  suggestion?: string;
}

interface CurriculumValidationBlockersProps {
  blockers: ValidationBlocker[];
  onDismiss: () => void;
  /** Compact variant for card overlays (smaller font, tighter padding). */
  compact?: boolean;
}

/**
 * Curriculum validation blocker panel.
 * Replaces the 2× duplicated inline `style={{}}` panel in:
 * - DesignsTab.tsx (grid card overlay)
 * - DesignsTab.tsx (kanban card overlay)
 * - FileWorkspace.tsx (workspace header banner)
 */
export function CurriculumValidationBlockers({
  blockers,
  onDismiss,
  compact = false,
}: CurriculumValidationBlockersProps) {
  const t = useT();

  if (blockers.length === 0) return null;

  return (
    <div
      className={[
        'curriculum-validation-blockers',
        compact ? 'curriculum-validation-blockers--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="curriculum-validation-blockers__header">
        <strong className="curriculum-validation-blockers__title">
          <Icon name="info" size={compact ? 10 : 14} className="curriculum-validation-blockers__icon" />
          {t('curriculum.validation.failed' as any) ||
            (compact ? 'Blockers' : 'Rollout Validation Failed — Resolve Blockers')}
        </strong>
        <button
          type="button"
          className="icon-btn curriculum-validation-blockers__dismiss"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <Icon name="close" size={compact ? 8 : 12} />
        </button>
      </div>
      <ul className="curriculum-validation-blockers__list">
        {blockers.map((b, idx) => (
          <li key={idx} className="curriculum-validation-blockers__item">
            <strong className="curriculum-validation-blockers__area">{b.area}:</strong>{' '}
            {b.description}
            {b.suggestion && (
              <span className="curriculum-validation-blockers__suggestion">
                ↳ {compact ? '' : 'Suggestion: '}
                {b.suggestion}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
