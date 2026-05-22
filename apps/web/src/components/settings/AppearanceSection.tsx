import { useLayoutEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { AppTheme, AppConfig } from '../../types';
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
} from '../../state/appearance';

const THEMES: Array<{
  value: AppTheme;
  labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark';
  icon?: 'sun' | 'moon';
}> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'moon' },
];

export function AppearanceSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const current = cfg.theme ?? 'system';
  const currentAccent = normalizeAccentColor(cfg.accentColor) ?? DEFAULT_ACCENT_COLOR;
  const accentLabel = t('pet.fieldAccent');
  const defaultAccentLabel = t('pet.fieldAccentDefault');
  const customAccentLabel = t('pet.fieldAccentCustom');

  // Apply the draft theme immediately so the user sees a live preview
  // before hitting Save. SettingsDialog's cleanup reverts this on cancel.
  useLayoutEffect(() => {
    applyAppearanceToDocument({
      theme: current,
      accentColor: currentAccent,
    });
  }, [current, currentAccent]);

  const setAccentColor = (color: string) => {
    setCfg((c) => ({
      ...c,
      accentColor: normalizeAccentColor(color) ?? c.accentColor ?? DEFAULT_ACCENT_COLOR,
    }));
  };

  return (
    <section className="settings-section">
      <div
        className="seg-control"
        role="group"
        aria-label={t('settings.appearance')}
        style={{ '--seg-cols': THEMES.length } as React.CSSProperties}
      >
        {THEMES.map(({ value, labelKey, icon }) => (
          <button
            key={value}
            type="button"
            className={'seg-btn' + (current === value ? ' active' : '')}
            aria-pressed={current === value}
            onClick={() => setCfg((c) => ({ ...c, theme: value }))}
          >
            {icon ? <Icon name={icon} size={14} aria-hidden="true" /> : null}
            <span className="seg-title">{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="field-label">{accentLabel}</span>
        <div className="pet-swatches" role="radiogroup" aria-label={accentLabel}>
          {ACCENT_SWATCHES.map((color) => {
            const active = currentAccent === color;
            return (
              <button
                key={color}
                type="button"
                className={`pet-swatch${active ? ' active' : ''}`}
                style={{ background: color }}
                aria-label={color === DEFAULT_ACCENT_COLOR ? defaultAccentLabel : color}
                aria-checked={active}
                role="radio"
                onClick={() => setAccentColor(color)}
              />
            );
          })}
          <input
            type="color"
            aria-label={customAccentLabel}
            className="pet-swatch-picker"
            value={currentAccent}
            onChange={(e) => setAccentColor(e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
