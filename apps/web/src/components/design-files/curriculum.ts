import type { ProjectFile, ProjectFileKind } from '../../types';
import type { Dict } from '../../i18n/types';

// Curriculum stages organize files by where they sit in the lesson
// lifecycle, mirroring the curriculum vocabulary in AGENTS.md:
// Plan → Guide → Slides → Material → Homework → Feedback → Review.
// 'analysis' covers AI-produced analysis/risk artefacts and `other`
// is the catch-all for raw uploads that don't match any heuristic.
export type CurriculumStage =
  | 'lesson-plan'
  | 'teaching-guide'
  | 'slides'
  | 'material'
  | 'homework'
  | 'feedback'
  | 'review'
  | 'analysis'
  | 'other';

export const CURRICULUM_STAGE_ORDER: CurriculumStage[] = [
  'lesson-plan',
  'teaching-guide',
  'slides',
  'material',
  'homework',
  'feedback',
  'analysis',
  'review',
  'other',
];

// Broader extension-family buckets used by the filter-chip bar so the
// user can quickly hide everything that isn't a slide deck (or every-
// thing that isn't an image). This lives in parallel with
// CurriculumStage — a file can be a 'lesson-plan' stage AND a 'docs'
// family.
export type KindFamily =
  | 'slides'
  | 'docs'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'data'
  | 'web'
  | 'sketch'
  | 'code'
  | 'other';

export const KIND_FAMILY_ORDER: KindFamily[] = [
  'slides',
  'docs',
  'pdf',
  'image',
  'video',
  'audio',
  'data',
  'web',
  'sketch',
  'code',
  'other',
];

// Filename heuristics for curriculum stage. Slug match wins, then name
// keyword, then extension. Vietnamese keywords share priority with the
// English ones because curriculum authors mix languages in filenames.
export function detectCurriculumStage(file: ProjectFile, slug?: string): CurriculumStage {
  const n = file.name.toLowerCase();
  const s = (slug || '').toLowerCase();

  if (matchesAny(n, s, [
    'lesson-plan', 'lessonplan', 'lesson_plan', 'lp-', '-lp.', 'kế hoạch bài', 'giáo án', 'giao-an',
  ])) {
    return 'lesson-plan';
  }
  if (matchesAny(n, s, [
    'teaching-guide', 'teacher-guide', 'teaching_guide', 'tg-', '-tg.', 'hướng dẫn dạy', 'huong-dan-day',
  ])) {
    return 'teaching-guide';
  }
  if (matchesAny(n, s, [
    'homework', 'assignment', 'rubric', 'bài tập', 'bai-tap', 'bài về nhà', 'phiếu bài tập',
  ])) {
    return 'homework';
  }
  if (matchesAny(n, s, [
    'feedback', 'survey', 'phản hồi', 'phan-hoi', 'khảo sát', 'khao-sat',
  ])) {
    return 'feedback';
  }
  if (matchesAny(n, s, [
    'rollout', 'rollout-validation', 'risk', 'risk-review', 'rủi ro', 'rui-ro', 'rollout_validation',
  ])) {
    return 'review';
  }
  if (matchesAny(n, s, [
    'analysis', 'curriculum-review', 'phân tích', 'phan-tich', 'đánh giá', 'danh-gia',
  ])) {
    return 'analysis';
  }
  if (file.kind === 'presentation' || matchesAny(n, s, [
    'slide', 'deck', 'trình chiếu', 'trinh-chieu',
  ])) {
    return 'slides';
  }
  if (matchesAny(n, s, [
    'material', 'handout', 'worksheet', 'tài liệu', 'tai-lieu', 'học liệu', 'hoc-lieu',
  ])) {
    return 'material';
  }
  // Fallback so generic documents and images don't disappear from the
  // panel — they group under "material" because uploaded reference
  // assets read most naturally as classroom material.
  if (file.kind === 'document' || file.kind === 'pdf') return 'material';
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio') return 'material';
  return 'other';
}

