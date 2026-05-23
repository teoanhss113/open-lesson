import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../Icon';

type McpClientId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'vscode'
  | 'zed'
  | 'windsurf'
  | 'antigravity';

interface McpInstallInfo {
  command: string;
  args: string[];
  env?: Record<string, string>;
  daemonUrl: string;
  platform: 'darwin' | 'linux' | 'win32' | string;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
}

interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpClient {
  id: McpClientId;
  label: string;
  buildMethod: (info: McpInstallInfo) => string;
  buildInstruction: (info: McpInstallInfo) => string;
  buildSnippet: (info: McpInstallInfo) => string;
  buildSnippetLang: (info: McpInstallInfo) => 'bash' | 'json' | 'toml';
  buildDeeplink?: (info: McpInstallInfo) => string;
  deeplinkLabel?: () => string;
}

function homeConfigPath(
  platform: McpInstallInfo['platform'],
  posix: string,
  windows: string,
): string {
  return platform === 'win32' ? windows : posix;
}

function commandPaletteShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘⇧P' : 'Ctrl+Shift+P';
}

function settingsShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘,' : 'Ctrl+,';
}

function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function buildMcpStdioServerConfig(info: McpInstallInfo): McpStdioServerConfig {
  const env = info.env && Object.keys(info.env).length > 0 ? info.env : undefined;
  return {
    command: info.command,
    args: info.args,
    ...(env ? { env } : {}),
  };
}

function buildCodexEnvToml(info: McpInstallInfo): string {
  const entries = Object.entries(info.env ?? {});
  if (entries.length === 0) return '';
  return `

[mcp_servers.open-design.env]
${entries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}`;
}

