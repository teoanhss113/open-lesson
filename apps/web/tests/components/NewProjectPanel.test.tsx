// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildDesignSystemCreateSelection,
  defaultDesignSystemSelection,
  NewProjectPanel,
} from '../../src/components/NewProjectPanel';
import { openFolderDialog } from '../../src/providers/registry';
import type { DesignSystemSummary, SkillSummary } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  openFolderDialog: vi.fn(),
}));

const skills: SkillSummary[] = [
  {
    id: 'prototype-skill',
    name: 'Prototype',
    description: 'Build prototypes',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: ['prototype'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a prototype.',
    aggregatesExamples: false,
  },
  {
    id: 'lesson-plan-generator',
    name: 'Lesson Plan Generator',
    description: 'Build structured lesson plans',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a lesson plan.',
    aggregatesExamples: false,
  },
  {
    id: 'teaching-guide-generator',
    name: 'Teaching Guide Generator',
    description: 'Build teaching guides',
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a teaching guide.',
    aggregatesExamples: false,
  },
  {
    id: 'deck-skill',
    name: 'Deck',
    description: 'Build slide decks',
    mode: 'deck',
    surface: 'deck',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: ['deck'],
    triggers: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a deck.',
    aggregatesExamples: false,
  },
];

const designSystems: DesignSystemSummary[] = [
  {
    id: 'clay',
    title: 'Clay',
    summary: 'Friendly tactile product UI.',
    category: 'Slide',
    swatches: ['#f4efe7', '#25211d'],
  },
  {
    id: 'noir',
    title: 'Editorial Noir',
    summary: 'High-contrast editorial system.',
    category: 'Slide',
    swatches: ['#111111', '#f7f0e8'],
  },
];

afterEach(() => {
  cleanup();
  vi.mocked(openFolderDialog).mockReset();
});

function renderPanel(onCreate = vi.fn()) {
  render(
    <NewProjectPanel
      skills={skills}
      designSystems={designSystems}
      defaultDesignSystemId="clay"
      templates={[]}
      promptTemplates={[]}
      onCreate={onCreate}
    />,
  );
  return onCreate;
}

describe('NewProjectPanel curriculum workspace creation', () => {
  it('uses the configured default design system when it exists in the catalog', () => {
    expect(defaultDesignSystemSelection('clay', designSystems)).toEqual(['clay']);
    expect(defaultDesignSystemSelection('missing', designSystems)).toEqual([]);
    expect(defaultDesignSystemSelection(null, designSystems)).toEqual([]);
  });

  it('shows the default design system and removes artifact-type tabs from the create surface', () => {
    const markup = renderToStaticMarkup(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
      />,
    );

    expect(markup).toContain('New curriculum workspace');
    expect(markup).toContain('Clay');
    expect(markup).toContain('Default');
    expect(markup).not.toContain('Prototype');
    expect(markup).not.toContain('Slide deck');
    expect(markup).not.toContain('Media');
    expect(markup).not.toContain('Starter template');
    expect(markup).not.toContain('newproj-option-card');
  });

  it('keeps design system selection explicit in create metadata', () => {
    expect(buildDesignSystemCreateSelection(true, ['clay', 'bmw'])).toEqual({
      primary: 'clay',
      inspirations: ['bmw'],
    });
    expect(buildDesignSystemCreateSelection(false, ['clay', 'bmw'])).toEqual({
      primary: null,
      inspirations: [],
    });
  });

  it('creates a curriculum workspace and stores metadata without a starter kind', () => {
    const onCreate = renderPanel();

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Grade 6 Ecosystems' },
    });
    fireEvent.change(screen.getByLabelText('From age'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('To age'), {
      target: { value: '8' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grade 6 Ecosystems',
        skillId: 'lesson-plan-generator',
        designSystemId: 'clay',
        metadata: expect.objectContaining({
          kind: 'prototype',
          intent: 'live-artifact',
          fidelity: 'high-fidelity',
          ageGroup: '6-8',
          level: 'basic, advanced, intensive',
          curriculumStatus: 'draft',
        }),
      }),
    );
    const metadata = onCreate.mock.calls[0][0].metadata;
    expect(metadata?.curriculumKind).toBeUndefined();
    expect(screen.queryByText('Level')).toBeNull();
  });

  it('keeps the single create form but infers prototype intent from the workspace name', () => {
    const onCreate = renderPanel();

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'ARMA web homework' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ARMA web homework',
        skillId: 'prototype-skill',
        metadata: expect.objectContaining({
          kind: 'prototype',
          curriculumKind: 'homework',
          curriculumStatus: 'draft',
        }),
      }),
    );
    expect(onCreate.mock.calls[0][0].metadata).not.toEqual(
      expect.objectContaining({ intent: 'live-artifact' }),
    );
  });

  it('infers slide deck projects from the unified create form', () => {
    const onCreate = renderPanel();

    fireEvent.change(screen.getByTestId('new-project-name'), {
      target: { value: 'Lesson 3 slide deck' },
    });
    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'deck-skill',
        metadata: expect.objectContaining({
          kind: 'deck',
          speakerNotes: false,
        }),
      }),
    );
  });

  it('does not show starter template option cards', () => {
    renderPanel();
    expect(screen.queryByText('Starter template')).toBeNull();
    expect(screen.queryByRole('button', { name: /Syllabus/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Teaching Slides/i })).toBeNull();
  });

  it('uses the generated workspace title as the project name fallback', () => {
    const onCreate = renderPanel();

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('New curriculum workspace'),
        skillId: 'lesson-plan-generator',
      }),
    );
  });

  it('clears design system metadata when freeform is selected in multi mode', () => {
    const onCreate = renderPanel();

    fireEvent.click(screen.getByTestId('design-system-trigger'));
    fireEvent.click(screen.getByRole('tab', { name: 'Multi' }));
    fireEvent.click(screen.getByRole('option', { name: /Editorial Noir/i }));
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('Clay');
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('+1');

    fireEvent.click(screen.getByRole('option', { name: /None — freeform/i }));
    expect(screen.getByTestId('design-system-trigger').textContent).toContain('None — freeform');

    fireEvent.click(screen.getByTestId('create-project'));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        designSystemId: null,
        metadata: expect.not.objectContaining({
          inspirationDesignSystemIds: expect.anything(),
        }),
      }),
    );
  });
});

describe('NewProjectPanel folder import feedback', () => {
  it('opens the native folder picker when no path has been typed', async () => {
    const onImportFolder = vi.fn().mockResolvedValue(true);
    vi.mocked(openFolderDialog).mockResolvedValue('/picked/project');

    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
        onImportFolder={onImportFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    expect(openFolderDialog).toHaveBeenCalledOnce();
    expect(await screen.findByDisplayValue('/picked/project')).toBeTruthy();
    expect(onImportFolder).toHaveBeenCalledWith('/picked/project');
  });

  it('shows an error when manual folder import resolves as failed', async () => {
    const onImportFolder = vi.fn().mockResolvedValue(false);

    render(
      <NewProjectPanel
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId="clay"
        templates={[]}
        promptTemplates={[]}
        onCreate={vi.fn()}
        onImportFolder={onImportFolder}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('/path/to/project'), {
      target: { value: '/missing/project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));

    expect(onImportFolder).toHaveBeenCalledWith('/missing/project');
    expect(await screen.findByText('Open folder failed: /missing/project')).toBeTruthy();
  });
});
