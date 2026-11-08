'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon, GridIcon, LogoutIcon, PackageIcon, PencilIcon } from '@/components/icons';
import { authRequest, type User } from '@/lib/auth-client';
import { ACCOUNT_COPY } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';
import ProfileForm from './profile-form';

const SIGNED_IN_ONLY = ['/orders', '/admin'];

function displayName(user: User) {
  return `${user.first_name} ${user.last_name}`.trim() || user.email.split('@')[0];
}

function Avatar({ user, size }: { user: User; size: 'sm' | 'lg' }) {
  const initials = displayName(user).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return user.avatar_url
    ? <img className={`account-avatar account-avatar-${size}`} src={user.avatar_url} alt="" />
    : <span className={`account-avatar account-avatar-${size}`} aria-hidden="true">{initials}</span>;
}

/** Sign-in link for visitors; for customers, the name pill that opens the account menu. */
export default function AccountMenu({ language }: { language: LanguageKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const text = ACCOUNT_COPY[language];
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    let active = true;
    void fetch('/api/auth', { cache: 'no-store' }).then((response) => response.json()).then((data) => {
      if (active) setUser(data.user ?? null);
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Close on outside press and Escape; Escape hands focus back to the pill.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setEditing(false);
    setOpen((value) => !value);
  };

  const signOut = async () => {
    try { await authRequest({ action: 'logout' }); } catch { /* the session is cleared on the next visit anyway */ }
    setOpen(false);
    setUser(null);
    if (SIGNED_IN_ONLY.some((path) => pathname.startsWith(path))) router.replace('/');
    router.refresh();
  };

  // Reserve the space while checking, instead of flashing "Sign in" at signed-in customers.
  if (!loaded) return <span className="topbar-link account-link" aria-hidden="true" style={{ visibility: 'hidden' }}>{text.signIn}</span>;
  if (!user) {
    const next = pathname && pathname !== '/' && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : '';
    return <Link className="topbar-link account-link" href={`/login${next}`}>{text.signIn}</Link>;
  }

  const name = displayName(user);

  return (
    <div className="account-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${text.accountMenu}: ${name}`}
        onClick={toggle}
      >
        <Avatar user={user} size="sm" />
        <span className="account-menu-name">{name}</span>
        <ChevronDownIcon size={14} className="account-menu-chevron" />
      </button>

      {open && (
        <div className="account-panel" id={panelId} role="dialog" aria-label={text.accountMenu}>
          <div className="account-panel-head">
            <Avatar user={user} size="lg" />
            <div>
              <strong>{name}</strong>
              <span><bdi>{user.email}</bdi></span>
            </div>
          </div>

          {editing ? (
            <ProfileForm
              language={language}
              user={user}
              onCancel={() => setEditing(false)}
              onSaved={(saved) => { setUser(saved); setEditing(false); router.refresh(); }}
            />
          ) : (
            <nav className="account-panel-links" aria-label={text.accountMenu}>
              <Link href="/orders" onClick={() => setOpen(false)} aria-current={pathname === '/orders' ? 'page' : undefined}><PackageIcon size={18} />{text.myOrders}</Link>
              <button type="button" onClick={() => setEditing(true)}><PencilIcon size={18} />{text.editProfile}</button>
              {user.is_admin && <Link href="/admin" onClick={() => setOpen(false)}><GridIcon size={18} />{text.dashboard}</Link>}
              <hr />
              <button type="button" className="account-signout" onClick={signOut}><LogoutIcon size={18} />{text.signOut}</button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
