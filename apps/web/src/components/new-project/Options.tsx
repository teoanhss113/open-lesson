import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { Icon } from '../Icon';
import type { AudioKind, MediaAspect, MediaProviderCredentials } from '../../types';
import {
  isStoredMediaProviderEntryPresent,
} from '../../state/config';
import {
  findProvider,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  type MediaModel,
  VIDEO_MODELS,
  VIDEO_LENGTHS_SEC,
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  DEFAULT_AUDIO_MODEL,
} from '../../media/models';
import {
  supportedModels,
  SFX_AUDIO_DURATIONS_SEC,
} from './utils';

export function SurfaceOptions({
  includeLandingPage,
  includeOsWidgets,
  onIncludeLandingPage,
  onIncludeOsWidgets,
}: {
  includeLandingPage: boolean;
  includeOsWidgets: boolean;
  onIncludeLandingPage: (v: boolean) => void;
  onIncludeOsWidgets: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section surface-options">
      <label className="newproj-label">{t('newproj.surfaceOptionsLabel')}</label>
      <div className="compact-toggle-list">
        <CompactToggle
          label={t('newproj.includeLandingPage')}
          hint={t('newproj.includeLandingPageHint')}
          checked={includeLandingPage}
          onChange={onIncludeLandingPage}
        />
        <CompactToggle
          label={t('newproj.includeOsWidgets')}
          hint={t('newproj.includeOsWidgetsHint')}
          checked={includeOsWidgets}
          onChange={onIncludeOsWidgets}
        />
      </div>
    </div>
  );
}

