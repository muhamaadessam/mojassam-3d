'use client';

import { useRouter } from 'next/navigation';
import SiteHeader from '@/components/site-header';
import { COPY } from '@/lib/copy';
import { useLanguage } from '@/lib/language';
import type { LanguageKey } from '@/lib/language-config';

/** Site header for server-rendered pages: switching language re-renders the page on the server. */
export default function OrdersHeader({ language: initial }: { language: LanguageKey }) {
  const router = useRouter();
  const { language, setLanguage } = useLanguage(initial);
  return (
    <SiteHeader
      language={language}
      text={COPY[language]}
      onToggleLanguage={() => { setLanguage(language === 'ar' ? 'en' : 'ar'); router.refresh(); }}
    />
  );
}
