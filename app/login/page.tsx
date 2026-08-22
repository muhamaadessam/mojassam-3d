'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const supabase = createClient();
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        setMessage('تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده.');
      } else {
        router.replace('/account');
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حدث خطأ. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-back" href="/">← العودة للمعاينة</a>
        <p className="eyebrow accent">3D PREVIEW ACCOUNT</p>
        <h1>{mode === 'login' ? 'سجّل دخولك' : 'اعمل حساب جديد'}</h1>
        <p className="auth-intro">تابع طلباتك واحفظ تفاصيل الطباعة في مكان واحد.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>البريد الإلكتروني<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
          <label>كلمة المرور<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          <button className="primary-button" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-switch" onClick={() => { setMode((value) => value === 'login' ? 'signup' : 'login'); setMessage(''); }}>
          {mode === 'login' ? 'ليس لديك حساب؟ أنشئ حسابًا' : 'لديك حساب؟ سجّل الدخول'}
        </button>
      </section>
    </main>
  );
}
