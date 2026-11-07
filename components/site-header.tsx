'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/app/account/auth-nav';
import LogoMark from './logo-mark';
import { UploadIcon } from './icons';
import type { Copy } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';

export default function SiteHeader({ language, text, onToggleLanguage, onUpload }: {
  language: LanguageKey;
  text: Copy;
  onToggleLanguage: () => void;
  onUpload: () => void;
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
        <Link className="brand-lockup" href="/" aria-label="Mojassam 3D">
          <span className="brand-mark" aria-hidden="true"><LogoMark size={28} /></span>
          <span className="brand-text"><span className="eyebrow" lang="en">3D WORKSPACE</span><span className="brand-name">Mojassam 3D</span></span>
        </Link>

        <nav className="topbar-nav" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          {nav.map((item) => {
            const current = item.href === pathname;
            return <Link key={item.href} href={item.href} aria-current={current ? 'page' : undefined}>{item.label}</Link>;
          })}
        </nav>

        <div className="topbar-actions">
          <span className="topbar-note"><span className="online-dot" aria-hidden="true" />{text.privacyStatus}</span>
          <button className="topbar-lang" onClick={onToggleLanguage} lang={language === 'ar' ? 'en' : 'ar'}>{text.language}</button>
          <AuthNav language={language} />
          <button className="primary-button compact topbar-upload" onClick={onUpload}>
            <UploadIcon size={16} />
            <span>{text.upload}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
