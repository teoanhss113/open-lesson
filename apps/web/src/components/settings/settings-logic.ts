import { validateBaseUrl } from '@open-design/contracts/api/connectionTest';
import {
  KNOWN_PROVIDERS,
  DEFAULT_ORBIT,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from '../../state/config';
import type { KnownProvider } from '../../state/config';
import type { Locale } from '../../i18n';
import type {
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  ConnectionTestResponse,
  ProviderModelOption,
  ProviderModelsResponse,
} from '../../types';
import type { SettingsSection, AgentRefreshOptions, OrbitRunStartResponse } from './types';

export type ComposioCredentialState =
  | 'empty'
  | 'pending-new'
  | 'saved'
  | 'saved-pending';

export function codexPathStrings(locale: Locale) {
  if (locale === 'zh-CN') {
    return {
      repairHint: '当前保存的 Codex 路径不适合继续使用。',
      useDetected: '使用检测到的 Codex',
      clearCustom: '清空自定义路径',
      configuredSuccess: (path: string) => `本次测试使用的是已配置的 Codex 路径：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径无效或不可执行：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径启动失败：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
    };
  }
  if (locale === 'zh-TW') {
    return {
      repairHint: '目前儲存的 Codex 路徑不適合繼續使用。',
      useDetected: '使用偵測到的 Codex',
      clearCustom: '清除自訂路徑',
      configuredSuccess: (path: string) => `本次測試使用的是已設定的 Codex 路徑：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑無效或不可執行：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑啟動失敗：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
    };
  }
  return {
    repairHint: 'The saved Codex path is not the binary this test should keep using.',
    useDetected: 'Use detected Codex',
    clearCustom: 'Clear custom path',
    configuredSuccess: (path: string) =>
      `This test used the configured Codex path: ${path}.`,
    invalidFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path is invalid or not executable: ${configuredPath}. This test used the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
    failedFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path failed: ${configuredPath}. This test succeeded with the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
  };
}

export function sanitizeHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

// Map a test result to the visual severity of its inline status node so
// the same green/red/amber palette as the Rescan status applies.
export function testStatusVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

export function shouldShowCustomModelInput(
  modelValue: string,
  knownModelIds: readonly string[],
  explicitCustomMode: boolean,
): boolean {
  return (
    explicitCustomMode ||
    !modelValue ||
    !knownModelIds.includes(modelValue)
  );
}

export function canRunProviderConnectionTest(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
): boolean {
  return (
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim())
  );
}

export function canFetchProviderModels(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl'>,
  protocol: ApiProtocol,
): boolean {
  return (
    protocol !== 'azure' &&
    protocol !== 'ollama' &&
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    isValidApiBaseUrl(config.baseUrl)
  );
}

export function providerModelsCacheKey(
  protocol: ApiProtocol,
  baseUrl: string,
  apiKey: string,
  apiVersion = '',
): string {
  return [
    protocol,
    baseUrl.trim().replace(/\/+$/, ''),
    apiKey,
    protocol === 'azure' ? apiVersion.trim() : '',
  ].join('\n');
}

export function mergeProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  return out;
}

export function defaultApiProtocolConfig(protocol: ApiProtocol): ApiProtocolConfig {
  const provider = KNOWN_PROVIDERS.find((p) => p.protocol === protocol);
  return {
    apiKey: '',
    baseUrl: provider?.baseUrl ?? '',
    model: provider?.model ?? '',
    apiVersion: '',
    apiProviderBaseUrl: provider ? provider.baseUrl : null,
  };
}

export function providerFamilyLabel(provider: KnownProvider): string {
  return provider.label.replace(/\s+—\s+(Anthropic|OpenAI)$/u, '');
}

export function siblingProviderForProtocol(
  providerBaseUrl: string | null | undefined,
  protocol: ApiProtocol,
): KnownProvider | null {
  if (!providerBaseUrl) return null;
  const currentProvider = KNOWN_PROVIDERS.find(
    (p) => p.baseUrl === providerBaseUrl,
  );
  if (!currentProvider) return null;

  const currentFamily = providerFamilyLabel(currentProvider);
  return (
    KNOWN_PROVIDERS.find(
      (p) => p.protocol === protocol && providerFamilyLabel(p) === currentFamily,
    ) ?? null
  );
}

export function nextApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): ApiProtocolConfig {
  const savedConfig = config.apiProtocolConfigs?.[protocol];
  if (savedConfig) return savedConfig;

  const currentConfig = currentApiProtocolConfig(config);
  const siblingProvider = siblingProviderForProtocol(
    currentConfig.apiProviderBaseUrl,
    protocol,
  );
  if (siblingProvider) {
    return {
      ...defaultApiProtocolConfig(protocol),
      baseUrl: siblingProvider.baseUrl,
      model: siblingProvider.model,
      apiProviderBaseUrl: siblingProvider.baseUrl,
    };
  }

  if (currentConfig.apiProviderBaseUrl === null) {
    return {
      ...currentConfig,
      apiKey: '',
      apiVersion: protocol === 'azure' ? currentConfig.apiVersion : '',
      apiProviderBaseUrl: null,
    };
  }

  return {
    ...defaultApiProtocolConfig(protocol),
  };
}

export function currentApiProtocolConfig(config: AppConfig): ApiProtocolConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    apiVersion: config.apiVersion ?? '',
    apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
  };
}

export function applyApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    apiProtocol: protocol,
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: apiConfig.model,
    apiProviderBaseUrl: apiConfig.apiProviderBaseUrl ?? null,
    apiVersion: protocol === 'azure' ? (apiConfig.apiVersion ?? '') : '',
  };
}

export function isValidApiBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const result = validateBaseUrl(trimmed);
  return Boolean(result.parsed && !result.error);
}

