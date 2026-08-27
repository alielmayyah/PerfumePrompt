import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Kufi_Arabic } from 'next/font/google';

import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

/** Fonts are self-hosted by next/font, so first paint carries no network dependency. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-cormorant',
  display: 'swap',
});

const kufi = Noto_Kufi_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  variable: '--font-kufi',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Perfume prompt preparer',
  description:
    'Scrapes fragrance notes and the real bottle photograph for any perfume, then builds a detailed image-generation prompt you can copy alongside the raw bottle image.',
};

export const viewport: Viewport = {
  themeColor: '#08070a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${kufi.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
