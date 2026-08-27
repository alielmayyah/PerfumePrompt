import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type BadgeTone = 'neutral' | 'gold' | 'good' | 'warn' | 'bad';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-ink-600 text-bone-400',
  gold: 'border-gold-500/50 text-gold-300',
  good: 'border-jade-400/40 text-jade-400',
  warn: 'border-[var(--color-amber-warn)]/40 text-[var(--color-amber-warn)]',
  bad: 'border-rose-500/40 text-rose-500',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.6875rem]',
        'font-medium uppercase tracking-[0.1em] whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Maps a 0-100 score to a tone using the same bands everywhere. */
export function toneForScore(score: number, threshold: number): BadgeTone {
  if (score >= threshold) return 'good';
  if (score >= threshold - 15) return 'warn';
  return 'bad';
}
