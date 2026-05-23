// Supported UI locales. Adding a new locale requires creating a new
// dictionary in `./locales/` and registering it in `./index.tsx`.
export type Locale = 'en' | 'vi' | 'id' | 'de' | 'zh-CN' | 'zh-TW' | 'pt-BR' | 'es-ES' | 'ru' | 'fa' | 'ar' | 'ja' | 'ko' | 'pl' | 'hu' | 'fr' | 'uk' | 'tr' | 'th' | 'it';

export const LOCALES: Locale[] = ['en', 'vi'];

export const LOCALE_LABEL: Record<Locale, string> = {
  'en': 'English',
  'vi': 'Tiếng Việt',
  'id': 'Bahasa Indonesia',
  'de': 'Deutsch',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'pt-BR': 'Português (Brasil)',
  'es-ES': 'Español (España)',
  'ru': 'Русский',
  'fa': 'فارسی',
  'ar': 'العربية',
  'ja': '日本語',
  'ko': '한국어',
  'pl': 'Polski',
  'hu': 'Magyar',
  'fr': 'Français',
  'uk': 'Українська',
  'tr': 'Türkçe',
  'th': 'ภาษาไทย',
  'it': 'Italiano'
};

// Translation dictionary shape — flat keys, dot-namespaced.
export type Dict = Record<string, string>;
