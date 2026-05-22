import { useT } from '../i18n';

export type CurriculumStatus = 'draft' | 'in-review' | 'approved' | 'archived';
export type CurriculumRisk = 'none' | 'low' | 'medium' | 'high';

interface CurriculumStatusBadgeProps {
  status: CurriculumStatus;
  /** Extra CSS class forwarded to the root span. */
  className?: string;
  /** Override font-size for compact contexts (kanban card). Defaults to undefined (CSS-driven). */
  compact?: boolean;
}

/**
 * Shared status badge for curriculum projects.
 * Replaces the 3× duplicated inline `style={{}}` ternary-chain in
 * DesignsTab (grid), DesignsTab (kanban), and FileWorkspace (metadata bar).
 *
 * All colour tokens are declared in index.css under `.curriculum-status-badge--*`.
 */
export function CurriculumStatusBadge({
  status,
  className,
  compact = false,
}: CurriculumStatusBadgeProps) {
  const t = useT();
  const label = t(`curriculum.status.${status}` as any) || STATUS_LABELS[status];
  return (
    <span
      className={[
        'curriculum-status-badge',
        `curriculum-status-badge--${status}`,
        compact ? 'curriculum-status-badge--compact' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  );
}

interface CurriculumRiskBadgeProps {
  risk: CurriculumRisk;
  className?: string;
}

/**
 * Shared risk badge for curriculum projects.
 * Replaces the inline `style={{}}` ternary-chain for `overallRisk` in DesignsTab.
 */
export function CurriculumRiskBadge({ risk, className }: CurriculumRiskBadgeProps) {
  const t = useT();
  const key = risk === 'none' ? 'passed' : risk;
  const label = t(`curriculum.risk.${key}` as any) || RISK_LABELS[risk];
  return (
    <span
      className={[
        'curriculum-risk-badge',
        `curriculum-risk-badge--${risk}`,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </span>
  );
}

// ── Fallback labels (i18n may not have these keys yet) ────────────────────────

const STATUS_LABELS: Record<CurriculumStatus, string> = {
  draft: 'Draft',
  'in-review': 'In Review',
  approved: 'Approved',
  archived: 'Archived',
};

const RISK_LABELS: Record<CurriculumRisk, string> = {
  none: 'Passed',
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
};
