import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mojassam 3D — عاين تصميمك قبل الطباعة',
  description: 'ارفع ملف 3D وشوفه وتحرّك حوله واحسب تقديرًا مبدئيًا للتكلفة داخل المتصفح.',
};

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
