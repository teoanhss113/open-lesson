import { useMemo } from 'react';
import type { ConnectorDetail } from '@open-design/contracts';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { Skeleton } from '../Loading';

export function ConnectorsSection({
  connectors,
  loading,
  onOpenConnectorsTab,
}: {
  connectors?: ConnectorDetail[];
  loading: boolean;
  onOpenConnectorsTab?: () => void;
}) {
  const t = useT();
  const configured = useMemo(
    () => (connectors ?? []).filter((c) => c.status === 'connected'),
    [connectors],
  );
  const hasConfigured = configured.length > 0;

  if (loading && !connectors) {
    return (
      <div className="newproj-section newproj-connectors">
        <label className="newproj-label">{t('newproj.connectorsLabel')}</label>
        <Skeleton height={56} width="100%" radius={8} />
      </div>
    );
  }

  return (
    <div
      className="newproj-section newproj-connectors"
      data-testid="new-project-connectors"
    >
      <div className="newproj-connectors-head">
        <label className="newproj-label">{t('newproj.connectorsLabel')}</label>
        {hasConfigured ? (
          <button
            type="button"
            className="newproj-connectors-manage"
            onClick={() => onOpenConnectorsTab?.()}
            data-testid="new-project-connectors-manage"
          >
            {t('newproj.connectorsManage')}
          </button>
        ) : null}
      </div>

      {hasConfigured ? (
        <>
          <span className="newproj-connectors-hint">
            {configured.length === 1
              ? t('newproj.connectorsCountOne', { n: configured.length })
              : t('newproj.connectorsCountMany', { n: configured.length })}
            <span aria-hidden> · </span>
            {t('newproj.connectorsHint')}
          </span>
          <ul className="newproj-connectors-list" aria-label={t('newproj.connectorsLabel')}>
            {configured.map((c) => (
              <li
                key={c.id}
                className="newproj-connector-chip"
                title={c.name}
              >
                <span className="newproj-connector-dot" aria-hidden />
                <span className="newproj-connector-name">{c.name}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <button
          type="button"
          className="newproj-connectors-empty"
          onClick={() => onOpenConnectorsTab?.()}
          data-testid="new-project-connectors-empty"
          aria-label={t('newproj.connectorsEmptyCta')}
        >
          <span className="newproj-connectors-empty-icon" aria-hidden>
            <Icon name="link" size={14} />
          </span>
          <span className="newproj-connectors-empty-text">
            <span className="newproj-connectors-empty-title">
              {t('newproj.connectorsEmptyTitle')}
            </span>
            <span className="newproj-connectors-empty-body">
              {t('newproj.connectorsEmptyBody')}
            </span>
            <span className="newproj-connectors-empty-cta">
              {t('newproj.connectorsEmptyCta')}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
