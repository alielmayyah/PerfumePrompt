import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)]',
        'border border-dashed border-ink-700 px-6 py-14 text-center',
        className,
      )}
    >
      <p className="studio-display text-lg text-bone-50">{title}</p>
      {description ? (
        <p className="mt-2 max-w-sm text-sm text-bone-400">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, detail, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-[var(--radius-card)] border border-rose-500/30 bg-rose-500/5 px-4 py-3',
        className,
      )}
    >
      <p className="text-sm font-medium text-rose-500">{message}</p>
      {detail ? <p className="mt-1 text-xs text-bone-400">{detail}</p> : null}
      {onRetry ? (
        <Button size="sm" variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('studio-shimmer rounded-lg', className)} />;
}

export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-live="polite" aria-busy>
      {label ? <p className="text-xs tracking-wide text-bone-400">{label}</p> : null}
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
