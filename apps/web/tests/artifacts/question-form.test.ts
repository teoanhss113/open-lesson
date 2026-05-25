import { describe, expect, it } from 'vitest';

import { formatFormAnswers, splitOnQuestionForms } from '../../src/artifacts/question-form';

describe('splitOnQuestionForms', () => {
  it('normalizes string and object question options', () => {
    const input = [
      '<question-form id="discovery" title="Quick brief">',
      '{',
      '  "questions": [',
      '    {',
      '      "id": "platform",',
      '      "label": "Primary surface",',
      '      "type": "radio",',
      '      "required": true,',
      '      "options": [',
      '        "Responsive",',
      '        { "label": "Mobile (iOS/Android)", "description": "Phone-first app prototype", "value": "mobile" },',
      '        { "label": "Desktop web", "description": "Browser-first prototype" },',
      '        { "description": "Missing label" }',
      '      ]',
      '    }',
      '  ]',
      '}',
      '</question-form>',
    ].join('\n');

    const segments = splitOnQuestionForms(input);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: 'form' });
    if (segments[0]?.kind !== 'form') throw new Error('expected parsed form segment');

    expect(segments[0].form.questions[0]?.options).toEqual([
      { label: 'Responsive', value: 'Responsive' },
      {
        label: 'Mobile (iOS/Android)',
        value: 'mobile',
        description: 'Phone-first app prototype',
      },
      {
        label: 'Desktop web',
        value: 'Desktop web',
        description: 'Browser-first prototype',
      },
    ]);
  });

  it('preserves stable option values when formatting object-option answers', () => {
    const text = formatFormAnswers(
      {
        id: 'discovery',
        title: 'Quick brief',
        questions: [
          {
            id: 'platform',
            label: 'Primary surface',
            type: 'radio',
            options: [
              { label: 'Mobile (iOS/Android)', value: 'mobile' },
              { label: 'Desktop web', value: 'Desktop web' },
            ],
          },
        ],
      },
      { platform: 'mobile' },
    );

    expect(text).toContain('- Primary surface: Mobile (iOS/Android) [value: mobile]');
  });

  it('parses question-form tags escaped by a markdown code block renderer', () => {
    const input = [
      'Let me confirm the brief.',
      '```',
      '&lt;question-form id=&quot;discovery&quot; title=&quot;Quick brief&quot;&gt;',
      '{',
      '  "questions": [',
      '    {',
      '      "id": "format",',
      '      "label": "Output format",',
      '      "type": "radio",',
      '      "options": ["HTML slide deck", "PowerPoint PPTX"]',
      '    }',
      '  ]',
      '}',
      '&lt;/question-form&gt;',
      '```',
    ].join('\n');

    const segments = splitOnQuestionForms(input);

    expect(segments).toHaveLength(3);
    expect(segments[1]).toMatchObject({
      kind: 'form',
      form: {
        id: 'discovery',
        title: 'Quick brief',
      },
    });
  });
});
