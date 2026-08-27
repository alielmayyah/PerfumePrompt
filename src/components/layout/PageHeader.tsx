import type { ReactNode } from 'react';

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="studio-label mb-2">{eyebrow}</p> : null}
        <h1 className="studio-display text-3xl leading-tight text-bone-50 sm:text-4xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm text-bone-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
