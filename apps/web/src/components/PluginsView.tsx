import { useEffect, useMemo, useState } from 'react';
import {
  PLUGIN_SHARE_ACTION_PLUGIN_IDS,
  type ApplyResult,
  type InstalledPluginRecord,
  type PluginSourceKind,
} from '@open-design/contracts';
import {
  addPluginMarketplace,
  applyPlugin,
  installPluginSource,
  listPluginMarketplaces,
  listPlugins,
  refreshPluginMarketplace,
  removePluginMarketplace,
  setPluginMarketplaceTrust,
  type PluginInstallOutcome,
  type PluginShareAction,
  type PluginShareProjectOutcome,
  type PluginMarketplaceEntry,
  type PluginMarketplace,
  type PluginMarketplaceMutationOutcome,
  type PluginMarketplaceTrust,
  uploadPluginFolder,
  uploadPluginZip,
} from '../state/projects';
import { Icon } from './Icon';
import { PluginDetailsModal } from './PluginDetailsModal';
import { PluginsHomeSection } from './PluginsHomeSection';
import { useI18n } from '../i18n';
import type { PluginUseAction } from './plugins-home/useActions';
import { PageHeader, UiActionButton, UiBadge } from './UiPrimitives';

type PluginsTab = 'installed' | 'available' | 'sources' | 'team';

const USER_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

const PLUGINS_TABS: ReadonlyArray<{
  id: PluginsTab;
  label: string;
  hint: string;
}> = [
  { id: 'installed', label: 'Installed', hint: 'Your plugins' },
  { id: 'available', label: 'Available', hint: 'From sources' },
  { id: 'sources', label: 'Sources', hint: 'Catalogs' },
  { id: 'team', label: 'Team', hint: 'Enterprise' },
];

const PLUGIN_SHARE_DETAILS: Record<PluginShareAction, {
  eyebrow: string;
  fallbackTitle: string;
  fallbackDescription: string;
  confirmLabel: string;
  steps: string[];
}> = {
  'publish-github': {
    eyebrow: 'GitHub repository',
    fallbackTitle: 'Publish Plugin to GitHub',
    fallbackDescription:
      'Creates a public GitHub repository for this local plugin.',
    confirmLabel: 'Start publishing',
    steps: [
      'Create a new project for the publish workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Run the official publish action plugin against the local daemon.',
    ],
  },
  'contribute-open-design': {
    eyebrow: 'Contribution pull request',
    fallbackTitle: 'Contribute Plugin',
    fallbackDescription:
      'Opens a pull request that adds this plugin to the community catalog.',
    confirmLabel: 'Start contribution',
    steps: [
      'Create a new project for the contribution workflow.',
      'Copy this plugin into that project as isolated source context.',
      'Run the official contribution action plugin against the local daemon.',
    ],
  },
};

interface PluginsViewProps {
  onCreatePlugin?: (goal?: string) => void;
  onUsePlugin?: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onCreatePluginShareProject?: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
}

