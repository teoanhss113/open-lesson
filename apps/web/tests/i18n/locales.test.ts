import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/locales/en';
import { id } from '../../src/i18n/locales/id';
import { LOCALES, LOCALE_LABEL, type Dict, type Locale } from '../../src/i18n/types';

const EXPECTED_LOCALES = ['en', 'vi'];

function placeholders(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names.sort();
}

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) {
    throw new Error(`No dictionary export found for locale ${locale}`);
  }
  return dict;
}

function explicitLocaleKeys(locale: Locale): string[] {
  const source = readFileSync(new URL(`../../src/i18n/locales/${locale}.ts`, import.meta.url), 'utf8');
  return Array.from(source.matchAll(/'([^']+)':/g), (match) => match[1] ?? '').filter(Boolean);
}

describe('i18n locales', () => {
  it('registers every supported locale in the language menu', () => {
    expect(LOCALES).toEqual(EXPECTED_LOCALES);
    expect(LOCALE_LABEL.en).toBe('English');
    expect(LOCALE_LABEL.vi).toBe('Tiếng Việt');
  });

  it('keeps locale dictionaries aligned with English keys and placeholders', async () => {
    const englishKeys = Object.keys(en).sort();

    for (const locale of LOCALES) {
      const dict = await loadDict(locale);
      const dictKeys = Object.keys(dict).filter(k => k.startsWith('curriculum.') ? (locale === 'en' || locale === 'vi') : true).sort();
      const expectedKeys = englishKeys.filter(k => k.startsWith('curriculum.') ? (locale === 'en' || locale === 'vi') : true).sort();
      expect(dictKeys).toEqual(expectedKeys);

      for (const key of expectedKeys) {
        const dictKey = key as keyof Dict;
        expect(placeholders((dict[dictKey] || en[dictKey]) as string), `${locale}.${key}`).toEqual(
          placeholders(en[dictKey] as string),
        );
      }
    }
  });

  it('keeps Indonesian connector settings copy translated instead of falling back to English', () => {
    const translatedKeys: Array<keyof Dict> = [
      'settings.connectorsNavHint',
      'settings.connectorsHint',
      'settings.connectorsComposioApiKey',
      'settings.connectorsSavedTitle',
      'settings.connectorsSaved',
      'settings.connectorsGetApiKey',
      'settings.connectorsApiKeyPlaceholder',
      'settings.connectorsClear',
      'settings.connectorsSaveKey',
      'settings.connectorsKeyError',
      'settings.connectorsHelpEmpty',
      'settings.connectorsLoadingSavedKey',
      'settings.autosaveSaving',
      'settings.autosaveSaved',
      'settings.autosaveError',
      'settings.orbit.eyebrow',
      'settings.orbit.navHint',
      'settings.orbit.lede',
      'settings.orbit.statusOnTitle',
      'settings.orbit.statusOffTitle',
      'settings.orbit.runTitle',
      'settings.orbit.running',
      'settings.orbit.runOpen',
      'settings.orbit.dailySummaryTitle',
      'settings.orbit.dailySummarySub',
      'settings.orbit.runTimeTitle',
      'settings.orbit.runTimeSub',
      'settings.orbit.nextRun',
      'settings.orbit.nextRunScheduledAfterSave',
      'settings.orbit.schedule',
      'settings.orbit.pausedManualOnly',
      'settings.orbit.templateTitle',
      'settings.orbit.templateMissing',
      'settings.orbit.templateMissingOption',
      'settings.orbit.templateMissingInstall',
      'settings.orbit.templateMissingPickAnother',
      'settings.orbit.templateResetTitle',
      'settings.orbit.templateReset',
      'settings.orbit.templateHelp',
      'settings.orbit.templatesLoading',
      'settings.orbit.templatesOptgroup',
      'settings.orbit.lastRun',
      'settings.orbit.countChecked',
      'settings.orbit.countSucceeded',
      'settings.orbit.countSkipped',
      'settings.orbit.countFailed',
      'settings.orbit.runError',
      'settings.orbit.artifactKickerLive',
    ];

    for (const key of translatedKeys) {
      expect(id[key], key).not.toBe(en[key]);
    }
  });

  it('declares CI-sensitive Indonesian fallback keys explicitly', () => {
    const explicitKeys = new Set(explicitLocaleKeys('id'));
    const requiredExplicitKeys = Object.keys(en).filter((key) => {
      return key.startsWith('connectors.category.') || key.startsWith('liveArtifact.viewer.');
    });

    expect(requiredExplicitKeys.filter((key) => !explicitKeys.has(key))).toEqual([]);
  });

  it('avoids brittle per-key English lookups in the Indonesian locale source', () => {
    const source = readFileSync(new URL('../../src/i18n/locales/id.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/en\['(?:connectors\.category\.|liveArtifact\.viewer\.)/);
  });
});