export function CompactToggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`compact-toggle${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      aria-pressed={checked}
      disabled={disabled}
      title={hint}
    >
      <span className="compact-toggle-label">{label}</span>
      <span className="compact-toggle-switch" aria-hidden />
    </button>
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle-row${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      onClick={() => { if (!disabled) onChange(!checked); }}
      aria-pressed={checked}
      disabled={disabled}
    >
      <div className="toggle-row-text">
        <span className="toggle-row-label">{label}</span>
        {hint ? <span className="toggle-row-hint">{hint}</span> : null}
      </div>
      <span className="toggle-row-switch" aria-hidden />
    </button>
  );
}

export function OptionCards<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; title: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="newproj-media-field">
      <div className="newproj-label">{label}</div>
      <div className="newproj-option-grid compact">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`newproj-card newproj-option-card${value === option.value ? ' active' : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            <span>{option.title}</span>
            {option.hint ? <small>{option.hint}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AspectCards({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MediaAspect;
  onChange: (value: MediaAspect) => void;
}) {
  const labels: Record<MediaAspect, string> = {
    '1:1': 'Square',
    '16:9': 'Landscape',
    '9:16': 'Portrait',
    '4:3': 'Wide',
    '3:4': 'Tall',
  };
  return (
    <div className="newproj-media-field">
      <div className="newproj-label">{label}</div>
      <div className="newproj-aspect-segmented" role="radiogroup" aria-label={label}>
        {MEDIA_ASPECTS.map((aspect) => {
          const active = value === aspect;
          return (
            <button
              key={aspect}
              type="button"
              role="radio"
              aria-checked={active}
              title={`${labels[aspect]} · ${aspect}`}
              className={`newproj-aspect-pill${active ? ' active' : ''}`}
              onClick={() => onChange(aspect)}
            >
              <span
                className={`newproj-aspect-icon newproj-aspect-icon-${aspect.replace(':', '-')}`}
                aria-hidden
              />
              <span className="newproj-aspect-ratio">{aspect}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MediaModelCards({
  label,
  models,
  mediaProviders,
  value,
  onChange,
}: {
  label: string;
  models: MediaModel[];
  mediaProviders?: Record<string, MediaProviderCredentials>;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const groups = useMemo(() => {
    const out: Array<{
      providerId: string;
      providerLabel: string;
      status: 'configured' | 'integrated' | 'unsupported';
      models: MediaModel[];
    }> = [];
    for (const model of models) {
      const provider = findProvider(model.provider);
      const providerId = provider?.id ?? model.provider;
      const entry = mediaProviders?.[providerId];
      const configured =
        provider?.credentialsRequired === false ||
        isStoredMediaProviderEntryPresent(entry);
      let group = out.find((g) => g.providerId === providerId);
      if (!group) {
        group = {
          providerId,
          providerLabel: provider?.label ?? model.provider,
          status: configured
            ? 'configured'
            : provider?.integrated
              ? 'integrated'
              : 'unsupported',
          models: [],
        };
        out.push(group);
      }
      group.models.push(model);
    }
    return out;
  }, [models, mediaProviders]);

  const selected = useMemo(() => {
    for (const group of groups) {
      const hit = group.models.find((m) => m.id === value);
      if (hit) return { model: hit, group };
    }
    return null;
  }, [groups, value]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        models: g.models.filter((m) => {
          return (
            m.id.toLowerCase().includes(q) ||
            m.label.toLowerCase().includes(q) ||
            m.hint.toLowerCase().includes(q) ||
            g.providerLabel.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.models.length > 0);
  }, [groups, query]);

  const totalMatches = filteredGroups.reduce((n, g) => n + g.models.length, 0);

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

  function pick(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setQuery('');
  }

  const triggerTitle = selected?.model.label ?? t('newproj.modelMissingTitle');
  const triggerSub = selected
    ? selected.model.hint.toLowerCase().startsWith(selected.group.providerLabel.toLowerCase())
      ? selected.model.hint
      : `${selected.group.providerLabel} · ${selected.model.hint}`
    : t('newproj.modelMissingSub');

  return (
    <div className="newproj-section ds-picker model-picker" ref={wrapRef}>
      <label className="newproj-label">{label}</label>
      <button
        type="button"
        data-testid="model-picker-trigger"
        className={`ds-picker-trigger${open ? ' open' : ''}${selected ? '' : ' empty'}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="ds-picker-meta">
          <span className="ds-picker-title">{triggerTitle}</span>
          <span className="ds-picker-sub">{triggerSub}</span>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={`ds-picker-chevron${open ? ' icon-rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="ds-picker-popover" role="listbox">
          <div className="ds-picker-head">
            <input
              ref={searchRef}
              data-testid="model-picker-search"
              className="ds-picker-search"
              placeholder={t('newproj.modelSearch')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ds-picker-list">
            {totalMatches === 0 ? (
              <div className="ds-picker-empty">{t('newproj.modelEmpty')}</div>
            ) : (
              filteredGroups.map((group) => (
                <div className="ds-picker-group" key={group.providerId}>
                  <div className="ds-picker-group-head">
                    <span>{group.providerLabel}</span>
                    <span className={`newproj-provider-badge ${group.status}`}>
                      {group.status === 'configured'
                        ? 'Configured'
                        : group.status === 'integrated'
                          ? 'Integrated'
                          : 'Unsupported'}
                    </span>
                  </div>
                  {group.models.map((model) => {
                    const active = value === model.id;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-testid={`model-picker-option-${model.id}`}
                        className={`ds-picker-item${active ? ' active' : ''}`}
                        onClick={() => pick(model.id)}
                      >
                        <span className="ds-picker-item-text">
                          <span className="ds-picker-item-title">
                            {model.label}
                            {model.default ? (
                              <span className="ds-picker-item-badge">
                                {t('newproj.modelRecommended')}
                              </span>
                            ) : null}
                          </span>
                          <span className="ds-picker-item-sub">{model.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MediaProjectOptions(props:
  | {
      surface: 'image';
      imageModel: string;
      imageAspect: MediaAspect;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onImageModel: (value: string) => void;
      onImageAspect: (value: MediaAspect) => void;
    }
  | {
      surface: 'video';
      videoModel: string;
      videoAspect: MediaAspect;
      videoLength: number;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onVideoModel: (value: string) => void;
      onVideoAspect: (value: MediaAspect) => void;
      onVideoLength: (value: number) => void;
    }
  | {
      surface: 'audio';
      audioKind: AudioKind;
      audioModel: string;
      audioDuration: number;
      voice: string;
      mediaProviders?: Record<string, MediaProviderCredentials>;
      onAudioKind: (value: AudioKind) => void;
      onAudioModel: (value: string) => void;
      onAudioDuration: (value: number) => void;
      onVoice: (value: string) => void;
    }
) {
  const t = useT();

  if (props.surface === 'image') {
    return (
      <div className="newproj-media-options">
        <MediaModelCards
          label={t('newproj.modelLabel')}
          models={supportedModels('image', IMAGE_MODELS)}
          mediaProviders={props.mediaProviders}
          value={props.imageModel}
          onChange={props.onImageModel}
        />
        <AspectCards
          label={t('newproj.aspectLabel')}
          value={props.imageAspect}
          onChange={props.onImageAspect}
        />
      </div>
    );
  }

  if (props.surface === 'video') {
    return (
      <div className="newproj-media-options">
        <MediaModelCards
          label={t('newproj.modelLabel')}
          models={supportedModels('video', VIDEO_MODELS)}
          mediaProviders={props.mediaProviders}
          value={props.videoModel}
          onChange={props.onVideoModel}
        />
        <AspectCards
          label={t('newproj.aspectLabel')}
          value={props.videoAspect}
          onChange={props.onVideoAspect}
        />
        <label className="newproj-label">
          <span>{t('newproj.videoLengthLabel')}</span>
          <select value={props.videoLength} onChange={(e) => props.onVideoLength(Number(e.target.value))}>
            {VIDEO_LENGTHS_SEC.map((sec) => (
              <option key={sec} value={sec}>{t('newproj.videoLengthSeconds', { n: sec })}</option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  const models = supportedModels('audio', AUDIO_MODELS_BY_KIND[props.audioKind]);
  const audioDurations = props.audioKind === 'sfx'
    ? SFX_AUDIO_DURATIONS_SEC
    : AUDIO_DURATIONS_SEC;
  return (
    <div className="newproj-media-options">
      <OptionCards
        label={t('newproj.audioKindLabel')}
        options={[
          { value: 'speech' as const, title: t('newproj.audioKindSpeech') },
          { value: 'sfx' as const, title: t('newproj.audioKindSfx') },
        ]}
        value={props.audioKind}
        onChange={props.onAudioKind}
      />
      <MediaModelCards
        label={t('newproj.modelLabel')}
        models={models}
        mediaProviders={props.mediaProviders}
        value={props.audioModel}
        onChange={props.onAudioModel}
      />
      <label className="newproj-label">
        <span>{t('newproj.audioDurationLabel')}</span>
        <select value={props.audioDuration} onChange={(e) => props.onAudioDuration(Number(e.target.value))}>
          {audioDurations.map((sec) => (
            <option key={sec} value={sec}>{t('newproj.audioDurationSeconds', { n: sec })}</option>
          ))}
        </select>
      </label>
      {props.audioKind === 'speech' ? (
        <label className="newproj-label">
          <span>{t('newproj.voiceLabel')}</span>
          <input
            value={props.voice}
            placeholder={t('newproj.voicePlaceholder')}
            onChange={(e) => props.onVoice(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}
