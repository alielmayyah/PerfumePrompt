'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type { CreativeDirection, Perfume, ReferenceCandidate } from '@/lib/types';
import { samplePalette } from '@/services/paletteExtraction';
import { scoreProductShots } from '@/services/productShotDetection';

export interface BatchEntry {
  brand: string;
  name: string;
  variant?: string;
}

type RowState = 'queued' | 'scraping' | 'looking' | 'colours' | 'done' | 'failed';

interface Row extends BatchEntry {
  key: string;
  state: RowState;
  detail?: string;
  perfumeId?: string;
}

const STATE_LABELS: Record<RowState, string> = {
  queued: 'queued',
  scraping: 'reading pages',
  looking: 'checking images',
  colours: 'sampling colours',
  done: 'ready',
  failed: 'failed',
};

const STATE_TONES: Record<RowState, 'neutral' | 'gold' | 'good' | 'bad'> = {
  queued: 'neutral',
  scraping: 'gold',
  looking: 'gold',
  colours: 'gold',
  done: 'good',
  failed: 'bad',
};

/** Gap between perfumes, to stay under the search endpoint's tolerance. */
const PACE_MS = 6_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SAMPLE = `[
  { "brand": "Assaf", "name": "Black Strike" },
  { "brand": "Rasasi", "name": "Hawas Elixir" }
]`;

/**
 * Prepares a list of perfumes one after another.
 *
 * Sequential on purpose, and driven from the browser rather than the server. Each
 * perfume needs two passes that only a browser can do — measuring the candidate images
 * and sampling the bottle's colours — so running the loop here keeps the whole pipeline
 * in one place. Sequential also keeps the scraper polite: a dozen perfumes fired in
 * parallel would mean a burst of requests at the same handful of sites.
 */
export function BatchPrepare({ onFinished }: { onFinished?: () => void }) {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const update = (key: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const start = async () => {
    setError(undefined);
    let entries: BatchEntry[];
    try {
      entries = parseEntries(input);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That list could not be read.');
      return;
    }
    if (entries.length === 0) {
      setError('No perfumes found in that list.');
      return;
    }

    const initial: Row[] = entries.map((entry, index) => ({
      ...entry,
      key: `${index}-${entry.brand}-${entry.name}`,
      state: 'queued',
    }));
    setRows(initial);
    setRunning(true);

    for (const [index, row] of initial.entries()) {
      /*
       * A gap between perfumes.
       *
       * The keyless search endpoint starts serving a bot challenge after a handful of
       * rapid queries, which on a first attempt at this list cut the run off after three
       * rows. Pacing costs a few seconds per perfume and is the difference between a
       * batch finishing and most of it failing.
       */
      if (index > 0) await sleep(PACE_MS);

      try {
        update(row.key, { state: 'scraping' });
        const scraped = await api.post<{
          perfume: Perfume;
          candidates: ReferenceCandidate[];
          warnings: string[];
        }>('/api/perfumes/scrape', {
          brand: row.brand,
          name: row.name,
          ...(row.variant ? { variant: row.variant } : {}),
        });

        let perfume = scraped.perfume;
        update(row.key, { perfumeId: perfume.id });

        // Pixel check on the shortlist, then re-rank server-side.
        const shortlist = scraped.candidates.filter((c) => c.usable).slice(0, 8);
        if (shortlist.length > 1) {
          update(row.key, { state: 'looking' });
          try {
            const scores = await scoreProductShots(
              shortlist.map((c) => ({ id: c.id, url: c.url })),
            );
            if (Object.keys(scores).length > 0) {
              const ranked = await api.post<{ perfume: Perfume }>(
                `/api/perfumes/${perfume.id}/references/rank`,
                { scores, accept: true },
              );
              perfume = ranked.perfume;
            }
          } catch {
            // Metadata ranking stands.
          }
        }

        if (perfume.bottleImageUrl) {
          update(row.key, { state: 'colours' });
          try {
            const palette = await samplePalette(perfume.bottleImageUrl);
            if (palette.length >= 3) {
              await api.post<{ perfume: Perfume; creativeDirection?: CreativeDirection }>(
                `/api/perfumes/${perfume.id}/palette`,
                { palette },
              );
            }
          } catch {
            // The world default palette still works.
          }
        }

        const summary = [
          perfume.bottleImageUrl ? 'bottle' : 'no bottle',
          `${perfume.topNotes.length + perfume.heartNotes.length + perfume.baseNotes.length} notes`,
        ].join(' · ');
        update(row.key, { state: 'done', detail: summary });
      } catch (cause) {
        update(row.key, { state: 'failed', detail: errorMessage(cause) });
      }
    }

    setRunning(false);
    onFinished?.();
  };

  const done = rows.filter((r) => r.state === 'done').length;
  const failed = rows.filter((r) => r.state === 'failed').length;

  return (
    <Card>
      <CardHeader
        title="Prepare a list"
        description="Paste a JSON array, or one perfume per line as “Brand, Name”. Each one is read in turn with a pause between, so a dozen takes several minutes. Leave the tab open."
        actions={
          rows.length > 0 ? (
            <span className="text-xs text-bone-600">
              {done} ready{failed > 0 ? `, ${failed} failed` : ''} of {rows.length}
            </span>
          ) : null
        }
      />

      <Field label="Perfumes" hint="JSON with brand and name, or plain lines.">
        {({ id }) => (
          <TextArea
            id={id}
            rows={6}
            value={input}
            placeholder={SAMPLE}
            onChange={(event) => setInput(event.target.value)}
            className="font-mono text-xs"
          />
        )}
      </Field>

      {error ? <ErrorState className="mt-3" message={error} /> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          loading={running}
          disabled={input.trim().length < 3}
          onClick={() => void start()}
        >
          Prepare all
        </Button>
        {running ? (
          <span className="text-sm text-bone-400">
            Working through the list. Leave this tab open.
          </span>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <ul className="mt-5 divide-y divide-ink-800 border-t border-ink-800">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="text-sm text-bone-50">
                  {row.brand} {row.name}
                </span>
                {row.detail ? (
                  <span
                    className={cn(
                      'block truncate text-xs',
                      row.state === 'failed' ? 'text-rose-500' : 'text-bone-600',
                    )}
                  >
                    {row.detail}
                  </span>
                ) : null}
              </span>
              <Badge tone={STATE_TONES[row.state]}>{STATE_LABELS[row.state]}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

/**
 * Accepts either a JSON array or plain lines.
 *
 * Both because a list like this arrives from wherever it arrives: pasted out of a
 * spreadsheet, or copied from an API response. Refusing one of those formats would just
 * mean the user reformats by hand.
 */
export function parseEntries(raw: string): BatchEntry[] {
  const text = raw.trim();
  if (text.length === 0) return [];

  if (text.startsWith('[') || text.startsWith('{')) {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const record = item as Record<string, unknown>;
      const brand = typeof record['brand'] === 'string' ? record['brand'].trim() : '';
      const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
      if (!brand || !name) return [];
      const variant = typeof record['variant'] === 'string' ? record['variant'].trim() : '';
      return [{ brand, name, ...(variant ? { variant } : {}) }];
    });
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .flatMap((line) => {
      // "Brand, Name" or "Brand | Name" or "Brand - Name"
      const parts = line.split(/\s*[,|]\s*|\s+[-–]\s+/);
      const brand = (parts[0] ?? '').trim();
      const name = parts.slice(1).join(' ').trim();
      if (!brand || !name) return [];
      return [{ brand, name }];
    });
}
