// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ConnectorDetail,
  type ImportFolderResponse,
  type InstalledPluginRecord,
} from '@open-design/contracts';
import { LOCALE_LABEL, LOCALES, useI18n, useT, type Locale } from '../i18n';
import { navigate, useRoute } from '../router';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { localizeSkillPrompt } from '../i18n/content';
import { CenteredLoader } from './Loading';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { ExamplesTab } from './ExamplesTab';
import { HomeView } from './HomeView';
import { Icon } from './Icon';
import { IntegrationsView, type IntegrationTab } from './IntegrationsView';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { NewProjectModal } from './NewProjectModal';
import { PluginsView } from './PluginsView';
import type { CreateInput } from './NewProjectPanel';
import type { PluginUseAction } from './plugins-home/useActions';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from '../state/projects';
import { TasksView } from './TasksView';

// The topbar chips (GitHub star, model switcher, Use everywhere)
// collapse into the settings dropdown when the viewport gets
// narrow. The transition is driven entirely by CSS @media queries
// in `entry-layout.css` so server and client render identical
// markup — both surfaces are always present, and CSS toggles
// `display` based on `--compact-topbar` breakpoint (900px).

// Theme options exposed in the avatar-popover appearance submenu.
// Mirrors the segmented control in `SettingsDialog` so the same three
// choices (System / Light / Dark) are available from both surfaces.
type AppearanceThemeLabel =
  | 'settings.themeSystem'
  | 'settings.themeLight'
  | 'settings.themeDark';

const APPEARANCE_THEMES: ReadonlyArray<{
  value: AppTheme;
  labelKey: AppearanceThemeLabel;
}> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
];

const APPEARANCE_LABEL: Record<AppTheme, AppearanceThemeLabel> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

type Translator = ReturnType<typeof useT>;

// Mirrors the chip text the InlineModelSwitcher renders, so the
// collapsed menu item inside the settings dropdown can advertise
// the same active mode/agent/model without duplicating the
// labelling logic. Returned as a structured tuple so the menu can
// style the primary text and meta independently.
function describeModelChip(
  config: AppConfig,
  agents: AgentInfo[],
  t: Translator,
): { mode: string; primary: string; model: string } {
  const currentAgent = agents.find((a) => a.id === config.agentId) ?? null;
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
  const currentModelLabel =
    currentAgent?.models?.find((m) => m.id === currentModelId)?.label ?? null;

  if (config.mode === 'daemon') {
    return {
      mode: t('inlineSwitcher.chipCli'),
      primary: currentAgent?.name ?? t('inlineSwitcher.noAgent'),
      model:
        currentModelLabel && currentModelId !== 'default'
          ? currentModelLabel
          : t('inlineSwitcher.modelDefault'),
    };
  }
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  // KNOWN_PROVIDERS is consulted indirectly via apiProtocolLabel —
  // looking it up here for the menu meta would diverge from the
  // chip, so we keep the surface identical to InlineModelSwitcher.
  return {
    mode: t('inlineSwitcher.chipByok'),
    primary: apiProtocolLabel(apiProtocol),
    model: config.model.trim() || t('inlineSwitcher.modelDefault'),
  };
}

interface Props {
  skills: SkillSummary[];
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  connectors: ConnectorDetail[];
  connectorsLoading: boolean;
  integrationInitialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  // Execution / model-switching context. Threaded down from `App` so the
  // top-bar `InlineModelSwitcher` can render the active mode/agent/model
  // and persist changes through the same callbacks the project view uses.
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  // Quick theme switch from the avatar-popover dropdown. Lets the user
  // flip between system / light / dark without opening the full Settings
  // dialog. App owns persistence; this component just calls the callback.
  onThemeChange: (theme: AppTheme) => void;
  onCreateProject: (
    input: CreateInput & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      pluginInputs?: Record<string, unknown>;
      autoSendFirstMessage?: boolean;
      pendingFiles?: File[];
    },
  ) => boolean | void | Promise<boolean | void>;
  onStartProjectConversation: (
    projectId: string,
    prompt: string,
  ) => boolean | Promise<boolean>;
  onCreatePluginShareProject: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<boolean> | boolean;
  onImportFolderResponse?: (response: ImportFolderResponse) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'orbit'
      | 'integrations'
      | 'mcpClient'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'library'
      | 'about',
  ) => void;
  onProjectsRefresh?: () => void;
}

