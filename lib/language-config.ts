// Safe to import from server and client code.
export type LanguageKey = 'ar' | 'en';
export const LANGUAGE_COOKIE = 'mojassam_lang';

export function applyDocumentLanguage(language: LanguageKey) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}
