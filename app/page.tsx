import Home from '@/components/home';
import { homeJsonLd } from '@/lib/site';
import { getPricing } from '@/lib/settings';

// Prices and the catalog are edited live from /admin.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const pricing = getPricing();
  const jsonLd = JSON.stringify(homeJsonLd(pricing)).replace(/</g, '\\u003c');
  return <Home pricing={pricing} jsonLd={jsonLd} />;
}
