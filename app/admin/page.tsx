import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/admin/dashboard';
import { getUser } from '@/lib/auth';
import { listAllOrders } from '@/lib/orders';
import { getPricing } from '@/lib/settings';

export const metadata: Metadata = { title: 'لوحة التحكم', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/admin');
  if (!user.is_admin) {
    return (
      <main className="account-page admin-denied">
        <Link className="auth-back" href="/">← العودة للموقع</Link>
        <h1>لوحة التحكم للإدارة فقط</h1>
        <p>الحساب {user.email} ليس له صلاحية الإدارة. أضف البريد في متغير البيئة ADMIN_EMAILS على السيرفر.</p>
      </main>
    );
  }
  return <AdminDashboard initialOrders={listAllOrders()} initialPricing={getPricing()} adminEmail={user.email} />;
}
