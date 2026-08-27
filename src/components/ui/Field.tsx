'use client';

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/utils/cn';

const CONTROL_CLASS =
  'w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-bone-50 ' +
  'placeholder:text-bone-600 transition-colors focus:border-gold-500 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy?: string }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="studio-label block">
        {label}
        {required ? <span className="ml-1 text-gold-400">*</span> : null}
      </label>
      {children({ id, describedBy: messageId })}
      {error ? (
        <p id={messageId} className="text-xs text-rose-500">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-bone-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL_CLASS, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL_CLASS, 'resize-y', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL_CLASS, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export interface RangeProps extends InputHTMLAttributes<HTMLInputElement> {
  valueLabel?: string;
}

export function Range({ className, valueLabel, ...rest }: RangeProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className={cn('h-1 w-full accent-[var(--color-gold-400)]', className)}
        {...rest}
      />
      {valueLabel ? (
        <span className="w-10 shrink-0 text-right font-mono text-xs text-bone-400">
          {valueLabel}
        </span>
      ) : null}
    </div>
  );
}