export function updateCurrentApiProtocolConfig(
  config: AppConfig,
  patch: Partial<ApiProtocolConfig>,
): AppConfig {
  const protocol = config.apiProtocol ?? 'anthropic';
  const nextApiConfig: ApiProtocolConfig = {
    ...currentApiProtocolConfig(config),
    ...patch,
  };
  return applyApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextApiConfig,
      },
    },
    protocol,
    nextApiConfig,
  );
}

export function updateAgentCliEnvValue(
  config: AppConfig,
  agentId: string,
  envKey: string,
  rawValue: string,
): AppConfig {
  const value = rawValue.trim();
  const agentCliEnv = { ...(config.agentCliEnv ?? {}) };
  const nextAgentEnv = { ...(agentCliEnv[agentId] ?? {}) };
  if (value) {
    nextAgentEnv[envKey] = value;
  } else {
    delete nextAgentEnv[envKey];
  }

  if (Object.keys(nextAgentEnv).length > 0) {
    agentCliEnv[agentId] = nextAgentEnv;
  } else {
    delete agentCliEnv[agentId];
  }

  return {
    ...config,
    agentCliEnv: Object.keys(agentCliEnv).length > 0 ? agentCliEnv : {},
  };
}

export function agentRefreshOptionsForConfig(cfg: AppConfig): AgentRefreshOptions {
  return {
    throwOnError: true,
    agentCliEnv: cfg.agentCliEnv ?? {},
  };
}

export function providerModelsStatusVariant(
  result: ProviderModelsResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited' || result.kind === 'no_models') return 'warn';
  return 'error';
}

export function apiModelOptionLabel(model: ProviderModelOption): string {
  return model.label && model.label !== model.id
    ? `${model.label} (${model.id})`
    : model.id;
}

export function codexPathRepairState(
  result: ConnectionTestResponse,
): { detectedPath: string; canUseDetected: boolean } | null {
  if (!result.ok) return null;
  if (
    result.usedExecutableSource !== 'fallback_invalid' &&
    result.usedExecutableSource !== 'fallback_failed'
  ) {
    return null;
  }
  const detectedPath = result.detectedExecutablePath?.trim() || '';
  if (!detectedPath) return null;
  return {
    detectedPath,
    canUseDetected: true,
  };
}

export function shouldEnableSettingsSave(
  cfg: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): boolean {
  if (activeSection !== 'execution') return true;
  if (cfg.mode === 'daemon') {
    return Boolean(
      cfg.agentId && agents.find((a) => a.id === cfg.agentId)?.available,
    );
  }
  return Boolean(cfg.apiKey.trim() && cfg.model.trim() && isBaseUrlValid);
}

export function sanitizeSettingsSavePayload(
  cfg: AppConfig,
  initial: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): AppConfig {
  if (activeSection === 'execution') return cfg;
  const executionValid = shouldEnableSettingsSave(cfg, 'execution', agents, isBaseUrlValid);
  if (executionValid) return cfg;
  return {
    ...cfg,
    mode: initial.mode,
    apiKey: initial.apiKey,
    apiProtocol: initial.apiProtocol,
    apiVersion: initial.apiVersion,
    apiProtocolConfigs: initial.apiProtocolConfigs,
    apiProviderBaseUrl: initial.apiProviderBaseUrl,
    baseUrl: initial.baseUrl,
    model: initial.model,
    agentId: initial.agentId,
    agentCliEnv: initial.agentCliEnv,
    maxTokens: initial.maxTokens,
  };
}

export function switchApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): AppConfig {
  const currentProtocol = config.apiProtocol ?? 'anthropic';
  const apiProtocolConfigs = {
    ...(config.apiProtocolConfigs ?? {}),
    [currentProtocol]: currentApiProtocolConfig(config),
  };
  const nextApiConfig = nextApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs,
    },
    protocol,
  );
  return applyApiProtocolConfig(
    {
      ...config,
      mode: 'api',
      apiProtocolConfigs,
    },
    protocol,
    nextApiConfig,
  );
}

export function deriveComposioCredentialState(
  composio: { apiKey?: string; apiKeyConfigured?: boolean } | null | undefined,
): ComposioCredentialState {
  const hasPendingEdit = Boolean(composio?.apiKey?.trim());
  const hasSavedKey = Boolean(composio?.apiKeyConfigured);
  if (hasSavedKey && hasPendingEdit) return 'saved-pending';
  if (hasSavedKey) return 'saved';
  if (hasPendingEdit) return 'pending-new';
  return 'empty';
}

export async function persistConfigAndRunOrbit(
  config: AppConfig,
  options?: {
    daemonProviders?: AppConfig['mediaProviders'] | null;
    syncMediaProviders?: boolean;
  },
): Promise<OrbitRunStartResponse> {
  if (options?.syncMediaProviders !== false) {
    await syncMediaProvidersToDaemon(config.mediaProviders, {
      daemonProviders: options?.daemonProviders,
    });
  }
  await syncConfigToDaemon(config, { throwOnError: true });
  const response = await fetch('/api/orbit/run', { method: 'POST' });
  if (!response.ok) throw new Error('Orbit run failed');
  return await response.json() as OrbitRunStartResponse;
}

export function configForManualOrbitRun(config: AppConfig): AppConfig {
  const effectiveTemplateSkillId = config.orbit?.templateSkillId || DEFAULT_ORBIT.templateSkillId || '';
  if (!effectiveTemplateSkillId) return config;
  return {
    ...config,
    orbit: {
      ...(config.orbit ?? DEFAULT_ORBIT),
      templateSkillId: effectiveTemplateSkillId,
    },
  };
}

export function isOrbitRunDisabled(isBusy: boolean, connectedCount: number | null): boolean {
  return isBusy || connectedCount === null || connectedCount === 0;
}

