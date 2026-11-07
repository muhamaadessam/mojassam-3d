import type { Metadata } from 'next';
import StudioPage from '@/components/studio';

export const metadata: Metadata = {
  title: 'استوديو المعاينة وحساب تكلفة الطباعة 3D',
  description: 'عارض STL وOBJ و3MF أونلاين: دوّر المجسم، راجع أبعاده بالمليمتر، واختار الخامة (PLA أو PETG) ونسبة الحشو لحساب تقدير مبدئي لسعر الطباعة ثلاثية الأبعاد بالجنيه المصري.',
  alternates: { canonical: '/studio' },
  openGraph: { url: '/studio' },
};

export default StudioPage;
