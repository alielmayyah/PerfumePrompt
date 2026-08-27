import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { cn } from '@/lib/utils/cn';
import { formatRelativeTime, titleCase } from '@/lib/utils/format';
import type { Perfume, PerfumeStatus } from '@/lib/types';

const STATUS_TONES: Record<PerfumeStatus, BadgeTone> = {
  draft: 'neutral',
  bottle_ready: 'neutral',
  notes_ready: 'gold',
  direction_ready: 'good',
};

export interface PerfumeCardProps {
  perfume: Perfume;
  compact?: boolean;
}

export function PerfumeCard({ perfume, compact = false }: PerfumeCardProps) {
  return (
    <Link
      href={`/perfumes/${perfume.id}`}
      className={cn(
        'group block overflow-hidden rounded-[var(--radius-card)] border border-ink-700',
        'bg-ink-850 transition-colors hover:border-ink-500',
      )}
    >
      <BottleThumb perfume={perfume} compact={compact} />

      <div className="space-y-2 p-4">
        <div className="min-w-0">
          <p className="studio-label truncate">{perfume.brand}</p>
          <p className="studio-display truncate text-lg text-bone-50">{perfume.name}</p>
          {perfume.variant ? (
            <p className="truncate text-xs tracking-[0.14em] text-bone-400 uppercase">
              {perfume.variant}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Badge tone={STATUS_TONES[perfume.status]}>{titleCase(perfume.status)}</Badge>
          <span className="text-[0.6875rem] text-bone-600">
            {formatRelativeTime(perfume.updatedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function BottleThumb({
  perfume,
  compact = false,
  className,
}: {
  perfume: Pick<Perfume, 'bottleImageUrl' | 'name'>;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'studio-alpha-grid relative flex items-center justify-center overflow-hidden bg-ink-900',
        compact ? 'aspect-4/3' : 'aspect-square',
        className,
      )}
    >
      {perfume.bottleImageUrl ? (
        // The bottle is a protected product reference: never cropped, never distorted.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={perfume.bottleImageUrl}
          alt={`${perfume.name} bottle`}
          loading="lazy"
          className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <span className="studio-label">No bottle image</span>
      )}
    </div>
  );
}