export function PluginsView({
  onCreatePlugin,
  onUsePlugin,
  onCreatePluginShareProject,
}: PluginsViewProps) {
  const { locale, t } = useI18n();
  const copy = useMemo(() => pluginsViewCopy(locale), [locale]);
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [allInstalledPlugins, setAllInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
  const [marketplaces, setMarketplaces] = useState<PluginMarketplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PluginsTab>('installed');
  const [importOpen, setImportOpen] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [pendingInstallEntry, setPendingInstallEntry] = useState<string | null>(null);
  const [pendingSourceAction, setPendingSourceAction] = useState<string | null>(null);
  const [pendingShareAction, setPendingShareAction] = useState<{
    pluginId: string;
    action: PluginShareAction;
  } | null>(null);
  const [activePlugin, setActivePlugin] = useState<{
    record: InstalledPluginRecord;
    result: ApplyResult;
  } | null>(null);
  const [detailsRecord, setDetailsRecord] = useState<InstalledPluginRecord | null>(null);
  const [availableDetails, setAvailableDetails] = useState<AvailableMarketplacePlugin | null>(null);
  const [shareConfirm, setShareConfirm] = useState<{
    sourceRecord: InstalledPluginRecord;
    action: PluginShareAction;
    actionRecord: InstalledPluginRecord | null;
  } | null>(null);
  const [notice, setNotice] = useState<PluginInstallOutcome | { ok: boolean; message: string } | null>(null);

  async function refresh() {
    setLoading(true);
    const [rows, allRows, catalogs] = await Promise.all([
      listPlugins(),
      listPlugins({ includeHidden: true }),
      listPluginMarketplaces(),
    ]);
    setPlugins(rows);
    setAllInstalledPlugins(allRows);
    setMarketplaces(catalogs);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    window.addEventListener('open-design:plugins-changed', refresh);
    return () => window.removeEventListener('open-design:plugins-changed', refresh);
  }, []);

  const userPlugins = useMemo(
    () => plugins.filter((plugin) => USER_SOURCE_KINDS.has(plugin.sourceKind)),
    [plugins],
  );
  const availablePlugins = useMemo(
    () => buildAvailablePlugins(marketplaces, allInstalledPlugins),
    [marketplaces, allInstalledPlugins],
  );

  async function finishImport(
    work: () => Promise<PluginInstallOutcome>,
    targetTab: PluginsTab = 'installed',
  ) {
    setNotice(null);
    const outcome = await work();
    setNotice(outcome);
    if (outcome.ok) {
      setImportOpen(false);
      await refresh();
      setActiveTab(targetTab);
    }
    return outcome;
  }

  async function handleUsePlugin(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    if (onUsePlugin) {
      setDetailsRecord(null);
      onUsePlugin(record, action);
      return;
    }
    setPendingApplyId(record.id);
    setNotice(null);
    const result = await applyPlugin(record.id, { locale });
    setPendingApplyId(null);
    if (!result) {
      setNotice({
        ok: false,
        message: `Failed to apply ${record.title}. Make sure the daemon is reachable.`,
      });
      return;
    }
    setActivePlugin({ record, result });
    setDetailsRecord(null);
    setNotice({
      ok: true,
      message: `${record.title} is ready. Use it from Home with @ search or pick it from the gallery.`,
    });
  }

  async function handleCreatePluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    if (!onCreatePluginShareProject) {
      setNotice({
        ok: false,
        message: 'Plugin sharing is not available in this shell.',
      });
      setShareConfirm(null);
      return;
    }
    setPendingShareAction({ pluginId: record.id, action });
    setNotice(null);
    const outcome = await onCreatePluginShareProject(record.id, action, locale);
    setPendingShareAction(null);
    setShareConfirm(null);
    if (!outcome.ok) {
      setNotice({
        ok: false,
        message: outcome.message,
      });
    }
  }

  function requestPluginShareTask(
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) {
    const actionRecord =
      plugins.find((plugin) => plugin.id === PLUGIN_SHARE_ACTION_PLUGIN_IDS[action]) ?? null;
    setShareConfirm({ sourceRecord: record, action, actionRecord });
  }

  async function handleInstallAvailable(plugin: AvailableMarketplacePlugin) {
    setPendingInstallEntry(plugin.key);
    try {
      const outcome = await finishImport(
        () => installPluginSource(plugin.entry.name),
        'installed',
      );
      if (outcome.ok) setAvailableDetails(null);
    } finally {
      setPendingInstallEntry(null);
    }
  }

  async function handleMarketplaceMutation(
    actionKey: string,
    work: () => Promise<PluginMarketplaceMutationOutcome>,
  ) {
    setPendingSourceAction(actionKey);
    setNotice(null);
    const outcome = await work();
    setPendingSourceAction(null);
    setNotice(outcome);
    if (outcome.ok) await refresh();
  }

  return (
    <section className="ui-page plugins-view" aria-labelledby="plugins-title">
      <PageHeader
        kicker={copy.kicker}
        title={<span id="plugins-title">{copy.title}</span>}
        lede={copy.lede}
        action={(
          <>
            <UiActionButton
              type="button"
              tone="primary"
              icon="edit"
              onClick={() => onCreatePlugin?.()}
              data-testid="plugins-create-button"
            >
              {t('homeHero.chip.createPlugin')}
            </UiActionButton>
            <UiActionButton
              type="button"
              tone="secondary"
              icon="plus"
              onClick={() => setImportOpen(true)}
              aria-haspopup="dialog"
              data-testid="plugins-import-button"
            >
              {copy.importPlugin}
            </UiActionButton>
            <UiBadge icon="grid">{copy.agentContext}</UiBadge>
          </>
        )}
      />

      <div className="plugins-view__stats" aria-label={copy.summaryAria}>
        <StatCard label={copy.installed} value={userPlugins.length} />
        <StatCard label={copy.available} value={availablePlugins.length} />
        <StatCard label={copy.sources} value={marketplaces.length} />
      </div>

      <nav className="plugins-view__tabs" role="tablist" aria-label={copy.pluginAreas}>
        {PLUGINS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          const tabCopy = copy.tabs[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={[
                'plugins-view__tab',
                active ? ' is-active' : '',
              ]
                .filter(Boolean)
                .join('')}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`plugins-tab-${tab.id}`}
            >
              <span className="plugins-view__tab-label">{tabCopy.label}</span>
              <span className="plugins-view__tab-hint">{tabCopy.hint}</span>
            </button>
          );
        })}
      </nav>

      {notice ? <Notice outcome={notice} /> : null}

      <div className="plugins-view__gallery">
        {loading ? <div className="plugins-view__empty">{copy.loadingPlugins}</div> : null}

        {!loading && activeTab === 'installed' ? (
          <PluginsHomeSection
            plugins={userPlugins}
            loading={false}
            activePluginId={activePlugin?.record.id ?? null}
            pendingApplyId={pendingApplyId}
            pendingShareAction={pendingShareAction}
            onUse={(record, action) => void handleUsePlugin(record, action)}
            onOpenDetails={setDetailsRecord}
            onPluginShareAction={(record, action) =>
              requestPluginShareTask(record, action)
            }
            onCreatePlugin={onCreatePlugin}
            preferDefaultFacet={false}
            title={copy.installedPluginsTitle}
            subtitle={copy.installedPluginsSubtitle}
            emptyMessage={copy.installedPluginsEmpty}
          />
        ) : null}

        {!loading && activeTab === 'available' ? (
          <AvailablePluginsPanel
            copy={copy}
            plugins={availablePlugins}
            pendingKey={pendingInstallEntry}
            onOpenDetails={setAvailableDetails}
            onInstall={(plugin) => void handleInstallAvailable(plugin)}
          />
        ) : null}

        {!loading && activeTab === 'sources' ? (
          <SourcesPanel
            copy={copy}
            marketplaces={marketplaces}
            pendingAction={pendingSourceAction}
            onAdd={(url, trust) =>
              void handleMarketplaceMutation('add', () => addPluginMarketplace({ url, trust }))
            }
            onRefresh={(marketplace) =>
              void handleMarketplaceMutation(`refresh:${marketplace.id}`, () =>
                refreshPluginMarketplace(marketplace.id),
              )
            }
            onRemove={(marketplace) =>
              void handleMarketplaceMutation(`remove:${marketplace.id}`, () =>
                removePluginMarketplace(marketplace.id),
              )
            }
            onTrust={(marketplace, trust) =>
              void handleMarketplaceMutation(`trust:${marketplace.id}:${trust}`, () =>
                setPluginMarketplaceTrust(marketplace.id, trust),
              )
            }
          />
        ) : null}

        {activeTab === 'team' ? <TeamPanel copy={copy} /> : null}
      </div>

      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={() => setDetailsRecord(null)}
          onUse={(record) => void handleUsePlugin(record, 'use')}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
      {availableDetails ? (
        <AvailablePluginDetailsModal
          copy={copy}
          plugin={availableDetails}
          pending={pendingInstallEntry === availableDetails.key}
          onClose={() => {
            if (pendingInstallEntry !== availableDetails.key) setAvailableDetails(null);
          }}
          onInstall={(plugin) => void handleInstallAvailable(plugin)}
        />
      ) : null}
      {shareConfirm ? (
        <PluginShareConfirmModal
          copy={copy}
          sourceRecord={shareConfirm.sourceRecord}
          action={shareConfirm.action}
          actionRecord={shareConfirm.actionRecord}
          pending={
            pendingShareAction?.pluginId === shareConfirm.sourceRecord.id &&
            pendingShareAction.action === shareConfirm.action
          }
          onClose={() => {
            if (!pendingShareAction) setShareConfirm(null);
          }}
          onConfirm={() =>
            void handleCreatePluginShareTask(
              shareConfirm.sourceRecord,
              shareConfirm.action,
            )
          }
        />
      ) : null}
      {importOpen ? (
        <PluginImportModal
          copy={copy}
          onClose={() => setImportOpen(false)}
          onInstallSource={(source) => finishImport(() => installPluginSource(source))}
          onUploadZip={(file) => finishImport(() => uploadPluginZip(file))}
          onUploadFolder={(files) => finishImport(() => uploadPluginFolder(files))}
        />
      ) : null}
    </section>
  );
}

