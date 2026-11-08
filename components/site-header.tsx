'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AccountMenu from '@/components/account/account-menu';
import LogoMark from './logo-mark';
import { SITE_NAME, SITE_NAME_AR } from '@/lib/site';
import type { Copy } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';

export default function SiteHeader({ language, text, onToggleLanguage }: {
  language: LanguageKey;
  text: Copy;
  onToggleLanguage: () => void;
}) {
  const pathname = usePathname();
  // Same links on every page so the bar never reshuffles between routes.
  const nav = [
    { href: '/', label: text.home },
    { href: '/studio', label: text.studioNav },
    { href: '/#store', label: text.storeNav },
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* The logo is the wordmark, so it stands alone. */}
        <Link className="brand-lockup" href="/" aria-label={language === 'ar' ? SITE_NAME_AR : SITE_NAME}>
          <LogoMark size={50} />
        </Link>

        <nav className="topbar-nav" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          {nav.map((item) => {
            const current = item.href === pathname;
            return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}>{item.label}</Link>;
          })}
        </nav>

        <div className="topbar-actions">
          <button className="topbar-lang" onClick={onToggleLanguage} lang={language === 'ar' ? 'en' : 'ar'}>{text.language}</button>
          <AccountMenu language={language} />
        </div>
      </div>
    </header>
  );
}
