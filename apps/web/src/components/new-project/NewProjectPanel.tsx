import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createTabToTracking,
  projectKindToTracking,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../../analytics/provider';
import { trackHomeClickCreateButton } from '../../analytics/events';

import { useT } from '../../i18n';
import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  VIDEO_MODELS,
} from '../../media/models';
import type { AudioKind, MediaAspect } from '../../types';
import { Icon } from '../Icon';
import { Toast } from '../Toast';

import type {
  CreateTab,
  MediaSurface,
  NewProjectPanelProps,
  NewProjectPlatform,
  PromptTemplatePick,
} from './types';
import {
  SFX_AUDIO_DURATIONS_SEC,
  formatPickAndImportErrorDetails,
  defaultDesignSystemSelection,
  buildDesignSystemCreateSelection,
  buildMetadata,
  titleForTab,
  autoName,
  TAB_LABEL_KEYS,
  MEDIA_SURFACE_LABEL_KEYS,
} from './utils';
import {
  PlatformPicker,
  FidelityPicker,
  TemplatePicker,
  PromptTemplatePicker,
  DesignSystemPicker,
} from './Pickers';
import {
  SurfaceOptions,
  ToggleRow,
  MediaProjectOptions,
} from './Options';
import { CurriculumMetadataSection } from './Curriculum';
import { ConnectorsSection } from './Connectors';

