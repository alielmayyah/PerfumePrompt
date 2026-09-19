import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Kufi_Arabic } from 'next/font/google';
import Script from 'next/script';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#08070a' },
  ],
};

const themeInitScript = `
  try {
    var stored = localStorage.getItem('perfume-theme');
    var isDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches) || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${cormorant.variable} ${kufi.variable}`}
    >
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
