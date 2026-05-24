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
} from '../../media/models';
import { openFolderDialog } from '../../providers/registry';
import { Icon } from '../Icon';
import { Toast } from '../Toast';
import { UiActionButton } from '../UiPrimitives';

import type {
  CreateTab,
  NewProjectPanelProps,
} from './types';
import {
  autoCurriculumWorkspaceName,
  defaultCurriculumWorkspaceSkillId,
  formatPickAndImportErrorDetails,
  defaultDesignSystemSelection,
  buildDesignSystemCreateSelection,
  buildMetadata,
} from './utils';
import {
  DesignSystemPicker,
} from './Pickers';
import { CurriculumMetadataSection } from './Curriculum';
import { ConnectorsSection } from './Connectors';

const DEFAULT_CURRICULUM_LEVELS = 'basic, advanced, intensive';

export function NewProjectPanel({
  skills,
  designSystems,
  defaultDesignSystemId,
  templates,
  onCreate,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
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
  const tab: CreateTab = 'live-artifact';
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

  // Curriculum metadata states
  const [ageGroup, setAgeGroup] = useState('');
  const [curriculumVersion, setCurriculumVersion] = useState('v1.0');

  const showDesignSystemPicker = true;

  useEffect(() => {
    if (dsSelectionTouched) return;
    setSelectedDsIds(initialDefaultDsSelection);
  }, [dsSelectionTouched, initialDefaultDsSelection]);

  const skillIdForTab = useMemo(
    () => defaultCurriculumWorkspaceSkillId(skills),
    [skills],
  );

  const canCreate = !loading;

  function handleDesignSystemChange(ids: string[]) {
    setDsSelectionTouched(true);
    setSelectedDsIds(ids);
  }

  function handleCreate() {
    if (!canCreate) return;
    const { primary: primaryDs, inspirations } =
      buildDesignSystemCreateSelection(showDesignSystemPicker, selectedDsIds);
    const metadata = buildMetadata({
      tab,
      mediaSurface: 'image',
      fidelity: 'high-fidelity',
      platformTargets: ['responsive'],
      includeLandingPage: false,
      includeOsWidgets: false,
      speakerNotes: false,
      animations: false,
      templateId: null,
      templates,
      imageModel: DEFAULT_IMAGE_MODEL,
      imageAspect: '1:1',
      videoModel: DEFAULT_VIDEO_MODEL,
      videoAspect: '16:9',
      videoLength: 5,
      audioKind: 'speech',
      audioModel: DEFAULT_AUDIO_MODEL.speech,
      audioDuration: 10,
      voice: '',
      inspirationIds: inspirations,
      promptTemplate: null,
      ageGroup,
      level: DEFAULT_CURRICULUM_LEVELS,
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
    const fallbackName = autoCurriculumWorkspaceName(t);
    return onCreate({
      name: name.trim() || fallbackName,
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
    setImportFolderError(null);
    setImportingFolder(true);
    try {
      let selectedDir = baseDir.trim();
      if (!selectedDir) {
        const pickedDir = await openFolderDialog();
        if (!pickedDir) return;
        selectedDir = pickedDir;
        setBaseDir(pickedDir);
      }
      const opened = await onImportFolder(selectedDir);
      if (!opened) {
        setImportFolderError({
          message: `Open folder failed: ${selectedDir}`,
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
      <div className="newproj-body newproj-body--workspace">
        <h3 className="newproj-title">
          <span className="newproj-title-text">{t('newproj.titleCurriculumWorkspace')}</span>
        </h3>
        <p className="newproj-intro">
          {t('newproj.curriculumWorkspaceIntro')}
        </p>

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

        <CurriculumMetadataSection
          ageGroup={ageGroup}
          onChangeAgeGroup={setAgeGroup}
          curriculumVersion={curriculumVersion}
          onChangeCurriculumVersion={setCurriculumVersion}
        />

        <ConnectorsSection
          connectors={connectors}
          loading={connectorsLoading}
          onOpenConnectorsTab={onOpenConnectorsTab}
        />

        <UiActionButton
          type="button"
          tone="primary"
          icon="plus"
          className="newproj-create"
          data-testid="create-project"
          onClick={handleCreate}
          disabled={!canCreate}
        >
          {t('newproj.createCurriculumWorkspace')}
        </UiActionButton>
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
              disabled={importingFolder}
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