export function curriculumStageI18nKey(stage: CurriculumStage): keyof Dict {
  switch (stage) {
    case 'lesson-plan':
      return 'curriculum.sidebar.lessonPlans' as keyof Dict;
    case 'teaching-guide':
      return 'curriculum.sidebar.teachingGuides' as keyof Dict;
    case 'slides':
      return 'curriculum.sidebar.slides' as keyof Dict;
    case 'material':
      return 'designFiles.stageMaterial' as keyof Dict;
    case 'homework':
      return 'designFiles.stageHomework' as keyof Dict;
    case 'feedback':
      return 'curriculum.sidebar.feedback' as keyof Dict;
    case 'analysis':
      return 'curriculum.sidebar.analysis' as keyof Dict;
    case 'review':
      return 'curriculum.sidebar.riskReviews' as keyof Dict;
    case 'other':
    default:
      return 'designFiles.sectionOther' as keyof Dict;
  }
}

// Kind family is purely extension-driven. We use the daemon's already-
// computed `kind` for the common buckets and only inspect the
// extension when the bucket is ambiguous (e.g. binaries that turn out
// to be CSV/JSON data files).
export function detectKindFamily(file: ProjectFile): KindFamily {
  const k: ProjectFileKind = file.kind;
  if (k === 'presentation') return 'slides';
  if (k === 'document') return 'docs';
  if (k === 'pdf') return 'pdf';
  if (k === 'image') return 'image';
  if (k === 'video') return 'video';
  if (k === 'audio') return 'audio';
  if (k === 'spreadsheet') return 'data';
  if (k === 'html') return 'web';
  if (k === 'sketch') return 'sketch';
  if (k === 'code') return 'code';
  if (k === 'text') {
    // .md, .txt — treat as docs so curriculum content authored as
    // markdown lands in the same family as docx exports.
    return 'docs';
  }
  // Try to recover something useful for unknown binaries.
  const ext = lowerExt(file.name);
  if (['.csv', '.tsv', '.json', '.yaml', '.yml'].includes(ext)) return 'data';
  return 'other';
}

export function kindFamilyI18nKey(family: KindFamily): keyof Dict {
  switch (family) {
    case 'slides':
      return 'designFiles.familySlides' as keyof Dict;
    case 'docs':
      return 'designFiles.familyDocs' as keyof Dict;
    case 'pdf':
      return 'designFiles.kindPdf' as keyof Dict;
    case 'image':
      return 'designFiles.kindImage' as keyof Dict;
    case 'video':
      return 'designFiles.familyVideo' as keyof Dict;
    case 'audio':
      return 'designFiles.familyAudio' as keyof Dict;
    case 'data':
      return 'designFiles.familyData' as keyof Dict;
    case 'web':
      return 'designFiles.familyWeb' as keyof Dict;
    case 'sketch':
      return 'designFiles.kindSketch' as keyof Dict;
    case 'code':
      return 'designFiles.kindCode' as keyof Dict;
    case 'other':
    default:
      return 'designFiles.sectionOther' as keyof Dict;
  }
}

// Size buckets used when grouping by file size. Boundaries are tuned
// so a typical curriculum project (small docx + large slide videos)
// produces three or four non-empty buckets.
export type SizeBucket = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

const SIZE_BOUNDS: Array<[SizeBucket, number]> = [
  ['tiny', 100 * 1024],
  ['small', 1 * 1024 * 1024],
  ['medium', 10 * 1024 * 1024],
  ['large', 100 * 1024 * 1024],
];

export function detectSizeBucket(size: number): SizeBucket {
  for (const [bucket, max] of SIZE_BOUNDS) {
    if (size < max) return bucket;
  }
  return 'huge';
}

export function sizeBucketI18nKey(bucket: SizeBucket): keyof Dict {
  switch (bucket) {
    case 'tiny':
      return 'designFiles.sizeTiny' as keyof Dict;
    case 'small':
      return 'designFiles.sizeSmall' as keyof Dict;
    case 'medium':
      return 'designFiles.sizeMedium' as keyof Dict;
    case 'large':
      return 'designFiles.sizeLarge' as keyof Dict;
    case 'huge':
      return 'designFiles.sizeHuge' as keyof Dict;
    default:
      return 'designFiles.sectionOther' as keyof Dict;
  }
}

export const SIZE_BUCKET_ORDER: SizeBucket[] = ['tiny', 'small', 'medium', 'large', 'huge'];

function matchesAny(name: string, slug: string, needles: string[]): boolean {
  for (const needle of needles) {
    if (name.includes(needle)) return true;
    if (slug && slug.includes(needle)) return true;
  }
  return false;
}

function lowerExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}
