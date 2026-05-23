// Minimal Home view — brand title plus a single "+" affordance to
// start a new project. Recent projects render below.
//
// This surface deliberately drops the older centered prompt hero,
// plugins-home, tasks, and use-everywhere blocks that used to live
// above Recent projects. Those components still ship in the
// codebase for other surfaces (PluginsView, dedicated tabs) but
// no longer render on the home page.

import { useT } from '../i18n';
import { APP_NAME } from '../constants';
import type { Project } from '../types';
import { Icon } from './Icon';
import { RecentProjectsStrip } from './RecentProjectsStrip';

interface Props {
  projects: Project[];
  projectsLoading?: boolean;
  onOpenProject: (id: string) => void;
  onViewAllProjects: () => void;
  onCreateProject: () => void;
}

export function HomeView({
  projects,
  projectsLoading,
  onOpenProject,
  onViewAllProjects,
  onCreateProject,
}: Props) {
  const t = useT();
  const newProjectLabel = t('entry.navNewProject');

  return (
    <div className="home-view" data-testid="home-view">
      <header className="home-view__header">
        <h1 className="home-view__brand" data-testid="home-view-brand">
          {APP_NAME}
        </h1>
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
      </header>
      <RecentProjectsStrip
        projects={projects}
        {...(projectsLoading !== undefined ? { loading: projectsLoading } : {})}
        onOpen={onOpenProject}
        onViewAll={onViewAllProjects}
      />
    </div>
  );
}
