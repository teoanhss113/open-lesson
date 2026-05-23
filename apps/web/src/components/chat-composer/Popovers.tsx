import { useEffect, useRef, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { ProjectFile, SkillSummary } from '../../types';
import type { McpServerConfig } from '../../state/mcp';
import type { TranslateFn, SlashCommand, MentionTab } from './types';
import { Icon } from '../Icon';
import { pluginSourceLabel, prettySize } from './utils';

export function SlashPopover({
  commands,
  activeIndex,
  onPick,
  onHover,
  t,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onPick: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
  t: TranslateFn;
}) {
  return (
    <div
      className="slash-popover"
      data-testid="slash-popover"
      role="listbox"
      aria-label={t('pet.slashPopoverAria')}
    >
      <div className="slash-popover-head">
        <span>{t('pet.slashPopoverTitle')}</span>
        <span className="slash-popover-hint">{t('pet.slashPopoverHint')}</span>
      </div>
      {commands.map((cmd, idx) => {
        const active = idx === activeIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={active}
            className={`slash-item${active ? ' active' : ''}`}
            onMouseDown={(e) => {
              // Prevent the textarea from losing focus before the click
              // handler fires — otherwise selectionStart resets and the
              // pick replacement targets the wrong substring.
              e.preventDefault();
            }}
            onMouseEnter={() => onHover(idx)}
            onClick={() => onPick(cmd)}
          >
            <span className="slash-item-icon" aria-hidden>
              <Icon name={cmd.icon} size={13} />
            </span>
            <span className="slash-item-body">
              <span className="slash-item-row">
                <code className="slash-item-label">{cmd.label}</code>
                {cmd.argHint ? (
                  <span className="slash-item-arg">{cmd.argHint}</span>
                ) : null}
              </span>
              <span className="slash-item-desc">{t(cmd.descKey)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MentionPopover({
  files,
  plugins,
  skills,
  mcpServers,
  query,
  currentSkillId,
  t,
  onPickFile,
  onPickPlugin,
  onPickSkill,
  onPickMcp,
}: {
  files: ProjectFile[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  mcpServers: McpServerConfig[];
  query: string;
  currentSkillId: string | null;
  t: TranslateFn;
  onPickFile: (path: string) => void;
  onPickPlugin: (record: InstalledPluginRecord) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickMcp: (server: McpServerConfig) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<MentionTab>('all');
  const tabs: Array<{ id: MentionTab; label: string }> = [
    { id: 'all', label: t('chat.mentionTabAll') },
    { id: 'plugins', label: t('chat.mentionTabPlugins') },
    { id: 'skills', label: t('chat.mentionTabSkills') },
    { id: 'mcp', label: t('chat.mentionTabMcp') },
    { id: 'files', label: t('chat.mentionTabFiles') },
  ];
  const showPlugins = tab === 'all' || tab === 'plugins';
  const showSkills = tab === 'all' || tab === 'skills';
  const showMcp = tab === 'all' || tab === 'mcp';
  const showFiles = tab === 'all' || tab === 'files';
  const hasVisibleResults =
    (showPlugins && plugins.length > 0) ||
    (showSkills && skills.length > 0) ||
    (showMcp && mcpServers.length > 0) ||
    (showFiles && files.length > 0);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [files, plugins, skills, mcpServers, tab]);
  return (
    <div className="mention-popover" data-testid="mention-popover">
      <div className="mention-tabs" role="tablist" aria-label={t('chat.mentionTabsAria')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`mention-tab${tab === item.id ? ' active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mention-results" ref={ref}>
        {!hasVisibleResults ? (
          <div className="mention-empty">
            {query ? (
              <>{t('chat.mentionNoResults', { query })}</>
            ) : (
              <>{t('chat.mentionSearchHint')}</>
            )}
          </div>
        ) : null}
        {showPlugins && plugins.length > 0 ? (
          <>
            <div className="mention-section-label">Plugins</div>
            {plugins.map((p) => (
              <button
                key={`plugin-${p.id}`}
                className="mention-item mention-item--plugin"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickPlugin(p)}
                title={p.manifest?.description ?? p.title}
              >
                <Icon name="sparkles" size={12} />
                <span className="mention-item-body">
                  <strong>{p.title}</strong>
                  <span className="mention-meta mention-meta--desc">
                    {p.manifest?.description ?? p.id}
                  </span>
                </span>
                <span className="mention-meta">{pluginSourceLabel(p)}</span>
              </button>
            ))}
          </>
        ) : null}
        {showSkills && skills.length > 0 ? (
          <>
            <div className="mention-section-label">Skills</div>
            {skills.map((skill) => {
              const active = skill.id === currentSkillId;
              return (
                <button
                  key={`skill-${skill.id}`}
                  className="mention-item"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickSkill(skill)}
                  title={skill.description}
                >
                  <Icon name={active ? 'check' : 'file'} size={12} />
                  <span className="mention-item-body">
                    <strong>{skill.name}</strong>
                    <span className="mention-meta mention-meta--desc">
                      {skill.description || skill.id}
                    </span>
                  </span>
                  <span className="mention-meta">{active ? 'Active' : skill.mode}</span>
                </button>
              );
            })}
          </>
        ) : null}
        {showMcp && mcpServers.length > 0 ? (
          <>
            <div className="mention-section-label">MCP</div>
            {mcpServers.map((server) => (
              <button
                key={`mcp-${server.id}`}
                className="mention-item"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPickMcp(server)}
                title={`Use ${server.label || server.id}`}
              >
                <Icon name="link" size={12} />
                <span className="mention-item-body">
                  <strong>{server.label || server.id}</strong>
                  <span className="mention-meta mention-meta--desc">
                    {server.url || server.command || server.id}
                  </span>
                </span>
                <span className="mention-meta">{server.transport}</span>
              </button>
            ))}
          </>
        ) : null}
        {showFiles && files.length > 0 ? (
          <>
            <div className="mention-section-label">Design files</div>
            {files.map((f) => {
              const key = f.path ?? f.name;
              return (
                <button
                  key={`file-${key}`}
                  className="mention-item"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickFile(key)}
                >
                  <Icon name="file" size={12} />
                  <code>{key}</code>
                  {f.size != null ? (
                    <span className="mention-meta">{prettySize(f.size)}</span>
                  ) : null}
                </button>
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}
