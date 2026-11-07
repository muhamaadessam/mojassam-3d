'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authRequest } from '@/lib/auth-client';
import { ACCOUNT_COPY } from '@/lib/copy';
import { useLanguage } from '@/lib/language';

export default function LoginPage() {
  const router = useRouter();
  const { language, toggleLanguage } = useLanguage();
  const text = ACCOUNT_COPY[language];
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await authRequest({ action: mode, email, password, firstName, lastName });
      // Only same-site paths, so a crafted link cannot send the customer to another site.
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && /^\/(?![/\\])/.test(next) ? next : '/');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card-top">
          <Link className="auth-back" href="/">{text.backToPreview}</Link>
          <button type="button" className="ghost-button" onClick={toggleLanguage}>{text.language}</button>
        </div>
        <p className="eyebrow accent" lang="en">MOJASSAM 3D ACCOUNT</p>
        <h1>{mode === 'login' ? text.loginTitle : text.signupTitle}</h1>
        <p className="auth-intro">{text.authIntro}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <div className="name-fields">
            <label>{text.firstName}<input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} required maxLength={80} autoComplete="given-name" /></label>
            <label>{text.lastName}<input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} required maxLength={80} autoComplete="family-name" /></label>
          </div>}
          <label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" dir="ltr" /></label>
          <label>{text.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" /></label>
          <button className="primary-button" disabled={busy}>{busy ? text.working : mode === 'login' ? text.login : text.signup}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-switch" onClick={() => { setMode((value) => value === 'login' ? 'signup' : 'login'); setMessage(''); }}>
          {mode === 'login' ? text.toSignup : text.toLogin}
        </button>
      </section>
    </main>
  );
}
