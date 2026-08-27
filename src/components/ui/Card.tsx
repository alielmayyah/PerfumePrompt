import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cn('studio-card', padded && 'p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="studio-label">{title}</h2>
        {description ? <p className="mt-1 text-sm text-bone-200">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
