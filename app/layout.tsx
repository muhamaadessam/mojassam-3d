import type { Metadata, Viewport } from 'next';
import { SITE_DESCRIPTION_AR, SITE_KEYWORDS, SITE_NAME, SITE_NAME_AR, SITE_TITLE_AR, SITE_URL } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE_AR, template: `%s | ${SITE_NAME_AR}` },
  description: SITE_DESCRIPTION_AR,
  applicationName: SITE_NAME_AR,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME_AR, url: SITE_URL }],
  creator: SITE_NAME_AR,
  publisher: SITE_NAME,
  category: '3D printing',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME_AR,
    title: SITE_TITLE_AR,
    description: SITE_DESCRIPTION_AR,
    locale: 'ar_EG',
    alternateLocale: ['en_US'],
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE_AR, description: SITE_DESCRIPTION_AR },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  appleWebApp: { title: SITE_NAME_AR },
  formatDetection: { telephone: false },
};

// Colors the browser UI (Android address bar, iOS status bar) to match the page.
export const viewport: Viewport = { themeColor: '#0b1020' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM summary" />
      </head>
      <body>{children}</body>
    </html>
  );
}
