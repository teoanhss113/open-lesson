import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  DesignSystemSummary,
  MediaAspect,
  ProjectTemplate,
  PromptTemplateSummary,
} from '../../types';
import { IMAGE_MODELS, MEDIA_ASPECTS, VIDEO_MODELS } from '../../media/models';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import { fetchPromptTemplate } from '../../providers/registry';
import {
  DESIGN_PLATFORMS,
  fallbackSwatches,
} from './utils';
import type {
  CreateTab,
  NewProjectPlatform,
  PromptTemplatePick,
} from './types';

export function PlatformPicker({
  value,
  onChange,
}: {
  value: NewProjectPlatform[];
  onChange: (v: NewProjectPlatform[]) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  function togglePlatform(next: NewProjectPlatform) {
    const active = value.includes(next);
    const updated = active
      ? value.filter((item) => item !== next)
      : [...value, next];
    onChange(updated.length > 0 ? updated : ['responsive']);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const tid = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const primary = DESIGN_PLATFORMS.find((o) => o.value === value[0]) ?? null;
  const extraCount = Math.max(0, value.length - 1);

  return (
    <div
      className="newproj-section ds-picker platform-picker"
      ref={wrapRef}
    >
      <label className="newproj-label">Target platforms</label>
      <button
        type="button"
        className={`ds-picker-trigger${open ? ' open' : ''}${primary ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        <span className="ds-picker-meta">
          <span className="ds-picker-title">
            {primary ? t(primary.labelKey) : 'Pick a platform'}
            {extraCount > 0 ? (
              <span className="ds-picker-extra-pill">+{extraCount}</span>
            ) : null}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div
          className="ds-picker-popover"
          id={listboxId}
          role="listbox"
          aria-label="Target platforms"
          aria-multiselectable="true"
        >
          <div className="ds-picker-list">
            {DESIGN_PLATFORMS.map((option) => {
              const active = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`ds-picker-item${active ? ' active' : ''}`}
                  onClick={() => togglePlatform(option.value)}
                >
                  <span className="ds-picker-item-text">
                    <span className="ds-picker-item-title">{t(option.labelKey)}</span>
                    <span className="ds-picker-item-sub">{t(option.hintKey)}</span>
                  </span>
                  <span
                    className={`ds-picker-mark check${active ? ' active' : ''}`}
                    aria-hidden
                  >
                    {active ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FidelityPicker({
  value,
  onChange,
}: {
  value: 'wireframe' | 'high-fidelity';
  onChange: (v: 'wireframe' | 'high-fidelity') => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.fidelityLabel')}</label>
      <div className="fidelity-grid">
        <FidelityCard
          active={value === 'wireframe'}
          onClick={() => onChange('wireframe')}
          label={t('newproj.fidelityWireframe')}
          variant="wireframe"
        />
        <FidelityCard
          active={value === 'high-fidelity'}
          onClick={() => onChange('high-fidelity')}
          label={t('newproj.fidelityHigh')}
          variant="high-fidelity"
        />
      </div>
    </div>
  );
}

function FidelityCard({
  active,
  onClick,
  label,
  variant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  variant: 'wireframe' | 'high-fidelity';
}) {
  return (
    <button
      type="button"
      className={`fidelity-card${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`fidelity-thumb fidelity-thumb-${variant}`} aria-hidden>
        {variant === 'wireframe' ? <WireframeArt /> : <HighFidelityArt />}
      </span>
      <span className="fidelity-label">{label}</span>
    </button>
  );
}

function WireframeArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="46" height="6" rx="2" fill="#d8d4cb" />
      <rect x="6" y="20" width="34" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="28" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="6" y="36" width="30" height="4" rx="2" fill="#ebe8e1" />
      <circle cx="22" cy="56" r="6" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="64" y="8" width="50" height="54" rx="3" fill="none" stroke="#d8d4cb" strokeWidth="1.4" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="22" width="32" height="4" rx="2" fill="#ebe8e1" />
      <rect x="70" y="30" width="38" height="4" rx="2" fill="#ebe8e1" />
    </svg>
  );
}

function HighFidelityArt() {
  return (
    <svg viewBox="0 0 120 70" width="100%" height="100%" aria-hidden>
      <rect x="6" y="8" width="34" height="6" rx="2" fill="#1a1916" />
      <rect x="6" y="20" width="46" height="4" rx="2" fill="#74716b" />
      <rect x="6" y="28" width="42" height="4" rx="2" fill="#b3b0a8" />
      <rect x="6" y="40" width="22" height="9" rx="2" fill="#00d4a4" />
      <rect x="64" y="8" width="50" height="54" rx="4" fill="#e6faf5" />
      <rect x="70" y="14" width="38" height="4" rx="2" fill="#00d4a4" />
      <rect x="70" y="22" width="32" height="3" rx="1.5" fill="#74716b" />
      <rect x="70" y="29" width="36" height="3" rx="1.5" fill="#b3b0a8" />
      <rect x="70" y="36" width="20" height="6" rx="2" fill="#00d4a4" />
    </svg>
  );
}

export function TemplatePicker({
  templates,
  value,
  onChange,
  onDelete,
}: {
  templates: ProjectTemplate[];
  value: string | null;
  onChange: (id: string | null) => void;
  onDelete?: (id: string) => Promise<boolean>;
}) {
  const t = useT();
  return (
    <div className="newproj-section">
      <label className="newproj-label">{t('newproj.templateLabel')}</label>
      {templates.length === 0 ? (
        <div className="template-howto">
          <span className="template-howto-title">
            {t('newproj.noTemplatesTitle')}
          </span>
          <span className="template-howto-body">
            {t('newproj.noTemplatesBody')}
          </span>
        </div>
      ) : (
        <div className="template-list">
          {templates.map((tpl) => {
            const fallbackDesc = `${t('newproj.savedTemplate')} · ${tpl.files.length} ${
              tpl.files.length === 1
                ? t('newproj.fileSingular')
                : t('newproj.filePlural')
            }`;
            return (
              <TemplateOption
                key={tpl.id}
                active={value === tpl.id}
                onClick={() => onChange(tpl.id)}
                onDelete={onDelete ? async () => {
                  const ok = await onDelete(tpl.id);
                  if (ok && value === tpl.id) onChange(null);
                } : () => {}}
                name={tpl.name}
                description={tpl.description ?? fallbackDesc}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplateOption({
  active,
  onClick,
  onDelete,
  name,
  description,
}: {
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  name: string;
  description: string;
}) {
  return (
    <div className={`template-option${active ? ' active' : ''}`}>
      <button
        type="button"
        className="template-option-select"
        onClick={onClick}
        aria-pressed={active}
      >
        <span className={`template-radio${active ? ' active' : ''}`} aria-hidden />
        <span className="template-option-text">
          <span className="template-option-name">{name}</span>
          <span className="template-option-desc">{description}</span>
        </span>
      </button>
      <button
        type="button"
        className="template-option-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete template"
        aria-label={`Delete template ${name}`}
      >
        ✕
      </button>
    </div>
  );
}

export function PromptTemplatePicker({
  surface,
  templates,
  value,
  onChange,
}: {
  surface: 'image' | 'video';
  templates: PromptTemplateSummary[];
  value: PromptTemplatePick | null;
  onChange: (next: PromptTemplatePick | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPick, setLastFailedPick] =
    useState<PromptTemplateSummary | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const surfaceScoped = useMemo(
    () => templates.filter((tpl) => tpl.surface === surface),
    [templates, surface],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return surfaceScoped;
    return surfaceScoped.filter((tpl) => {
      return (
        tpl.title.toLowerCase().includes(q) ||
        tpl.summary.toLowerCase().includes(q) ||
        (tpl.category || '').toLowerCase().includes(q) ||
        (tpl.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [surfaceScoped, query]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function pickTemplate(summary: PromptTemplateSummary) {
    setLoadingId(summary.id);
    setError(null);
    try {
      const detail = await fetchPromptTemplate(summary.surface, summary.id);
      if (!detail) {
        setError(t('promptTemplates.fetchError'));
        setLastFailedPick(summary);
        return;
      }
      onChange({ summary, prompt: detail.prompt });
      setLastFailedPick(null);
      setOpen(false);
      setQuery('');
    } catch {
      setError(t('promptTemplates.fetchError'));
      setLastFailedPick(summary);
    } finally {
      setLoadingId(null);
    }
  }

  function clear() {
    onChange(null);
    setLastFailedPick(null);
    setError(null);
    setOpen(false);
    setQuery('');
  }

  const triggerTitle = value?.summary.title ?? t('newproj.promptTemplateNoneTitle');
  const triggerSub = value
    ? value.summary.category || value.summary.summary || t('newproj.promptTemplateRefSub')
    : t('newproj.promptTemplateNoneSub');

  return (
    <div className="newproj-section ds-picker prompt-template-picker" ref={wrapRef}>
      <label className="newproj-label">{t('newproj.promptTemplateLabel')}</label>
      <button
        type="button"
        data-testid="prompt-template-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${value ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <PromptTemplateAvatar summary={value?.summary ?? null} />
        <span className="ds-picker-meta">
          <span className="ds-picker-title">{triggerTitle}</span>
          <span className="ds-picker-sub">{triggerSub}</span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="prompt-template-search"
              className="ds-picker-search"
              placeholder={t('newproj.promptTemplateSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ds-picker-list">
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className={`ds-picker-item${value === null ? ' active' : ''}`}
              onClick={clear}
            >
              <span className="ds-picker-item-avatar">
                <NoneAvatar />
              </span>
              <span className="ds-picker-item-text">
                <span className="ds-picker-item-title">
                  {t('newproj.promptTemplateNoneTitle')}
                </span>
                <span className="ds-picker-item-sub">
                  {t('newproj.promptTemplateNoneSub')}
                </span>
              </span>
            </button>
            {filtered.length === 0 ? (
              <div className="ds-picker-empty">
                {surfaceScoped.length === 0
                  ? t('newproj.promptTemplateEmpty')
                  : t('promptTemplates.emptyNoMatch')}
              </div>
            ) : (
              filtered.map((tpl) => {
                const active = value?.summary.id === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`ds-picker-item${active ? ' active' : ''}`}
                    onClick={() => void pickTemplate(tpl)}
                    disabled={loadingId === tpl.id}
                  >
                    <span className="ds-picker-item-avatar">
                      <PromptTemplateAvatar summary={tpl} />
                    </span>
                    <span className="ds-picker-item-text">
                      <span className="ds-picker-item-title">
                        {tpl.title}
                        {loadingId === tpl.id ? (
                          <span className="ds-picker-item-badge">
                            {t('common.loading')}
                          </span>
                        ) : null}
                      </span>
                      <span className="ds-picker-item-sub">
                        {tpl.summary || tpl.category}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
      {error ? (
        <div
          className="prompt-template-error"
          role="alert"
          data-testid="prompt-template-error"
        >
          <span className="prompt-template-error-msg">{error}</span>
          {lastFailedPick ? (
            <button
              type="button"
              className="ghost prompt-template-error-retry"
              data-testid="prompt-template-retry"
              onClick={() => void pickTemplate(lastFailedPick)}
              disabled={loadingId === lastFailedPick.id}
            >
              {loadingId === lastFailedPick.id
                ? t('common.loading')
                : t('promptTemplates.retry')}
            </button>
          ) : null}
        </div>
      ) : null}
      {value ? (
        <div className="prompt-template-edit">
          <div className="prompt-template-edit-head">
            <span className="prompt-template-edit-label">
              {t('newproj.promptTemplateBodyLabel')}
            </span>
            <span className="prompt-template-edit-hint">
              {t('newproj.promptTemplateOptimizeHint')}
            </span>
          </div>
          <textarea
            data-testid="prompt-template-body"
            className="prompt-template-edit-textarea"
            value={value.prompt}
            rows={6}
            onChange={(e) =>
              onChange({ summary: value.summary, prompt: e.target.value })
            }
          />
          {value.prompt.trim().length === 0 ? (
            <div
              className="prompt-template-edit-empty"
              data-testid="prompt-template-empty-hint"
            >
              {t('newproj.promptTemplateBodyEmpty')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PromptTemplateAvatar({
  summary,
}: {
  summary: PromptTemplateSummary | null;
}) {
  if (!summary) return <NoneAvatar />;
  if (summary.previewImageUrl) {
    return (
      <span className="ds-avatar prompt-template-avatar" aria-hidden>
        <img
          src={summary.previewImageUrl}
          alt=""
          loading="lazy"
          draggable={false}
        />
      </span>
    );
  }
  return (
    <span className="ds-avatar prompt-template-avatar fallback" aria-hidden>
      <Icon name={summary.surface === 'video' ? 'play' : 'image'} size={14} />
    </span>
  );
}

export function DesignSystemPicker({
  designSystems,
  defaultDesignSystemId,
  selectedIds,
  multi,
  onChange,
  onChangeMulti,
  loading,
}: {
  designSystems: DesignSystemSummary[];
  defaultDesignSystemId: string | null;
  selectedIds: string[];
  multi: boolean;
  onChange: (ids: string[]) => void;
  onChangeMulti: (v: boolean) => void;
  loading: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const byId = useMemo(() => {
    const map = new Map<string, DesignSystemSummary>();
    for (const d of designSystems) map.set(d.id, d);
    return map;
  }, [designSystems]);

  const ordered = useMemo(() => {
    const picked = selectedIds
      .map((id) => byId.get(id))
      .filter((d): d is DesignSystemSummary => Boolean(d));
    const pickedSet = new Set(picked.map((d) => d.id));
    const rest = designSystems
      .filter((d) => !pickedSet.has(d.id))
      .sort((a, b) => {
        if (a.id === defaultDesignSystemId) return -1;
        if (b.id === defaultDesignSystemId) return 1;
        const ca = a.category || 'Other';
        const cb = b.category || 'Other';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.title.localeCompare(b.title);
      });
    return [...picked, ...rest];
  }, [designSystems, byId, selectedIds, defaultDesignSystemId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        (d.summary || '').toLowerCase().includes(q) ||
        (d.category || '').toLowerCase().includes(q)
      );
    });
  }, [ordered, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointer);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(id: string) {
    if (multi) {
      const has = selectedIds.includes(id);
      if (has) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setOpen(false);
    }
  }

  function clearAll() {
    onChange([]);
    if (!multi) setOpen(false);
  }

  const primaryId = selectedIds[0] ?? null;
  const primary = primaryId ? byId.get(primaryId) ?? null : null;
  const extraCount = Math.max(0, selectedIds.length - 1);
  const isDefault = !!primary && primary.id === defaultDesignSystemId;

  return (
    <div className="newproj-section ds-picker" data-testid="design-system-picker" ref={wrapRef}>
      <label className="newproj-label">{t('newproj.designSystem')}</label>
      <button
        type="button"
        data-testid="design-system-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${primary ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <DesignSystemAvatar system={primary} extraCount={extraCount} />
        <span className="ds-picker-meta">
          <span className="ds-picker-title">
            {primary ? primary.title : t('newproj.dsNoneFreeform')}
            {extraCount > 0 ? (
              <span className="ds-picker-extra-pill">+{extraCount}</span>
            ) : null}
          </span>
          <span className="ds-picker-sub">
            {primary
              ? isDefault
                ? t('common.default')
                : primary.category || t('newproj.dsCategoryFallback')
              : t('newproj.dsNoneSubtitleEmpty')}
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className="ds-picker-chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="design-system-search"
              className="ds-picker-search"
              placeholder={t('newproj.dsSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              className="ds-picker-mode"
              role="tablist"
              aria-label={t('newproj.dsModeAria')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={!multi}
                className={`ds-picker-mode-btn${!multi ? ' active' : ''}`}
                onClick={() => {
                  onChangeMulti(false);
                  if (selectedIds.length > 1) onChange(selectedIds.slice(0, 1));
                }}
              >
                {t('newproj.dsModeSingle')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={multi}
                className={`ds-picker-mode-btn${multi ? ' active' : ''}`}
                onClick={() => onChangeMulti(true)}
              >
                {t('newproj.dsModeMulti')}
              </button>
            </div>
          </div>
          <div className="ds-picker-list ds-picker-list-design-systems">
            <DsPickerItem
              active={selectedIds.length === 0}
              multi={multi}
              onClick={clearAll}
              avatar={<NoneAvatar />}
              title={t('newproj.dsNoneTitle')}
              subtitle={t('newproj.dsNoneSub')}
            />
            {filtered.length === 0 ? (
              <div className="ds-picker-empty">
                {t('newproj.dsEmpty', { query })}
              </div>
            ) : (
              filtered.map((d) => {
                const active = selectedIds.includes(d.id);
                const order = active ? selectedIds.indexOf(d.id) : -1;
                return (
                  <DsPickerItem
                    key={d.id}
                    active={active}
                    multi={multi}
                    order={order}
                    onClick={() => toggle(d.id)}
                    avatar={<DesignSystemAvatar system={d} />}
                    title={d.title}
                    badge={
                      d.id === defaultDesignSystemId
                        ? t('newproj.dsBadgeDefault')
                        : undefined
                    }
                    subtitle={d.summary || d.category || ''}
                  />
                );
              })
            )}
          </div>
          {multi && selectedIds.length > 1 ? (
            <div className="ds-picker-foot">
              <span className="ds-picker-foot-text">
                <strong>{primary?.title ?? t('newproj.dsPrimaryFallback')}</strong>{' '}
                {extraCount === 1
                  ? t('newproj.dsFootSingular')
                  : t('newproj.dsFootPlural')}
              </span>
              <button
                type="button"
                className="ds-picker-clear"
                onClick={clearAll}
              >
                {t('newproj.dsFootClear')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DsPickerItem({
  active,
  multi,
  order,
  onClick,
  avatar,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  multi: boolean;
  order?: number;
  onClick: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`ds-picker-item${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="ds-picker-item-avatar">{avatar}</span>
      <span className="ds-picker-item-text">
        <span className="ds-picker-item-title">
          {title}
          {badge ? <span className="ds-picker-item-badge">{badge}</span> : null}
        </span>
        <span className="ds-picker-item-sub">{subtitle}</span>
      </span>
      <span
        className={`ds-picker-mark ${multi ? 'check' : 'radio'}${active ? ' active' : ''}`}
        aria-hidden
      >
        {multi ? (
          active ? (order != null && order >= 0 ? order + 1 : '✓') : ''
        ) : null}
      </span>
    </button>
  );
}

function DesignSystemAvatar({
  system,
  extraCount = 0,
}: {
  system: DesignSystemSummary | null;
  extraCount?: number;
}) {
  if (!system) return <NoneAvatar />;
  const swatches = system.swatches && system.swatches.length > 0
    ? system.swatches.slice(0, 4)
    : fallbackSwatches(system.title);
  return (
    <span className="ds-avatar" aria-hidden>
      <span className="ds-avatar-grid">
        {swatches.map((c, i) => (
          <span key={i} className="ds-avatar-cell" style={{ background: c }} />
        ))}
      </span>
      {extraCount > 0 ? (
        <span className="ds-avatar-stack">+{extraCount}</span>
      ) : null}
    </span>
  );
}

function NoneAvatar() {
  return (
    <span className="ds-avatar ds-avatar-none" aria-hidden>
      <Icon name="ban" size={16} />
    </span>
  );
}
