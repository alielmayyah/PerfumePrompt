import { cn } from '@/lib/utils/cn';
import { Spinner } from './Spinner';

export interface ProgressStep {
  key: string;
  label: string;
}

/**
 * Named stages for a job that takes most of a minute.
 *
 * A prepare run reads several pages, measures the candidate images and then samples the
 * bottle's colours, which together take 30–60 seconds. Reporting that as one line of
 * text gave no sense of whether it was progressing or hung; naming the stages turns the
 * wait into something legible, and makes it obvious which stage a failure came from.
 */
export function ProgressSteps({
  steps,
  activeKey,
  className,
}: {
  steps: readonly ProgressStep[];
  /** The stage now running, or undefined when idle. */
  activeKey?: string | undefined;
  className?: string;
}) {
  const activeIndex = activeKey ? steps.findIndex((step) => step.key === activeKey) : -1;

  return (
    <ol className={cn('space-y-2', className)} aria-live="polite">
      {steps.map((step, index) => {
        const done = activeIndex > index;
        const active = activeIndex === index;

        return (
          <li key={step.key} className="flex items-center gap-2.5 text-xs">
            <span
              aria-hidden
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                done && 'border-jade-400 bg-jade-400/20 text-jade-400',
                active && 'border-gold-400 text-gold-300',
                !done && !active && 'border-ink-600 text-bone-600',
              )}
            >
              {active ? <Spinner size={10} /> : done ? '✓' : null}
            </span>
            <span
              className={cn(
                done && 'text-bone-400',
                active && 'text-bone-50',
                !done && !active && 'text-bone-600',
              )}
            >
              {step.label}
            </span>
            {done ? <span className="sr-only">complete</span> : null}
            {active ? <span className="sr-only">in progress</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
