import { cn } from '@/lib/utils/cn';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn('inline-block animate-spin rounded-full border-2 border-current', className)}
      style={{
        width: size,
        height: size,
        borderTopColor: 'transparent',
        borderRightColor: 'transparent',
      }}
    />
  );
}
