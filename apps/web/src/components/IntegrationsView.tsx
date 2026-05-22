import { useEffect, useState } from 'react';
import type { AppConfig } from '../types';
import { useT } from '../i18n';
import { ConnectorSection } from './SettingsDialog';
import { Icon } from './Icon';
import { McpClientSection } from './McpClientSection';
import { PageHeader, UiTabs } from './UiPrimitives';
import { UseEverywhereGuidePanel } from './UseEverywhereModal';

export type IntegrationTab = 'mcp' | 'connectors' | 'skills' | 'use-everywhere';

interface Props {
  config: AppConfig;
  initialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
}

export function IntegrationsView({
  config,
  initialTab = 'mcp',
  composioConfigLoading = false,
  onPersistComposioKey,
}: Props) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<IntegrationTab>(initialTab);
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setLocalConfig((curr) => ({
      ...curr,
      composio: config.composio,
    }));
  }, [config.composio]);

  const liveDaemonUrl =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const tabs: ReadonlyArray<{ id: IntegrationTab; label: string; hint: string }> = [
    { id: 'mcp', label: t('integrations.tabMcp'), hint: t('integrations.tabMcpHint') },
    { id: 'connectors', label: t('integrations.tabConnectors'), hint: t('integrations.tabConnectorsHint') },
    { id: 'skills', label: t('integrations.tabSkills'), hint: t('integrations.tabSkillsHint') },
    { id: 'use-everywhere', label: t('integrations.tabUseEverywhere'), hint: t('integrations.tabUseEverywhereHint') },
  ];

  return (
    <section className="integrations-view" aria-labelledby="integrations-title">
      <PageHeader
        kicker={t('integrations.kicker')}
        title={<span id="integrations-title">{t('integrations.title')}</span>}
        lede={t('integrations.lede')}
        badge={{ icon: 'link', label: t('integrations.badge') }}
      />

      <UiTabs
        items={tabs}
        active={activeTab}
        ariaLabel={t('integrations.tabsAria')}
        testIdPrefix="integrations-tab"
        onChange={setActiveTab}
      />

      <div className="integrations-view__panel">
        {activeTab === 'mcp' ? <McpClientSection /> : null}

        {activeTab === 'connectors' ? (
          <ConnectorSection
            cfg={localConfig}
            setCfg={setLocalConfig}
            composioConfigLoading={composioConfigLoading}
            onPersistComposioKey={onPersistComposioKey}
          />
        ) : null}

        {activeTab === 'skills' ? <SkillsComingSoonPanel /> : null}

        {activeTab === 'use-everywhere' ? (
          <div className="integrations-view__use-everywhere">
            <UseEverywhereGuidePanel
              onOpenSettings={() => setActiveTab('mcp')}
              {...(liveDaemonUrl ? { daemonUrl: liveDaemonUrl } : {})}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SkillsComingSoonPanel() {
  const t = useT();
  return (
    <section className="integrations-view__coming-soon" aria-labelledby="integration-skills-title">
      <div className="integrations-view__coming-icon" aria-hidden="true">
        <Icon name="sparkles" size={22} />
      </div>
      <div>
        <p className="ui-kicker">{t('integrations.skillsComingSoon')}</p>
        <h2 id="integration-skills-title">{t('integrations.skillsTitle')}</h2>
        <p>
          {t('integrations.skillsBody')}
        </p>
      </div>
    </section>
  );
}
