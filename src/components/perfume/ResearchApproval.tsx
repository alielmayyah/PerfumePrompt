'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import type { PerfumeResearch } from '@/lib/types';

export interface ResearchApprovalProps {
  research: PerfumeResearch;
  approving: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}

/**
 * Research review gate (brief section 9).
 *
 * AI-researched notes are never silently treated as truth. They land here first,
 * and only an explicit approval writes them to the perfume.
 */
export function ResearchApproval({
  research,
  approving,
  onApprove,
  onEdit,
  onDismiss,
}: ResearchApprovalProps) {
  const confidenceTone =
    research.confidence === 'high' ? 'good' : research.confidence === 'low' ? 'bad' : 'warn';

  return (
    <Card className="border-gold-500/40">
      <CardHeader
        title="AI found"
        description="Review before this becomes the campaign data. Nothing has been saved yet."
        actions={<Badge tone={confidenceTone}>{research.confidence ?? 'medium'} confidence</Badge>}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <NoteColumn title="Top" notes={research.topNotes} />
        <NoteColumn title="Heart" notes={research.heartNotes} />
        <NoteColumn title="Base" notes={research.baseNotes} />
      </div>

      {research.fragranceFamily || research.mainAccords.length > 0 ? (
        <div className="mt-5 space-y-1.5 border-t border-ink-700 pt-4 text-sm">
          {research.fragranceFamily ? (
            <p className="text-bone-200">
              <span className="studio-label mr-2">Family</span>
              {research.fragranceFamily}
            </p>
          ) : null}
          {research.mainAccords.length > 0 ? (
            <p className="text-bone-200">
              <span className="studio-label mr-2">Accords</span>
              {research.mainAccords.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

      {research.rationale ? (
        <p className="mt-4 text-xs leading-relaxed text-bone-600">{research.rationale}</p>
      ) : null}

      {research.sources && research.sources.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-bone-400 hover:text-bone-200">
            {research.sources.length} source{research.sources.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 space-y-1">
            {research.sources.map((source) => (
              <li key={source} className="truncate text-xs">
                <a
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-300 hover:text-gold-400"
                >
                  {source}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={approving} onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" onClick={onEdit}>
          Edit first
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Discard
        </Button>
      </div>
    </Card>
  );
}

function NoteColumn({ title, notes }: { title: string; notes: string[] }) {
  return (
    <div>
      <p className="studio-label mb-2">{title}</p>
      {notes.length === 0 ? (
        <p className="text-xs text-bone-600">None found</p>
      ) : (
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-sm text-bone-50">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
