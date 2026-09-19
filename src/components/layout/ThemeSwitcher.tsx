'use client';

import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils/cn';

export type ThemeChoice = 'light' | 'dark' | 'system';

function getThemeSnapshot(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem('perfume-theme');
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
}

function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('storage', callback);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', callback);

  return () => {
    window.removeEventListener('storage', callback);
    mq.removeEventListener('change', callback);
  };
}

function updateThemeColor(color: string) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

function applyThemeDOM(choice: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.remove('light');
    root.classList.add('dark');
    root.setAttribute('data-theme', 'dark');
    updateThemeColor('#08070a');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    updateThemeColor('#f7f5f0');
  }
}

export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerSnapshot);

  const handleSelect = (choice: ThemeChoice) => {
    localStorage.setItem('perfume-theme', choice);
    applyThemeDOM(choice);
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div
      role="radiogroup"
      aria-label="Color theme selection"
      className="flex items-center rounded-lg border border-ink-700 bg-ink-900/80 p-0.5 shadow-xs"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        aria-label="Light mode"
        title="Light mode"
        onClick={() => handleSelect('light')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all duration-200 cursor-pointer',
          theme === 'light'
            ? 'bg-ink-850 text-gold-400 shadow-xs ring-1 ring-ink-700 font-semibold'
            : 'text-bone-400 hover:text-bone-200 hover:bg-ink-800/50',
        )}
      >
        <svg
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
        <span className="hidden sm:inline lg:inline">Light</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        aria-label="Dark mode"
        title="Dark mode"
        onClick={() => handleSelect('dark')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all duration-200 cursor-pointer',
          theme === 'dark'
            ? 'bg-ink-850 text-gold-400 shadow-xs ring-1 ring-ink-700 font-semibold'
            : 'text-bone-400 hover:text-bone-200 hover:bg-ink-800/50',
        )}
      >
        <svg
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
        <span className="hidden sm:inline lg:inline">Dark</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={theme === 'system'}
        aria-label="System auto mode"
        title="Follow system preference"
        onClick={() => handleSelect('system')}
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all duration-200 cursor-pointer',
          theme === 'system'
            ? 'bg-ink-850 text-gold-400 shadow-xs ring-1 ring-ink-700 font-semibold'
            : 'text-bone-400 hover:text-bone-200 hover:bg-ink-800/50',
        )}
      >
        <svg
          className="size-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
        <span className="hidden sm:inline lg:inline">Auto</span>
      </button>
    </div>
  );
}