export function EntryShell({
  skills,
  designTemplates,
  designSystems,
  projects,
  templates,
  promptTemplates,
  defaultDesignSystemId,
  connectors,
  connectorsLoading,
  integrationInitialTab = 'mcp',
  composioConfigLoading = false,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onThemeChange,
  onCreateProject,
  onStartProjectConversation,
  onCreatePluginShareProject,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onPersistComposioKey,
  onOpenSettings,
  onProjectsRefresh,
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [templatePromptSkill, setTemplatePromptSkill] = useState<SkillSummary | null>(null);
  const [templateProjectId, setTemplateProjectId] = useState<string | null>(null);
  const [templateProjectError, setTemplateProjectError] = useState<string | null>(null);
  const [templateProjectSubmitting, setTemplateProjectSubmitting] = useState(false);
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(integrationInitialTab);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  // Active-model summary is kept in render scope so
  // the dropdown's collapsed rows can mirror what the chips show
  // when CSS unhides them on narrow viewports. Both surfaces are
  // always rendered; only `display` flips per the media query.
  const modelSummary = useMemo(
    () => describeModelChip(config, agents, t),
    [config, agents, t],
  );
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [projects],
  );

  const templatePromptText = useMemo(() => {
    if (!templatePromptSkill) return '';
    return (
      localizeSkillPrompt(locale, templatePromptSkill)
      ?? templatePromptSkill.description
      ?? templatePromptSkill.name
      ?? ''
    ).trim();
  }, [locale, templatePromptSkill]);

  function changeView(next: EntryViewKind) {
    navigate({ kind: 'home', view: next });
  }

  function openTemplateProjectPicker(skill: SkillSummary) {
    setTemplatePromptSkill(skill);
    setTemplateProjectId(sortedProjects[0]?.id ?? null);
    setTemplateProjectError(null);
  }

  function closeTemplateProjectPicker() {
    if (templateProjectSubmitting) return;
    setTemplatePromptSkill(null);
    setTemplateProjectId(null);
    setTemplateProjectError(null);
  }

  async function startTemplateConversation() {
    if (!templatePromptSkill || !templateProjectId || !templatePromptText) return;
    setTemplateProjectSubmitting(true);
    setTemplateProjectError(null);
    try {
      const ok = await onStartProjectConversation(templateProjectId, templatePromptText);
      if (ok) {
        setTemplatePromptSkill(null);
        setTemplateProjectId(null);
      } else {
        setTemplateProjectError(t('templates.projectStartFailed'));
      }
    } catch {
      setTemplateProjectError(t('templates.projectStartFailed'));
    } finally {
      setTemplateProjectSubmitting(false);
    }
  }

  // The home view no longer hosts a prompt loop, so the plugin
  // library's "create plugin" / "use plugin" entry points just
  // bounce the user back to the workspace home. The associated
  // prefill state was removed when HomeView was simplified.
  function startPluginAuthoring(_goal?: string) {
    changeView('home');
  }

  function usePluginFromLibrary(
    _record: InstalledPluginRecord,
    _action: PluginUseAction = 'use',
  ) {
    changeView('home');
  }

  useEffect(() => {
    setIntegrationTab(integrationInitialTab);
  }, [integrationInitialTab]);

  function openIntegrationTab(tab: IntegrationTab) {
    setIntegrationTab(tab);
    changeView('integrations');
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput & { requestId?: string }) {
    // Let the daemon attach an installed default scenario if one exists.
    // Passing a missing default plugin explicitly makes /api/projects fail
    // after the project has already been inserted, which prevents routing
    // into the new workspace.
    return onCreateProject(input);
  }

  // Dismiss the avatar dropdown on outside-click / Escape so it
  // behaves like the project-view AvatarMenu (which uses the same
  // shell CSS). Collapse the inline language list whenever the
  // dropdown is closed, so the next open starts compact again.
  useEffect(() => {
    if (!avatarMenuOpen) {
      setLanguageExpanded(false);
      setAppearanceExpanded(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatarMenu = (
    <div className="avatar-menu" ref={avatarMenuRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setAvatarMenuOpen((v) => !v)}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={avatarMenuOpen}
      >
        <Icon name="settings" size={17} />
      </button>
      {avatarMenuOpen ? (
        <div className="avatar-popover" role="menu">
          {/* Collapsed-topbar rows. Always rendered so SSR and the
              client agree on the markup; CSS @media (max-width: 900px)
              flips their `display` so they only show when the
              matching topbar chips are themselves hidden. */}
          <button
            type="button"
            className="avatar-item avatar-item--compact-only"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings('execution');
            }}
            data-testid="entry-avatar-model"
            title={t('inlineSwitcher.chipTitle')}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="sparkles" size={14} />
            </span>
            <span className="avatar-item-stack">
              <span className="avatar-item-stack__top">
                {modelSummary.mode} · {modelSummary.primary}
              </span>
              <span className="avatar-item-stack__sub">
                {modelSummary.model}
              </span>
            </span>
          </button>
          <div
            className="avatar-popover__divider avatar-popover__divider--compact-only"
            aria-hidden
          />
          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={languageExpanded}
            onClick={() => setLanguageExpanded((v) => !v)}
            data-testid="entry-avatar-language"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="languages" size={14} />
            </span>
            <span>{t('settings.language')}</span>
            <span className="avatar-item-meta">{LOCALE_LABEL[locale]}</span>
            <Icon
              name={languageExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>
          {languageExpanded ? (
            <div className="avatar-language-list" role="group" aria-label={t('settings.language')}>
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setAvatarMenuOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{LOCALE_LABEL[code]}</span>
                    <span className="avatar-item-meta">{code}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {/* Appearance — system / light / dark. Mirrors the language
              picker: a toggle row that expands a nested radio group so
              the dropdown can host quick theme switching without
              opening the full Settings dialog. The active theme is
              echoed in the meta slot so the row reads as status when
              collapsed. */}
          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={appearanceExpanded}
            onClick={() => setAppearanceExpanded((v) => !v)}
            data-testid="entry-avatar-appearance"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="sun-moon" size={14} />
            </span>
            <span>{t('settings.appearance')}</span>
            <span className="avatar-item-meta">
              {t(APPEARANCE_LABEL[config.theme ?? 'system'])}
            </span>
            <Icon
              name={appearanceExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>
          {appearanceExpanded ? (
            <div
              className="avatar-language-list"
              role="group"
              aria-label={t('settings.appearance')}
            >
              {APPEARANCE_THEMES.map(({ value, labelKey }) => {
                const active = (config.theme ?? 'system') === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      onThemeChange(value);
                      setAvatarMenuOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="menu-hairline" />
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              openIntegrationTab('use-everywhere');
            }}
            data-testid="entry-avatar-use-everywhere"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="hammer" size={14} />
            </span>
            <span>{t('entry.useEverywhereTitle')}</span>
          </button>
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className="entry">
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => setNewProjectOpen(true)}
        />
        <main className="entry-main entry-main--scroll">
          <div className="entry-main__topbar">
            <div className="entry-main__topbar-chips">
              <InlineModelSwitcher
                config={config}
                agents={agents}
                daemonLive={daemonLive}
                onModeChange={onModeChange}
                onAgentChange={onAgentChange}
                onAgentModelChange={onAgentModelChange}
                onApiProtocolChange={onApiProtocolChange}
                onApiModelChange={onApiModelChange}
                onOpenSettings={onOpenSettings}
              />
              <button
                type="button"
                className="use-everywhere-chip"
                onClick={() => openIntegrationTab('use-everywhere')}
                title={t('entry.useEverywhereTitle')}
                aria-label={t('entry.useEverywhereAria')}
                data-testid="entry-use-everywhere-button"
              >
                <span className="use-everywhere-chip__icon" aria-hidden>
                  <Icon name="hammer" size={13} />
                </span>
                <span className="use-everywhere-chip__label">
                  {t('entry.useEverywhereTitle')}
                </span>
              </button>
            </div>
            {avatarMenu}
          </div>
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            {view === 'home' ? (
              <HomeView
                projects={projects}
                skills={skills}
                designSystems={designSystems}
                projectsLoading={projectsLoading}
                onOpenProject={onOpenProject}
                onOpenLiveArtifact={onOpenLiveArtifact}
                onDeleteProject={onDeleteProject}
                onCreateProject={() => setNewProjectOpen(true)}
                onProjectsRefresh={onProjectsRefresh}
              />
            ) : null}
            {view === 'tasks' ? (
              <TasksView
                config={config}
                onOpenOrbitSettings={() => onOpenSettings('orbit')}
              />
            ) : null}
            {view === 'plugins' ? (
              <PluginsView
                onCreatePlugin={startPluginAuthoring}
                onUsePlugin={usePluginFromLibrary}
                onCreatePluginShareProject={onCreatePluginShareProject}
              />
            ) : null}
            {view === 'templates' ? (
              skillsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.tabTemplates')}</h1>
                  </header>
                  <ExamplesTab
                    skills={designTemplates}
                    onUsePrompt={openTemplateProjectPicker}
                  />
                </div>
              )
            ) : null}
            {view === 'design-systems' ? (
              designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.tabDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onPreview={(id) => setPreviewSystemId(id)}
                  />
                </div>
              )
            ) : null}
            {view === 'integrations' ? (
              <IntegrationsView
                config={config}
                initialTab={integrationTab}
                composioConfigLoading={composioConfigLoading}
                onPersistComposioKey={onPersistComposioKey}
              />
            ) : null}
          </div>
        </main>
      </div>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
      {templatePromptSkill ? (
        <div
          className="template-project-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTemplateProjectPicker();
          }}
        >
          <div
            className="template-project-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-project-title"
          >
            <header className="template-project-modal__head">
              <div>
                <h2 id="template-project-title" className="template-project-modal__title">
                  {t('templates.projectPickerTitle')}
                </h2>
                <p className="template-project-modal__subtitle">
                  {t('templates.projectPickerSubtitle')}
                </p>
              </div>
              <button
                type="button"
                className="new-project-modal__close"
                onClick={closeTemplateProjectPicker}
                aria-label={t('common.close')}
                title={`${t('common.close')} (Esc)`}
              >
                <Icon name="close" size={14} />
              </button>
            </header>
            <div className="template-project-modal__body">
              {sortedProjects.length > 0 ? (
                <div className="template-project-list" role="listbox" aria-label={t('templates.selectProject')}>
                  {sortedProjects.map((project) => {
                    const active = project.id === templateProjectId;
                    const updated = project.updatedAt
                      ? new Date(project.updatedAt).toLocaleDateString(locale)
                      : t('common.untitled');
                    return (
                      <button
                        key={project.id}
                        type="button"
                        className={`template-project-row${active ? ' is-active' : ''}`}
                        onClick={() => setTemplateProjectId(project.id)}
                        role="option"
                        aria-selected={active}
                      >
                        <span className="template-project-row__name">{project.name}</span>
                        <span className="template-project-row__meta">{updated}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="template-project-modal__empty">
                  {t('templates.noProjects')}
                </div>
              )}
              {templateProjectError ? (
                <div className="template-project-modal__error">{templateProjectError}</div>
              ) : null}
            </div>
            <footer className="template-project-modal__foot">
              <button
                type="button"
                className="secondary"
                onClick={closeTemplateProjectPicker}
              >
                {t('common.cancel')}
              </button>
              {sortedProjects.length > 0 ? (
                <button
                  type="button"
                  className="primary"
                  disabled={!templateProjectId || templateProjectSubmitting}
                  onClick={() => void startTemplateConversation()}
                >
                  {templateProjectSubmitting
                    ? t('common.loading')
                    : t('templates.startConversation')}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    closeTemplateProjectPicker();
                    setNewProjectOpen(true);
                  }}
                >
                  {t('entry.navNewProject')}
                </button>
              )}
            </footer>
          </div>
        </div>
      ) : null}
      <NewProjectModal
        open={newProjectOpen}
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={templates}
        promptTemplates={promptTemplates}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
        onOpenConnectorsTab={() => {
          setNewProjectOpen(false);
          openIntegrationTab('connectors');
        }}
        onClose={() => setNewProjectOpen(false)}
      />
    </div>
  );
}
