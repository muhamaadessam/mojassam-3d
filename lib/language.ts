'use client';

import { useCallback, useEffect, useState } from 'react';
import { applyDocumentLanguage, LANGUAGE_COOKIE, type LanguageKey } from './language-config';

export type { LanguageKey };

function readStoredLanguage(): LanguageKey {
  if (typeof document === 'undefined') return 'ar';
  return document.cookie.split('; ').some((part) => part === `${LANGUAGE_COOKIE}=en`) ? 'en' : 'ar';
}

/**
 * The chosen language, remembered in a cookie so every page (including server-rendered
 * ones like /account) opens in it.
 */
export function useLanguage(initial?: LanguageKey) {
  const [language, setLanguageState] = useState<LanguageKey>(initial ?? 'ar');

  useEffect(() => {
    // Static pages are prerendered in Arabic; switch after hydration if the visitor chose English.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial) setLanguageState(readStoredLanguage());
  }, [initial]);

  useEffect(() => applyDocumentLanguage(language), [language]);

  const setLanguage = useCallback((next: LanguageKey) => {
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => setLanguage(language === 'ar' ? 'en' : 'ar'), [language, setLanguage]);

  return { language, setLanguage, toggleLanguage };
}
