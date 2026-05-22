import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n, LOCALES, LOCALE_LABEL } from '../../i18n';
import type { Locale } from '../../i18n';
import type { AppConfig, SkillSummary, CurriculumDefaultsConfig } from '../../types';
import { DEFAULT_CURRICULUM_DEFAULTS } from '../../state/config';
import { fetchSkills } from '../../providers/registry';
import { Icon } from '../Icon';

export function CurriculumSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t, locale, setLocale } = useI18n();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingSkills(true);
    fetchSkills()
      .then((list) => {
        if (active) {
          setSkills(list);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoadingSkills(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const defaults = cfg.curriculumDefaults ?? DEFAULT_CURRICULUM_DEFAULTS;

  const updateDefaults = (patch: Partial<CurriculumDefaultsConfig>) => {
    setCfg((c) => ({
      ...c,
      curriculumDefaults: {
        ...(c.curriculumDefaults ?? DEFAULT_CURRICULUM_DEFAULTS),
        ...patch,
      },
    }));
  };

  const ageGroups = ['K-12', 'Primary', 'Secondary', 'Adult'];
  const levels = ['Beginner', 'Intermediate', 'Advanced'];

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.curriculum')}</h3>
          <p className="hint">{t('settings.curriculumHint')}</p>
        </div>
      </div>

      <div className="settings-language-grid" role="radiogroup" aria-label={t('settings.language')} style={{ marginBottom: 'var(--spacing-xl)' }}>
        {LOCALES.map((code) => {
          const active = locale === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              className={`settings-language-tile${active ? ' active' : ''}`}
              onClick={() => setLocale(code as Locale)}
            >
              <span className="settings-language-tile-text">
                <span className="settings-language-tile-title">
                  {LOCALE_LABEL[code]}
                </span>
                <span className="settings-language-tile-code">
                  {code}
                </span>
              </span>
              {active ? <Icon name="check" size={16} /> : null}
            </button>
          );
        })}
      </div>

      <label className="field">
        <span className="field-label">{t('settings.curriculum.defaultAgeGroup')}</span>
        <select
          value={defaults.defaultAgeGroup ?? 'K-12'}
          onChange={(e) => updateDefaults({ defaultAgeGroup: e.target.value })}
        >
          {ageGroups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <small className="hint">{t('settings.curriculum.defaultAgeGroupHint')}</small>
      </label>

      <label className="field" style={{ marginTop: 'var(--spacing-md)' }}>
        <span className="field-label">{t('settings.curriculum.defaultLevel')}</span>
        <select
          value={defaults.defaultLevel ?? 'Beginner'}
          onChange={(e) => updateDefaults({ defaultLevel: e.target.value })}
        >
          {levels.map((lvl) => (
            <option key={lvl} value={lvl}>{lvl}</option>
          ))}
        </select>
        <small className="hint">{t('settings.curriculum.defaultLevelHint')}</small>
      </label>

      <label className="field" style={{ marginTop: 'var(--spacing-md)' }}>
        <span className="field-label">{t('settings.curriculum.defaultSkillId')}</span>
        <select
          value={defaults.defaultSkillId ?? 'curriculum-analysis'}
          onChange={(e) => updateDefaults({ defaultSkillId: e.target.value })}
          disabled={loadingSkills}
        >
          {loadingSkills ? (
            <option value="">Loading skills...</option>
          ) : (
            <>
              {skills.length === 0 ? (
                <option value="curriculum-analysis">Curriculum Quality Analyzer (curriculum-analysis)</option>
              ) : (
                skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id} ({s.id})
                  </option>
                ))
              )}
            </>
          )}
        </select>
        <small className="hint">{t('settings.curriculum.defaultSkillIdHint')}</small>
      </label>
    </section>
  );
}
