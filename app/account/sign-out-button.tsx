'use client';

import { useRouter } from 'next/navigation';
import { authRequest } from '@/lib/auth-client';

export default function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const signOut = async () => {
    try { await authRequest({ action: 'logout' }); } catch { /* the session is cleared on the next visit anyway */ }
    router.replace('/');
    router.refresh();
  };
  return <button className="ghost-button" onClick={signOut}>{label}</button>;
}
