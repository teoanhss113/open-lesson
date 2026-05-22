import type { AppConfig, ConnectionTestResponse, ProviderModelsResponse } from '../../types';

export type SettingsSection =
  | 'execution'
  | 'media'
  | 'composio'
  | 'orbit'
  | 'routines'
  | 'integrations'
  | 'mcpClient'
  | 'language'
  | 'appearance'
  | 'curriculum'
  | 'critiqueTheater'
  | 'notifications'
  | 'pet'
  | 'skills'
  | 'designSystems'
  | 'memory'
  | 'privacy'
  | 'library'
  | 'about';

export interface AgentRefreshOptions {
  throwOnError?: boolean;
  agentCliEnv?: AppConfig['agentCliEnv'];
}

export type RescanNotice =
  | { kind: 'success'; count: number }
  | { kind: 'error' };

export type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };

export type ProviderModelsState =
  | { status: 'idle' }
  | { status: 'running'; cacheKey: string }
  | { status: 'done'; cacheKey: string; result: ProviderModelsResponse };

export interface OrbitRunStartResponse {
  projectId: string;
  agentRunId: string;
}


