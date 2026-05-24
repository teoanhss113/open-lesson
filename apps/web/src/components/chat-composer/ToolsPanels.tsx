import { useState, useMemo } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { McpServerConfig, McpTemplate } from '../../state/mcp';
import type { AppConfig, SkillSummary } from '../../types';
import type { TranslateFn } from './types';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { BUILT_IN_PETS, resolveActivePet } from '../pet/pets';
import {
  USER_PLUGIN_SOURCE_KINDS,
  pluginMatchesQuery,
  skillMatchesQuery,
  mcpServerMatchesQuery,
  mcpTemplateMatchesQuery,
  pluginSourceLabel,
} from './utils';
import { inlineMentionToken } from '../../utils/inlineMentions';

export function ToolsPluginsPanel({
  plugins,
  activePluginId,
  onApply,
  onShowDetails,
}: {
  plugins: InstalledPluginRecord[];
  activePluginId: string | null;
  onApply: (record: InstalledPluginRecord) => void | Promise<void>;
  onShowDetails: (record: InstalledPluginRecord) => void;
}) {
  const t = useT();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [source, setSource] = useState<'community' | 'mine'>('community');
  const [query, setQuery] = useState('');
  const communityPlugins = useMemo(
    () => plugins.filter((p) => p.sourceKind === 'bundled'),
    [plugins],
  );
  const userPlugins = useMemo(
    () => plugins.filter((p) => USER_PLUGIN_SOURCE_KINDS.has(p.sourceKind)),
    [plugins],
  );
  const scopedPlugins = source === 'community' ? communityPlugins : userPlugins;
  const visiblePlugins = useMemo(
    () => scopedPlugins.filter((p) => pluginMatchesQuery(p, query)),
    [scopedPlugins, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <div className="composer-tools-segments" role="tablist" aria-label="Plugin source">
          <button
            type="button"
            role="tab"
            aria-selected={source === 'community'}
            className={`composer-tools-segment${source === 'community' ? ' active' : ''}`}
            onClick={() => setSource('community')}
            title={t('plugins.source.officialCount', { n: communityPlugins.length })}
          >
            {t('plugins.source.official')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={source === 'mine'}
            className={`composer-tools-segment${source === 'mine' ? ' active' : ''}`}
            onClick={() => setSource('mine')}
            title={t('plugins.source.mineCount', { n: userPlugins.length })}
          >
            {t('plugins.source.mine')}
          </button>
        </div>
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('pluginsHome.searchPlaceholder')}
          aria-label={t('pluginsHome.searchAria')}
        />
      </div>
      {visiblePlugins.length === 0 ? (
        <div className="composer-tools-empty">
          {plugins.length === 0 ? (
            <>
              {t('plugins.emptyInstallPrefix')}{' '}
              <code>od plugin install &lt;source&gt;</code>.
            </>
          ) : query ? (
            <>{t('plugins.emptyQuery', { source: source === 'community' ? t('plugins.source.official') : t('plugins.source.mine'), query })}</>
          ) : (
            <>{t('plugins.emptySource', { source: source === 'community' ? t('plugins.source.official') : t('plugins.source.mine') })}</>
          )}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visiblePlugins.map((p) => (
            <div
              key={p.id}
              className={`composer-tools-row composer-tools-row--plugin${
                p.id === activePluginId ? ' active' : ''
              }`}
            >
              <button
                type="button"
                className="composer-tools-row-main"
                onClick={async () => {
                  setPendingId(p.id);
                  try {
                    await onApply(p);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                aria-busy={pendingId === p.id ? 'true' : undefined}
                title={p.manifest?.description ?? p.title}
              >
                <Icon name="sparkles" size={12} />
                <span className="composer-tools-row-body">
                  <strong>{p.title}</strong>
                  {p.manifest?.description ? (
                    <span className="composer-tools-row-meta">
                      {p.manifest.description}
                    </span>
                  ) : (
                    <span className="composer-tools-row-meta">{p.id}</span>
                  )}
                </span>
                {pendingId === p.id ? (
                  <span className="composer-tools-row-pending">{t('plugins.applying')}</span>
                ) : null}
              </button>
              <button
                type="button"
                className="composer-tools-row-side"
                onClick={() => onShowDetails(p)}
                title={t('plugins.viewDetailsFor', { title: p.title })}
                aria-label={t('plugins.viewDetailsFor', { title: p.title })}
              >
                <Icon name="eye" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ToolsMcpPanel({
  servers,
  templates,
  onInsert,
  onManage,
}: {
  servers: McpServerConfig[];
  templates: McpTemplate[];
  onInsert: (serverId: string) => void;
  onManage: () => void;
}) {
  const [query, setQuery] = useState('');
  const visibleServers = useMemo(
    () => servers.filter((s) => mcpServerMatchesQuery(s, query)),
    [servers, query],
  );
  const visibleTemplates = useMemo(
    () => templates.filter((tpl) => mcpTemplateMatchesQuery(tpl, query)).slice(0, 8),
    [templates, query],
  );

  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search MCP…"
          aria-label="Search MCP servers and templates"
        />
      </div>
      {visibleServers.length === 0 ? (
        <div className="composer-tools-empty">
          {servers.length === 0
            ? 'No enabled MCP servers configured yet.'
            : `No configured MCP results for “${query}”.`}
        </div>
      ) : (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">Configured</div>
          {visibleServers.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onClick={() => onInsert(s.id)}
              title={`Insert a hint that nudges the model to use ${s.label || s.id}`}
            >
              <Icon name="link" size={12} />
              <span className="composer-tools-row-body">
                <strong>{s.label || s.id}</strong>
                <span className="composer-tools-row-meta">{s.transport}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {visibleTemplates.length > 0 ? (
        <div className="composer-tools-list">
          <div className="composer-tools-section-label">Templates</div>
          {visibleTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="composer-tools-row"
              onClick={onManage}
              title={`Add ${tpl.label} from Settings`}
            >
              <Icon name="plus" size={12} />
              <span className="composer-tools-row-body">
                <strong>{tpl.label}</strong>
                <span className="composer-tools-row-meta">
                  {tpl.transport}
                  {tpl.category ? ` · ${tpl.category}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onClick={onManage}
      >
        <Icon name="settings" size={12} />
        <span>Manage MCP servers…</span>
      </button>
    </>
  );
}

export function ToolsSkillsPanel({
  skills,
  currentSkillId,
  onPick,
}: {
  skills: SkillSummary[];
  currentSkillId: string | null;
  onPick: (skill: SkillSummary) => void | Promise<void>;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleSkills = useMemo(
    () => skills.filter((s) => skillMatchesQuery(s, query)).slice(0, 24),
    [skills, query],
  );
  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('skills.searchPlaceholder')}
          aria-label={t('skills.searchAria')}
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0 ? t('skills.empty') : t('skills.emptyQuery', { query })}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visibleSkills.map((skill) => {
            const active = skill.id === currentSkillId;
            return (
              <button
                key={skill.id}
                type="button"
                role="menuitem"
                className={`composer-tools-row${active ? ' active' : ''}`}
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={skill.description}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{skill.name}</strong>
                  <span className="composer-tools-row-meta">
                    {skill.mode}
                    {skill.surface ? ` · ${skill.surface}` : ''}
                  </span>
                </span>
                {pendingId === skill.id ? (
                  <span className="composer-tools-row-pending">{t('plugins.applying')}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ToolsImportPanel({
  t,
  onLinkFolder,
}: {
  t: TranslateFn;
  onLinkFolder: () => Promise<void> | void;
}) {
  return (
    <div className="composer-tools-list">
      <ImportItem icon="upload" label={t('chat.importFig')} t={t} />
      <ImportItem icon="grid" label={t('chat.importWeb')} t={t} />
      <ImportItem
        icon="folder"
        label={t('chat.importFolder')}
        t={t}
        enabled
        onClick={() => void onLinkFolder()}
      />
      <ImportItem icon="sparkles" label={t('chat.importSkills')} t={t} />
      <ImportItem icon="file" label={t('chat.importProject')} t={t} />
    </div>
  );
}

export function ToolsPetPanel({
  t,
  petConfig,
  onTogglePet,
  onAdoptPet,
  onOpenPetSettings,
}: {
  t: TranslateFn;
  petConfig: AppConfig['pet'] | undefined;
  onTogglePet: () => void;
  onAdoptPet: (id: string) => void;
  onOpenPetSettings: () => void;
}) {
  return (
    <div className="composer-tools-pet">
      <div className="composer-tools-pet-head">
        <span className="hint">{t('pet.composerMenuHint')}</span>
      </div>
      {petConfig?.adopted ? (
        <button
          type="button"
          role="menuitem"
          className="composer-tools-row composer-tools-row-toggle"
          onClick={onTogglePet}
        >
          <Icon name={petConfig.enabled ? 'eye' : 'sparkles'} size={12} />
          <span>{petConfig.enabled ? t('pet.tuck') : t('pet.wake')}</span>
        </button>
      ) : null}
      <div className="composer-tools-pet-grid">
        {BUILT_IN_PETS.map((p) => {
          const active = petConfig?.adopted && petConfig.petId === p.id;
          return (
            <button
              type="button"
              role="menuitem"
              key={p.id}
              className={`composer-tools-pet-item${active ? ' active' : ''}`}
              onClick={() => onAdoptPet(p.id)}
              style={{ ['--pet-accent' as string]: p.accent }}
              title={p.flavor}
            >
              <span aria-hidden>{p.glyph}</span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        role="menuitem"
        className="composer-tools-row composer-tools-row-action"
        onClick={onOpenPetSettings}
      >
        <Icon name="settings" size={12} />
        <span>{t('pet.composerOpenSettings')}</span>
      </button>
    </div>
  );
}

export function ImportItem({
  icon,
  label,
  t,
  enabled,
  onClick,
}: {
  icon: 'upload' | 'link' | 'grid' | 'folder' | 'sparkles' | 'file';
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`composer-import-item${enabled ? ' composer-import-item-enabled' : ''}`}
      role="menuitem"
      tabIndex={-1}
      disabled={!enabled}
      title={enabled ? label : t('chat.importComingSoon')}
      onClick={enabled && onClick ? onClick : (e) => e.preventDefault()}
    >
      <span className="ico" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="composer-import-item-label">{label}</span>
      {!enabled && <span className="composer-import-item-soon">{t('chat.importSoon')}</span>}
    </button>
  );
}
