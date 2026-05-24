import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CreateRoutineRequest,
  Routine,
  RoutineProjectTarget,
  RoutineRun,
  RoutineSchedule,
  Weekday,
} from '@open-design/contracts';

import { Icon } from './Icon';
import { UiActionButton } from './UiPrimitives';
import { navigate } from '../router';
import { useT } from '../i18n';

type ProjectSummary = { id: string; name: string };

type RoutinesSectionProps = {
  onClose?: () => void;
};

type ScheduleKind = RoutineSchedule['kind'];

const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'hourly', label: 'Hourly' },
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekdays', label: 'Weekdays' },
  { kind: 'weekly', label: 'Weekly' },
];

const WEEKDAY_LABELS: { value: Weekday; short: string; long: string }[] = [
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
];

// Fallback list used only when the runtime doesn't expose
// `Intl.supportedValuesOf('timeZone')`. The backend validator accepts any
// IANA zone, so the picker should match — see `listSupportedTimezones`.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
];

function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Returns every IANA zone the platform recognizes, so the picker stays in
// sync with the backend validator (which accepts any IANA timezone). Falls
// back to a curated subset on older runtimes that lack `supportedValuesOf`.
// `UTC` is always prepended because `Intl.supportedValuesOf('timeZone')`
// returns only canonical region names on current runtimes (e.g. Node 24)
// and would otherwise drop the most common non-local zone — which the
// backend validator and contract examples still accept.
function listSupportedTimezones(): string[] {
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') {
      const list = fn('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list.includes('UTC') ? list : ['UTC', ...list];
      }
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

// "GMT+8", "GMT-5:30", "GMT" — short label that mirrors the screenshot's
// "Shanghai (GMT+8)" pattern for legibility.
function gmtLabel(timezone: string, at = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? 'GMT';
  } catch {
    return 'GMT';
  }
}

// "GMT+8", "GMT-5:30", "GMT" — short label that mirrors the screenshot's
// "Shanghai (GMT+8)" pattern for legibility. (Vietnamese time formatting uses shortOffset as well)
function gmtLabelLocale(timezone: string, locale: string, at = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? 'GMT';
  } catch {
    return 'GMT';
  }
}

function tzCityLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC';
  const last = timezone.split('/').pop() ?? timezone;
  return last.replace(/_/g, ' ');
}

function tzOptionLabel(timezone: string): string {
  // The GMT offset is intentionally omitted: it would drift seasonally for
  // DST-observing zones (e.g. `America/New_York` is GMT-5 in winter and
  // GMT-4 in summer) and a picker label that depends on `new Date()` is
  // misleading. The IANA city stays stable year-round.
  return tzCityLabel(timezone);
}

