'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextInput } from '@/components/ui/Field';
import { TagInput } from '@/components/ui/TagInput';
import type { NotesSource, Perfume } from '@/lib/types';

export interface NotesDraft {
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  fragranceFamily: string;
  mainAccords: string[];
}

export interface NotesEditorProps {
  draft: NotesDraft;
  notesSource: NotesSource;
  notesApproved: boolean;
  researching: boolean;
  onChange: (draft: NotesDraft) => void;
  onResearch: () => void;
}

export function toNotesDraft(perfume: Perfume): NotesDraft {
  return {
    topNotes: perfume.topNotes,
    heartNotes: perfume.heartNotes,
    baseNotes: perfume.baseNotes,
    fragranceFamily: perfume.fragranceFamily ?? '',
    mainAccords: perfume.mainAccords ?? [],
  };
}

export function NotesEditor({
  draft,
  notesSource,
  notesApproved,
  researching,
  onChange,
  onResearch,
}: NotesEditorProps) {
  const set = <K extends keyof NotesDraft>(key: K, value: NotesDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <Card>
      <CardHeader
        title="Fragrance notes"
        description="The notes decide which objects appear around the bottle. Correct anything the scrape got wrong."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={notesApproved ? 'good' : 'warn'}>
              {notesSource === 'scraped' ? 'Scraped' : notesSource === 'seed' ? 'Seeded' : 'Manual'}
              {notesApproved ? ' · approved' : ' · unapproved'}
            </Badge>
            <Button size="sm" loading={researching} onClick={onResearch}>
              Re-scrape
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <TagInput label="Top notes" values={draft.topNotes} onChange={(v) => set('topNotes', v)} />
        <TagInput
          label="Heart notes"
          values={draft.heartNotes}
          onChange={(v) => set('heartNotes', v)}
        />
        <TagInput label="Base notes" values={draft.baseNotes} onChange={(v) => set('baseNotes', v)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fragrance family" hint="e.g. Amber Woody, Oriental Spicy">
            {({ id }) => (
              <TextInput
                id={id}
                value={draft.fragranceFamily}
                onChange={(e) => set('fragranceFamily', e.target.value)}
                placeholder="Amber Woody"
              />
            )}
          </Field>
          <div>
            <TagInput
              label="Main accords"
              values={draft.mainAccords}
              onChange={(v) => set('mainAccords', v)}
              maxItems={10}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
