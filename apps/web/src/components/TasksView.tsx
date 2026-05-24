import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import type { AppConfig } from '../types';
import { Icon } from './Icon';
import { PageHeader, UiActionButton, UiBadge, UiInfoNote } from './UiPrimitives';

type TaskFilter = 'all' | 'scheduled' | 'running' | 'done';
type TaskStatus = 'running' | 'scheduled' | 'idle' | 'done' | 'failed';

interface TaskCard {
  id: string;
  title: string;
  icon: 'bell' | 'file' | 'history' | 'orbit';
  status: TaskStatus;
  statusLabel: string;
  meta: string;
  preview: string;
  trigger: string;
  pattern: string;
  runtime: string;
  output: string;
  artifactTitle: string;
  artifactMeta: string;
  artifactBody: string[];
}

interface Props {
  config: AppConfig;
  onOpenOrbitSettings: () => void;
}

type TaskFilterLabelKey =
  | 'tasks.filterAll'
  | 'tasks.filterScheduled'
  | 'tasks.filterRunning'
  | 'tasks.filterDone';

const FILTERS: ReadonlyArray<{ id: TaskFilter; label: TaskFilterLabelKey }> = [
  { id: 'all', label: 'tasks.filterAll' },
  { id: 'scheduled', label: 'tasks.filterScheduled' },
  { id: 'running', label: 'tasks.filterRunning' },
  { id: 'done', label: 'tasks.filterDone' },
];