function PluginShareConfirmModal({
  copy,
  sourceRecord,
  action,
  actionRecord,
  pending,
  onClose,
  onConfirm,
}: {
  copy: PluginsViewCopy;
  sourceRecord: InstalledPluginRecord;
  action: PluginShareAction;
  actionRecord: InstalledPluginRecord | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const details = PLUGIN_SHARE_DETAILS[action];
  const actionTitle = actionRecord?.title ?? details.fallbackTitle;
  const actionDescription =
    actionRecord?.manifest?.description ?? details.fallbackDescription;
  const actionQuery = readLocalizedUseCaseQuery(actionRecord);
  const stagedPath = `plugin-source/${pluginShareSlug(sourceRecord.id)}`;

  return (
    <div
      className="plugin-details-modal-backdrop plugin-share-confirm"
      role="dialog"
      aria-modal="true"
      aria-label={`${actionTitle} for ${sourceRecord.title}`}
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
      data-testid="plugin-share-confirm-modal"
    >
      <div className="plugin-details-modal plugin-share-confirm__panel">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2 className="plugin-details-modal__title">{actionTitle}</h2>
              <span className="plugin-details-modal__trust trust-bundled">
                Action plugin
              </span>
            </div>
            <div className="plugin-details-modal__meta">
              <span>{details.eyebrow}</span>
              <span>· for {sourceRecord.title}</span>
              {actionRecord ? <span>· v{actionRecord.version}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            disabled={pending}
            aria-label={copy.closeShareConfirmation}
            title={copy.close}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {copy.whatThisStarts}
              </h3>
            </div>
            <p className="plugin-details-modal__description">
              {actionDescription}
            </p>
            <ol className="plugin-share-confirm__steps">
              {details.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">
                {copy.sourcePlugin}
              </h3>
            </div>
            <dl className="plugin-share-confirm__facts">
              <div>
                <dt>{copy.plugin}</dt>
                <dd>{sourceRecord.title}</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{sourceRecord.id}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.copiedTo}</dt>
                <dd>
                  <code>{stagedPath}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.trust}</dt>
                <dd>{sourceRecord.trust}</dd>
              </div>
            </dl>
          </section>

          {actionQuery ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">
                  {copy.actionPrompt}
                </h3>
              </div>
              <pre className="plugin-details-modal__query">{actionQuery}</pre>
            </section>
          ) : null}
        </div>

        <footer className="plugin-details-modal__foot">
          <UiActionButton
            type="button"
            tone="secondary"
            onClick={onClose}
            disabled={pending}
          >
            {copy.cancel}
          </UiActionButton>
          <UiActionButton
            type="button"
            tone="primary"
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid="plugin-share-confirm-start"
          >
            {pending ? copy.starting : details.confirmLabel}
          </UiActionButton>
        </footer>
      </div>
    </div>
  );
}

function readLocalizedUseCaseQuery(record: InstalledPluginRecord | null): string | null {
  const query = record?.manifest?.od?.useCase?.query;
  if (typeof query === 'string' && query.trim()) return query.trim();
  if (!query || typeof query !== 'object') return null;
  const dict = query as Record<string, unknown>;
  const preferred = dict.en ?? Object.values(dict).find((value) => typeof value === 'string');
  return typeof preferred === 'string' && preferred.trim() ? preferred.trim() : null;
}

function pluginShareSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/(^[-._]+|[-._]+$)/g, '') || 'open-design-plugin'
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="plugins-view__stat">
      <span className="plugins-view__stat-value">{value}</span>
      <span className="plugins-view__stat-label">{label}</span>
    </div>
  );
}

