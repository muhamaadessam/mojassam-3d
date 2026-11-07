import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mojassam 3D — عاين تصميمك قبل الطباعة',
  description: 'ارفع ملف 3D وشوفه وتحرّك حوله واحسب تقديرًا مبدئيًا للتكلفة داخل المتصفح.',
  appleWebApp: { title: 'Mojassam 3D' },
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
      <body>{children}</body>
    </html>
  );
}
