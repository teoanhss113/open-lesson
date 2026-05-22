import { useI18n } from '../../i18n';
import { useRoute } from '../../router';
import { setCritiqueTheaterEnabled, useCritiqueTheaterEnabled } from '../Theater';

export function CritiqueTheaterSection() {
  const { t } = useI18n();
  const enabled = useCritiqueTheaterEnabled();
  const route = useRoute();
  const activeProjectId = route.kind === 'project' ? route.projectId : null;

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('critiqueTheater.settingsNav')}</h3>
          <p className="hint">{t('critiqueTheater.settingsNavHint')}</p>
        </div>
      </div>
      <label className="field">
        <span className="field-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              if (activeProjectId !== null) {
                void setCritiqueTheaterEnabled(next, { projectId: activeProjectId });
              } else {
                void setCritiqueTheaterEnabled(next);
              }
            }}
          />
          {' '}
          {t('critiqueTheater.settingsEnabledLabel')}
        </span>
        <small className="hint">
          {t('critiqueTheater.settingsEnabledDescription')}
        </small>
        {activeProjectId !== null ? (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledProjectHint')}
          </small>
        ) : (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledNoProjectHint')}
          </small>
        )}
      </label>
    </section>
  );
}
