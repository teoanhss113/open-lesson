import { describe, expect, it } from 'vitest';

import {
  CURRICULUM_STAGE_ORDER,
  KIND_FAMILY_ORDER,
  SIZE_BUCKET_ORDER,
  curriculumStageI18nKey,
  detectCurriculumStage,
  detectKindFamily,
  detectSizeBucket,
  kindFamilyI18nKey,
  sizeBucketI18nKey,
} from '../../../src/components/design-files/curriculum';
import type { ProjectFile, ProjectFileKind } from '../../../src/types';

function file(name: string, kind: ProjectFileKind = 'document', size = 1024): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size,
    mtime: 1,
    kind,
    mime: 'application/octet-stream',
  };
}

describe('detectCurriculumStage', () => {
  it('recognises English curriculum keywords in filenames', () => {
    expect(detectCurriculumStage(file('module1-lesson-plan.docx'))).toBe('lesson-plan');
    expect(detectCurriculumStage(file('teaching-guide-week2.pdf', 'pdf'))).toBe('teaching-guide');
    expect(detectCurriculumStage(file('week-3-homework.pdf', 'pdf'))).toBe('homework');
    expect(detectCurriculumStage(file('rubric-final.pdf', 'pdf'))).toBe('homework');
    expect(detectCurriculumStage(file('student-feedback.xlsx', 'spreadsheet'))).toBe('feedback');
    expect(detectCurriculumStage(file('rollout-validation-2026.pdf', 'pdf'))).toBe('review');
    expect(detectCurriculumStage(file('curriculum-analysis.json', 'text'))).toBe('analysis');
  });

  it('recognises Vietnamese curriculum keywords in filenames', () => {
    expect(detectCurriculumStage(file('giao-an-buoi-1.docx'))).toBe('lesson-plan');
    expect(detectCurriculumStage(file('huong-dan-day-buoi-1.docx'))).toBe('teaching-guide');
    expect(detectCurriculumStage(file('bai-tap-buoi-2.pdf', 'pdf'))).toBe('homework');
    expect(detectCurriculumStage(file('phan-hoi-hoc-vien.xlsx', 'spreadsheet'))).toBe('feedback');
  });

  it('classifies PPTX as slides even without a "slide" keyword', () => {
    expect(detectCurriculumStage(file('Buoi-2-Robotics.pptx', 'presentation'))).toBe('slides');
  });

  it('routes generic documents/PDFs to material as a graceful fallback', () => {
    expect(detectCurriculumStage(file('reference.pdf', 'pdf'))).toBe('material');
    expect(detectCurriculumStage(file('overview.docx', 'document'))).toBe('material');
    expect(detectCurriculumStage(file('cover.png', 'image'))).toBe('material');
  });

  it('falls back to "other" only for unrecognised binaries', () => {
    expect(detectCurriculumStage(file('random.bin', 'binary'))).toBe('other');
  });

  it('honours an explicit slug ahead of the filename', () => {
    expect(
      detectCurriculumStage(file('Untitled.docx'), 'lesson-plan-module-2'),
    ).toBe('lesson-plan');
  });
});

describe('detectKindFamily', () => {
  it('maps presentation/document/pdf to their dedicated families', () => {
    expect(detectKindFamily(file('a.pptx', 'presentation'))).toBe('slides');
    expect(detectKindFamily(file('a.docx', 'document'))).toBe('docs');
    expect(detectKindFamily(file('a.pdf', 'pdf'))).toBe('pdf');
    expect(detectKindFamily(file('a.png', 'image'))).toBe('image');
    expect(detectKindFamily(file('a.mp4', 'video'))).toBe('video');
    expect(detectKindFamily(file('a.mp3', 'audio'))).toBe('audio');
    expect(detectKindFamily(file('a.xlsx', 'spreadsheet'))).toBe('data');
  });

  it('treats markdown/text as docs', () => {
    expect(detectKindFamily(file('readme.md', 'text'))).toBe('docs');
  });

  it('recovers CSV/JSON binaries into the data family', () => {
    expect(detectKindFamily(file('roster.csv', 'binary'))).toBe('data');
    expect(detectKindFamily(file('grades.json', 'binary'))).toBe('data');
  });
});

describe('detectSizeBucket', () => {
  it('binds tiny/small/medium/large/huge to expected thresholds', () => {
    expect(detectSizeBucket(0)).toBe('tiny');
    expect(detectSizeBucket(50 * 1024)).toBe('tiny');
    expect(detectSizeBucket(500 * 1024)).toBe('small');
    expect(detectSizeBucket(5 * 1024 * 1024)).toBe('medium');
    expect(detectSizeBucket(50 * 1024 * 1024)).toBe('large');
    expect(detectSizeBucket(200 * 1024 * 1024)).toBe('huge');
  });
});

describe('i18n key wiring', () => {
  it('emits a key for every stage', () => {
    for (const stage of CURRICULUM_STAGE_ORDER) {
      expect(typeof curriculumStageI18nKey(stage)).toBe('string');
    }
  });
  it('emits a key for every family', () => {
    for (const family of KIND_FAMILY_ORDER) {
      expect(typeof kindFamilyI18nKey(family)).toBe('string');
    }
  });
  it('emits a key for every size bucket', () => {
    for (const bucket of SIZE_BUCKET_ORDER) {
      expect(typeof sizeBucketI18nKey(bucket)).toBe('string');
    }
  });
});