function buildSharedMcpJson(info: McpInstallInfo): string {
  const inner = buildMcpStdioServerConfig(info);
  const innerJson = JSON.stringify(inner, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join('\n');
  return `{
  "mcpServers": {
    "open-design": ${innerJson}
  }
}`;
}

export function IntegrationsSection() {
  const { t } = useI18n();

  const MCP_CLIENTS: McpClient[] = [
    {
      id: 'claude',
      label: 'Claude Code',
      buildMethod: () => t('settings.mcpMethodCli'),
      buildInstruction: () => t('settings.mcpInstructionCli'),
      buildSnippet: (info) => {
        const inner = JSON.stringify(buildMcpStdioServerConfig(info));
        return `claude mcp add-json --scope user open-design '${inner}'`;
      },
      buildSnippetLang: () => 'bash',
    },
    {
      id: 'codex',
      label: 'Codex',
      buildMethod: () => t('settings.mcpMethodToml'),
      buildInstruction: (info) => {
        const path = homeConfigPath(
          info.platform,
          '~/.codex/config.toml',
          '%USERPROFILE%\\.codex\\config.toml',
        );
        return t('settings.mcpInstructionCodex', { path });
      },
      buildSnippet: (info) => `[mcp_servers.open-design]\ncommand = ${JSON.stringify(info.command)}\nargs = ${JSON.stringify(info.args)}${buildCodexEnvToml(info)}`,
      buildSnippetLang: () => 'toml',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      buildMethod: () => t('settings.mcpMethodOneClick'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionCursor', {
          path: homeConfigPath(info.platform, '~/.cursor/mcp.json', '%USERPROFILE%\\.cursor\\mcp.json'),
        }),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
      buildDeeplink: (info) => {
        const inner = buildMcpStdioServerConfig(info);
        const encoded = utf8Btoa(JSON.stringify(inner));
        return `cursor://anysphere.cursor-deeplink/mcp/install?name=open-design&config=${encoded}`;
      },
      deeplinkLabel: () => t('settings.mcpDeeplinkInstallCursor'),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionCopilot', {
          shortcut: commandPaletteShortcut(info.platform),
        }),
      buildSnippet: (info) => `{\n  "servers": {\n    "open-design": {\n      "type": "stdio",\n      "command": ${JSON.stringify(info.command)},\n      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,\n      "env": ${JSON.stringify(info.env)}` : ''}\n    }\n  }\n}`,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: () => t('settings.mcpInstructionAntigravity'),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'zed',
      label: 'Zed',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionZed', {
          shortcut: settingsShortcut(info.platform),
        }),
      buildSnippet: (info) => `{\n  "context_servers": {\n    "open-design": {\n      "source": "custom",\n      "command": ${JSON.stringify(info.command)},\n      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,\n      "env": ${JSON.stringify(info.env)}` : ''}\n    }\n  }\n}`,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionWindsurf', {
          path: homeConfigPath(info.platform, '~/.codeium/windsurf/mcp_config.json', '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json'),
        }),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
    },
  ];

  const [clientId, setClientId] = useState<McpClientId>('claude');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<McpInstallInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mcp/install-info')
      .then(async (res) => {
        if (!res.ok) throw new Error(`daemon ${res.status}`);
        return (await res.json()) as McpInstallInfo;
      })
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setInfoError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setInfoError(String(err && err.message ? err.message : err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const client = MCP_CLIENTS.find((c) => c.id === clientId) ?? MCP_CLIENTS[0]!;
  const snippet = info ? client.buildSnippet(info) : '';
  const snippetLang: 'bash' | 'json' | 'toml' = info
    ? client.buildSnippetLang(info)
    : 'json';

  useEffect(() => {
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [clientId]);

  const onCopy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="mcp-client-body">
        {infoError ? (
          <div className="empty-card mcp-error-card">
            {t('settings.mcpDaemonError', { error: infoError! })}
          </div>
        ) : null}

        <div className="mcp-capabilities-card">
          <p className="mcp-capabilities-label">
            {t('settings.mcpCapabilitiesTitle')}
          </p>
          <ul className="mcp-capabilities-list">
            <li>{t('settings.mcpCapabilityRead')}</li>
            <li>{t('settings.mcpCapabilityPull')}</li>
            <li>{t('settings.mcpCapabilityDefault')}</li>
          </ul>
        </div>

        <div className="mcp-setup-card">
          <div
            className="ds-picker"
            ref={pickerRef}
          >
            <button
              type="button"
              className={`ds-picker-trigger${pickerOpen ? ' open' : ''}`}
              onClick={() => setPickerOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
            >
              <span className="ds-picker-meta">
                <span className="ds-picker-title">{client.label}</span>
                <span className="ds-picker-sub">
                  {info ? client.buildMethod(info) : ''}
                </span>
              </span>
              <Icon
                name="chevron-down"
                size={14}
                className="ds-picker-chevron"
                style={{ transform: pickerOpen ? 'rotate(180deg)' : undefined }}
              />
            </button>
            {pickerOpen ? (
              <div className="ds-picker-popover" role="listbox">
                <div className="ds-picker-list">
                  {MCP_CLIENTS.map((c) => {
                    const active = c.id === clientId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`ds-picker-item${active ? ' active' : ''}`}
                        onClick={() => {
                          setClientId(c.id);
                          setPickerOpen(false);
                        }}
                      >
                        <span className="ds-picker-item-text">
                          <span className="ds-picker-item-title">{c.label}</span>
                          <span className="mcp-picker-label">
                            {info ? c.buildMethod(info) : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {info ? (
            <p className="mcp-build-instruction">{client.buildInstruction(info)}</p>
          ) : null}

          {client.buildDeeplink && info ? (
            <div className="mcp-deeplink-wrap">
              <button
                type="button"
                className="primary mcp-deeplink-btn"
                onClick={() => {
                  const url = client.buildDeeplink!(info);
                  const a = document.createElement('a');
                  a.href = url;
                  a.rel = 'noopener noreferrer';
                  a.click();
                }}
                disabled={!info.cliExists || !info.nodeExists}
              >
                <Icon name="link" size={14} />
                <span className="mcp-text-gap">{client.deeplinkLabel ? client.deeplinkLabel() : ''}</span>
              </button>
              <span className="mcp-gap-detail">
                {t('settings.mcpCursorApproval')}
              </span>
            </div>
          ) : null}

          <div className="mcp-code-wrap">
            <pre
              style={{
                background: 'var(--surface-2, #11141a)',
                color: 'var(--fg-1, #e6e6e6)',
                padding: 'var(--spacing-xxxl) 104px var(--spacing-sm) var(--spacing-sm)',
                borderRadius: 'var(--rounded-md)',
                overflowX: 'auto',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
                lineHeight: 1.55,
                margin: 0,
                userSelect: 'text',
                whiteSpace: snippetLang === 'bash' ? 'pre-wrap' : 'pre',
                wordBreak: snippetLang === 'bash' ? 'break-all' : 'normal',
                minHeight: 60,
              }}
              data-lang={snippetLang}
            >
              <code>
                {snippet ||
                  (infoError
                    ? t('settings.mcpResolvingFailed')
                    : t('settings.mcpLoadingPaths'))}
              </code>
            </pre>
            <button
              type="button"
              className="ghost mcp-copy-btn"
              onClick={onCopy}
              disabled={!snippet}
              aria-label={t('settings.mcpCopyAria')}
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              <span className="mcp-copy-label">{copied ? t('settings.mcpCopied') : t('settings.mcpCopy')}</span>
            </button>
          </div>

          {info && (!info.cliExists || !info.nodeExists) ? (
            <div
              className="empty-card mcp-warning-card"
            >
              <strong>
                {!info.cliExists
                  ? t('settings.mcpBuildDaemon')
                  : t('settings.mcpNodeMissing')}
              </strong>{' '}
              {info.buildHint ?? t('settings.mcpBuildHint')}
            </div>
          ) : null}

          <div className="mcp-restart-note">
            <strong>{t('settings.mcpRestartNote')}</strong>{' '}
            <span className="text-muted">{t('settings.mcpRestartDetail')}</span>
          </div>

          <p className="mcp-running-note">
            {t('settings.mcpRunningNote')}
          </p>
        </div>
      </div>
    </section>
  );
}
