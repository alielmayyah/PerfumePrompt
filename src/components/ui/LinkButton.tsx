import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface LinkButtonProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

/**
 * A link that looks like a button.
 *
 * Kept separate from `Button` rather than adding an `asChild` escape hatch, so the
 * rendered element is always the semantically correct one.
 */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={cn(buttonClasses(variant, size), className)} {...rest}>
      {children}
    </Link>
  );
}
