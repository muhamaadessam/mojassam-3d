import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const PRIVATE = ['/api/', '/orders', '/admin', '/login'];
// AI search / answer engines are explicitly welcome (GEO / AEO).
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: AI_BOTS, allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
