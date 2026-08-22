'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type LanguageKey = 'ar' | 'en';

function getProfile(user: User) {
  const metadata = user.user_metadata as Record<string, string | undefined>;
  const name = metadata.full_name
    || [metadata.first_name, metadata.last_name].filter(Boolean).join(' ')
    || user.email?.split('@')[0]
    || (metadata.email ? metadata.email.split('@')[0] : '')
    || 'Account';

  return { name, avatar: metadata.avatar_url || metadata.picture || '' };
}

export default function AuthNav({ language }: { language: LanguageKey }) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setLoaded(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoaded(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!loaded || !user) {
    return <a className="ghost-button account-link" href="/login">{language === 'ar' ? 'تسجيل الدخول' : 'Sign in'}</a>;
  }

  const profile = getProfile(user);
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <>
      <a className="orders-link" href="/account#orders">{language === 'ar' ? 'سجل الطلبات' : 'Order history'}</a>
      <a className="account-menu" href="/account" title={language === 'ar' ? 'فتح الحساب' : 'Open account'}>
        {profile.avatar ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="account-avatar-fallback">{initials}</span>}
        <span className="account-menu-copy"><strong>{profile.name}</strong><small>{user.email}</small></span>
      </a>
    </>
  );
}