export function NewProjectPanel({
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  onDeleteTemplate,
  promptTemplates,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  mediaProviders,
  connectors,
  connectorsLoading = false,
  onOpenConnectorsTab,
  loading = false,
}: NewProjectPanelProps) {
  const t = useT();
  const analytics = useAnalytics();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [baseDir, setBaseDir] = useState('');
  const [importingFolder, setImportingFolder] = useState(false);
  const [importFolderError, setImportFolderError] = useState<
    { message: string; details?: string } | null
  >(null);
  const [tab, setTab] = useState<CreateTab>('prototype');
  const [mediaSurface, setMediaSurface] = useState<MediaSurface>('image');
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });
  const [name, setName] = useState('');

  const initialDefaultDsSelection = useMemo(
    () => defaultDesignSystemSelection(defaultDesignSystemId, designSystems),
    [defaultDesignSystemId, designSystems],
  );
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>(
    () => initialDefaultDsSelection,
  );
  const [dsSelectionTouched, setDsSelectionTouched] = useState(false);
  const [dsMulti, setDsMulti] = useState(false);

  const [fidelity, setFidelity] = useState<'wireframe' | 'high-fidelity'>(
    'high-fidelity',
  );
  const [platformTargets, setPlatformTargets] = useState<NewProjectPlatform[]>(['responsive']);
  const [includeLandingPage, setIncludeLandingPage] = useState(false);
  const [includeOsWidgets, setIncludeOsWidgets] = useState(false);
  const [speakerNotes, setSpeakerNotes] = useState(false);
  const [animations, setAnimations] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  const [imageAspect, setImageAspect] = useState<MediaAspect>('1:1');
  const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
  const [videoModelTouched, setVideoModelTouched] = useState(false);
  const [videoAspect, setVideoAspect] = useState<MediaAspect>('16:9');
  const [videoLength, setVideoLength] = useState(5);
  const [audioKind, setAudioKind] = useState<AudioKind>('speech');
  const [audioModel, setAudioModel] = useState(DEFAULT_AUDIO_MODEL.speech);
  const [audioDuration, setAudioDuration] = useState(10);
  const [voice, setVoice] = useState('');

  const [imagePromptTemplate, setImagePromptTemplate] =
    useState<PromptTemplatePick | null>(null);
  const [videoPromptTemplate, setVideoPromptTemplate] =
    useState<PromptTemplatePick | null>(null);

  // Curriculum metadata states
  const [curriculumKind, setCurriculumKind] = useState<'lesson-plan' | 'teaching-guide' | 'slides' | 'curriculum-review' | 'rollout-validation'>('lesson-plan');
  const [courseName, setCourseName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [level, setLevel] = useState('');
  const [curriculumVersion, setCurriculumVersion] = useState('v1.0');

  const tabSupportsDesignSystem =
    tab === 'prototype' ||
    tab === 'deck' ||
    tab === 'template' ||
    tab === 'other';

  const tabDefaultSkillForcesNoDs = useMemo(() => {
    const tabSkillId = ((): string | null => {
      if (tab === 'prototype' || tab === 'live-artifact') {
        const list = skills.filter((s) => s.mode === 'prototype');
        return list.find((s) => s.defaultFor.includes('prototype'))?.id
          ?? list[0]?.id ?? null;
      }
      if (tab === 'deck') {
        const list = skills.filter((s) => s.mode === 'deck');
        return list.find((s) => s.defaultFor.includes('deck'))?.id
          ?? list[0]?.id ?? null;
      }
      return null;
    })();
    if (!tabSkillId) return false;
    const s = skills.find((x) => x.id === tabSkillId);
    return s
      ? s.scenario === 'orbit' && s.designSystemRequired === false
      : false;
  }, [tab, skills]);

  const showDesignSystemPicker =
    tabSupportsDesignSystem && !tabDefaultSkillForcesNoDs;

  useEffect(() => {
    if (dsSelectionTouched) return;
    setSelectedDsIds(initialDefaultDsSelection);
  }, [dsSelectionTouched, initialDefaultDsSelection]);

  useEffect(() => {
    if (tab !== 'template') return;
    if (templates.length === 0) {
      setTemplateId(null);
      return;
    }
    if (templateId == null || !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]!.id);
    }
  }, [tab, templates, templateId]);

  const skillIdForTab = useMemo(() => {
    if (tab === 'other') return null;
    if (tab === 'prototype') {
      const list = skills.filter((s) => s.mode === 'prototype');
      return list.find((s) => s.defaultFor.includes('prototype'))?.id
        ?? list[0]?.id
        ?? null;
    }
    if (tab === 'live-artifact') {
      if (curriculumKind === 'lesson-plan') {
        const skill = skills.find((s) => s.id === 'lesson-plan-generator');
        if (skill) return skill.id;
      } else if (curriculumKind === 'teaching-guide') {
        const skill = skills.find((s) => s.id === 'teaching-guide-generator');
        if (skill) return skill.id;
      } else if (curriculumKind === 'curriculum-review') {
        const skill = skills.find((s) => s.id === 'curriculum-analysis');
        if (skill) return skill.id;
      } else if (curriculumKind === 'rollout-validation') {
        const skill = skills.find((s) => s.id === 'curriculum-review');
        if (skill) return skill.id;
      }
      const exact = skills.find((s) => s.id === 'live-artifact' || s.name === 'live-artifact');
      if (exact) return exact.id;
      const hinted = skills.find((s) => {
        const haystack = `${s.id} ${s.name} ${s.description} ${s.triggers.join(' ')}`.toLowerCase();
        return haystack.includes('live artifact') || haystack.includes('live-artifact');
      });
      if (hinted) return hinted.id;
      const prototypes = skills.filter((s) => s.mode === 'prototype');
      return prototypes.find((s) => s.defaultFor.includes('prototype'))?.id
        ?? prototypes[0]?.id
        ?? null;
    }
    if (tab === 'deck') {
      const list = skills.filter((s) => s.mode === 'deck');
      return list.find((s) => s.defaultFor.includes('deck'))?.id
        ?? list[0]?.id
        ?? null;
    }
    if (tab === 'media') {
      const list = skills.filter(
        (s) => s.mode === mediaSurface || s.surface === mediaSurface,
      );
      if (mediaSurface === 'video' && videoModel === 'hyperframes-html') {
        const hyper = list.find((s) => s.id === 'hyperframes');
        if (hyper) return hyper.id;
      }
      return list.find((s) => s.defaultFor.includes(mediaSurface))?.id
        ?? list[0]?.id
        ?? null;
    }
    return null;
  }, [tab, mediaSurface, skills, videoModel, curriculumKind]);

  function handleImagePromptTemplate(pick: PromptTemplatePick | null) {
    setImagePromptTemplate(pick);
    const m = pick?.summary.model;
    if (m && IMAGE_MODELS.some((x) => x.id === m)) setImageModel(m);
    const a = pick?.summary.aspect;
    if (a && (MEDIA_ASPECTS as readonly string[]).includes(a)) {
      setImageAspect(a as MediaAspect);
    }
  }

  function handleVideoPromptTemplate(pick: PromptTemplatePick | null) {
    setVideoPromptTemplate(pick);
    const m = pick?.summary.model;
    if (m && VIDEO_MODELS.some((x) => x.id === m)) {
      setVideoModel(m);
      setVideoModelTouched(true);
    }
    const a = pick?.summary.aspect;
    if (a && (MEDIA_ASPECTS as readonly string[]).includes(a)) {
      setVideoAspect(a as MediaAspect);
    }
  }

  function handleVideoModel(id: string) {
    setVideoModel(id);
    setVideoModelTouched(true);
  }

  useEffect(() => {
    if (tab !== 'media' || mediaSurface !== 'video') return;
    if (skillIdForTab !== 'hyperframes') return;
    if (videoModelTouched) return;
    if (videoPromptTemplate) return;
    if (!VIDEO_MODELS.some((m) => m.id === 'hyperframes-html')) return;
    setVideoModel('hyperframes-html');
  }, [tab, mediaSurface, skillIdForTab, videoModelTouched, videoPromptTemplate]);

  const canCreate =
    !loading && (tab !== 'template' || templateId != null);

  function updateTabScrollState() {
    const el = tabsRef.current;
    if (!el) return;
    const maxLeft = el.scrollWidth - el.clientWidth;
    setTabScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft < maxLeft - 2,
    });
  }

  function scrollTabs(direction: -1 | 1) {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(120, el.clientWidth * 0.65),
      behavior: 'smooth',
    });
  }

  function handleDesignSystemChange(ids: string[]) {
    setDsSelectionTouched(true);
    setSelectedDsIds(ids);
  }

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateTabScrollState();
    const onScroll = () => updateTabScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(updateTabScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    const active = el?.querySelector<HTMLButtonElement>('.newproj-tab.active');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    window.setTimeout(updateTabScrollState, 180);
  }, [tab]);

  function handleCreate() {
    if (!canCreate) return;
    const { primary: primaryDs, inspirations } =
      buildDesignSystemCreateSelection(showDesignSystemPicker, selectedDsIds);
    const promptTemplatePick =
      tab === 'media'
        ? mediaSurface === 'image'
          ? imagePromptTemplate
          : mediaSurface === 'video'
            ? videoPromptTemplate
            : null
        : null;
    const metadata = buildMetadata({
      tab,
      mediaSurface,
      fidelity,
      platformTargets,
      includeLandingPage,
      includeOsWidgets,
      speakerNotes,
      animations,
      templateId,
      templates,
      imageModel,
      imageAspect,
      videoModel,
      videoAspect,
      videoLength,
      audioKind,
      audioModel,
      audioDuration,
      voice,
      inspirationIds: inspirations,
      promptTemplate: promptTemplatePick,
      curriculumKind,
      courseName,
      moduleName,
      lessonTitle,
      ageGroup,
      level,
      curriculumVersion,
    });

    const requestId = analytics.newRequestId();
    const trackedKind = projectKindToTracking(metadata?.kind ?? null) ?? 'prototype';
    trackHomeClickCreateButton(
      analytics.track,
      {
        page: 'home',
        area: 'create_panel',
        element: 'create_button',
        action: 'create_project',
        source_tab: createTabToTracking(tab),
        project_kind: trackedKind,
        has_project_name: name.trim().length > 0,
      },
      { requestId },
    );
    onCreate({
      name: name.trim() || autoName(tab, mediaSurface, t),
      skillId: skillIdForTab,
      designSystemId: primaryDs,
      metadata,
      requestId,
    });
  }

  async function handleImportPicked(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file || !onImportClaudeDesign) return;
    setImporting(true);
    try {
      await onImportClaudeDesign(file);
    } finally {
      setImporting(false);
    }
  }

  const hasElectronPickAndImport =
    typeof window !== 'undefined' && typeof window.electronAPI?.pickAndImport === 'function';

  async function handleOpenFolder() {
    if (hasElectronPickAndImport) {
      if (!onImportFolderResponse) return;
      setImportFolderError(null);
      setImportingFolder(true);
      try {
        const result = await window.electronAPI!.pickAndImport!({
          skillId: skillIdForTab,
        });
        if (!result) return;
        if (result.ok === true) {
          await onImportFolderResponse(result.response);
          return;
        }
        if ('canceled' in result && result.canceled === true) return;
        const reason = 'reason' in result && typeof result.reason === 'string'
          ? result.reason
          : 'unknown failure';
        const details = 'details' in result && result.details != null
          ? formatPickAndImportErrorDetails(result.details)
          : undefined;
        setImportFolderError({
          message: `Open folder failed: ${reason}`,
          ...(details ? { details } : {}),
        });
      } finally {
        setImportingFolder(false);
      }
      return;
    }
    if (!onImportFolder) return;
    const trimmed = baseDir.trim();
    if (!trimmed) return;
    setImportFolderError(null);
    setImportingFolder(true);
    try {
      const opened = await onImportFolder(trimmed);
      if (!opened) {
        setImportFolderError({
          message: `Open folder failed: ${trimmed}`,
        });
      }
    } catch (err) {
      setImportFolderError({
        message: `Open folder failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    } finally {
      setImportingFolder(false);
    }
  }

  return (
    <div className="newproj" data-testid="new-project-panel">
      <div className={`newproj-tabs-shell${tabScroll.left ? ' can-left' : ''}${tabScroll.right ? ' can-right' : ''}`}>
        <button
          type="button"
          className={`newproj-tabs-arrow left${tabScroll.left ? '' : ' hidden'}`}
          onClick={() => scrollTabs(-1)}
          aria-label="Scroll project types left"
          tabIndex={tabScroll.left ? 0 : -1}
        >
          <Icon name="chevron-left" size={16} strokeWidth={2} />
        </button>
        <div className="newproj-tabs" role="tablist" ref={tabsRef}>
          {(Object.keys(TAB_LABEL_KEYS) as CreateTab[]).map((entry) => (
            <button
              key={entry}
              role="tab"
              data-testid={`new-project-tab-${entry}`}
              aria-selected={tab === entry}
              className={`newproj-tab ${tab === entry ? 'active' : ''}`}
              onClick={() => setTab(entry)}
            >
              {t(TAB_LABEL_KEYS[entry])}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`newproj-tabs-arrow right${tabScroll.right ? '' : ' hidden'}`}
          onClick={() => scrollTabs(1)}
          aria-label="Scroll project types right"
          tabIndex={tabScroll.right ? 0 : -1}
        >
          <Icon name="chevron-right" size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="newproj-body">
        <h3 className="newproj-title">
          <span className="newproj-title-text">{titleForTab(tab, mediaSurface, t)}</span>
          {tab === 'live-artifact' ? (
            <span className="newproj-title-badge" aria-label="Beta feature">Beta</span>
          ) : null}
        </h3>

        <input
          className="newproj-name"
          data-testid="new-project-name"
          placeholder={t('newproj.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {showDesignSystemPicker ? (
          <DesignSystemPicker
            designSystems={designSystems}
            defaultDesignSystemId={defaultDesignSystemId}
            selectedIds={selectedDsIds}
            multi={dsMulti}
            onChangeMulti={setDsMulti}
            onChange={handleDesignSystemChange}
            loading={loading}
          />
        ) : null}

        {tab === 'media' ? (
          <div
            className="newproj-media-segmented"
            role="tablist"
            aria-label={t('newproj.tabMedia')}
          >
            {(Object.keys(MEDIA_SURFACE_LABEL_KEYS) as MediaSurface[]).map((surface) => (
              <button
                key={surface}
                type="button"
                role="tab"
                data-testid={`new-project-media-surface-${surface}`}
                aria-selected={mediaSurface === surface}
                className={`newproj-media-surface ${mediaSurface === surface ? 'active' : ''}`}
                onClick={() => setMediaSurface(surface)}
              >
                {t(MEDIA_SURFACE_LABEL_KEYS[surface])}
              </button>
            ))}
          </div>
        ) : null}

        {tab === 'media' && mediaSurface === 'image' ? (
          <PromptTemplatePicker
            surface="image"
            templates={promptTemplates}
            value={imagePromptTemplate}
            onChange={handleImagePromptTemplate}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'video' ? (
          <PromptTemplatePicker
            surface="video"
            templates={promptTemplates}
            value={videoPromptTemplate}
            onChange={handleVideoPromptTemplate}
          />
        ) : null}

        {tab === 'prototype' || tab === 'live-artifact' || tab === 'template' || tab === 'other' ? (
          <PlatformPicker value={platformTargets} onChange={setPlatformTargets} />
        ) : null}

        {tab === 'prototype' || tab === 'live-artifact' || tab === 'template' || tab === 'other' ? (
          <SurfaceOptions
            includeLandingPage={includeLandingPage}
            includeOsWidgets={includeOsWidgets}
            onIncludeLandingPage={setIncludeLandingPage}
            onIncludeOsWidgets={setIncludeOsWidgets}
          />
        ) : null}

        {tab === 'prototype' || tab === 'live-artifact' ? (
          <CurriculumMetadataSection
            curriculumKind={curriculumKind}
            onChangeCurriculumKind={setCurriculumKind}
            courseName={courseName}
            onChangeCourseName={setCourseName}
            moduleName={moduleName}
            onChangeModuleName={setModuleName}
            lessonTitle={lessonTitle}
            onChangeLessonTitle={setLessonTitle}
            ageGroup={ageGroup}
            onChangeAgeGroup={setAgeGroup}
            level={level}
            onChangeLevel={setLevel}
            curriculumVersion={curriculumVersion}
            onChangeCurriculumVersion={setCurriculumVersion}
          />
        ) : null}

        {tab === 'prototype' ? (
          <FidelityPicker value={fidelity} onChange={setFidelity} />
        ) : null}

        {tab === 'live-artifact' ? (
          <ConnectorsSection
            connectors={connectors}
            loading={connectorsLoading}
            onOpenConnectorsTab={onOpenConnectorsTab}
          />
        ) : null}

        {tab === 'deck' ? (
          <ToggleRow
            label={t('newproj.toggleSpeakerNotes')}
            hint={t('newproj.toggleSpeakerNotesHint')}
            checked={speakerNotes}
            onChange={setSpeakerNotes}
          />
        ) : null}

        {tab === 'template' ? (
          <>
            <TemplatePicker
              templates={templates}
              value={templateId}
              onChange={setTemplateId}
              onDelete={onDeleteTemplate}
            />
            <ToggleRow
              label={t('newproj.toggleAnimations')}
              hint={t('newproj.toggleAnimationsHint')}
              checked={animations}
              onChange={setAnimations}
            />
          </>
        ) : null}

        {tab === 'media' && mediaSurface === 'image' ? (
          <MediaProjectOptions
            surface="image"
            imageModel={imageModel}
            imageAspect={imageAspect}
            mediaProviders={mediaProviders}
            onImageModel={setImageModel}
            onImageAspect={setImageAspect}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'video' ? (
          <MediaProjectOptions
            surface="video"
            videoModel={videoModel}
            videoAspect={videoAspect}
            videoLength={videoLength}
            mediaProviders={mediaProviders}
            onVideoModel={handleVideoModel}
            onVideoAspect={setVideoAspect}
            onVideoLength={setVideoLength}
          />
        ) : null}

        {tab === 'media' && mediaSurface === 'audio' ? (
          <MediaProjectOptions
            surface="audio"
            audioKind={audioKind}
            audioModel={audioModel}
            audioDuration={audioDuration}
            voice={voice}
            mediaProviders={mediaProviders}
            onAudioKind={(kind) => {
              setAudioKind(kind);
              setAudioModel(DEFAULT_AUDIO_MODEL[kind]);
              if (kind === 'sfx') {
                setAudioDuration((duration) => Math.min(duration, SFX_AUDIO_DURATIONS_SEC.at(-1) ?? 30));
              }
            }}
            onAudioModel={setAudioModel}
            onAudioDuration={setAudioDuration}
            onVoice={setVoice}
          />
        ) : null}

        <button
          className="primary newproj-create"
          data-testid="create-project"
          onClick={handleCreate}
          disabled={!canCreate}
          title={
            tab === 'template' && templateId == null
              ? t('newproj.createDisabledTitle')
              : undefined
          }
        >
          <Icon name="plus" size={13} />
          <span>
            {tab === 'template'
              ? t('newproj.createFromTemplate')
              : tab === 'live-artifact'
                ? t('newproj.createLiveArtifact')
              : t('newproj.create')}
          </span>
        </button>
        {onImportClaudeDesign ? (
          <>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={handleImportPicked}
            />
            <button
              type="button"
              className="ghost newproj-import"
              disabled={loading || importing}
              title={t('newproj.importClaudeZipTitle')}
              onClick={() => importInputRef.current?.click()}
            >
              <Icon name="import" size={13} />
              <span>
                {importing
                  ? t('newproj.importingClaudeZip')
                  : t('newproj.importClaudeZip')}
              </span>
            </button>
          </>
        ) : null}
        {(hasElectronPickAndImport ? onImportFolderResponse : onImportFolder) ? (
          <div className="newproj-open-folder">
            {!hasElectronPickAndImport ? (
              <input
                type="text"
                className="newproj-folder-input"
                placeholder="/path/to/project"
                value={baseDir}
                onChange={(e) => setBaseDir(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleOpenFolder(); }}
                disabled={importingFolder}
              />
            ) : null}
            <button
              type="button"
              className="ghost newproj-import"
              disabled={(!hasElectronPickAndImport && !baseDir.trim()) || importingFolder}
              onClick={() => void handleOpenFolder()}
            >
              <Icon name="folder" size={13} />
              <span>{importingFolder ? 'Opening…' : 'Open folder'}</span>
            </button>
          </div>
        ) : null}
      </div>
      <div className="newproj-footer">{t('newproj.privacyFooter')}</div>
      {importFolderError ? (
        <Toast
          message={importFolderError.message}
          details={importFolderError.details ?? null}
          ttlMs={6000}
          onDismiss={() => setImportFolderError(null)}
        />
      ) : null}
    </div>
  );
}
