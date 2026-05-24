import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';
import type { AppConfig } from '../../types';
import {
  isStoredMediaProviderEntryEmpty,
  isStoredMediaProviderEntryPresent,
  mergeDaemonMediaProviders,
} from '../../state/config';
import { MEDIA_PROVIDERS } from '../../media/models';
import type { MediaProvider } from '../../media/models';
import { sanitizeHttpsUrl } from './settings-logic';

export function MediaProvidersSection({
  cfg,
  setCfg,
  mediaProvidersNotice,
  onReloadMediaProviders,
  onChange,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  mediaProvidersNotice?: string | null;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [reloadRunning, setReloadRunning] = useState(false);
  const [reloadNotice, setReloadNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [visibleApiKeys, setVisibleApiKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setVisibleApiKeys((current) => {
      const next = new Set<string>();
      for (const providerId of current) {
        const apiKey = cfg.mediaProviders?.[providerId]?.apiKey ?? '';
        if (apiKey.trim()) next.add(providerId);
      }
      return next.size === current.size ? current : next;
    });
  }, [cfg.mediaProviders]);

  const visibleProviders = MEDIA_PROVIDERS.filter(
    (p) => p.settingsVisible !== false,
  );

  const availableProviders = visibleProviders
    .filter((p) => p.integrated)
    .slice()
    .sort((a, b) => {
      const aEntry = cfg.mediaProviders?.[a.id];
      const bEntry = cfg.mediaProviders?.[b.id];
      const aConfigured = isStoredMediaProviderEntryPresent(aEntry);
      const bConfigured = isStoredMediaProviderEntryPresent(bEntry);
      if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

  const comingSoonProviders = visibleProviders
    .filter((p) => !p.integrated)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));

  const updateProvider = (
    provider: MediaProvider,
    patch: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      apiKeyConfigured?: boolean;
      apiKeyTail?: string;
    },
  ) => {
    onChange();
    setCfg((curr) => {
      const prev = curr.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
      const next = { ...prev, ...patch };
      const map = { ...(curr.mediaProviders ?? {}) };
      if (isStoredMediaProviderEntryEmpty(next)) {
        delete map[provider.id];
      } else {
        map[provider.id] = next;
      }
      return { ...curr, mediaProviders: map };
    });
  };

  const handleReload = async () => {
    if (!onReloadMediaProviders || reloadRunning) return;
    setReloadRunning(true);
    setReloadNotice(null);
    try {
      const next = await onReloadMediaProviders();
      if (!next) {
        setReloadNotice({ kind: 'error', message: t('settings.mediaProviderReloadError') });
        return;
      }
      setCfg((curr) => mergeDaemonMediaProviders(curr, next));
      setReloadNotice({ kind: 'success', message: t('settings.mediaProviderReloadSuccess') });
    } finally {
      setReloadRunning(false);
    }
  };

  useEffect(() => {
    if (reloadNotice?.kind !== 'success') return;
    const handle = window.setTimeout(() => setReloadNotice(null), 2000);
    return () => window.clearTimeout(handle);
  }, [reloadNotice]);

  const toggleApiKeyVisibility = (providerId: string) => {
    setVisibleApiKeys((current) => {
      const next = new Set(current);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  return (
    <section className="settings-section">
      {mediaProvidersNotice ? (
        <p className="hint" role="alert">{mediaProvidersNotice}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'error' ? (
        <p className="hint" role="alert">{reloadNotice.message}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'success' ? (
        <span className="sr-only" role="status">
          {reloadNotice.message}
        </span>
      ) : null}
      {onReloadMediaProviders ? (
        <div className="media-provider-reload-row">
          <button
            type="button"
            className={`ghost media-provider-reload-btn${
              reloadNotice?.kind === 'success' ? ' is-success-flash' : ''
            }`}
            onClick={() => void handleReload()}
            disabled={reloadRunning}
            aria-live="polite"
          >
            {reloadRunning ? (
              t('common.loading')
            ) : reloadNotice?.kind === 'success' ? (
              <>
                <Icon name="check" size={13} />
                <span className="ml-xxs">{t('settings.mediaProviders.reloaded')}</span>
              </>
            ) : (
              <>
                <Icon name="refresh" size={13} />
                <span className="ml-xxs">{t('settings.mediaProviderReload')}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
      <div className="media-provider-list">
        {availableProviders.map((provider) => {
          const entry = cfg.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
          const hasPendingEdit = Boolean(entry.apiKey.trim());
          const isSavedState = Boolean((hasPendingEdit || entry.apiKeyConfigured) && !hasPendingEdit);
          const tail = entry.apiKeyTail?.trim();
          const disabled = false;
          const supportsCustomModel = provider.supportsCustomModel === true;
          const clearable = isStoredMediaProviderEntryPresent(entry);
          const apiKeyVisible = visibleApiKeys.has(provider.id);
          return (
            <div key={provider.id} className="media-provider-row">
              <div className="media-provider-head">
                <div className="media-provider-meta">
                  <div className="media-provider-name-row">
                    <span className="media-provider-name">{provider.label}</span>
                    {isSavedState ? (
                      <span
                        className="field-status-badge field-status-badge--inline"
                        title={t('settings.connectorsSavedTitle')}
                      >
                        {tail
                          ? t('settings.connectorsSavedWithTail', { tail })
                          : t('settings.connectorsSaved')}
                      </span>
                    ) : null}
                  </div>
                  <span className="media-provider-hint">{provider.hint}</span>
                </div>
              </div>
              <div className="media-provider-body">
                <div className="media-provider-secret-field">
                  <input
                    type={apiKeyVisible ? 'text' : 'password'}
                    value={entry.apiKey}
                    placeholder={isSavedState ? t('settings.connectorsReplaceKeyPlaceholder') : t('settings.mediaProviderPlaceholder')}
                    aria-label={`${provider.label} ${t('settings.mediaProviderApiKey')}`}
                    disabled={disabled}
                    onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    className="secret-visibility-button"
                    disabled={disabled}
                    aria-label={
                      apiKeyVisible
                        ? `${provider.label} ${t('settings.hideKey')}`
                        : `${provider.label} ${t('settings.showKey')}`
                    }
                    aria-pressed={apiKeyVisible}
                    onClick={() => toggleApiKeyVisibility(provider.id)}
                  >
                    <Icon name={apiKeyVisible ? 'eye' : 'eye-off'} size={15} />
                  </button>
                </div>
                <input
                  value={entry.baseUrl}
                  placeholder={provider.defaultBaseUrl || t('settings.mediaProviderBaseUrlPlaceholder')}
                  aria-label={`${provider.label} ${t('settings.mediaProviderBaseUrl')}`}
                  disabled={disabled}
                  onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                />
                {supportsCustomModel ? (
                  <input
                    value={entry.model ?? ''}
                    placeholder="gemini-3.1-flash-image-preview"
                    aria-label={`${provider.label} model`}
                    disabled={disabled}
                    onChange={(e) => updateProvider(provider, { model: e.target.value })}
                  />
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  disabled={!clearable}
                  onClick={() => {
                    if (
                      !confirm(
                        t('settings.mediaProviderClearConfirm', {
                          name: provider.label,
                        }),
                      )
                    ) {
                      return;
                    }
                    updateProvider(provider, {
                      apiKey: '',
                      baseUrl: '',
                      model: '',
                      apiKeyConfigured: false,
                      apiKeyTail: '',
                    });
                  }}
                >
                  {t('settings.mediaProviderClear')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {comingSoonProviders.length > 0 ? (
        <details className="library-group media-provider-coming-soon">
          <summary className="memory-details-summary">
            <span className="memory-details-title">
              {t('settings.mediaProviders.comingSoon')}
            </span>
            <span className="filter-pill-count">
              {comingSoonProviders.length}
            </span>
          </summary>
          <p className="hint media-provider-coming-soon-hint">
            {t('settings.mediaProviders.comingSoonHint')}
          </p>
          <ul className="media-provider-coming-soon-list">
            {comingSoonProviders.map((provider) => {
              const docsHref = sanitizeHttpsUrl(provider.docsUrl);
              return (
                <li
                  key={provider.id}
                  className="media-provider-coming-soon-item"
                >
                  <div className="media-provider-coming-soon-meta">
                    <span className="media-provider-name">
                      {provider.label}
                    </span>
                    <span className="media-provider-hint">
                      {provider.hint}
                    </span>
                  </div>
                  {docsHref ? (
                    <a
                      href={docsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost-link"
                    >
                      {t('settings.mediaProviders.docs')}
                      <Icon name="external-link" size={11} />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
