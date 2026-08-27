'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

export type ToastTone = 'good' | 'bad' | 'info';

export interface ToastMessage {
  /** Changing the id re-shows the toast even when the text is identical. */
  id: number;
  text: string;
  tone?: ToastTone;
}

const TONES: Record<ToastTone, string> = {
  good: 'border-jade-400/40 bg-jade-400/10 text-jade-400',
  bad: 'border-rose-500/40 bg-rose-500/10 text-rose-500',
  info: 'border-ink-600 bg-ink-800 text-bone-200',
};

/**
 * A short confirmation that does not depend on where the page is scrolled.
 *
 * The copy actions used to report themselves with a line of text above the table. With
 * a dozen rows the useful half of that sentence — whether the image made it onto the
 * clipboard or only the prompt did — was announced somewhere off screen. Fixing the
 * message to the viewport means the answer arrives where the click happened.
 */
export function Toast({
  message,
  duration = 4000,
}: {
  message?: ToastMessage | undefined;
  duration?: number;
}) {
  /*
   * Tracked as "which message has expired" rather than a visible flag.
   *
   * A flag has to be switched on when the message arrives, which means setting state
   * from inside the effect. Recording the expired id instead makes visibility a pure
   * derivation of the props, and the only state change happens in the timer callback.
   */
  const [expiredId, setExpiredId] = useState<number | undefined>();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setExpiredId(message.id), duration);
    return () => clearTimeout(timer);
  }, [message, duration]);

  const visible = message !== undefined && message.id !== expiredId;

  return (
    /*
     * The live region is always mounted, never conditionally rendered: a screen reader
     * only announces changes inside a region it was already watching, so mounting the
     * region together with its first message swallows that message.
     */
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6"
    >
      {message && visible ? (
        <p
          className={cn(
            'pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-center text-sm',
            'shadow-lg shadow-ink-950/60 backdrop-blur',
            'motion-safe:animate-[studio-toast-in_180ms_ease-out]',
            TONES[message.tone ?? 'info'],
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Builds a message with a fresh id, so repeating the same action re-shows the toast. */
export function toast(text: string, tone: ToastTone = 'info'): ToastMessage {
  return { id: Date.now() + Math.random(), text, tone };
}
