import { useEffect, useMemo, useRef, useState } from 'react';
import type { ManualEditStyles, ManualEditTarget, ManualEditHistoryEntry, ManualEditPatch } from '../edit-mode/types';
import { useT } from '../i18n';
import { Icon } from './Icon';

export interface ManualEditDraft {
  text: string;
  href: string;
  src: string;
  alt: string;
  styles: ManualEditStyles;
  attributesText: string;
  outerHtml: string;
  fullSource: string;
}

export function emptyManualEditDraft(source = ''): ManualEditDraft {
  return {
    text: '', href: '', src: '', alt: '',
    styles: {} as ManualEditStyles,
    attributesText: '{}', outerHtml: '', fullSource: source,
  };
}

export function manualEditPatchSummary(patch: ManualEditPatch): string {
  if (patch.kind === 'set-full-source') {
    return JSON.stringify({ kind: patch.kind, bytes: patch.source.length });
  }
  return JSON.stringify(patch);
}

export function ManualEditPanel({
  selectedTarget,
  draft,
  error,
  onDraftChange,
  onStyleChange,
  onInvalidStyle,
  onError,
  onClearSelection,
  pageStylesEnabled = true,
}: {
  targets: ManualEditTarget[];
  selectedTarget: ManualEditTarget | null;
  draft: ManualEditDraft;
  history: ManualEditHistoryEntry[];
  error: string | null;
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  pageStylesEnabled?: boolean;
  onSelectTarget: (target: ManualEditTarget) => void;
  onDraftChange: (draft: ManualEditDraft) => void;
  onStyleChange?: (id: string, styles: Partial<ManualEditStyles>, label: string) => void;
  onInvalidStyle?: (id: string, keys: Array<keyof ManualEditStyles>) => void;
  onApplyPatch: (patch: ManualEditPatch, label: string) => void;
  onError: (message: string) => void;
  onClearSelection: () => void;
  onCancelDraft: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const t = useT();
  const targetForInspector = selectedTarget;
  const changeTargetStyle = (key: keyof ManualEditStyles, value: string) => {
    const nextStyles = { ...draft.styles, [key]: value };
    onDraftChange({ ...draft, styles: nextStyles });
    if (!targetForInspector) return;
    const normalized = normalizeManualEditStyles({ [key]: value }, {
      layoutEnabled: targetForInspector.isLayoutContainer,
    });
    if (!normalized.ok) {
      onError(normalized.error);
      onInvalidStyle?.(targetForInspector.id, [key]);
      return;
    }
    onError('');
    onStyleChange?.(targetForInspector.id, normalized.styles, `Style: ${targetForInspector.label}`);
  };

  return (
    <aside className="manual-edit-right">
      <section className="manual-edit-modal cc-panel">
        {targetForInspector ? (
          <StyleInspector
            styles={draft.styles}
            layoutEnabled={targetForInspector.isLayoutContainer}
            onClearSelection={onClearSelection}
            onChange={changeTargetStyle}
          />
        ) : !targetForInspector ? (
          <PageInspector
            enabled={pageStylesEnabled}
            onStyleChange={(styles) => {
              const normalized = normalizeManualEditStyles(styles, { layoutEnabled: true });
              if (!normalized.ok) {
                onError(normalized.error);
                onInvalidStyle?.('__body__', Object.keys(styles) as Array<keyof ManualEditStyles>);
                return;
              }
              onError('');
              onStyleChange?.('__body__', normalized.styles, 'Page styles');
            }}
          />
        ) : null}

        {error ? <div className="manual-edit-error">{error}</div> : null}
      </section>
    </aside>
  );
}

export function normalizeManualEditStyles(raw: Partial<ManualEditStyles>, options: { layoutEnabled: boolean }): { ok: true; styles: Partial<ManualEditStyles> } | { ok: false; error: string } {
  const normalized: Partial<ManualEditStyles> = {};
  for (const [key, value] of Object.entries(raw)) {
    const rawKey = key as keyof ManualEditStyles;
    if (rawKey === 'fontSize' || rawKey === 'padding' || rawKey === 'margin' || rawKey === 'borderRadius' || rawKey === 'width' || rawKey === 'height' || rawKey === 'gap') {
      const px = normalizePxValue(value);
      if (!px) return { ok: false, error: `${styleLabel(rawKey)} must be a px value.` };
      normalized[rawKey] = px;
      continue;
    }
    if (rawKey === 'color' || rawKey === 'backgroundColor' || rawKey === 'borderColor') {
      const hex = normalizeHexColor(value);
      if (!hex) return { ok: false, error: `${styleLabel(rawKey)} must be a hex color.` };
      normalized[rawKey] = hex;
      continue;
    }
    if (rawKey === 'lineHeight') {
      const lineHeight = normalizeLineHeightValue(value);
      if (!lineHeight) return { ok: false, error: 'Line height must be a positive number or px value.' };
      normalized.lineHeight = lineHeight;
      continue;
    }
    normalized[rawKey] = value;
  }
  return { ok: true, styles: normalized };
}

function normalizePxValue(value: string): string | null {
  if (/^-?\d+(\.\d+)?$/.test(value)) return `${value}px`;
  if (/^-?\d+(\.\d+)?px$/i.test(value)) return value.toLowerCase();
  return null;
}

function normalizeLineHeightValue(value: string): string | null {
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return n > 0 ? String(n) : null;
  }
  if (/^\d+(\.\d+)?px$/i.test(value)) {
    const n = Number(value.slice(0, -2));
    return n > 0 ? value.toLowerCase() : null;
  }
  return null;
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const r = trimmed[1]!, g = trimmed[2]!, b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function styleLabel(key: keyof ManualEditStyles): string {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

function StyleInspector({
  styles, layoutEnabled, onClearSelection, onChange,
}: {
  styles: ManualEditStyles;
  layoutEnabled: boolean;
  onClearSelection: () => void;
  onChange: (key: keyof ManualEditStyles, value: string) => void;
}) {
  const t = useT();
  const u = (key: keyof ManualEditStyles, value: string) => onChange(key, value);

  return (
    <div className="cc-inspector">
      <div className="cc-inspector-nav">
        <button type="button" className="cc-inspector-page" onClick={onClearSelection} aria-label={t('manualEdit.sectionPage')}>
          {t('manualEdit.sectionPage')}
        </button>
      </div>
      <Section title={t('manualEdit.sectionTypography')}>
        <FontRow value={styles.fontFamily} onChange={(v) => u('fontFamily', v)} />
        <PairRow>
          <UnitRow label={t('manualEdit.fontSize')} value={styles.fontSize} onChange={(v) => u('fontSize', v)} unit="px" autoUnit />
          <DropdownRow label={t('manualEdit.weight')} value={styles.fontWeight} onChange={(v) => u('fontWeight', v)} options={WEIGHT_OPTS} />
        </PairRow>
        <PairRow>
          <ColorRow label={t('manualEdit.textColor')} value={styles.color} onChange={(v) => u('color', v)} />
          <DropdownRow label={t('manualEdit.align')} value={styles.textAlign} onChange={(v) => u('textAlign', v)} options={ALIGN_OPTS} />
        </PairRow>
        <PairRow>
          <UnitRow label={t('manualEdit.lineHeight')} value={styles.lineHeight} onChange={(v) => u('lineHeight', v)} unit="" />
          <UnitRow label={t('manualEdit.tracking')} value={styles.letterSpacing} onChange={(v) => u('letterSpacing', v)} unit="px" autoUnit />
        </PairRow>
      </Section>

      <Section title={t('manualEdit.sectionSize')}>
        <PairRow>
          <UnitRow label={t('manualEdit.width')} value={styles.width} onChange={(v) => u('width', v)} unit="px" autoUnit />
          <UnitRow label={t('manualEdit.height')} value={styles.height} onChange={(v) => u('height', v)} unit="px" autoUnit />
        </PairRow>
      </Section>

      <Section title={t('manualEdit.sectionLayout')} inactive={!layoutEnabled}>
        {!layoutEnabled ? (
          <p className="cc-section-hint">{t('manualEdit.layoutUnavailable')}</p>
        ) : null}
        <PairRow>
          <UnitRow label={t('manualEdit.gap')} value={styles.gap} onChange={(v) => u('gap', v)} unit="px" autoUnit disabled={!layoutEnabled} />
          <DropdownRow label={t('manualEdit.direction')} value={styles.flexDirection} onChange={(v) => u('flexDirection', v)} options={DIRECTION_OPTS} disabled={!layoutEnabled} />
        </PairRow>
        <PairRow>
          <DropdownRow label={t('manualEdit.justify')} value={styles.justifyContent} onChange={(v) => u('justifyContent', v)} options={JUSTIFY_OPTS} disabled={!layoutEnabled} />
          <DropdownRow label={t('manualEdit.align')} value={styles.alignItems} onChange={(v) => u('alignItems', v)} options={ITEMS_OPTS} disabled={!layoutEnabled} />
        </PairRow>
      </Section>

      <Section title={t('manualEdit.sectionColor')}>
        <PairRow>
          <ColorRow label={t('manualEdit.background')} value={styles.backgroundColor} onChange={(v) => u('backgroundColor', v)} />
          <UnitRow label="Opacity" value={styles.opacity || ''} onChange={(v) => u('opacity', v)} unit="" />
        </PairRow>
        <UnitRow label={t('manualEdit.radius')} value={styles.borderRadius} onChange={(v) => u('borderRadius', v)} unit="px" autoUnit />
      </Section>
    </div>
  );
}

function PageInspector({
  enabled,
  onStyleChange,
}: {
  enabled: boolean;
  onStyleChange: (styles: Partial<ManualEditStyles>) => void;
}) {
  const t = useT();
  const [bg, setBg] = useState('');
  const [font, setFont] = useState('');
  const [size, setSize] = useState('');
  const update = (next: { bg?: string; font?: string; size?: string }) => {
    if ('bg' in next) {
      const value = next.bg ?? '';
      setBg(value);
      onStyleChange({ backgroundColor: value });
    }
    if ('font' in next) {
      const value = next.font ?? '';
      setFont(value);
      onStyleChange({ fontFamily: value });
    }
    if ('size' in next) {
      const value = next.size ?? '';
      setSize(value);
      onStyleChange({ fontSize: value });
    }
  };

  return (
    <div className="cc-inspector">
      <Section title={t('manualEdit.sectionPage')}>
        {enabled ? (
          <>
            <ColorRow label={t('manualEdit.background')} value={bg} onChange={(value) => update({ bg: value })} />
            <FontRow value={font} onChange={(value) => update({ font: value })} />
            <UnitRow label={t('manualEdit.baseSize')} value={size} onChange={(value) => update({ size: value })} unit="px" autoUnit />
          </>
        ) : (
          <p className="cc-section-hint">{t('manualEdit.pageStylesUnavailable')}</p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children, inactive }: { title: string; children: React.ReactNode; inactive?: boolean }) {
  return (
    <section className={`cc-section${inactive ? ' cc-section-inactive' : ''}`}>
      <header className="cc-section-head">{title}</header>
      <div className="cc-section-body">{children}</div>
    </section>
  );
}

function PairRow({ children }: { children: React.ReactNode }) {
  return <div className="cc-pair">{children}</div>;
}

function UnitRow({ label, value, onChange, unit, autoUnit, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  unit: string; autoUnit?: boolean; disabled?: boolean;
}) {
  const display = unit === 'px' && value ? value.replace(/px$/i, '') : value;
  return (
    <label className="cc-row">
      <span>{label}</span>
      <div className="cc-unit-input">
        <input
          value={display}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (!raw) {
              onChange('');
              return;
            }
            if (autoUnit && /^-?\d+(\.\d+)?$/.test(raw)) {
              onChange(`${raw}${unit}`);
            } else {
              onChange(raw);
            }
          }}
        />
        <span className="cc-unit-label">{unit}</span>
      </div>
    </label>
  );
}

function ColorRow({ label, value, onChange, compact }: { label: string; value: string; onChange: (v: string) => void; compact?: boolean }) {
  return (
    <label className={`cc-row${compact ? ' compact' : ''}`}>
      <span>{label}</span>
      <div className="cc-color-input">
        <input value={value} placeholder="#000000" onChange={(e) => onChange(e.target.value)} />
        <div className="cc-color-swatch" style={{ background: value || 'transparent' }} />
      </div>
    </label>
  );
}

function DropdownRow({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="cc-row">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

const WEIGHT_OPTS = [
  { label: 'Normal', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Semibold', value: '600' },
  { label: 'Bold', value: '700' },
];

const ALIGN_OPTS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
  { label: 'Justify', value: 'justify' },
];

const DIRECTION_OPTS = [
  { label: 'Row', value: 'row' },
  { label: 'Column', value: 'column' },
];

const JUSTIFY_OPTS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Between', value: 'space-between' },
];

const ITEMS_OPTS = [
  { label: 'Start', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'End', value: 'flex-end' },
  { label: 'Stretch', value: 'stretch' },
];

const FONT_OPTS = [
  { label: 'inherit', value: '' },
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Mono', value: 'monospace' },
];

function FontRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="cc-row">
      <span>Font</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {FONT_OPTS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
