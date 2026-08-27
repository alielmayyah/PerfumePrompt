import { cn } from '@/lib/utils/cn';
import type { Perfume } from '@/lib/types';
import { PerfumeCard } from './PerfumeCard';

export interface PerfumeGridProps {
  perfumes: Perfume[];
  compact?: boolean;
  className?: string;
}

export function PerfumeGrid({ perfumes, compact = false, className }: PerfumeGridProps) {
  return (
    <ul
      className={cn(
        'grid gap-4',
        compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {perfumes.map((perfume) => (
        <li key={perfume.id}>
          <PerfumeCard perfume={perfume} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
