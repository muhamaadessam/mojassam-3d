'use client';

import { useEffect } from 'react';
import { applyDocumentLanguage, type LanguageKey } from '@/lib/language-config';

/** The root layout always renders Arabic/RTL; this switches server-rendered pages to the saved language. */
export default function DocumentLanguage({ language }: { language: LanguageKey }) {
  useEffect(() => applyDocumentLanguage(language), [language]);
  return null;
}
