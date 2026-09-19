import Link from 'next/link';
import type { ReactNode } from 'react';

import { NavLinks } from './NavLinks';
import { ThemeSwitcher } from './ThemeSwitcher';
import { UpdateChecker } from './UpdateChecker';

/**
 * Application chrome: a quiet sidebar on desktop, a horizontal rail on mobile.
 *
 * Deliberately minimal so nothing competes with product imagery.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex">
      <UpdateChecker />
      <header
        className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/95 backdrop-blur
                   lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0"
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:h-full lg:flex-col lg:items-stretch lg:justify-between lg:gap-8">
          <div className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-8">
            <Link href="/" className="group block shrink-0">
              <span className="studio-display block text-lg leading-tight text-bone-50">
                Perfume
              </span>
              <span className="studio-display block text-lg leading-tight text-gold-300">
                Prompt Preparer
              </span>
            </Link>

            <NavLinks />
          </div>

          <div className="flex items-center gap-2 lg:w-full lg:flex-col lg:items-stretch">
            <div className="hidden lg:block mb-1 px-1">
              <span className="studio-label text-[10px] text-bone-400 font-semibold tracking-wider">
                Appearance
              </span>
            </div>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
