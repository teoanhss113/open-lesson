import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface PageHeaderBadge {
  icon?: IconName;
  label: string;
}

export function PageHeader({
  kicker,
  title,
  lede,
  badge,
  action,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  badge?: PageHeaderBadge;
  action?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__copy">
        <p className="ui-kicker">{kicker}</p>
        <h1 className="entry-section__title">{title}</h1>
        {lede ? <p className="ui-page-header__lede">{lede}</p> : null}
      </div>
      {action ? action : badge ? <UiBadge icon={badge.icon}>{badge.label}</UiBadge> : null}
    </header>
  );
}

export function UiBadge({
  icon,
  tone = 'neutral',
  children,
}: {
  icon?: IconName;
  tone?: 'amber' | 'green' | 'neutral';
  children: ReactNode;
}) {
  return (
    <span className={`ui-badge ui-badge--${tone}`}>
      {icon ? <Icon name={icon} size={14} /> : null}
      <span>{children}</span>
    </span>
  );
}

export function UiInfoNote({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <div className="ui-info-note" role="note">
      <Icon name={icon} size={14} />
      <span>{children}</span>
    </div>
  );
}

export function UiActionButton({
  children,
  icon,
  tone = 'secondary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  tone?: 'primary' | 'secondary';
}) {
  return (
    <button
      {...props}
      className={`ui-action-button ui-action-button--${tone}${className ? ` ${className}` : ''}`}
    >
      <span>{children}</span>
      {icon ? <Icon name={icon} size={13} /> : null}
    </button>
  );
}

export function UiTabs<T extends string>({
  items,
  active,
  ariaLabel,
  testIdPrefix,
  onChange,
}: {
  items: ReadonlyArray<{ id: T; label: string; hint?: string }>;
  active: T;
  ariaLabel: string;
  testIdPrefix?: string;
  onChange: (id: T) => void;
}) {
  return (
    <nav className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`ui-tabs__item${selected ? ' is-active' : ''}`}
            onClick={() => onChange(item.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${item.id}` : undefined}
          >
            <span className="ui-tabs__label">{item.label}</span>
            {item.hint ? <span className="ui-tabs__hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
