'use client';

import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { CreativeDirectionEditor } from '@/components/creative/CreativeDirectionEditor';
import { BottleUpload } from '@/components/perfume/BottleUpload';
import { NotesEditor, toNotesDraft, type NotesDraft } from '@/components/perfume/NotesEditor';
import { ReferenceFinder } from '@/components/perfume/ReferenceFinder';
import { PromptPanel } from '@/components/prompt/PromptPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api/client';
import { titleCase } from '@/lib/utils/format';
import type { CreativeDirection, Perfume, ReferenceCandidate } from '@/lib/types';
import { samplePalette } from '@/services/paletteExtraction';

export interface PerfumeWorkspaceProps {
  perfume: Perfume;
  prompt?: string;
  variationPrompts?: string[];
}

type Busy = 'idle' | 'searching' | 'uploading' | 'saving' | 'rebuilding';

/**
 * Editing surface for one saved perfume.
 *
 * The preparer on the home page does everything in one pass; this is where it gets
 * corrected. Anything the scrape got wrong (a note, the chosen bottle, the art
 * direction) is editable, and the prompt rebuilds from whatever is currently saved.
 */
export function PerfumeWorkspace({
  perfume: initialPerfume,
  prompt: initialPrompt,
  variationPrompts: initialVariations,
}: PerfumeWorkspaceProps) {
  const [perfume, setPerfume] = useState(initialPerfume);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [variationPrompts, setVariationPrompts] = useState(initialVariations ?? []);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | undefined>();
  const [accepting, setAccepting] = useState<string | undefined>();
  const [refFailures, setRefFailures] = useState<{ url: string; reason: string }[]>([]);

  const [notesDraft, setNotesDraft] = useState<NotesDraft>(() => toNotesDraft(initialPerfume));
  const [directionDraft, setDirectionDraft] = useState<CreativeDirection | undefined>(
    initialPerfume.creativeDirection,
  );

  const run = async (state: Busy, fn: () => Promise<void>) => {
    setError(undefined);
    setBusy(state);
    try {
      await fn();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy('idle');
    }
  };

  /** Rebuilds the prompt from whatever is saved right now. */
  const refreshPrompt = async () => {
    const built = await api.get<{ prompt: string; variationPrompts: string[] }>(
      `/api/perfumes/${perfume.id}/prompt`,
    );
    setPrompt(built.prompt);
    setVariationPrompts(built.variationPrompts);
  };

  /**
   * Re-samples the bottle's colours and rebuilds the direction from them.
   *
   * Called whenever the product reference changes, because the palette and the light
   * temperature of the scene are read off the product itself.
   */
  const applyPalette = async (target: Perfume) => {
    if (!target.bottleImageUrl) return;
    try {
      const palette = await samplePalette(target.bottleImageUrl);
      if (palette.length < 3) return;
      const result = await api.post<{
        perfume: Perfume;
        creativeDirection?: CreativeDirection;
        prompt?: string;
        variationPrompts?: string[];
      }>(`/api/perfumes/${target.id}/palette`, { palette });
      setPerfume(result.perfume);
      if (result.creativeDirection) setDirectionDraft(result.creativeDirection);
      if (result.prompt) setPrompt(result.prompt);
      if (result.variationPrompts) setVariationPrompts(result.variationPrompts);
    } catch {
      // Sampling is an enhancement; the existing palette still works.
    }
  };

  const findReferences = (payload: { query?: string; urls?: string[] }) =>
    run('searching', async () => {
      setRefFailures([]);
      const { perfume: next, failures } = await api.post<{
        perfume: Perfume;
        candidates: ReferenceCandidate[];
        failures: { url: string; reason: string }[];
      }>(`/api/perfumes/${perfume.id}/references`, {
        ...(payload.urls ? { urls: payload.urls } : { search: true, query: payload.query }),
        replace: true,
      });
      setPerfume(next);
      setRefFailures(failures);
    });

  const acceptReference = async (candidateId: string) => {
    setError(undefined);
    setAccepting(candidateId);
    try {
      const { perfume: accepted } = await api.post<{ perfume: Perfume }>(
        `/api/perfumes/${perfume.id}/references/accept`,
        { candidateId },
      );
      setPerfume(accepted);
      await applyPalette(accepted);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAccepting(undefined);
    }
  };

  const uploadBottle = (file: File) =>
    run('uploading', async () => {
      const { perfume: next } = await api.upload<{ perfume: Perfume }>(
        `/api/perfumes/${perfume.id}/bottle`,
        file,
      );
      setPerfume(next);
      await applyPalette(next);
    });

  const clearReferences = () =>
    run('searching', async () => {
      const { perfume: next } = await api.delete<{ perfume: Perfume }>(
        `/api/perfumes/${perfume.id}/references`,
      );
      setPerfume(next);
      setRefFailures([]);
    });

  const saveNotes = () =>
    run('saving', async () => {
      const { perfume: next } = await api.patch<{ perfume: Perfume }>(
        `/api/perfumes/${perfume.id}`,
        {
          topNotes: notesDraft.topNotes,
          heartNotes: notesDraft.heartNotes,
          baseNotes: notesDraft.baseNotes,
          fragranceFamily: notesDraft.fragranceFamily || undefined,
          mainAccords: notesDraft.mainAccords,
          notesApproved: true,
        },
      );
      setPerfume(next);
      setNotesDraft(toNotesDraft(next));
      await refreshPrompt();
    });

  const saveDirection = (direction: CreativeDirection) =>
    run('saving', async () => {
      const { perfume: next } = await api.patch<{ perfume: Perfume }>(
        `/api/perfumes/${perfume.id}`,
        { creativeDirection: direction },
      );
      setPerfume(next);
      setDirectionDraft(next.creativeDirection);
      await refreshPrompt();
    });

  /** Re-derives the direction from the rules. No model call is involved. */
  const rebuildDirection = () =>
    run('rebuilding', async () => {
      const palette = perfume.bottlePalette;
      if (!palette || palette.length < 3) {
        await applyPalette(perfume);
        return;
      }
      const result = await api.post<{
        perfume: Perfume;
        creativeDirection?: CreativeDirection;
        prompt?: string;
        variationPrompts?: string[];
      }>(`/api/perfumes/${perfume.id}/palette`, { palette });
      setPerfume(result.perfume);
      if (result.creativeDirection) setDirectionDraft(result.creativeDirection);
      if (result.prompt) setPrompt(result.prompt);
      if (result.variationPrompts) setVariationPrompts(result.variationPrompts);
    });

  return (
    <>
      <PageHeader
        eyebrow={perfume.brand}
        title={perfume.name}
        description={
          perfume.variant ? (
            <span className="tracking-[0.16em] uppercase">{perfume.variant}</span>
          ) : undefined
        }
        actions={
          <>
            <Badge tone={perfume.notesApproved ? 'good' : 'warn'}>
              {perfume.notesApproved ? 'notes approved' : 'notes unapproved'}
            </Badge>
            <Badge tone="neutral">{titleCase(perfume.status)}</Badge>
          </>
        }
      />

      {error ? <ErrorState className="mb-6" message={error} /> : null}

      {prompt ? (
        <PromptPanel
          className="mb-6"
          perfume={perfume}
          prompt={prompt}
          variationPrompts={variationPrompts}
        />
      ) : (
        <Card className="mb-6">
          <CardHeader
            title="No prompt yet"
            description="A prompt needs fragrance notes and an art direction. Add the notes below, then build."
          />
          <Button variant="primary" loading={busy === 'rebuilding'} onClick={rebuildDirection}>
            Build the art direction
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Bottle reference"
              description="The raw image you copy alongside the prompt."
            />
            <BottleUpload
              {...(perfume.bottleImageUrl ? { currentUrl: perfume.bottleImageUrl } : {})}
              uploading={busy === 'uploading'}
              onSelect={uploadBottle}
            />
            {perfume.bottleSourceUrl ? (
              <p className="mt-3 text-xs text-bone-600">
                Sourced from{' '}
                <a
                  href={perfume.bottleSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gold-300 hover:text-gold-400"
                >
                  {hostOf(perfume.bottleSourceUrl)}
                </a>
              </p>
            ) : null}
            {perfume.bottlePalette && perfume.bottlePalette.length > 0 ? (
              <div className="mt-4">
                <p className="studio-label mb-1.5">Sampled from the bottle</p>
                <div className="flex flex-wrap gap-1.5">
                  {perfume.bottlePalette.map((colour) => (
                    <span
                      key={colour}
                      title={colour}
                      className="h-6 w-6 rounded border border-ink-600"
                      style={{ backgroundColor: colour }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <ReferenceFinder
            candidates={perfume.referenceCandidates ?? []}
            searching={busy === 'searching'}
            accepting={accepting}
            {...(perfume.bottleImageUrl ? { currentBottleUrl: perfume.bottleImageUrl } : {})}
            defaultQuery={[perfume.brand, perfume.name, perfume.variant].filter(Boolean).join(' ')}
            failures={refFailures}
            onSearch={(query) => void findReferences({ query })}
            onFetchUrls={(urls) => void findReferences({ urls })}
            onAccept={(id) => void acceptReference(id)}
            onClear={clearReferences}
          />
        </div>

        <div className="space-y-4">
          <NotesEditor
            draft={notesDraft}
            notesSource={perfume.notesSource}
            notesApproved={perfume.notesApproved}
            researching={busy === 'searching'}
            onChange={setNotesDraft}
            onResearch={() => void findReferences({})}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === 'saving'} onClick={saveNotes}>
              Save notes and rebuild
            </Button>
            <Button loading={busy === 'rebuilding'} onClick={rebuildDirection}>
              Rebuild art direction
            </Button>
          </div>

          <CreativeDirectionEditor
            {...(directionDraft ? { direction: directionDraft } : {})}
            generating={busy === 'rebuilding'}
            canGenerate
            guidance=""
            onGuidanceChange={() => undefined}
            onGenerate={rebuildDirection}
            onChange={setDirectionDraft}
          />

          {directionDraft ? (
            <Button
              variant="primary"
              loading={busy === 'saving'}
              onClick={() => void saveDirection(directionDraft)}
            >
              Save direction and rebuild prompt
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}