export function TasksView({ config, onOpenOrbitSettings }: Props) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const [selectedId, setSelectedId] = useState('orbit-daily');
  const orbitEnabled = config.orbit?.enabled ?? false;
  const orbitTime = config.orbit?.time ?? '08:00';

  const tasks = useMemo<ReadonlyArray<TaskCard>>(() => {
    const orbitTask: TaskCard = {
      id: 'orbit-daily',
      title: t('tasks.orbitTitle'),
      icon: 'orbit',
      status: orbitEnabled ? 'scheduled' : 'idle',
      statusLabel: orbitEnabled ? t('tasks.orbitStatusOn', { time: orbitTime }) : t('tasks.orbitStatusOff'),
      meta: orbitEnabled ? t('tasks.orbitMetaOn') : t('tasks.orbitMetaOff'),
      preview: orbitEnabled ? t('tasks.orbitPreviewOn') : t('tasks.orbitPreviewOff'),
      trigger: orbitEnabled ? t('tasks.orbitTriggerOn', { time: orbitTime }) : t('tasks.orbitTriggerOff'),
      pattern: t('tasks.orbitPattern'),
      runtime: t('tasks.orbitRuntime'),
      output: t('tasks.orbitOutput'),
      artifactTitle: 'orbit_daily.html',
      artifactMeta: orbitEnabled ? t('tasks.orbitArtifactMetaOn') : t('tasks.orbitArtifactMetaOff'),
      artifactBody: t('tasks.orbitArtifactBody').split('\n'),
    };
    return [orbitTask];
  }, [orbitEnabled, orbitTime, t]);

  const filteredTasks = tasks.filter((task) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'running') return task.status === 'running';
    if (activeFilter === 'scheduled') return task.status === 'scheduled';
    return task.status === 'done';
  });
  const selectedTask =
    tasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? tasks[0];
  if (!selectedTask) return null;

  return (
    <section className="ui-page tasks-view" aria-labelledby="tasks-title" data-testid="tasks-view">
      <PageHeader
        kicker={t('tasks.kicker')}
        title={(
          <span className="tasks-view__title-row">
            <span id="tasks-title">{t('tasks.title')}</span>
            <UiBadge tone="amber">{t('tasks.comingSoon')}</UiBadge>
          </span>
        )}
        lede={t('tasks.lede')}
        action={(
          <UiActionButton type="button" tone="primary" icon="plus" onClick={onOpenOrbitSettings}>
            {t('tasks.newAutomation')}
          </UiActionButton>
        )}
      />

      <UiInfoNote icon="orbit">{t('tasks.previewNote')}</UiInfoNote>

      <div className="tasks-primitives" aria-label={t('tasks.primitivesAria')}>
        <PrimitiveCard
          icon="orbit"
          title={t('tasks.primitiveOrbitTitle')}
          body={t('tasks.primitiveOrbitBody')}
          meta={orbitEnabled ? t('tasks.primitiveOrbitMetaOn') : t('tasks.primitiveOrbitMetaOff')}
          tone="green"
        />
        <PrimitiveCard
          icon="history"
          title={t('tasks.primitiveRoutinesTitle')}
          body={t('tasks.primitiveRoutinesBody')}
          meta={t('tasks.primitiveRoutinesMeta')}
          tone="blue"
        />
        <PrimitiveCard
          icon="bell"
          title={t('tasks.primitiveSchedulesTitle')}
          body={t('tasks.primitiveSchedulesBody')}
          meta={t('tasks.primitiveSchedulesMeta')}
          tone="amber"
        />
        <PrimitiveCard
          icon="file"
          title={t('tasks.primitiveArtifactsTitle')}
          body={t('tasks.primitiveArtifactsBody')}
          meta={t('tasks.primitiveArtifactsMeta')}
          tone="purple"
        />
      </div>

      <div className="tasks-board">
        <aside className="tasks-list" aria-label={t('tasks.listAria')}>
          <div className="tasks-list__head">
            <div>
              <h2>{t('tasks.title')}</h2>
              <p>{t('tasks.count', { count: tasks.length })}</p>
            </div>
            <button type="button" onClick={onOpenOrbitSettings}>
              <Icon name="plus" size={13} />
              <span>{t('tasks.new')}</span>
            </button>
          </div>
          <div className="tasks-filter" role="tablist" aria-label={t('tasks.filtersAria')}>
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.id}
                className={activeFilter === filter.id ? 'is-active' : ''}
                onClick={() => setActiveFilter(filter.id)}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
          <div className="tasks-list__items">
            {filteredTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`task-card task-card--${task.status}${
                  selectedTask.id === task.id ? ' is-active' : ''
                }`}
                aria-current={selectedTask.id === task.id ? 'true' : undefined}
                onClick={() => setSelectedId(task.id)}
              >
                <span className="task-card__status">
                  <span className="task-status-dot" aria-hidden="true" />
                  {task.statusLabel}
                </span>
                <span className="task-card__title">
                  <Icon name={task.icon} size={14} />
                  {task.title}
                </span>
                <span className="task-card__meta">{task.meta}</span>
                <span className="task-card__preview">{task.preview}</span>
              </button>
            ))}
          </div>
        </aside>

        <article className="task-detail" aria-labelledby="task-detail-title">
          <div className="task-detail__top">
            <span className={`task-detail__state task-detail__state--${selectedTask.status}`}>
              <span className="task-status-dot" aria-hidden="true" />
              {selectedTask.statusLabel}
            </span>
            <h2 id="task-detail-title">{selectedTask.title}</h2>
            <p>{selectedTask.meta}</p>
          </div>

          <div className="task-slots" aria-label={t('tasks.configAria')}>
            <Slot icon="bell" label={t('tasks.slotTrigger')} value={selectedTask.trigger} />
            <Slot icon="sparkles" label={t('tasks.slotPattern')} value={selectedTask.pattern} />
            <Slot icon="orbit" label={t('tasks.slotRuntime')} value={selectedTask.runtime} />
            <Slot icon="file" label={t('tasks.slotOutput')} value={selectedTask.output} />
          </div>

          <section className="task-artifact" aria-labelledby="task-artifact-title">
            <header className="task-artifact__head">
              <div>
                <span className="task-artifact__kicker">
                  <Icon name="file" size={12} />
                  {t('tasks.liveArtifact')}
                </span>
                <h3 id="task-artifact-title">{selectedTask.artifactTitle}</h3>
              </div>
              <span>{selectedTask.artifactMeta}</span>
            </header>
            <pre>{selectedTask.artifactBody.join('\n')}</pre>
          </section>

          <div className="task-detail__actions">
            <UiActionButton type="button" tone="secondary" icon="external-link">
              {t('tasks.viewProgress')}
            </UiActionButton>
            <UiActionButton type="button" tone="secondary">
              {selectedTask.status === 'running' ? t('tasks.pause') : t('tasks.runNow')}
            </UiActionButton>
            <UiActionButton type="button" tone="primary" icon="external-link">
              {t('tasks.openArtifact')}
            </UiActionButton>
          </div>
        </article>
      </div>
    </section>
  );
}

function PrimitiveCard({
  icon,
  title,
  body,
  meta,
  tone,
}: {
  icon: 'bell' | 'file' | 'history' | 'orbit';
  title: string;
  body: string;
  meta: string;
  tone: 'amber' | 'blue' | 'green' | 'purple';
}) {
  return (
    <article className={`tasks-primitive tasks-primitive--${tone}`}>
      <span className="tasks-primitive__icon" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{body}</p>
        <span>{meta}</span>
      </div>
    </article>
  );
}

function Slot({
  icon,
  label,
  value,
}: {
  icon: 'bell' | 'file' | 'orbit' | 'sparkles';
  label: string;
  value: string;
}) {
  return (
    <div className="task-slot">
      <span className="task-slot__label">
        <Icon name={icon} size={12} />
        {label}
      </span>
      <span className="task-slot__value">{value}</span>
    </div>
  );
}
