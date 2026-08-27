import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gold-400 text-ink-950 hover:bg-gold-300 disabled:bg-ink-700 disabled:text-bone-600',
  secondary:
    'bg-ink-800 text-bone-50 border border-ink-600 hover:border-ink-500 hover:bg-ink-700 disabled:text-bone-600',
  ghost: 'text-bone-200 hover:text-bone-50 hover:bg-ink-800 disabled:text-bone-600',
  danger:
    'bg-transparent text-rose-500 border border-ink-600 hover:border-rose-500/60 hover:bg-rose-500/10',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-sm',
};

/** Shared by `Button` and `LinkButton` so the two can never drift apart. */
export function buttonClasses(variant: ButtonVariant, size: ButtonSize): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium tracking-wide',
    'transition-colors duration-150 disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
  );
}
