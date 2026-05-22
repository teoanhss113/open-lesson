import { useMemo, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../i18n';
import { useAnalytics } from '../../analytics/provider';
import {
  agentIdToTracking,
  executionModeToTracking,
} from '@open-design/contracts/analytics';
import {
  trackSettingsClickByokField,
  trackSettingsClickByokProviderOption,
  trackSettingsClickCliProviderCard,
  trackSettingsClickExecutionModeTab,
} from '../../analytics/events';
import { Icon } from '../Icon';
import { AgentIcon } from '../AgentIcon';
import { MemoryModelInline } from '../MemoryModelInline';
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_LABELS,
  API_PROTOCOL_TABS,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../../state/apiProtocols';
import {
  CUSTOM_MODEL_SENTINEL,
  renderModelOptions,
} from '../modelOptions';
import { KNOWN_PROVIDERS } from '../../state/config';
import type {
  AgentInfo,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  ProviderModelOption,
  ConnectionTestResponse,
  ProviderModelsResponse,
  ExecMode,
} from '../../types';
import type { RescanNotice, TestState, ProviderModelsState } from './types';
import {
  sanitizeHttpsUrl,
  testStatusVariant,
  shouldShowCustomModelInput,
  canRunProviderConnectionTest,
  canFetchProviderModels,
  providerModelsCacheKey,
  mergeProviderModelOptions,
  updateAgentCliEnvValue,
  providerModelsStatusVariant,
  apiModelOptionLabel,
  codexPathRepairState,
  codexPathStrings,
  isValidApiBaseUrl,
} from './settings-logic';

const AGENT_CLI_ENV_FIELDS = [
  {
    agentId: 'claude',
    envKey: 'CLAUDE_CONFIG_DIR',
    labelKey: 'settings.cliEnvClaudeConfigDir',
    placeholder: '~/.claude-2',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_BASE_URL',
    labelKey: 'settings.cliEnvClaudeBaseUrl',
    placeholder: 'https://your-proxy.example.com',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_API_KEY',
    labelKey: 'settings.cliEnvClaudeApiKey',
    placeholder: 'Paste proxy API key',
    secret: true,
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_HOME',
    labelKey: 'settings.cliEnvCodexHome',
    placeholder: '~/.codex-alt',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_BIN',
    labelKey: 'settings.cliEnvCodexBin',
    placeholder: '/absolute/path/to/codex',
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_BASE_URL',
    labelKey: 'settings.cliEnvCodexBaseUrl',
    placeholder: 'https://your-proxy.example.com/v1',
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_API_KEY',
    labelKey: 'settings.cliEnvCodexApiKey',
    placeholder: 'Paste proxy API key',
    secret: true,
  },
] as const;

export function ExecutionSection({
  cfg,
  setCfg,
  daemonLive,
  agents,
  agentTestState,
  setAgentTestState,
  agentRescanRunning,
  handleRefreshAgents,
  agentRescanNotice,
  handleTestAgent,
  apiProtocol,
  setApiProtocol,
  updateApiConfig,
  providerTestState,
  handleTestProvider,
  providerModelsState,
  handleFetchProviderModels,
  providerModelsCache,
  apiModelCustomEditing,
  setApiModelCustomEditing,
  agentCustomModelIds,
  setAgentCustomModelIds,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  daemonLive: boolean;
  agents: AgentInfo[];
  agentTestState: TestState;
  setAgentTestState: Dispatch<SetStateAction<TestState>>;
  agentRescanRunning: boolean;
  handleRefreshAgents: () => Promise<void>;
  agentRescanNotice: RescanNotice | null;
  handleTestAgent: () => Promise<void>;
  apiProtocol: ApiProtocol;
  setApiProtocol: (protocol: ApiProtocol) => void;
  updateApiConfig: (patch: Partial<ApiProtocolConfig>) => void;
  providerTestState: TestState;
  handleTestProvider: () => Promise<void>;
  providerModelsState: ProviderModelsState;
  handleFetchProviderModels: () => Promise<void>;
  providerModelsCache: Record<string, ProviderModelOption[]>;
  apiModelCustomEditing: boolean;
  setApiModelCustomEditing: Dispatch<SetStateAction<boolean>>;
  agentCustomModelIds: ReadonlySet<string>;
  setAgentCustomModelIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  const [showApiKey, setShowApiKey] = useState(false);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => {
    setCfg((c) => {
      const modeBefore = executionModeToTracking(c.mode);
      const modeAfter = executionModeToTracking(mode);
      if (modeBefore !== modeAfter) {
        trackSettingsClickExecutionModeTab(analytics.track, {
          page: 'settings',
          area: 'execution_model',
          element: 'execution_mode_tab',
          action: 'switch_execution_mode',
          mode_before: modeBefore,
          mode_after: modeAfter,
        });
      }
      return { ...c, mode };
    });
  };

  const applyCodexDetectedPath = (detectedPath: string) => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', detectedPath));
    setAgentTestState({ status: 'idle' });
  };

  const clearCodexCustomPath = () => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', ''));
    setAgentTestState({ status: 'idle' });
  };

  const renderTestMessage = (
    result: ConnectionTestResponse,
    kindForSuccess: 'api' | 'cli',
  ): string => {
    const ms = Math.max(0, Math.round(result.latencyMs));
    const sample = result.sample ?? '';
    const agentName = result.agentName ?? '';
    const testedModel = result.model ?? cfg.model;
    if (result.ok) {
      const baseMessage = kindForSuccess === 'api'
        ? t('settings.testSuccessApi', { ms, sample })
        : t('settings.testSuccessCli', { agentName, ms, sample });
      if (kindForSuccess === 'cli' && cfg.agentId === 'codex') {
        const codexStrings = codexPathStrings(locale);
        if (
          result.usedExecutableSource === 'configured' &&
          result.configuredExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.configuredSuccess(result.configuredExecutablePath)}`;
        }
        if (
          result.usedExecutableSource === 'fallback_invalid' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.invalidFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
        if (
          result.usedExecutableSource === 'fallback_failed' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.failedFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
      }
      return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
    }
    switch (result.kind) {
      case 'auth_failed':
        return t('settings.testAuthFailed');
      case 'forbidden':
        return t('settings.testForbidden');
      case 'not_found_model':
        return t('settings.testNotFoundModel', { model: testedModel });
      case 'invalid_model_id':
        return t('settings.testInvalidModelId', { model: testedModel });
      case 'invalid_base_url':
        return t('settings.testInvalidBaseUrl');
      case 'rate_limited':
        return t('settings.testRateLimited');
      case 'upstream_unavailable':
        return t('settings.testUpstream', { status: result.status ?? 0 });
      case 'timeout':
        return t('settings.testTimeout', { ms });
      case 'agent_not_installed':
        return t('settings.testAgentMissing', { agentName });
      case 'agent_auth_required':
        return result.detail || 'Agent authentication is required.';
      case 'agent_spawn_failed':
        return t('settings.testAgentSpawn', {
          agentName,
          detail: result.detail ?? '',
        });
      default:
        return t('settings.testUnknown', { detail: result.detail ?? '' });
    }
  };

  const renderProviderModelsMessage = (
    result: ProviderModelsResponse,
  ): string => {
    if (result.ok) {
      return t('settings.fetchModelsSuccess', {
        count: result.models?.length ?? 0,
      });
    }
    switch (result.kind) {
      case 'auth_failed':
        return t('settings.testAuthFailed');
      case 'forbidden':
        return t('settings.testForbidden');
      case 'invalid_base_url':
        return t('settings.testInvalidBaseUrl');
      case 'rate_limited':
        return t('settings.testRateLimited');
      case 'upstream_unavailable':
        return t('settings.testUpstream', { status: result.status ?? 0 });
      case 'timeout':
        return t('settings.testTimeout', {
          ms: Math.max(0, Math.round(result.latencyMs)),
        });
      case 'no_models':
        return t('settings.fetchModelsEmpty');
      case 'unsupported_protocol':
        return t('settings.fetchModelsUnsupported');
      default:
        return t('settings.fetchModelsFailed', { detail: result.detail ?? '' });
    }
  };

  // Derive execution BYOK sub-variables
  const protocolProviders = useMemo(
    () => KNOWN_PROVIDERS.filter((p) => p.protocol === apiProtocol),
    [apiProtocol],
  );

  const selectedProviderIndex =
    cfg.apiProviderBaseUrl == null
      ? -1
      : protocolProviders.findIndex(
          (p) => p.baseUrl === cfg.apiProviderBaseUrl && p.baseUrl === cfg.baseUrl,
        );

  const selectedProvider = selectedProviderIndex >= 0 ? protocolProviders[selectedProviderIndex] : undefined;

  const providerModelsKey = useMemo(
    () => providerModelsCacheKey(
      apiProtocol,
      cfg.baseUrl,
      cfg.apiKey,
      cfg.apiVersion ?? '',
    ),
    [apiProtocol, cfg.baseUrl, cfg.apiKey, cfg.apiVersion],
  );

  const fetchedApiModelOptions = providerModelsCache[providerModelsKey] ?? [];

  const suggestedApiModelIds = useMemo(
    () => Array.from(new Set(
      selectedProvider?.models?.length
        ? selectedProvider.models
        : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    )),
    [apiProtocol, selectedProvider],
  );

  const apiModelOptions = useMemo(
    () => mergeProviderModelOptions(
      fetchedApiModelOptions,
      suggestedApiModelIds,
    ),
    [fetchedApiModelOptions, suggestedApiModelIds],
  );

  const apiModelIds = useMemo(
    () => apiModelOptions.map((m) => m.id),
    [apiModelOptions],
  );

  const apiModelCustomActive = shouldShowCustomModelInput(
    cfg.model,
    apiModelIds,
    apiModelCustomEditing,
  );

  const apiModelSelectValue = apiModelCustomActive
    ? CUSTOM_MODEL_SENTINEL
    : cfg.model;

  const baseUrlValid = isValidApiBaseUrl(cfg.baseUrl);
  const baseUrlInvalid = Boolean(cfg.baseUrl.trim() && !baseUrlValid);

  return (
    <>
      <div
        className="seg-control"
        role="tablist"
        aria-label={t('settings.modeAria')}
        style={{ ['--seg-cols' as string]: 2 } as CSSProperties}
      >
        <button
          type="button"
          role="tab"
          aria-selected={cfg.mode === 'daemon'}
          className={
            'seg-btn seg-btn--inline' +
            (cfg.mode === 'daemon' ? ' active' : '')
          }
          disabled={!daemonLive}
          onClick={() => setMode('daemon')}
          title={
            daemonLive
              ? t('settings.modeDaemonHelp')
              : t('settings.modeDaemonOffline')
          }
        >
          <span className="seg-title">{t('settings.localCli')}</span>
          <span className="seg-meta">
            {daemonLive
              ? t('settings.modeDaemonInstalledMeta', { count: installedCount })
              : t('settings.modeDaemonOfflineMeta')}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cfg.mode === 'api'}
          className={
            'seg-btn seg-btn--inline' +
            (cfg.mode === 'api' ? ' active' : '')
          }
          onClick={() => setMode('api')}
        >
          <span className="seg-title">{t('settings.modeApiMeta')}</span>
          <span className="seg-meta">{t('settings.modeApi')}</span>
        </button>
      </div>

      {cfg.mode === 'api' ? (
        <div
          className="protocol-chips"
          role="tablist"
          aria-label={t('settings.protocolAria')}
        >
          {API_PROTOCOL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={apiProtocol === tab.id}
              className={'protocol-chip' + (apiProtocol === tab.id ? ' active' : '')}
              onClick={() => {
                trackSettingsClickByokProviderOption(analytics.track, {
                  page: 'settings',
                  area: 'execution_model',
                  element: 'byok_provider_option',
                  action: 'select_byok_provider',
                  provider_id: tab.id,
                  is_selected: apiProtocol === tab.id,
                });
                setApiProtocol(tab.id);
              }}
            >
              {tab.title}
            </button>
          ))}
        </div>
      ) : null}

      {cfg.mode === 'daemon' ? (
        <section className="settings-section">
          <div className="section-head">
            <div>
              <p className="hint">{t('settings.codeAgentHint')}</p>
            </div>
            <div className="section-head-actions">
              {(() => {
                const selected = agents.find(
                  (a) => a.id === cfg.agentId && a.available,
                );
                const running = agentTestState.status === 'running';
                const disabled = running || !selected;
                return (
                  <button
                    type="button"
                    className={
                      'ghost icon-btn settings-test-btn' +
                      (running ? ' loading' : '')
                    }
                    onClick={() => void handleTestAgent()}
                    disabled={disabled}
                    title={t('settings.testTitle')}
                  >
                    {running ? (
                      <>
                        <Icon
                          name="spinner"
                          size={13}
                          className="icon-spin"
                        />
                        <span>{t('settings.test')}</span>
                      </>
                    ) : (
                      t('settings.test')
                    )}
                  </button>
                );
              })()}
              <button
                type="button"
                className={
                  'ghost icon-btn settings-rescan-btn' +
                  (agentRescanRunning ? ' loading' : '')
                }
                onClick={() => void handleRefreshAgents()}
                disabled={agentRescanRunning}
                title={t('settings.rescanTitle')}
              >
                {agentRescanRunning ? (
                  <>
                    <Icon name="spinner" size={13} className="icon-spin" />
                    <span>{t('settings.rescanRunning')}</span>
                  </>
                ) : (
                  t('settings.rescan')
                )}
              </button>
            </div>
          </div>

          {agentRescanNotice ? (
            <p
              className={
                'settings-rescan-status ' + agentRescanNotice.kind
              }
              role={
                agentRescanNotice.kind === 'error' ? 'alert' : 'status'
              }
            >
              {agentRescanNotice.kind === 'success'
                ? t('settings.rescanSuccess', {
                    count: agentRescanNotice.count,
                  })
                : t('settings.rescanFailed')}
            </p>
          ) : null}

          {agents.length === 0 ? (
            <div className="empty-card">
              {t('settings.noAgentsDetected')}
            </div>
          ) : (
            <>
              <div className="agent-grid">
                {agents.flatMap((a) => {
                  const active = cfg.agentId === a.id;
                  const cardEl = a.available ? (
                    <button
                      type="button"
                      key={a.id}
                      className={
                        'agent-card' + (active ? ' active' : '')
                      }
                      onClick={() => {
                        trackSettingsClickCliProviderCard(analytics.track, {
                          page: 'settings',
                          area: 'execution_model',
                          element: 'cli_provider_card',
                          action: 'select_cli_provider',
                          cli_provider_id: agentIdToTracking(a.id),
                          install_status: a.available ? 'installed' : 'not_installed',
                          is_selected: !active,
                        });
                        setCfg((c) => ({ ...c, agentId: a.id }));
                      }}
                      aria-pressed={active}
                    >
                      <AgentIcon id={a.id} size={32} />
                      <div className="agent-card-body">
                        <div className="agent-card-name">{a.name}</div>
                        <div className="agent-card-meta">
                          {a.authStatus === 'missing' ? (
                            <span title={a.authMessage ?? a.path ?? ''}>
                              {t('settings.agentAuthRequired')}
                            </span>
                          ) : a.authStatus === 'unknown' ? (
                            <span title={a.authMessage ?? a.path ?? ''}>
                              {t('settings.agentAuthUnknown')}
                            </span>
                          ) : a.version ? (
                            <span title={a.path ?? ''}>{a.version}</span>
                          ) : (
                            <span title={a.path ?? ''}>
                              {t('common.installed')}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={
                          'status-dot' + (active ? ' active' : '')
                        }
                        aria-hidden="true"
                      />
                    </button>
                  ) : (() => {
                    const installUrl = sanitizeHttpsUrl(a.installUrl);
                    const docsUrl = sanitizeHttpsUrl(a.docsUrl);
                    const hasLinks = Boolean(installUrl || docsUrl);
                    const cardLabel = `${a.name} · ${t('common.notInstalled')}`;
                    return (
                      <div
                        key={a.id}
                        className="agent-card disabled agent-card-unavailable"
                        role="group"
                        aria-label={cardLabel}
                      >
                        <AgentIcon id={a.id} size={40} />
                        <div className="agent-card-body">
                          <div className="agent-card-name">{a.name}</div>
                        </div>
                        {hasLinks ? (
                          <div className="agent-card-actions agent-card-actions--inline">
                            {docsUrl ? (
                              <a
                                href={docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="agent-card-link agent-card-link--muted"
                              >
                                {t('settings.agentInstall.docs')}
                              </a>
                            ) : null}
                            {installUrl ? (
                              <a
                                href={installUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="agent-card-link agent-card-link--ghost"
                              >
                                {t('settings.agentInstall.install')}
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })();

                  if (
                    active &&
                    a.available &&
                    agentTestState.status !== 'idle'
                  ) {
                    const resultRow = (
                      <div
                        key={`${a.id}__test-result`}
                        className="agent-test-result-row"
                      >
                        {agentTestState.status === 'running' ? (
                          <p
                            className="settings-test-status running"
                            role="status"
                            aria-live="polite"
                          >
                            {t('settings.testRunning')}
                          </p>
                        ) : (
                          <>
                            <p
                              className={
                                'settings-test-status ' +
                                testStatusVariant(agentTestState.result)
                              }
                              role={
                                agentTestState.result.ok
                                  ? 'status'
                                  : 'alert'
                              }
                            >
                              {renderTestMessage(
                                agentTestState.result,
                                'cli',
                              )}
                            </p>
                            {cfg.agentId === 'codex' && (() => {
                              const repair = codexPathRepairState(
                                agentTestState.result,
                              );
                              if (!repair) return null;
                              const codexStrings = codexPathStrings(locale);
                              return (
                                <div className="settings-test-actions">
                                  <span className="settings-test-actions-hint">
                                    {codexStrings.repairHint}
                                  </span>
                                  <div className="settings-test-actions-row">
                                    {repair.canUseDetected ? (
                                      <button
                                        type="button"
                                        className="settings-test-btn"
                                        onClick={() =>
                                          applyCodexDetectedPath(
                                            repair.detectedPath,
                                          )
                                        }
                                      >
                                        {codexStrings.useDetected}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="ghost icon-btn settings-rescan-btn"
                                      onClick={clearCodexCustomPath}
                                    >
                                      {codexStrings.clearCustom}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    );
                    return [cardEl, resultRow];
                  }
                  return [cardEl];
                })}
              </div>

              {!agents.find(
                (a) => a.id === cfg.agentId && a.available,
              ) ? (
                <div className="agent-install-guide">
                  <p className="hint agent-install-path-hint">
                    {t('settings.agentInstall.pathHint')}
                  </p>
                  <ol className="agent-install-steps">
                    <li>{t('settings.agentInstall.stepOpenLinks')}</li>
                    <li>{t('settings.agentInstall.stepAuth')}</li>
                    <li>{t('settings.agentInstall.stepRescan')}</li>
                    <li>{t('settings.agentInstall.stepSelect')}</li>
                  </ol>
                </div>
              ) : null}
            </>
          )}

          {(() => {
            const selected = agents.find(
              (a) => a.id === cfg.agentId && a.available,
            );
            if (!selected) return null;
            const hasModels =
              Array.isArray(selected.models) && selected.models.length > 0;
            const hasReasoning =
              Array.isArray(selected.reasoningOptions) &&
              selected.reasoningOptions.length > 0;
            if (!hasModels && !hasReasoning) return null;
            const choice = cfg.agentModels?.[selected.id] ?? {};
            const setChoice = (
              next: { model?: string; reasoning?: string },
            ) => {
              setCfg((c) => {
                const prev = c.agentModels?.[selected.id] ?? {};
                return {
                  ...c,
                  agentModels: {
                    ...(c.agentModels ?? {}),
                    [selected.id]: { ...prev, ...next },
                  },
                };
              });
            };
            const modelValue =
              choice.model ?? selected.models?.[0]?.id ?? '';
            const reasoningValue =
              choice.reasoning ??
              selected.reasoningOptions?.[0]?.id ?? '';
            const customActive =
              hasModels &&
              shouldShowCustomModelInput(
                modelValue,
                selected.models!.map((m) => m.id),
                agentCustomModelIds.has(selected.id),
              );
            const selectValue = customActive
              ? CUSTOM_MODEL_SENTINEL
              : modelValue;
            return (
              <div className="agent-model-row">
                <div className="agent-model-row-head">
                  {t('settings.agentModelHead')} <strong>{selected.name}</strong>
                </div>
                {hasModels ? (
                  <>
                    <label className="field">
                      <span className="field-label">
                        {t('settings.modelPicker')}
                      </span>
                      <div className="agent-model-select-wrap">
                        <select
                          value={selectValue}
                          onChange={(e) => {
                            if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                              setAgentCustomModelIds((prev) => {
                                const next = new Set(prev);
                                next.add(selected.id);
                                return next;
                              });
                              setChoice({ model: '' });
                            } else {
                              setAgentCustomModelIds((prev) => {
                                if (!prev.has(selected.id)) return prev;
                                const next = new Set(prev);
                                next.delete(selected.id);
                                return next;
                              });
                              setChoice({ model: e.target.value });
                            }
                          }}
                        >
                          {renderModelOptions(selected.models!)}
                          <option value={CUSTOM_MODEL_SENTINEL}>
                            {t('settings.modelCustom')}
                          </option>
                        </select>
                        <Icon
                          name="chevron-down"
                          size={12}
                          className="agent-model-select-chevron"
                        />
                      </div>
                    </label>
                    <p className="hint agent-model-row-hint">
                      {t('settings.modelPickerHint')}
                    </p>
                  </>
                ) : null}
                {customActive ? (
                  <label className="field">
                    <span className="field-label">
                      {t('settings.modelCustomLabel')}
                    </span>
                    <input
                      type="text"
                      value={modelValue}
                      placeholder={t('settings.modelCustomPlaceholder')}
                      onChange={(e) =>
                        setChoice({ model: e.target.value.trim() })
                      }
                    />
                  </label>
                ) : null}
                {hasReasoning ? (
                  <label className="field">
                    <span className="field-label">
                      {t('settings.reasoningPicker')}
                    </span>
                    <div className="agent-model-select-wrap">
                      <select
                        value={reasoningValue}
                        onChange={(e) =>
                          setChoice({ reasoning: e.target.value })
                        }
                      >
                        {selected.reasoningOptions!.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <Icon
                        name="chevron-down"
                        size={12}
                        className="agent-model-select-chevron"
                      />
                    </div>
                  </label>
                ) : null}
                <MemoryModelInline
                  mode="daemon"
                  apiProtocol={apiProtocol}
                  chatApiKey={cfg.apiKey}
                  chatBaseUrl={cfg.baseUrl}
                  chatApiVersion={cfg.apiVersion ?? ''}
                  chatModel={modelValue}
                  cliAgentId={selected.id}
                  cliModelOptions={
                    hasModels
                      ? selected.models!.map((m) => m.id)
                      : []
                  }
                />
              </div>
            );
          })()}

          {(() => {
            const cliEnvFields = AGENT_CLI_ENV_FIELDS.filter(
              (field) => field.agentId === cfg.agentId,
            );
            if (cliEnvFields.length === 0) return null;
            return (
              <details className="agent-cli-env">
                <summary className="agent-cli-env-summary">
                  <span className="agent-cli-env-summary-title">
                    {t('settings.cliEnvTitle')}
                  </span>
                </summary>
                <div className="agent-cli-env-body">
                  <p className="hint">{t('settings.cliEnvHint')}</p>
                  <div className="agent-cli-env-grid">
                    {cliEnvFields.map((field) => (
                      <label
                        className="field"
                        key={`${field.agentId}:${field.envKey}`}
                      >
                        <span className="field-label">
                          {t(field.labelKey)}
                        </span>
                        <input
                          type={
                            'secret' in field && field.secret
                              ? 'password'
                              : 'text'
                          }
                          value={
                            cfg.agentCliEnv?.[field.agentId]?.[
                              field.envKey
                            ] ?? ''
                          }
                          placeholder={field.placeholder}
                          spellCheck={false}
                          autoComplete="off"
                          onChange={(e) =>
                            setCfg((c) =>
                              updateAgentCliEnvValue(
                                c,
                                field.agentId,
                                field.envKey,
                                e.target.value,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            );
          })()}
        </section>
      ) : (
        <section className="settings-section settings-section-card settings-section-byok">
          <div className="section-head">
            <div>
              <h3>{API_PROTOCOL_LABELS[apiProtocol]}</h3>
            </div>
            <div className="section-head-actions">
              {(() => {
                const running =
                  providerModelsState.status === 'running' &&
                  providerModelsState.cacheKey === providerModelsKey;
                const disabled =
                  providerModelsState.status === 'running' ||
                  !canFetchProviderModels(cfg, apiProtocol);
                return (
                  <button
                    type="button"
                    className={
                      'ghost icon-btn settings-fetch-models-btn' +
                      (running ? ' loading' : '')
                    }
                    onClick={() => void handleFetchProviderModels()}
                    disabled={disabled}
                    title={t('settings.fetchModelsTitle')}
                  >
                    {running ? (
                      <>
                        <Icon
                          name="spinner"
                          size={13}
                          className="icon-spin"
                        />
                        <span>{t('settings.fetchModelsRunning')}</span>
                      </>
                    ) : (
                      t('settings.fetchModels')
                    )}
                  </button>
                );
              })()}
              {(() => {
                const running = providerTestState.status === 'running';
                const hasRequired = canRunProviderConnectionTest(cfg);
                const disabled = running || !hasRequired;
                return (
                  <button
                    type="button"
                    className={
                      'ghost icon-btn settings-test-btn' +
                      (running ? ' loading' : '')
                    }
                    onClick={() => void handleTestProvider()}
                    disabled={disabled}
                    title={t('settings.testTitle')}
                  >
                    {running ? (
                      <>
                        <Icon
                          name="spinner"
                          size={13}
                          className="icon-spin"
                        />
                        <span>{t('settings.test')}</span>
                      </>
                    ) : (
                      t('settings.test')
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
          {providerTestState.status === 'running' ? (
            <p
              className="settings-test-status running"
              role="status"
              aria-live="polite"
            >
              {t('settings.testRunning')}
            </p>
          ) : providerTestState.status === 'done' ? (
            <p
              className={
                'settings-test-status ' +
                testStatusVariant(providerTestState.result)
              }
              role={providerTestState.result.ok ? 'status' : 'alert'}
            >
              {renderTestMessage(providerTestState.result, 'api')}
            </p>
          ) : null}
          {providerModelsState.status === 'running' &&
          providerModelsState.cacheKey === providerModelsKey ? (
            <p
              className="settings-test-status running"
              role="status"
              aria-live="polite"
            >
              {t('settings.fetchModelsRunning')}
            </p>
          ) : providerModelsState.status === 'done' &&
            providerModelsState.cacheKey === providerModelsKey ? (
            <p
              className={
                'settings-test-status ' +
                providerModelsStatusVariant(providerModelsState.result)
              }
              role={providerModelsState.result.ok ? 'status' : 'alert'}
            >
              {renderProviderModelsMessage(providerModelsState.result)}
            </p>
          ) : null}
          <label className="field">
            <span className="field-label">{t('settings.quickFillProvider')}</span>
            <select
              value={selectedProviderIndex >= 0 ? String(selectedProviderIndex) : ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  setApiModelCustomEditing(false);
                  updateApiConfig({
                    baseUrl: '',
                    model: '',
                    apiProviderBaseUrl: null,
                  });
                  return;
                }
                const idx = Number(e.target.value);
                if (!isNaN(idx) && protocolProviders[idx]) {
                  const p = protocolProviders[idx]!;
                  setApiModelCustomEditing(false);
                  updateApiConfig({
                    baseUrl: p.baseUrl,
                    model: p.model,
                    apiProviderBaseUrl: p.baseUrl,
                  });
                }
              }}
            >
              <option value="">{t('settings.customProvider')}</option>
              {protocolProviders.map((p, i) => (
                <option key={p.label} value={i}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('settings.apiKey')}</span>
            <div className="field-row">
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder={API_KEY_PLACEHOLDERS[apiProtocol]}
                value={cfg.apiKey}
                onChange={(e) => updateApiConfig({ apiKey: e.target.value })}
                onFocus={() => {
                  trackSettingsClickByokField(analytics.track, {
                    page: 'settings',
                    area: 'execution_model',
                    element: 'byok_field',
                    action: 'focus_byok_field',
                    field_id: 'api_key',
                    provider_id: apiProtocol,
                    has_value: Boolean(cfg.apiKey?.trim()),
                  });
                }}
                autoFocus
              />
              <button
                type="button"
                className="ghost icon-btn"
                onClick={() => setShowApiKey((v) => !v)}
                title={
                  showApiKey ? t('settings.hideKey') : t('settings.showKey')
                }
              >
                {showApiKey ? t('settings.hide') : t('settings.show')}
              </button>
            </div>
          </label>
          <label className="field">
            <span className="field-label">
              {apiProtocol === 'azure'
                ? t('settings.azureDeploymentModel')
                : t('settings.model')}
            </span>
            <select
              value={apiModelSelectValue}
              onFocus={() => {
                trackSettingsClickByokField(analytics.track, {
                  page: 'settings',
                  area: 'execution_model',
                  element: 'byok_field',
                  action: 'focus_byok_field',
                  field_id: 'model',
                  provider_id: apiProtocol,
                  has_value: Boolean(cfg.model?.trim()),
                });
              }}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                  setApiModelCustomEditing(true);
                  updateApiConfig({ model: '' });
                } else {
                  setApiModelCustomEditing(false);
                  updateApiConfig({ model: e.target.value });
                }
              }}
            >
              {apiModelOptions.map((m) => (
                <option value={m.id} key={m.id}>{apiModelOptionLabel(m)}</option>
              ))}
              <option value={CUSTOM_MODEL_SENTINEL}>{t('settings.modelCustom')}</option>
            </select>
          </label>
          {!selectedProvider ? (
            <p className="hint">{t('settings.suggestedModelsHint')}</p>
          ) : null}
          {apiProtocol === 'azure' ? (
            <p className="hint">{t('settings.azureModelFetchHint')}</p>
          ) : null}
          {apiProtocol === 'ollama' ? (
            <p className="hint">{t('settings.fetchModelsUnsupported')}</p>
          ) : null}
          {apiModelCustomActive ? (
            <label className="field">
              <span className="field-label">{t('settings.modelCustomLabel')}</span>
              <input
                type="text"
                value={cfg.model}
                placeholder={t('settings.modelCustomPlaceholder')}
                onChange={(e) => updateApiConfig({ model: e.target.value.trim() })}
              />
            </label>
          ) : null}
          <MemoryModelInline
            mode="api"
            apiProtocol={apiProtocol}
            chatApiKey={cfg.apiKey}
            chatBaseUrl={cfg.baseUrl}
            chatApiVersion={cfg.apiVersion ?? ''}
            chatModel={cfg.model}
          />
          <label className="field">
            <span className="field-label">{t('settings.baseUrl')}</span>
            <input
              type="url"
              inputMode="url"
              value={cfg.baseUrl}
              aria-invalid={baseUrlInvalid || undefined}
              aria-describedby={
                baseUrlInvalid ? 'settings-base-url-error' : undefined
              }
              onFocus={() => {
                trackSettingsClickByokField(analytics.track, {
                  page: 'settings',
                  area: 'execution_model',
                  element: 'byok_field',
                  action: 'focus_byok_field',
                  field_id: 'base_url',
                  provider_id: apiProtocol,
                  has_value: Boolean(cfg.baseUrl?.trim()),
                });
              }}
              onChange={(e) => updateApiConfig({ baseUrl: e.target.value, apiProviderBaseUrl: null })}
            />
            {baseUrlInvalid ? (
              <span
                id="settings-base-url-error"
                className="settings-field-error"
                role="alert"
              >
                {t('settings.baseUrlInvalid')}
              </span>
            ) : null}
          </label>
          {apiProtocol === 'azure' ? (
            <label className="field">
              <span className="field-label">{t('settings.apiVersion')}</span>
              <input
                type="text"
                value={cfg.apiVersion ?? ''}
                placeholder="2024-10-21"
                onChange={(e) => updateApiConfig({ apiVersion: e.target.value.trim() })}
              />
            </label>
          ) : null}
          <p className="hint">{t('settings.apiHint')}</p>
        </section>
      )}
    </>
  );
}
