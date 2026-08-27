'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils/cn';

const LINKS = [
  { href: '/', label: 'Prepare' },
  { href: '/perfumes', label: 'Matrix' },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {LINKS.map((link) => {
        const active =
          link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
              active
                ? 'bg-ink-800 text-bone-50'
                : 'text-bone-400 hover:bg-ink-850 hover:text-bone-200',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