function Notice({
  outcome,
}: {
  outcome: PluginInstallOutcome | { ok: boolean; message: string };
}) {
  const warnings = 'warnings' in outcome ? outcome.warnings : [];
  const log = 'log' in outcome ? outcome.log : [];
  return (
    <div className={`plugins-view__notice${outcome.ok ? ' is-success' : ' is-error'}`} role="status">
      <div>{outcome.message}</div>
      {warnings.length > 0 ? (
        <div className="plugins-view__notice-sub">
          {warnings.length} warning{warnings.length === 1 ? '' : 's'}
        </div>
      ) : null}
      {log.length > 0 ? (
        <details className="plugins-view__notice-log">
          <summary>Install log</summary>
          <ul>
            {log.map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

interface AvailableMarketplacePlugin {
  key: string;
  marketplace: PluginMarketplace;
  entry: PluginMarketplaceEntry;
}

function AvailablePluginsPanel({
  copy,
  plugins,
  pendingKey,
  onOpenDetails,
  onInstall,
}: {
  copy: PluginsViewCopy;
  plugins: AvailableMarketplacePlugin[];
  pendingKey: string | null;
  onOpenDetails: (plugin: AvailableMarketplacePlugin) => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
}) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const sourceOptions = useMemo(() => buildAvailableSourceOptions(plugins), [plugins]);
  const filteredPlugins = useMemo(
    () => filterAvailablePlugins(plugins, { query, sourceFilter }),
    [plugins, query, sourceFilter],
  );
  const filterActive = query.trim().length > 0 || sourceFilter !== 'all';

  return (
    <section className="plugins-view__section" aria-labelledby="plugins-available-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-available-title">{copy.availableTitle}</h2>
          <p>{copy.availableSubtitle}</p>
        </div>
        <span className="plugins-view__section-count">
          {filteredPlugins.length === plugins.length
            ? plugins.length
            : copy.ofCount(filteredPlugins.length, plugins.length)}
        </span>
      </div>
      {plugins.length > 0 ? (
        <div className="plugins-view__available-controls" aria-label={copy.availableFiltersAria}>
          <div className="plugins-view__search">
            <Icon name="search" size={13} className="plugins-view__search-icon" />
            <input
              id="plugins-available-search"
              type="search"
              aria-label={copy.searchAvailable}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchAvailable}
            />
            {query ? (
              <button
                type="button"
                className="plugins-view__search-clear"
                onClick={() => setQuery('')}
                aria-label={copy.clearAvailableSearch}
                title={copy.clearSearch}
              >
                <Icon name="close" size={11} />
              </button>
            ) : null}
          </div>
          <label className="plugins-view__filter" htmlFor="plugins-available-source">
            <span>{copy.source}</span>
            <select
              id="plugins-available-source"
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value)}
            >
              <option value="all">{copy.allSources}</option>
              {sourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {plugins.length === 0 ? (
        <div className="plugins-view__empty">
          {copy.noAvailableEntries}
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div className="plugins-view__empty">
          {filterActive
            ? copy.noAvailableFilterMatch
            : copy.noAvailableSourceHint}
        </div>
      ) : (
        <div className="plugins-view__available-list">
          {filteredPlugins.map((plugin) => {
            const title = plugin.entry.title ?? plugin.entry.name;
            return (
              <article key={plugin.key} className="plugins-view__available-card">
                <div className="plugins-view__available-main">
                  <div className="plugins-view__row-title">
                    <span>{title}</span>
                    <span className={`plugins-view__trust trust-${plugin.marketplace.trust}`}>
                      {plugin.marketplace.trust}
                    </span>
                  </div>
                  {plugin.entry.description ? <p>{plugin.entry.description}</p> : null}
                  <div className="plugins-view__meta">
                    <span>{plugin.entry.name}</span>
                    {plugin.entry.version ? <span>v{plugin.entry.version}</span> : null}
                    <span>{plugin.marketplace.manifest.name ?? plugin.marketplace.url}</span>
                    {plugin.entry.tags?.slice(0, 3).map((tag) => (
                      <span key={`${plugin.key}:${tag}`}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="plugins-view__row-actions">
                  <UiActionButton
                    type="button"
                    tone="secondary"
                    onClick={() => onOpenDetails(plugin)}
                    data-testid={`plugins-available-details-${plugin.entry.name}`}
                  >
                    {copy.details}
                  </UiActionButton>
                  <UiActionButton
                    type="button"
                    tone="primary"
                    onClick={() => onInstall(plugin)}
                    disabled={pendingKey === plugin.key}
                    data-testid={`plugins-available-install-${plugin.entry.name}`}
                  >
                    {pendingKey === plugin.key ? copy.installing : copy.install}
                  </UiActionButton>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AvailablePluginDetailsModal({
  copy,
  plugin,
  pending,
  onClose,
  onInstall,
}: {
  copy: PluginsViewCopy;
  plugin: AvailableMarketplacePlugin;
  pending: boolean;
  onClose: () => void;
  onInstall: (plugin: AvailableMarketplacePlugin) => void;
}) {
  const title = plugin.entry.title ?? plugin.entry.name;
  const sourceName = plugin.marketplace.manifest.name ?? plugin.marketplace.url;
  const trustClass =
    plugin.marketplace.trust === 'official' ? 'bundled' : plugin.marketplace.trust;
  const publisher = plugin.entry.publisher;
  const publisherLabel =
    publisher?.id ?? publisher?.github ?? publisher?.url ?? null;
  const tags = plugin.entry.tags ?? [];
  const capabilitySummary = plugin.entry.capabilitiesSummary ?? [];

  return (
    <div
      className="plugin-details-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugins-available-details-title"
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
      data-testid="plugins-available-details-modal"
    >
      <div className="plugin-details-modal">
        <header className="plugin-details-modal__head">
          <div className="plugin-details-modal__head-titles">
            <div className="plugin-details-modal__head-row">
              <h2
                id="plugins-available-details-title"
                className="plugin-details-modal__title"
              >
                {title}
              </h2>
              <span className={`plugin-details-modal__trust trust-${trustClass}`}>
                {plugin.marketplace.trust}
              </span>
            </div>
            <div className="plugin-details-modal__meta">
              <span>{plugin.entry.name}</span>
              {plugin.entry.version ? <span>· v{plugin.entry.version}</span> : null}
              <span>· {sourceName}</span>
            </div>
          </div>
          <button
            type="button"
            className="plugin-details-modal__close"
            onClick={onClose}
            disabled={pending}
            aria-label={copy.closeAvailableDetails}
            title={copy.close}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="plugin-details-modal__body">
          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">{copy.about}</h3>
            </div>
            <p className="plugin-details-modal__description">
              {plugin.entry.description ?? copy.noDescription}
            </p>
          </section>

          <section className="plugin-details-modal__section">
            <div className="plugin-details-modal__section-head">
              <h3 className="plugin-details-modal__section-title">Catalog</h3>
            </div>
            <dl className="plugin-details-modal__source">
              <div>
                <dt>{copy.source}</dt>
                <dd>
                  <code>{plugin.entry.source}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.catalog}</dt>
                <dd>{sourceName}</dd>
              </div>
              <div>
                <dt>{copy.catalogUrl}</dt>
                <dd>
                  <a href={plugin.marketplace.url} target="_blank" rel="noreferrer">
                    {plugin.marketplace.url}
                  </a>
                </dd>
              </div>
              {plugin.entry.license ? (
                <div>
                  <dt>{copy.license}</dt>
                  <dd>{plugin.entry.license}</dd>
                </div>
              ) : null}
              {publisherLabel ? (
                <div>
                  <dt>{copy.publisher}</dt>
                  <dd>
                    {publisher?.url ? (
                      <a href={publisher.url} target="_blank" rel="noreferrer">
                        {publisherLabel}
                      </a>
                    ) : (
                      publisherLabel
                    )}
                  </dd>
                </div>
              ) : null}
              {plugin.entry.homepage ? (
                <div>
                  <dt>{copy.homepage}</dt>
                  <dd>
                    <a href={plugin.entry.homepage} target="_blank" rel="noreferrer">
                      {plugin.entry.homepage}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {tags.length > 0 || capabilitySummary.length > 0 ? (
            <section className="plugin-details-modal__section">
              <div className="plugin-details-modal__section-head">
                <h3 className="plugin-details-modal__section-title">{copy.metadata}</h3>
              </div>
              <div className="plugin-details-modal__context">
                {tags.length > 0 ? (
                  <div className="plugin-details-modal__ctx-group">
                    <div className="plugin-details-modal__ctx-label">{copy.tags}</div>
                    <div className="plugin-details-modal__chips">
                      {tags.map((tag) => (
                        <span key={tag} className="plugin-details-modal__chip">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {capabilitySummary.length > 0 ? (
                  <div className="plugin-details-modal__ctx-group">
                    <div className="plugin-details-modal__ctx-label">{copy.capabilities}</div>
                    <div className="plugin-details-modal__chips">
                      {capabilitySummary.map((capability) => (
                        <span
                          key={capability}
                          className="plugin-details-modal__chip plugin-details-modal__chip--mono"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="plugin-details-modal__foot">
          <UiActionButton
            type="button"
            tone="secondary"
            onClick={onClose}
            disabled={pending}
          >
            {copy.close}
          </UiActionButton>
          <UiActionButton
            type="button"
            tone="primary"
            onClick={() => onInstall(plugin)}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            data-testid={`plugins-available-details-install-${plugin.entry.name}`}
          >
            {pending ? copy.installing : copy.install}
          </UiActionButton>
        </footer>
      </div>
    </div>
  );
}

function SourcesPanel({
  copy,
  marketplaces,
  pendingAction,
  onAdd,
  onRefresh,
  onRemove,
  onTrust,
}: {
  copy: PluginsViewCopy;
  marketplaces: PluginMarketplace[];
  pendingAction: string | null;
  onAdd: (url: string, trust: PluginMarketplaceTrust) => void;
  onRefresh: (marketplace: PluginMarketplace) => void;
  onRemove: (marketplace: PluginMarketplace) => void;
  onTrust: (marketplace: PluginMarketplace, trust: PluginMarketplaceTrust) => void;
}) {
  const [url, setUrl] = useState('');
  const [trust, setTrust] = useState<PluginMarketplaceTrust>('restricted');
  const trimmedUrl = url.trim();
  return (
    <section className="plugins-view__section" aria-labelledby="plugins-sources-title">
      <div className="plugins-view__section-head">
        <div>
          <h2 id="plugins-sources-title">{copy.registrySources}</h2>
          <p>{copy.registrySourcesBody}</p>
        </div>
        <span className="plugins-view__section-count">{marketplaces.length}</span>
      </div>

      <form
        className="plugins-view__source-manager"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedUrl) return;
          onAdd(trimmedUrl, trust);
          setUrl('');
        }}
      >
        <label htmlFor="plugin-marketplace-url">{copy.sourceUrl}</label>
        <div className="plugins-view__source-row">
          <input
            id="plugin-marketplace-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/open-design-marketplace.json"
            disabled={pendingAction === 'add'}
          />
          <select
            value={trust}
            onChange={(event) => setTrust(event.target.value as PluginMarketplaceTrust)}
            disabled={pendingAction === 'add'}
            aria-label={copy.defaultTrust}
          >
            <option value="restricted">{copy.trustRestricted}</option>
            <option value="trusted">{copy.trustTrusted}</option>
            <option value="official">{copy.trustOfficial}</option>
          </select>
          <UiActionButton
            type="submit"
            tone="primary"
            disabled={!trimmedUrl || pendingAction === 'add'}
          >
            {pendingAction === 'add' ? copy.adding : copy.addSource}
          </UiActionButton>
        </div>
      </form>

      {marketplaces.length === 0 ? (
        <div className="plugins-view__empty">
          {copy.noRegistrySources}
        </div>
      ) : (
        <div className="plugins-view__marketplaces">
          {marketplaces.map((marketplace) => (
            <article key={marketplace.id} className="plugins-view__marketplace">
              <div>
                <h3>{marketplace.manifest.name ?? marketplace.url}</h3>
                <a href={marketplace.url} target="_blank" rel="noreferrer">
                  {marketplace.url}
                </a>
                <div className="plugins-view__meta">
                  <span>{marketplace.trust}</span>
                  <span>{copy.pluginCount(marketplace.manifest.plugins?.length ?? 0)}</span>
                  {marketplace.version ? <span>{copy.catalogVersion(marketplace.version)}</span> : null}
                </div>
              </div>
              <div className="plugins-view__source-actions">
                <select
                  value={marketplace.trust}
                  onChange={(event) =>
                    onTrust(marketplace, event.target.value as PluginMarketplaceTrust)
                  }
                  aria-label={copy.trustFor(marketplace.manifest.name ?? marketplace.url)}
                  disabled={pendingAction?.startsWith(`trust:${marketplace.id}:`)}
                >
                  <option value="restricted">{copy.trustRestricted}</option>
                  <option value="trusted">{copy.trustTrusted}</option>
                  <option value="official">{copy.trustOfficial}</option>
                </select>
                <UiActionButton
                  type="button"
                  tone="secondary"
                  onClick={() => onRefresh(marketplace)}
                  disabled={pendingAction === `refresh:${marketplace.id}`}
                >
                  {pendingAction === `refresh:${marketplace.id}` ? copy.refreshing : copy.refresh}
                </UiActionButton>
                <UiActionButton
                  type="button"
                  tone="danger"
                  onClick={() => onRemove(marketplace)}
                  disabled={pendingAction === `remove:${marketplace.id}`}
                >
                  {pendingAction === `remove:${marketplace.id}` ? copy.removing : copy.remove}
                </UiActionButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type ImportKind = 'github' | 'zip' | 'folder';

function PluginImportModal({
  copy,
  onClose,
  onInstallSource,
  onUploadZip,
  onUploadFolder,
}: {
  copy: PluginsViewCopy;
  onClose: () => void;
  onInstallSource: (source: string) => Promise<PluginInstallOutcome>;
  onUploadZip: (file: File) => Promise<PluginInstallOutcome>;
  onUploadFolder: (files: File[]) => Promise<PluginInstallOutcome>;
}) {
  const [kind, setKind] = useState<ImportKind>('github');
  const [source, setSource] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);

  async function runImport() {
    setWorking(true);
    try {
      if (kind === 'github') {
        const trimmed = source.trim();
        if (trimmed) await onInstallSource(trimmed);
      } else if (kind === 'zip' && zipFile) {
        await onUploadZip(zipFile);
      } else if (kind === 'folder' && folderFiles.length > 0) {
        await onUploadFolder(folderFiles);
      }
    } finally {
      setWorking(false);
    }
  }

  const canSubmit =
    (kind === 'github' && source.trim().length > 0) ||
    (kind === 'zip' && zipFile !== null) ||
    (kind === 'folder' && folderFiles.length > 0);

  return (
    <div className="plugins-import-modal__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="plugins-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-import-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="plugins-import-modal__head">
          <div>
            <p className="ui-kicker">{copy.userPlugins}</p>
            <h2 id="plugins-import-title">{copy.importAPlugin}</h2>
          </div>
          <button
            type="button"
            className="plugins-import-modal__close"
            onClick={onClose}
            aria-label={copy.closeImportDialog}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <nav className="plugins-import-modal__tabs" aria-label={copy.importSource}>
          <ImportChoice
            active={kind === 'github'}
            icon="github"
            title={copy.fromGithub}
            body={copy.fromGithubBody}
            onClick={() => setKind('github')}
          />
          <ImportChoice
            active={kind === 'zip'}
            icon="upload"
            title={copy.uploadZip}
            body={copy.uploadZipBody}
            onClick={() => setKind('zip')}
          />
          <ImportChoice
            active={kind === 'folder'}
            icon="folder"
            title={copy.uploadFolder}
            body={copy.uploadFolderBody}
            onClick={() => setKind('folder')}
          />
        </nav>

        <div className="plugins-import-modal__body">
          {kind === 'github' ? (
            <div className="plugins-view__install-card">
              <label htmlFor="plugin-source">{copy.githubArchiveOrMarketplace}</label>
              <div className="plugins-view__source-row">
                <input
                  id="plugin-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="github:owner/repo@main/plugins/my-plugin"
                  disabled={working}
                />
                <UiActionButton
                  type="button"
                  tone="primary"
                  onClick={runImport}
                  disabled={working || !canSubmit}
                >
                  {working ? copy.importing : copy.import}
                </UiActionButton>
              </div>
              <div className="plugins-view__source-help">
                {copy.supportsPrefix} <code>github:owner/repo[@ref][/subpath]</code>, HTTPS{' '}
                <code>.tar.gz</code>/<code>.tgz</code> {copy.supportsSuffix}
              </div>
            </div>
          ) : null}

          {kind === 'zip' ? (
            <FileImportPanel
              copy={copy}
              title={copy.uploadZip}
              body={copy.uploadZipPanelBody}
              accept=".zip,application/zip"
              working={working}
              fileLabel={zipFile?.name ?? copy.noZipSelected}
              onChange={(files) => setZipFile(files[0] ?? null)}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

          {kind === 'folder' ? (
            <FileImportPanel
              copy={copy}
              title={copy.uploadFolder}
              body={copy.uploadFolderPanelBody}
              working={working}
              fileLabel={
                folderFiles.length > 0
                  ? copy.filesSelected(folderFiles.length)
                  : copy.noFolderSelected
              }
              folder
              onChange={setFolderFiles}
              onImport={runImport}
              canSubmit={canSubmit}
            />
          ) : null}

        </div>

        <footer className="plugins-import-modal__foot">
          <p>
            {copy.importFooter}
          </p>
          <UiActionButton
            type="button"
            tone="secondary"
            onClick={onClose}
          >
            {copy.cancel}
          </UiActionButton>
        </footer>
      </section>
    </div>
  );
}

function ImportChoice({
  active,
  icon,
  title,
  body,
  onClick,
}: {
  active: boolean;
  icon: 'github' | 'upload' | 'folder';
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`plugins-import-modal__choice${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span className="plugins-import-modal__choice-icon" aria-hidden>
        <Icon name={icon} size={16} />
      </span>
      <span className="plugins-import-modal__choice-copy">
        <span>{title}</span>
        <span>{body}</span>
      </span>
    </button>
  );
}

function FileImportPanel({
  copy,
  title,
  body,
  accept,
  working,
  fileLabel,
  folder,
  canSubmit,
  onChange,
  onImport,
}: {
  copy: PluginsViewCopy;
  title: string;
  body: string;
  accept?: string;
  working: boolean;
  fileLabel: string;
  folder?: boolean;
  canSubmit: boolean;
  onChange: (files: File[]) => void;
  onImport: () => void;
}) {
  return (
    <section className="plugins-view__install-card">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <label className="plugins-import-modal__file">
        <input
          type="file"
          data-testid={folder ? 'plugins-folder-input' : 'plugins-zip-input'}
          {...(accept ? { accept } : {})}
          {...(folder ? { webkitdirectory: '', directory: '' } : {})}
          multiple={folder}
          disabled={working}
          onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []))}
        />
        <span>{fileLabel}</span>
      </label>
      <UiActionButton
        type="button"
        tone="primary"
        onClick={onImport}
        disabled={working || !canSubmit}
      >
        {working ? copy.importing : copy.import}
      </UiActionButton>
    </section>
  );
}

function buildAvailablePlugins(
  marketplaces: PluginMarketplace[],
  installed: InstalledPluginRecord[],
): AvailableMarketplacePlugin[] {
  const installedByName = new Map<string, InstalledPluginRecord>();
  for (const plugin of installed) {
    for (const key of pluginLookupKeys(plugin)) {
      installedByName.set(key, plugin);
    }
  }
  return marketplaces.flatMap((marketplace) => {
    const entries = marketplace.manifest.plugins ?? [];
    return entries.flatMap((entry) => {
      const installedPlugin = installedByName.get(normalizePluginName(entry.name)) ?? null;
      if (installedPlugin) return [];
      return [{
        key: `${marketplace.id}:${entry.name}:${entry.version ?? ''}`,
        marketplace,
        entry,
      }];
    });
  });
}

interface AvailableSourceOption {
  id: string;
  label: string;
}

function buildAvailableSourceOptions(plugins: AvailableMarketplacePlugin[]): AvailableSourceOption[] {
  const byId = new Map<string, AvailableSourceOption>();
  for (const plugin of plugins) {
    if (byId.has(plugin.marketplace.id)) continue;
    byId.set(plugin.marketplace.id, {
      id: plugin.marketplace.id,
      label: plugin.marketplace.manifest.name ?? plugin.marketplace.url,
    });
  }
  return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function filterAvailablePlugins(
  plugins: AvailableMarketplacePlugin[],
  filters: { query: string; sourceFilter: string },
): AvailableMarketplacePlugin[] {
  const terms = filters.query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return plugins.filter((plugin) => {
    if (filters.sourceFilter !== 'all' && plugin.marketplace.id !== filters.sourceFilter) {
      return false;
    }
    if (terms.length === 0) return true;
    const haystack = availablePluginSearchText(plugin);
    return terms.every((term) => haystack.includes(term));
  });
}

function availablePluginSearchText(plugin: AvailableMarketplacePlugin): string {
  const { entry, marketplace } = plugin;
  const parts = [
    entry.name,
    entry.title,
    entry.description,
    entry.source,
    entry.version,
    entry.homepage,
    entry.license,
    entry.publisher?.id,
    entry.publisher?.github,
    entry.publisher?.url,
    marketplace.id,
    marketplace.url,
    marketplace.trust,
    marketplace.manifest.name,
    ...(entry.tags ?? []),
    ...(entry.capabilitiesSummary ?? []),
  ];
  return parts.filter((part): part is string => typeof part === 'string').join(' ').toLowerCase();
}

function pluginLookupKeys(plugin: InstalledPluginRecord): string[] {
  const keys = new Set<string>();
  keys.add(normalizePluginName(plugin.id));
  if (plugin.manifest?.name) keys.add(normalizePluginName(plugin.manifest.name));
  if (plugin.sourceMarketplaceEntryName) {
    keys.add(normalizePluginName(plugin.sourceMarketplaceEntryName));
  }
  return Array.from(keys);
}

function normalizePluginName(name: string): string {
  return name.trim().toLowerCase();
}

type PluginsViewCopy = ReturnType<typeof pluginsViewCopy>;

function pluginsViewCopy(locale: string) {
  if (locale === 'vi') {
    return {
      kicker: 'Thư viện mở rộng',
      title: 'Plugins',
      lede: 'Duyệt workflow đã cài, khám phá mục từ registry, quản lý nguồn và chuẩn bị plugin để dùng trong nhóm.',
      importPlugin: 'Nhập plugin',
      agentContext: 'Ngữ cảnh AI',
      summaryAria: 'Tóm tắt plugin',
      installed: 'Đã cài',
      available: 'Có sẵn',
      sources: 'Nguồn',
      pluginAreas: 'Khu vực plugin',
      loadingPlugins: 'Đang tải plugin...',
      installedPluginsTitle: 'Plugin đã cài',
      installedPluginsSubtitle: 'Các plugin bạn đã nhập hoặc cài từ nguồn marketplace.',
      installedPluginsEmpty: 'Chưa có plugin người dùng nào. Hãy tạo, nhập hoặc cài một mục trong tab Có sẵn.',
      tabs: {
        installed: { label: 'Đã cài', hint: 'Plugin của bạn' },
        available: { label: 'Có sẵn', hint: 'Từ nguồn' },
        sources: { label: 'Nguồn', hint: 'Catalog' },
        team: { label: 'Nhóm', hint: 'Doanh nghiệp' },
      } satisfies Record<PluginsTab, { label: string; hint: string }>,
      availableTitle: 'Có sẵn từ nguồn',
      availableSubtitle: 'Các mục catalog phát hiện từ marketplace đã cấu hình.',
      ofCount: (shown: number, total: number) => `${shown} / ${total}`,
      availableFiltersAria: 'Bộ lọc plugin có sẵn',
      searchAvailable: 'Tìm plugin có sẵn',
      clearAvailableSearch: 'Xóa tìm kiếm plugin có sẵn',
      clearSearch: 'Xóa tìm kiếm',
      source: 'Nguồn',
      allSources: 'Tất cả nguồn',
      noAvailableEntries: 'Chưa có mục nào. Các mục đã cài sẽ bị ẩn khỏi tab Có sẵn; gỡ cài đặt để hiện lại.',
      noAvailableFilterMatch: 'Không có mục nào khớp với bộ lọc.',
      noAvailableSourceHint: 'Chưa có mục nào. Hãy thêm nguồn ở tab Nguồn.',
      details: 'Chi tiết',
      installing: 'Đang cài...',
      install: 'Cài đặt',
      closeAvailableDetails: 'Đóng chi tiết plugin có sẵn',
      close: 'Đóng',
      about: 'Giới thiệu',
      noDescription: 'Chưa có mô tả.',
      catalog: 'Catalog',
      catalogUrl: 'URL catalog',
      license: 'Giấy phép',
      publisher: 'Nhà phát hành',
      homepage: 'Trang chủ',
      metadata: 'Siêu dữ liệu',
      tags: 'Thẻ',
      capabilities: 'Khả năng',
      registrySources: 'Nguồn registry',
      registrySourcesBody: 'Các catalog marketplace cung cấp mục cho tab Có sẵn.',
      sourceUrl: 'URL nguồn',
      defaultTrust: 'Mức tin cậy mặc định',
      trustRestricted: 'Hạn chế',
      trustTrusted: 'Tin cậy',
      trustOfficial: 'Chính thức',
      adding: 'Đang thêm...',
      addSource: 'Thêm nguồn',
      noRegistrySources: 'Chưa cấu hình nguồn registry nào.',
      pluginCount: (count: number) => `${count} plugin`,
      catalogVersion: (version: string) => `catalog v${version}`,
      trustFor: (name: string) => `Mức tin cậy cho ${name}`,
      refreshing: 'Đang làm mới...',
      refresh: 'Làm mới',
      removing: 'Đang xóa...',
      remove: 'Xóa',
      userPlugins: 'Plugin người dùng',
      importAPlugin: 'Nhập plugin',
      closeImportDialog: 'Đóng hộp thoại nhập',
      importSource: 'Nguồn nhập',
      fromGithub: 'Từ GitHub',
      fromGithubBody: 'Cài bằng đường dẫn github:owner/repo.',
      uploadZip: 'Tải zip lên',
      uploadZipBody: 'Tải lên một gói plugin.',
      uploadFolder: 'Tải thư mục lên',
      uploadFolderBody: 'Tải lên một thư mục plugin.',
      githubArchiveOrMarketplace: 'Nguồn GitHub, archive hoặc marketplace',
      importing: 'Đang nhập...',
      import: 'Nhập',
      supportsPrefix: 'Hỗ trợ',
      supportsSuffix: 'archive, hoặc tên plugin marketplace.',
      uploadZipPanelBody: 'Chọn file .zip chứa open-design.json, SKILL.md hoặc .claude-plugin/plugin.json.',
      uploadFolderPanelBody: 'Chọn thư mục plugin. Đường dẫn tương đối sẽ được giữ nguyên khi cài vào registry người dùng.',
      noZipSelected: 'Chưa chọn zip',
      noFolderSelected: 'Chưa chọn thư mục',
      filesSelected: (count: number) => `${count} tệp đã chọn`,
      importFooter: 'Plugin đã nhập là plugin người dùng và được lưu tách khỏi plugin chính thức đi kèm.',
      cancel: 'Hủy',
      closeShareConfirmation: 'Đóng xác nhận chia sẻ',
      whatThisStarts: 'Quy trình sẽ bắt đầu',
      sourcePlugin: 'Plugin nguồn',
      plugin: 'Plugin',
      copiedTo: 'Đã sao chép tới',
      trust: 'Mức tin cậy',
      actionPrompt: 'Prompt hành động',
      starting: 'Đang bắt đầu...',
      comingSoon: 'Sắp có',
      teamTitle: 'Marketplace riêng cho nhóm',
      teamBody: 'Khu vực này dành cho catalog nhóm/doanh nghiệp, chính sách tin cậy riêng và kiểm soát vòng đời plugin dùng chung.',
    };
  }
  return {
    kicker: 'Extension library',
    title: 'Plugins',
    lede: 'Browse installed workflows, discover registry entries, manage sources, and prepare plugins for team distribution.',
    importPlugin: 'Import plugin',
    agentContext: 'Agent context',
    summaryAria: 'Plugin summary',
    installed: 'Installed',
    available: 'Available',
    sources: 'Sources',
    pluginAreas: 'Plugin areas',
    loadingPlugins: 'Loading plugins...',
    installedPluginsTitle: 'Installed plugins',
    installedPluginsSubtitle: 'Plugins you imported or installed from marketplace sources.',
    installedPluginsEmpty: 'No installed user plugins yet. Use Create / Import or install an Available entry.',
    tabs: {
      installed: { label: 'Installed', hint: 'Your plugins' },
      available: { label: 'Available', hint: 'From sources' },
      sources: { label: 'Sources', hint: 'Catalogs' },
      team: { label: 'Team', hint: 'Enterprise' },
    } satisfies Record<PluginsTab, { label: string; hint: string }>,
    availableTitle: 'Available from sources',
    availableSubtitle: 'Catalog entries discovered from configured marketplaces.',
    ofCount: (shown: number, total: number) => `${shown} of ${total}`,
    availableFiltersAria: 'Available plugin filters',
    searchAvailable: 'Search available plugins',
    clearAvailableSearch: 'Clear available plugin search',
    clearSearch: 'Clear search',
    source: 'Source',
    allSources: 'All sources',
    noAvailableEntries: 'No available entries yet. Installed catalog entries are removed from Available; uninstall one to make it available again.',
    noAvailableFilterMatch: 'No available entries match your filters.',
    noAvailableSourceHint: 'No available entries yet. Add a source in the Sources tab.',
    details: 'Details',
    installing: 'Installing...',
    install: 'Install',
    closeAvailableDetails: 'Close available plugin details',
    close: 'Close',
    about: 'About',
    noDescription: 'No description provided.',
    catalog: 'Catalog',
    catalogUrl: 'Catalog URL',
    license: 'License',
    publisher: 'Publisher',
    homepage: 'Homepage',
    metadata: 'Metadata',
    tags: 'Tags',
    capabilities: 'Capabilities',
    registrySources: 'Registry sources',
    registrySourcesBody: 'Marketplace catalogs that feed Available plugin entries.',
    sourceUrl: 'Source URL',
    defaultTrust: 'Default trust',
    trustRestricted: 'Restricted',
    trustTrusted: 'Trusted',
    trustOfficial: 'Official',
    adding: 'Adding...',
    addSource: 'Add source',
    noRegistrySources: 'No registry sources configured yet.',
    pluginCount: (count: number) => `${count} plugins`,
    catalogVersion: (version: string) => `catalog v${version}`,
    trustFor: (name: string) => `Trust for ${name}`,
    refreshing: 'Refreshing...',
    refresh: 'Refresh',
    removing: 'Removing...',
    remove: 'Remove',
    userPlugins: 'User plugins',
    importAPlugin: 'Import a plugin',
    closeImportDialog: 'Close import dialog',
    importSource: 'Import source',
    fromGithub: 'From GitHub',
    fromGithubBody: 'Install github:owner/repo paths.',
    uploadZip: 'Upload zip',
    uploadZipBody: 'Upload a plugin archive.',
    uploadFolder: 'Upload folder',
    uploadFolderBody: 'Upload a plugin directory.',
    githubArchiveOrMarketplace: 'GitHub, archive, or marketplace source',
    importing: 'Importing...',
    import: 'Import',
    supportsPrefix: 'Supports',
    supportsSuffix: 'archives, or marketplace plugin names.',
    uploadZipPanelBody: 'Choose a .zip archive containing open-design.json, SKILL.md, or .claude-plugin/plugin.json.',
    uploadFolderPanelBody: 'Choose a plugin folder. Relative paths are preserved and installed into your user plugin registry.',
    noZipSelected: 'No zip selected',
    noFolderSelected: 'No folder selected',
    filesSelected: (count: number) => `${count} file${count === 1 ? '' : 's'} selected`,
    importFooter: 'Imported plugins are user plugins and are stored separately from bundled official plugins.',
    cancel: 'Cancel',
    closeShareConfirmation: 'Close share confirmation',
    whatThisStarts: 'What this starts',
    sourcePlugin: 'Source plugin',
    plugin: 'Plugin',
    copiedTo: 'Copied to',
    trust: 'Trust',
    actionPrompt: 'Action prompt',
    starting: 'Starting...',
    comingSoon: 'Coming soon',
    teamTitle: 'Private team marketplaces',
    teamBody: 'This area is reserved for enterprise and team catalogs, private trust policies, and shared plugin lifecycle controls.',
  };
}

function TeamPanel({ copy }: { copy: PluginsViewCopy }) {
  return (
    <section className="plugins-view__team" aria-labelledby="plugins-team-title">
      <span className="plugins-view__future-icon" aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div>
        <p className="ui-kicker">{copy.comingSoon}</p>
        <h2 id="plugins-team-title">{copy.teamTitle}</h2>
        <p>{copy.teamBody}</p>
      </div>
    </section>
  );
}
