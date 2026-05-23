// Horizontal "Recent projects" rail for the Home view.
//
// Mirrors the strip Lovart shows under its hero: a small set of
// recent project cards with a "View all" link that switches to the
// full Projects view. We keep the data shape narrow (Project[] +
// onOpen / onViewAll) so the strip can be reused later by other
// surfaces (e.g. an in-project quick-switcher pane).

import { useT } from '../i18n';
import type { Project } from '../types';
import { Icon } from './Icon';
import { projectFileUrl } from '../providers/registry';
import type { CSSProperties } from 'react';

interface Props {
  projects: Project[];
  loading?: boolean;
  onOpen: (id: string) => void;
  onViewAll: () => void;
  limit?: number;
}

export function RecentProjectsStrip({
  projects,
  loading,
  onOpen,
  onViewAll,
  limit = 6,
}: Props) {
  const t = useT();
  const recent = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

  return (
    <section className="recent-projects" data-testid="recent-projects-strip">
      <header className="recent-projects__head">
        <h2 className="recent-projects__title">{t('home.recentProjectsTitle')}</h2>
        <button
          type="button"
          className="recent-projects__view-all"
          onClick={onViewAll}
          data-testid="recent-projects-view-all"
        >
          <span>{t('home.recentProjectsViewAll')}</span>
          <Icon name="chevron-right" size={12} />
        </button>
      </header>
      {loading && recent.length === 0 ? (
        <div className="recent-projects__empty">{t('common.loading')}</div>
      ) : recent.length === 0 ? (
        <div className="recent-projects__empty">{t('home.recentProjectsEmpty')}</div>
      ) : (
        <div className="recent-projects__row" role="list">
          {recent.map((project) => {
            const cover = projectCover(project);
            return (
              <button
                key={project.id}
                type="button"
                role="listitem"
                className="recent-projects__card"
                onClick={() => onOpen(project.id)}
                title={project.name}
                data-project-id={project.id}
              >
                <div
                  className="recent-projects__card-thumb"
                  aria-hidden
                  style={cover.kind === 'fallback' ? cover.style : undefined}
                >
                  {cover.kind === 'image' ? (
                    <img
                      className="recent-projects__card-img"
                      src={cover.src}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <span className="recent-projects__card-glyph">
                    {cover.initial}
                  </span>
                </div>
                <div className="recent-projects__card-meta">
                  <div className="recent-projects__card-name">{project.name}</div>
                  <div className="recent-projects__card-time">
                    {relativeTime(project.updatedAt, t)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function projectCover(project: Project): {
  kind: 'image' | 'fallback';
  src?: string;
  style: CSSProperties;
  initial: string;
} {
  let h = 0;
  for (let i = 0; i < project.id.length; i++) {
    h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const style: CSSProperties = {
    background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
  };
  const trimmed = project.name.trim();
  const initial = (trimmed ? Array.from(trimmed)[0]! : '?').toUpperCase();
  const meta = project.metadata;
  const entry = meta?.entryFile;
  if (entry && meta?.kind === 'image') {
    return { kind: 'image', src: projectFileUrl(project.id, entry), style, initial };
  }
  return { kind: 'fallback', style, initial };
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}
