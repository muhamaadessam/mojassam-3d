'use client';

import Link from 'next/link';
import AuthNav from '@/app/account/auth-nav';
import LogoMark from './logo-mark';
import type { Copy } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';

type NavItem = { href: string; label: string };

export default function SiteHeader({ language, text, nav, onToggleLanguage, onUpload }: {
  language: LanguageKey;
  text: Copy;
  nav: NavItem[];
  onToggleLanguage: () => void;
  onUpload: () => void;
}) {
  return (
    <header className="topbar">
      <Link className="brand-lockup" href="/" aria-label="Mojassam 3D">
        <div className="brand-mark" aria-hidden="true"><LogoMark size={30} /></div>
        <div className="brand-text"><p className="eyebrow" lang="en">3D WORKSPACE</p><h1>Mojassam 3D</h1></div>
      </Link>
      <nav className="topbar-nav" aria-label={language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
        {nav.map((item) => item.href.startsWith('#')
          ? <a key={item.href} href={item.href}>{item.label}</a>
          : <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
      <div className="topbar-note"><span className="online-dot" aria-hidden="true" /> {text.privacyStatus}</div>
      <div className="topbar-actions">
        <AuthNav language={language} />
        <button className="ghost-button language-button" onClick={onToggleLanguage}>{text.language}</button>
        <button className="primary-button compact" onClick={onUpload}>{text.upload}</button>
      </div>
    </header>
  );
}
