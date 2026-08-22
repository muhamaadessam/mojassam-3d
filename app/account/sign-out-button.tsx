'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  return <button className="ghost-button" onClick={async () => { await createClient().auth.signOut(); router.replace('/'); router.refresh(); }}>تسجيل الخروج</button>;
}
