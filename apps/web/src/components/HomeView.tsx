// Unified Home — brand header, project toolbar (search / grid / board),
// and the full curriculum projects catalog (DesignsTab).
//
// The former split between Home (recent strip) and Projects (catalog) is
// merged here so creation, search, and browsing share one surface.

import { useState } from 'react';
import { useT } from '../i18n';
import type {
  DesignSystemSummary,
  Project,
  SkillSummary,
} from '../types';
import { Icon } from './Icon';
import { DesignsTab } from './DesignsTab';

interface Props {
  projects: Project[];
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projectsLoading?: boolean;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onCreateProject: () => void;
  onProjectsRefresh?: () => void;
}

export function HomeView({
  projects,
  skills,
  designSystems,
  projectsLoading,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onCreateProject,
  onProjectsRefresh,
}: Props) {
  const t = useT();
  const newProjectLabel = t('entry.navNewProject');
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);

  return (
    <div className="home-view home-view--unified" data-testid="home-view">
      <header className="home-view__header">
        <div className="home-view__header-primary">
          <div className="home-view__brand-lockup" data-testid="home-view-brand">
            <img
              src="/od-logo.png"
              alt=""
              className="home-view__brand-logo"
              draggable={false}
            />
            <h1 className="home-view__brand">{t('app.brand')}</h1>
          </div>
          <button
            type="button"
            className="home-view__create"
            onClick={onCreateProject}
            aria-label={newProjectLabel}
            title={newProjectLabel}
            data-testid="home-view-create"
          >
            <Icon name="plus" size={20} />
          </button>
        </div>
        <div
          ref={setToolbarHost}
          className="home-view__toolbar"
          data-testid="home-view-toolbar"
        />
      </header>
      {projectsLoading ? (
        <div className="home-view__loading">{t('common.loading')}</div>
      ) : (
        <DesignsTab
          projects={projects}
          skills={skills}
          designSystems={designSystems}
          onOpen={onOpenProject}
          onOpenLiveArtifact={onOpenLiveArtifact}
          onDelete={onDeleteProject}
          {...(onProjectsRefresh ? { onProjectsRefresh } : {})}
          toolbarPortalTarget={toolbarHost}
        />
      )}
    </div>
  );
}
