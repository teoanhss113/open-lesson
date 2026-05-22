import { useId } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** 'sm' renders the smaller `.toggle-switch-sm` variant. */
  size?: 'default' | 'sm';
  /** Visible label text rendered beside the toggle (optional). */
  label?: string;
  /** Explicit id for the hidden checkbox; auto-generated if omitted. */
  id?: string;
  /** Extra className forwarded to the root `<label>`. */
  className?: string;
  /** aria-label for cases where no visible label is provided. */
  'aria-label'?: string;
}

/**
 * Shared toggle / switch component.
 *
 * Wraps the `.toggle-switch` / `.toggle-switch-sm` CSS system from `index.css`
 * into a reusable React component, replacing the 3× duplicated raw HTML pattern:
 * ```html
 * <label className="toggle-switch [toggle-switch-sm]">
 *   <input type="checkbox" checked={x} onChange={y} />
 *   <span className="toggle-slider" />
 * </label>
 * ```
 *
 * Used in: SkillsSection.tsx, MemorySection.tsx, DesignSystemsSection.tsx
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'default',
  label,
  id: idProp,
  className,
  'aria-label': ariaLabel,
}: ToggleProps) {
  const autoId = useId();
  const inputId = idProp ?? autoId;

  const rootClass = [
    'toggle-switch',
    size === 'sm' ? 'toggle-switch-sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label
      className={rootClass}
      htmlFor={inputId}
      aria-label={!label ? ariaLabel : undefined}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-slider" aria-hidden />
      {label ? <span className="toggle-label">{label}</span> : null}
    </label>
  );
}
