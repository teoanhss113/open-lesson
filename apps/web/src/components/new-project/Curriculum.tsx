import { useT } from '../../i18n';

const AGE_ENDPOINT_OPTIONS = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

function splitAgeGroup(value: string): [string, string] {
  const trimmed = value.trim();
  if (!trimmed) return ['', ''];
  const leadingEnd = trimmed.match(/^-(.+)$/);
  if (leadingEnd) return ['', leadingEnd[1]?.trim() ?? ''];
  const range = trimmed.match(/^(.+?)\s*-\s*(.+)$/);
  if (range) return [range[1]?.trim() ?? '', range[2]?.trim() ?? ''];
  return [trimmed, ''];
}

function joinAgeGroup(from: string, to: string): string {
  const start = from.trim();
  const end = to.trim();
  if (start && end) return `${start}-${end}`;
  if (start) return start;
  if (end) return `-${end}`;
  return '';
}

export function CurriculumMetadataSection({
  ageGroup,
  onChangeAgeGroup,
  curriculumVersion,
  onChangeCurriculumVersion,
}: {
  ageGroup: string;
  onChangeAgeGroup: (v: string) => void;
  curriculumVersion: string;
  onChangeCurriculumVersion: (v: string) => void;
}) {
  const t = useT();
  const [ageFrom, ageTo] = splitAgeGroup(ageGroup);
  const ageEndpointListId = 'curriculum-age-endpoints';

  return (
    <div className="newproj-section curriculum-metadata-section">
      <div className="curriculum-field-grid curriculum-field-grid--lesson">
        <label className="newproj-label">
          <span>{t('newproj.curriculumVersionLabel')}</span>
          <input
            value={curriculumVersion}
            placeholder="v1.0"
            onChange={(e) => onChangeCurriculumVersion(e.target.value)}
          />
        </label>
      </div>

      <div className="curriculum-field-grid">
        <label className="newproj-label curriculum-age-label">
          <span>{t('newproj.ageGroupLabel')}</span>
          <div className="curriculum-age-range">
            <input
              aria-label={t('newproj.ageFromLabel')}
              inputMode="numeric"
              list={ageEndpointListId}
              value={ageFrom}
              placeholder={t('newproj.ageFromPlaceholder')}
              onChange={(e) => onChangeAgeGroup(joinAgeGroup(e.target.value, ageTo))}
            />
            <input
              aria-label={t('newproj.ageToLabel')}
              inputMode="numeric"
              list={ageEndpointListId}
              value={ageTo}
              placeholder={t('newproj.ageToPlaceholder')}
              onChange={(e) => onChangeAgeGroup(joinAgeGroup(ageFrom, e.target.value))}
            />
            <datalist id={ageEndpointListId}>
              {AGE_ENDPOINT_OPTIONS.map((age) => (
                <option key={age} value={age} />
              ))}
            </datalist>
          </div>
        </label>
      </div>
    </div>
  );
}
