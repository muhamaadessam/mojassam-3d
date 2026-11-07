'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@/lib/auth-client';
import type { LanguageKey } from '@/lib/language-config';

function getProfile(user: User) {
  return { name: `${user.first_name} ${user.last_name}`.trim() || user.email.split('@')[0], avatar: user.avatar_url };
}

export default function AuthNav({ language }: { language: LanguageKey }) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
      if (active) setUser(data.user ?? null);
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Reserve the space while checking, instead of flashing "Sign in" at signed-in customers.
  if (!loaded) return <span className="topbar-link account-link" aria-hidden="true" style={{ visibility: 'hidden' }}>{language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}</span>;
  if (!user) return <Link className="topbar-link account-link" href="/login">{language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}</Link>;

  const profile = getProfile(user);
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <>
      {user.is_admin && <Link className="topbar-link admin-link" href="/admin">{language === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</Link>}
      <Link className="topbar-link orders-link" href="/account#orders">{language === 'ar' ? 'سجل الطلبات' : 'Order history'}</Link>
      <Link className="account-menu" href="/account" title={user.email} aria-label={`${language === 'ar' ? 'حسابي' : 'My account'}: ${profile.name}`}>
        {profile.avatar ? <img src={profile.avatar} alt="" /> : <span className="account-avatar-fallback">{initials}</span>}
        <span className="account-menu-name">{profile.name}</span>
      </Link>
    </>
  );
}