function formatTime12h(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

function describeSchedule(
  schedule: RoutineSchedule,
  t: (key: string, vars?: any) => string,
  nextRunAt?: number | null,
): string {
  if (schedule.kind === 'hourly') {
    const mm = String(schedule.minute).padStart(2, '0');
    return t('settings.routines.descHourly', { minute: mm });
  }
  // Anchor the GMT offset to the next actual fire time so DST-observing
  // zones don't drift seasonally — a New York routine created in winter
  // would otherwise still render `GMT-5` after DST starts. When we don't
  // know the next fire (e.g. the live preview while the form is open),
  // fall back to the IANA city, which is stable year-round.
  const tz = nextRunAt
    ? gmtLabel(schedule.timezone, new Date(nextRunAt))
    : tzCityLabel(schedule.timezone);
  if (schedule.kind === 'daily') {
    return t('settings.routines.descDaily', { time: formatTime12h(schedule.time), tz });
  }
  if (schedule.kind === 'weekdays') {
    return t('settings.routines.descWeekdays', { time: formatTime12h(schedule.time), tz });
  }
  const day = t(`settings.routines.weekdayLong.${schedule.weekday}`);
  return t('settings.routines.descWeekly', { day, time: formatTime12h(schedule.time), tz });
}

function formatRelative(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatRunTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

type FormState = {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  minute: number; // hourly
  time: string; // daily/weekdays/weekly (HH:MM)
  weekday: Weekday; // weekly
  timezone: string;
  mode: 'create_each_run' | 'reuse';
  projectId: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    prompt: '',
    kind: 'daily',
    minute: 0,
    time: '09:00',
    weekday: 1,
    timezone: detectLocalTimezone(),
    mode: 'create_each_run',
    projectId: '',
  };
}

function buildSchedule(form: FormState): RoutineSchedule {
  if (form.kind === 'hourly') {
    return { kind: 'hourly', minute: form.minute };
  }
  if (form.kind === 'weekly') {
    return {
      kind: 'weekly',
      weekday: form.weekday,
      time: form.time,
      timezone: form.timezone,
    };
  }
  return {
    kind: form.kind,
    time: form.time,
    timezone: form.timezone,
  };
}

function StatusPill({ status }: { status: RoutineRun['status'] }) {
  return <span className={`routines-status routines-status-${status}`}>{status}</span>;
}

function ScheduleEditor({
  form,
  setForm,
  timezones,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  timezones: string[];
}) {
  const t = useT();

  const localizedScheduleKinds = useMemo(() => [
    { kind: 'hourly' as const, label: t('settings.routines.hourly') },
    { kind: 'daily' as const, label: t('settings.routines.daily') },
    { kind: 'weekdays' as const, label: t('settings.routines.weekdays') },
    { kind: 'weekly' as const, label: t('settings.routines.weekly') },
  ], [t]);

  const localizedWeekdayLabels = useMemo(() => [
    { value: 0 as const, short: t('settings.routines.weekdayShort.0') },
    { value: 1 as const, short: t('settings.routines.weekdayShort.1') },
    { value: 2 as const, short: t('settings.routines.weekdayShort.2') },
    { value: 3 as const, short: t('settings.routines.weekdayShort.3') },
    { value: 4 as const, short: t('settings.routines.weekdayShort.4') },
    { value: 5 as const, short: t('settings.routines.weekdayShort.5') },
    { value: 6 as const, short: t('settings.routines.weekdayShort.6') },
  ], [t]);

  return (
    <div className="routines-schedule-editor">
      <div className="routines-field-label">{t('settings.routines.schedule')}</div>
      <div className="subtab-pill routines-kind-pills" role="tablist">
        {localizedScheduleKinds.map((k) => (
          <button
            type="button"
            key={k.kind}
            role="tab"
            aria-selected={form.kind === k.kind}
            className={form.kind === k.kind ? 'active' : ''}
            onClick={() => setForm({ ...form, kind: k.kind })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {form.kind === 'hourly' ? (
        <div className="routines-fieldrow">
          <label className="routines-field">
            <span>{t('settings.routines.minuteOfEveryHour')}</span>
            <input
              type="number"
              min={0}
              max={59}
              step={1}
              value={form.minute}
              onChange={(e) =>
                setForm({
                  ...form,
                  minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                })
              }
            />
          </label>
        </div>
      ) : null}

      {form.kind === 'weekly' ? (
        <div className="routines-weekday-row">
          {localizedWeekdayLabels.map((d) => (
            <button
              type="button"
              key={d.value}
              className={`routines-weekday${form.weekday === d.value ? ' active' : ''}`}
              onClick={() => setForm({ ...form, weekday: d.value })}
              aria-pressed={form.weekday === d.value}
            >
              {d.short}
            </button>
          ))}
        </div>
      ) : null}

      {form.kind !== 'hourly' ? (
        <div className="routines-fieldrow routines-fieldrow-2col">
          <label className="routines-field">
            <span>{t('settings.routines.timeField')}</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
          <label className="routines-field">
            <span>{t('settings.routines.timezoneField')}</span>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tzOptionLabel(tz)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <p className="routines-schedule-hint">
        {describeSchedule(buildSchedule(form), t)}
      </p>
    </div>
  );
}

function RunHistory({ routineId, refreshKey, onClose }: { routineId: string; refreshKey: number; onClose?: () => void }) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/routines/${routineId}/runs?limit=10`);
        if (!res.ok) throw new Error(`runs: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRuns(json.runs ?? []);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId, refreshKey]);

  if (runs === null) return <div className="routines-history-empty">{t('settings.routines.loadingRuns')}</div>;
  if (runs.length === 0)
    return <div className="routines-history-empty">{t('settings.routines.noRuns')}</div>;

  return (
    <ul className="routines-history">
      {runs.map((r) => (
        <li key={r.id} className="routines-history-row">
          <StatusPill status={r.status} />
          <span className="routines-history-time">{formatRunTimestamp(r.startedAt)}</span>
          <span className="routines-history-trigger">
            {r.trigger === 'manual' ? t('settings.routines.manual') : t('settings.routines.scheduled')}
          </span>
          <button
            type="button"
            className="routines-history-link"
            onClick={() => {
              // Issue #1505: deep-link to this run's specific
              // conversation, not just the project root. Without the
              // conversation id, parallel runs that share a project
              // (reuse mode) all resolve to the same default
              // conversation in the project view, which made earlier
              // runs look "absorbed" by the latest one.
              navigate({
                kind: 'project',
                projectId: r.projectId,
                conversationId: r.conversationId ?? null,
                fileName: null,
              });
              onClose?.();
            }}
            title={t('settings.routines.openProjectTitle')}
          >
            {t('settings.routines.openProject')}
            <Icon name="chevron-right" size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RoutinesSection({ onClose }: RoutinesSectionProps) {
  const t = useT();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const timezones = useMemo(() => {
    const local = detectLocalTimezone();
    // Pin the user's local zone first, then expose every IANA zone the
    // backend would accept so the picker matches the validator.
    const set = new Set<string>([local, ...listSupportedTimezones()]);
    return Array.from(set);
  }, []);

  const refresh = async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (form.mode === 'reuse' && !form.projectId) {
        throw new Error(t('settings.routines.errorPickProject'));
      }
      const target: RoutineProjectTarget =
        form.mode === 'reuse' && form.projectId
          ? { mode: 'reuse', projectId: form.projectId }
          : { mode: 'create_each_run' };
      const body: CreateRoutineRequest = {
        name: form.name.trim(),
        prompt: form.prompt,
        schedule: buildSchedule(form),
        target,
        enabled: true,
      };
      const res = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `create failed: ${res.status}`);
      }
      setShowForm(false);
      setForm(emptyForm());
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `run failed: ${res.status}`);
      }
      void refresh();
      setExpandedId(id);
      setHistoryTick((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `update failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('settings.routines.deleteConfirm')))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed: ${res.status}`);
      }
      if (expandedId === id) setExpandedId(null);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-section routines-section">
      <div className="section-head">
        <div>
          <h3>{t('settings.routines.title')}</h3>
        </div>
        {!showForm ? (
          <UiActionButton
            type="button"
            tone="primary"
            icon="plus"
            onClick={() => {
              setForm(emptyForm());
              setShowForm(true);
            }}
          >
            {t('settings.routines.newRoutine')}
          </UiActionButton>
        ) : null}
      </div>

      {error ? (
        <div className="settings-notice error" role="alert">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={submit} className="routines-card routines-form">
          <label className="routines-field">
            <span>{t('settings.routines.name')}</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('settings.routines.namePlaceholder')}
              autoFocus
            />
          </label>
          <label className="routines-field">
            <span>{t('settings.routines.prompt')}</span>
            <textarea
              required
              rows={4}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder={t('settings.routines.promptPlaceholder')}
            />
          </label>

          <ScheduleEditor form={form} setForm={setForm} timezones={timezones} />

          <fieldset className="routines-fieldset">
            <legend>{t('settings.routines.project')}</legend>

            <label className="routines-radio">
              <input
                type="radio"
                checked={form.mode === 'create_each_run'}
                onChange={() => setForm({ ...form, mode: 'create_each_run' })}
              />
              <span>
                <strong>{t('settings.routines.createNew')}</strong>
                <small>{t('settings.routines.createNewHint')}</small>
              </span>
            </label>

            <label className="routines-radio">
              <input
                type="radio"
                checked={form.mode === 'reuse'}
                onChange={() => setForm({ ...form, mode: 'reuse' })}
              />
              <span>
                <strong>{t('settings.routines.reuse')}</strong>
                <small>{t('settings.routines.reuseHint')}</small>
              </span>
            </label>

            {form.mode === 'reuse' && (
              <select
                className="routines-project-select"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                required
              >
                <option value="">{t('settings.routines.pickProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </fieldset>

          <div className="routines-form-actions">
            <UiActionButton
              type="button"
              tone="secondary"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm());
              }}
            >
              {t('settings.routines.cancel')}
            </UiActionButton>
            <UiActionButton type="submit" tone="primary" disabled={submitting}>
              {submitting ? t('settings.routines.creating') : t('settings.routines.create')}
            </UiActionButton>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="routines-empty">{t('settings.routines.loading')}</div>
      ) : routines.length === 0 ? (
        <div className="routines-empty">
          <strong>{t('settings.routines.noRoutines')}</strong>
          <p>{t('settings.routines.noRoutinesHint')}</p>
        </div>
      ) : (
        <ul className="routines-list">
          {routines.map((r) => {
            const targetLabel =
              r.target.mode === 'reuse'
                ? t('settings.routines.targetReuseProject', { projectName: projectsById.get(r.target.projectId) ?? r.target.projectId })
                : t('settings.routines.targetNewProject');
            const isBusy = busyId === r.id;
            const isExpanded = expandedId === r.id;
            return (
              <li key={r.id} className={`routines-card routines-item${r.enabled ? '' : ' is-disabled'}`}>
                <div className="routines-item-head">
                  <div className="routines-item-main">
                    <div className="routines-item-title">
                      <strong>{r.name}</strong>
                      {!r.enabled ? (
                        <span className="routines-tag">{t('settings.routines.paused')}</span>
                      ) : null}
                    </div>
                    <div className="routines-item-line">{describeSchedule(r.schedule, t, r.nextRunAt)}</div>
                    <div className="routines-item-meta">
                      <span>{targetLabel}</span>
                      <span aria-hidden>·</span>
                      <span>{t('settings.routines.nextRun', { time: formatRelative(r.nextRunAt) })}</span>
                      {r.lastRun ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            {t('settings.routines.lastRun')}{' '}
                            <StatusPill status={r.lastRun.status} />{' '}
                            {formatRelative(r.lastRun.startedAt)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="routines-item-actions">
                    <UiActionButton
                      type="button"
                      tone="primary"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                    >
                      {t('settings.routines.runNow')}
                    </UiActionButton>
                    <UiActionButton
                      type="button"
                      tone="secondary"
                      onClick={() => toggleEnabled(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? t('settings.routines.pause') : t('settings.routines.resume')}
                    </UiActionButton>
                    <UiActionButton
                      type="button"
                      tone="secondary"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? t('settings.routines.hideHistory') : t('settings.routines.history')}
                    </UiActionButton>
                    <UiActionButton
                      type="button"
                      tone="danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      title={t('settings.routines.delete')}
                    >
                      {t('settings.routines.delete')}
                    </UiActionButton>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="routines-item-history">
                    <RunHistory routineId={r.id} refreshKey={historyTick} onClose={onClose} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
