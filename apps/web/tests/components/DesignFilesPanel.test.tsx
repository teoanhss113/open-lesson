// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile, ProjectFileKind } from '../../src/types';

function extForKind(kind: ProjectFileKind): string {
  if (kind === 'html') return 'html';
  if (kind === 'image') return 'png';
  if (kind === 'sketch') return 'sketch.json';
  if (kind === 'text') return 'txt';
  if (kind === 'code') return 'ts';
  if (kind === 'pdf') return 'pdf';
  return 'bin';
}

function file(overrides: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    path: overrides.name,
    type: 'file',
    size: 1024,
    mtime: Date.now(),
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  };
}

function generateFiles(count: number): ProjectFile[] {
  const kinds: ProjectFileKind[] = ['html', 'image', 'sketch', 'text', 'code', 'pdf'];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    return file({
      name: `file-${i + 1}.${extForKind(kind)}`,
      kind,
      size: 1024 * (i + 1),
      mtime: Date.now() - i * 60_000,
      mime: 'text/plain',
    });
  });
}

function renderPanel(files: ProjectFile[]) {
  const onOpenFile = vi.fn();
  const onDeleteFiles = vi.fn();
  const onUpload = vi.fn();
  const onUploadFolder = vi.fn();
  const onUploadFiles = vi.fn();
  const result = render(
    <DesignFilesPanel
      projectId="test-project"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={onOpenFile}
      onOpenLiveArtifact={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={onDeleteFiles}
      onUpload={onUpload}
      onUploadFolder={onUploadFolder}
      onUploadFiles={onUploadFiles}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
    />,
  );
  return { ...result, onDeleteFiles, onOpenFile, onUpload, onUploadFolder, onUploadFiles };
}

function getPageInfo(container: HTMLElement): string {
  const el = container.querySelector('.df-page-info');
  return el?.textContent?.trim() ?? '';
}

/** page-btn order: top-Prev=0, top-Next=1, bottom-Prev=2, bottom-Next=3 */
function getPageBtns(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.df-page-btn'));
}

function getSelects(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
}

describe('DesignFilesPanel upload actions', () => {
  it('calls onUploadFolder when Upload folder is clicked', () => {
    const onUploadFolder = vi.fn();
    render(
      <DesignFilesPanel
        projectId="test-project"
        files={[]}
        liveArtifacts={[]}
        onRefreshFiles={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onDeleteFiles={vi.fn()}
        onUpload={vi.fn()}
        onUploadFolder={onUploadFolder}
        onUploadFiles={vi.fn()}
        onPaste={vi.fn()}
        onNewSketch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('design-files-upload-folder-trigger'));
    expect(onUploadFolder).toHaveBeenCalledTimes(1);
  });
});

describe('DesignFilesPanel grouping', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('lists live artifacts when no on-disk files are available', () => {
    render(
      <DesignFilesPanel
        projectId="project-1"
        files={[]}
        liveArtifacts={[
          {
            kind: 'live-artifact',
            artifactId: 'artifact-1',
            tabId: 'live:artifact-1',
            projectId: 'project-1',
            title: 'Live Preview',
            slug: 'live-preview',
            status: 'active',
            refreshStatus: 'idle',
            pinned: false,
            preview: { type: 'html', entry: 'index.html' },
            hasDocument: true,
            updatedAt: '2026-05-09T12:00:00.000Z',
          },
        ]}
        onRefreshFiles={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenLiveArtifact={vi.fn()}
        onRenameFile={vi.fn()}
        onDeleteFile={vi.fn()}
        onDeleteFiles={vi.fn()}
        onUpload={vi.fn()}
        onUploadFolder={vi.fn()}
        onUploadFiles={vi.fn()}
        onPaste={vi.fn()}
        onNewSketch={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: 'Group by' })).toBeTruthy();
    expect(screen.getByTestId('design-file-row-live:artifact-1')).toBeTruthy();
  });

  it('groups files by kind when kind grouping is selected', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    const sectionLabels = Array.from(
      document.querySelectorAll<HTMLElement>('.df-section-label'),
    ).map((el) => el.textContent ?? '');
    expect(sectionLabels.length).toBeGreaterThan(0);
    expect(screen.getByTestId('design-file-row-page.html')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-chart.png')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('keeps kind grouping selected by default', () => {
    renderPanel([
      file({ name: 'page.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'chart.png', kind: 'image', mime: 'image/png' }),
    ]);

    const groupControls = screen.getByRole('group', { name: 'Group by' });
    const kindGroupButton = within(groupControls).getByRole('button', { name: 'Kind' });
    expect(kindGroupButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Name')).toBeTruthy();
    expect(document.querySelector('.df-th-kind')?.textContent).toContain('Kind');
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('can group files by modified date and collapse a date group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'today.html', mtime: new Date(2026, 4, 9, 11).getTime() }),
      file({ name: 'yesterday.html', mtime: new Date(2026, 4, 8, 12).getTime() }),
    ]);

    expect(screen.queryByText('Today')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-today.html')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-yesterday.html')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Collapse Today/i }));

    expect(screen.queryByTestId('design-file-row-today.html')).toBeNull();
    expect(screen.getByTestId('design-file-row-yesterday.html')).toBeTruthy();
  });

  it('keeps files from seven calendar days ago in the previous 7 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([file({ name: 'week-old.html', mtime: new Date(2026, 4, 2, 12).getTime() })]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 7 days')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-week-old.html')).toBeTruthy();
  });

  it('keeps files at the seven calendar day boundary in the previous 7 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'week-boundary.html', mtime: new Date(2026, 4, 2, 0, 0, 0, 0).getTime() }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 7 days')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-week-boundary.html')).toBeTruthy();
  });

  it('keeps files from thirty calendar days ago in the previous 30 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({ name: 'month-old.html', mtime: new Date(2026, 3, 9, 12).getTime() }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByTestId('design-file-row-month-old.html')).toBeTruthy();
  });

  it('keeps files at the thirty calendar day boundary in the previous 30 days group', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([
      file({
        name: 'month-boundary.html',
        mtime: new Date(2026, 3, 9, 0, 0, 0, 0).getTime(),
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Previous 30 days')).toBeTruthy();
    expect(screen.queryByText('Older')).toBeNull();
    expect(screen.getByTestId('design-file-row-month-boundary.html')).toBeTruthy();
  });

  it('groups files older than thirty calendar days into older', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel([file({ name: 'archive.html', mtime: new Date(2026, 3, 8, 12).getTime() })]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Older')).toBeTruthy();
    expect(screen.queryByText('Previous 30 days')).toBeNull();
    expect(screen.getByTestId('design-file-row-archive.html')).toBeTruthy();
  });

  it('groups only the current page so large file lists stay paginated', () => {
    const now = new Date(2026, 4, 9, 12).getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderPanel(
      Array.from({ length: 31 }, (_, i) =>
        file({ name: `today-${String(i + 1).padStart(2, '0')}.html`, mtime: now - i }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByTestId('design-file-row-today-01.html')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-today-31.html')).toBeNull();
    expect(getPageInfo(document.body)).toContain('1–30 of 31');
  });

  it('updates modified date groups when the local day changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 9, 23, 59, 50));

    renderPanel([file({ name: 'late-edit.html', mtime: new Date(2026, 4, 9, 23, 59).getTime() })]);

    fireEvent.click(screen.getByRole('button', { name: 'Modified' }));

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.queryByText('Yesterday')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_001);
    });

    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull();
    expect(screen.getByTestId('design-file-row-late-edit.html')).toBeTruthy();
  });

  it('exposes Stage / Folder / Size group toggles alongside Kind and Modified', () => {
    renderPanel([
      file({ name: 'lesson-plan-1.docx', kind: 'document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      file({ name: 'unit-2-slides.pptx', kind: 'presentation', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
    ]);

    expect(screen.getByTestId('design-files-group-stage')).toBeTruthy();
    expect(screen.getByTestId('design-files-group-folder')).toBeTruthy();
    expect(screen.getByTestId('design-files-group-size')).toBeTruthy();
  });

  it('groups files by curriculum stage when Stage grouping is selected', () => {
    renderPanel([
      file({ name: 'module-1-lesson-plan.docx', kind: 'document', mime: 'application/octet-stream' }),
      file({ name: 'unit-2-slides.pptx', kind: 'presentation', mime: 'application/octet-stream' }),
      file({ name: 'student-feedback.csv', kind: 'binary', mime: 'text/csv' }),
    ]);

    fireEvent.click(screen.getByTestId('design-files-group-stage'));

    const sectionLabels = Array.from(
      document.querySelectorAll<HTMLElement>('.df-section-label'),
    ).map((el) => el.textContent ?? '');

    // Each file should land in a distinct curriculum-stage bucket
    // (lesson-plan, slides, feedback) so we expect at least three
    // distinct section headers after grouping.
    const lessonRow = screen.getByTestId('design-file-row-module-1-lesson-plan.docx');
    const slidesRow = screen.getByTestId('design-file-row-unit-2-slides.pptx');
    const feedbackRow = screen.getByTestId('design-file-row-student-feedback.csv');
    expect(lessonRow).toBeTruthy();
    expect(slidesRow).toBeTruthy();
    expect(feedbackRow).toBeTruthy();
    expect(sectionLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('hides files outside the selected kind-family chip', () => {
    renderPanel([
      file({ name: 'unit-2-slides.pptx', kind: 'presentation', mime: 'application/octet-stream' }),
      file({ name: 'cover.png', kind: 'image', mime: 'image/png' }),
    ]);

    // Pre-condition: both rows visible.
    expect(screen.getByTestId('design-file-row-unit-2-slides.pptx')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-cover.png')).toBeTruthy();

    fireEvent.click(screen.getByTestId('design-files-filter-slides'));

    expect(screen.getByTestId('design-file-row-unit-2-slides.pptx')).toBeTruthy();
    expect(screen.queryByTestId('design-file-row-cover.png')).toBeNull();

    fireEvent.click(screen.getByTestId('design-files-filter-all'));

    expect(screen.getByTestId('design-file-row-unit-2-slides.pptx')).toBeTruthy();
    expect(screen.getByTestId('design-file-row-cover.png')).toBeTruthy();
  });
});

describe('DesignFilesPanel large-list regression', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders only the default page size (30) rows with 500 files', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);
    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
  });

  it('shows all 500 rows when page size is set to All', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[0]!, { target: { value: 'all' } });

    expect(container.querySelectorAll('.df-file-row').length).toBe(500);
  });

  it('shows 60 rows when page size is changed to 60', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[0]!, { target: { value: '60' } });

    expect(container.querySelectorAll('.df-file-row').length).toBe(60);
  });

  it('navigates pages with Next button and updates row content', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-1');

    const btns = getPageBtns(container);
    fireEvent.click(btns[1]!);

    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-31');
  });

  it('shows disabled Previous on first page and Next on last page', () => {
    const files = generateFiles(45);
    const { container } = renderPanel(files);

    const btns = getPageBtns(container);
    expect(btns[0]!.disabled).toBe(true);
    expect(btns[1]!.disabled).toBe(false);

    fireEvent.click(btns[1]!);
    const btns2 = getPageBtns(container);
    expect(btns2[0]!.disabled).toBe(false);

    fireEvent.click(getPageBtns(container)[1]!);
    fireEvent.click(getPageBtns(container)[1]!);
    expect(getPageBtns(container)[1]!.disabled).toBe(true);
  });

  it('jumps to a specific page via page dropdown at bottom', () => {
    const files = generateFiles(200);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[1]!, { target: { value: '3' } });

    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-91');
  });

  it('updates page info text when navigating', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    expect(getPageInfo(container)).toContain('1–30 of 500');

    const btns = getPageBtns(container);
    fireEvent.click(btns[1]!);

    expect(getPageInfo(container)).toContain('31–60 of 500');
  });

  it('keeps the bulk toolbar focused on the all-files action instead of duplicating page select', () => {
    const { container } = renderPanel(generateFiles(3));

    const toolbar = container.querySelector('.df-select-bar');
    expect(toolbar?.textContent).toContain('Select everything');
    expect(toolbar?.textContent).not.toContain('Select all on page');
  });

  it('opens a folder on double-click and shows breadcrumb navigation', () => {
    const { container } = renderPanel([
      file({ name: 'lessons/plan.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'lessons/unit-1/slides.html', kind: 'html', mime: 'text/html' }),
      file({ name: 'index.html', kind: 'html', mime: 'text/html' }),
    ]);

    const folderRow = container.querySelector('[data-testid="design-folder-row-lessons"]')!;
    expect(folderRow).toBeTruthy();
    fireEvent.doubleClick(folderRow.querySelector('.df-cell-name')!);

    expect(container.querySelector('[data-testid="design-folder-row-lessons--unit-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="design-file-row-lessons/plan.html"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'lessons' })).toBeTruthy();

    fireEvent.click(within(container).getByRole('button', { name: 'project' }));
    expect(container.querySelector('[data-testid="design-folder-row-lessons"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="design-file-row-index.html"]')).toBeTruthy();
  });

  it('uses non-control table cells as file row click targets', () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const row = container.querySelector('.df-file-row')!;

    fireEvent.click(row.querySelector('.df-cell-icon')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')?.textContent).toContain(
      'file-1.html',
    );

    fireEvent.click(row.querySelector('.df-cell-kind')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')?.textContent).toContain(
      'file-1.html',
    );

    fireEvent.click(row.querySelector('.df-cell-name')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')?.textContent).toContain(
      'file-1.html',
    );

    fireEvent.doubleClick(row.querySelector('.df-cell-name')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-1.html');
    onOpenFile.mockClear();

    fireEvent.doubleClick(row.querySelector('.df-cell-time')!);
    expect(onOpenFile).toHaveBeenCalledWith('file-1.html');
  });

  it('does not preview or open files from row controls', () => {
    const files = generateFiles(1);
    const { container, onOpenFile } = renderPanel(files);
    const row = container.querySelector('.df-file-row')!;

    fireEvent.click(row.querySelector('.df-row-check')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();

    fireEvent.click(row.querySelector('.df-row-menu')!);
    expect(container.querySelector('[data-testid="design-file-preview"]')).toBeNull();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('renders sketch files with the static sketch preview instead of a broken image', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'rect',
          x: 20,
          y: 16,
          w: 120,
          h: 72,
          color: '#1c1b1a',
          size: 2,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const sketchFile = file({
      name: 'board.sketch.json',
      path: 'board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const { container } = renderPanel([sketchFile]);

    fireEvent.click(container.querySelector('.df-file-row .df-row-name-btn')!);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeTruthy();
    });
    expect(container.querySelector('.df-preview-thumb img')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/test-project/raw/board.sketch.json', { cache: 'no-store' });
  });

  it('passes every selected file to batch delete', () => {
    const files = generateFiles(3);
    const { container, onDeleteFiles } = renderPanel(files);
    const rows = Array.from(container.querySelectorAll('.df-file-row'));

    const firstName = rows[0]!.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    const secondName = rows[1]!.getAttribute('data-testid')!.replace(/^design-file-row-/, '');
    fireEvent.click(rows[0]!.querySelector('.df-row-check')!);
    fireEvent.click(rows[1]!.querySelector('.df-row-check')!);
    fireEvent.click(container.querySelector('[data-testid="design-files-batch-delete"]')!);

    expect(onDeleteFiles).toHaveBeenCalledTimes(1);
    expect(onDeleteFiles).toHaveBeenCalledWith([firstName, secondName]);
  });

  it('renders 500 files within a reasonable time', () => {
    const files = generateFiles(500);
    const start = performance.now();
    renderPanel(files);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('opens the file picker when the drop zone is clicked', () => {
    const { onUpload } = renderPanel(generateFiles(1));
    fireEvent.click(screen.getByTestId('design-files-drop-zone'));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('forwards dropped files to onUploadFiles', () => {
    const { onUploadFiles } = renderPanel(generateFiles(1));
    const dropZone = screen.getByTestId('design-files-drop-zone');
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });
    expect(onUploadFiles).toHaveBeenCalledWith([file]);
  });
});
