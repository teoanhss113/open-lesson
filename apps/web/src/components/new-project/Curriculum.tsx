import { useT } from '../../i18n';
import { OptionCards } from './Options';

export function CurriculumMetadataSection({
  curriculumKind,
  onChangeCurriculumKind,
  courseName,
  onChangeCourseName,
  moduleName,
  onChangeModuleName,
  lessonTitle,
  onChangeLessonTitle,
  ageGroup,
  onChangeAgeGroup,
  level,
  onChangeLevel,
  curriculumVersion,
  onChangeCurriculumVersion,
}: {
  curriculumKind: 'lesson-plan' | 'teaching-guide' | 'slides' | 'curriculum-review' | 'rollout-validation';
  onChangeCurriculumKind: (v: 'lesson-plan' | 'teaching-guide' | 'slides' | 'curriculum-review' | 'rollout-validation') => void;
  courseName: string;
  onChangeCourseName: (v: string) => void;
  moduleName: string;
  onChangeModuleName: (v: string) => void;
  lessonTitle: string;
  onChangeLessonTitle: (v: string) => void;
  ageGroup: string;
  onChangeAgeGroup: (v: string) => void;
  level: string;
  onChangeLevel: (v: string) => void;
  curriculumVersion: string;
  onChangeCurriculumVersion: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="newproj-section curriculum-metadata-section" style={{ borderTop: '1px solid var(--colors-border)', paddingTop: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
      <OptionCards
        label={t('newproj.curriculumKindLabel')}
        options={[
          { value: 'lesson-plan' as const, title: t('newproj.curriculumKind.lessonPlan') },
          { value: 'teaching-guide' as const, title: t('newproj.curriculumKind.teachingGuide') },
          { value: 'slides' as const, title: t('newproj.curriculumKind.slides') },
          { value: 'curriculum-review' as const, title: t('newproj.curriculumKind.curriculumReview') },
          { value: 'rollout-validation' as const, title: t('newproj.curriculumKind.rolloutValidation') },
        ]}
        value={curriculumKind}
        onChange={onChangeCurriculumKind}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
        <label className="newproj-label">
          <span>{t('newproj.courseNameLabel')}</span>
          <input
            value={courseName}
            placeholder="e.g. Science 101"
            onChange={(e) => onChangeCourseName(e.target.value)}
          />
        </label>
        <label className="newproj-label">
          <span>{t('newproj.moduleNameLabel')}</span>
          <input
            value={moduleName}
            placeholder="e.g. Physics"
            onChange={(e) => onChangeModuleName(e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
        <label className="newproj-label">
          <span>{t('newproj.lessonTitleLabel')}</span>
          <input
            value={lessonTitle}
            placeholder="e.g. Newton's Laws"
            onChange={(e) => onChangeLessonTitle(e.target.value)}
          />
        </label>
        <label className="newproj-label">
          <span>{t('newproj.curriculumVersionLabel')}</span>
          <input
            value={curriculumVersion}
            placeholder="v1.0"
            onChange={(e) => onChangeCurriculumVersion(e.target.value)}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
        <label className="newproj-label">
          <span>{t('newproj.ageGroupLabel')}</span>
          <select value={ageGroup} onChange={(e) => onChangeAgeGroup(e.target.value)}>
            <option value="">-- {t('common.none').toLowerCase()} --</option>
            <option value="6-8">6-8</option>
            <option value="8-10">8-10</option>
            <option value="10-12">10-12</option>
            <option value="12-15">12-15</option>
            <option value="15-18">15-18</option>
            <option value="adult">Adult</option>
          </select>
        </label>
        <label className="newproj-label">
          <span>{t('newproj.levelLabel')}</span>
          <select value={level} onChange={(e) => onChangeLevel(e.target.value)}>
            <option value="">-- {t('common.none').toLowerCase()} --</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>
    </div>
  );
}
