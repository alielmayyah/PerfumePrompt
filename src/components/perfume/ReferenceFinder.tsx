'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/utils/cn';
import type { ReferenceCandidate } from '@/lib/types/perfume';

export interface ReferenceFinderProps {
  candidates: ReferenceCandidate[];
  searching: boolean;
  accepting: string | undefined;
  currentBottleUrl?: string;
  defaultQuery: string;
  failures: { url: string; reason: string }[];
  onSearch: (query: string) => void;
  onFetchUrls: (urls: string[]) => void;
  onAccept: (candidateId: string) => void;
  onClear: () => void;
}

/**
 * Sources the bottle reference from the web instead of a manual upload.
 *
 * Two inputs, because they fail in different ways: search is fastest when it works,
 * and pasting a product page URL is the reliable fallback when a brand is obscure or
 * search returns junk. Candidates are shown with their real pixel dimensions and the
 * page they came from, so the choice is informed rather than a guess at a thumbnail.
 */
export function ReferenceFinder({
  candidates,
  searching,
  accepting,
  currentBottleUrl,
  defaultQuery,
  failures,
  onSearch,
  onFetchUrls,
  onAccept,
  onClear,
}: ReferenceFinderProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [urls, setUrls] = useState('');
  const [mode, setMode] = useState<'search' | 'urls'>('search');

  const submitUrls = () => {
    const list = urls
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (list.length > 0) onFetchUrls(list);
  };

  return (
    <Card>
      <CardHeader
        title="Find the bottle online"
        description="Pulls product photography from brand and retailer pages. Pick one to become the protected product reference."
        actions={
          candidates.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={onClear} disabled={searching}>
              Clear results
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex gap-1">
        {(
          [
            ['search', 'Search'],
            ['urls', 'Paste URLs'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-current={mode === key ? 'true' : undefined}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs tracking-[0.1em] uppercase transition-colors',
              mode === key
                ? 'bg-ink-800 text-bone-50'
                : 'text-bone-400 hover:bg-ink-850 hover:text-bone-200',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'search' ? (
        <div className="space-y-3">
          <Field label="Search terms" hint="Brand and name usually suffice.">
            {({ id }) => (
              <TextInput
                id={id}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch(query);
                }}
              />
            )}
          </Field>
          <Button
            variant="primary"
            size="sm"
            loading={searching}
            disabled={query.trim().length < 3}
            onClick={() => onSearch(query)}
          >
            Search the web
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Field
            label="Product page or image URLs"
            hint="One per line. A product page works best; a direct image link also works."
          >
            {({ id }) => (
              <TextArea
                id={id}
                rows={3}
                value={urls}
                placeholder={'https://brand.example/products/the-perfume\nhttps://retailer.example/p/12345'}
                onChange={(event) => setUrls(event.target.value)}
              />
            )}
          </Field>
          <Button
            variant="primary"
            size="sm"
            loading={searching}
            disabled={urls.trim().length < 8}
            onClick={submitUrls}
          >
            Fetch images
          </Button>
        </div>
      )}

      {failures.length > 0 ? (
        <div className="mt-4 space-y-1.5">
          {failures.map((failure) => (
            <p key={failure.url} className="text-xs text-bone-600">
              <span className="text-[var(--color-amber-warn)]">Skipped</span> {hostOf(failure.url)}
              {' — '}
              {failure.reason}
            </p>
          ))}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <>
          <p className="studio-label mt-6 mb-3">
            {candidates.length} candidate{candidates.length === 1 ? '' : 's'}, best match first
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {candidates.map((candidate) => {
              const isCurrent = currentBottleUrl === candidate.url;
              return (
                <li key={candidate.id}>
                  <figure
                    className={cn(
                      'overflow-hidden rounded-[var(--radius-card)] border',
                      isCurrent ? 'border-gold-400' : 'border-ink-700',
                    )}
                  >
                    <div className="studio-alpha-grid aspect-square bg-ink-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={candidate.url}
                        alt={candidate.pageTitle ?? 'Candidate bottle image'}
                        loading="lazy"
                        className="h-full w-full object-contain p-2"
                      />
                    </div>
                    <figcaption className="space-y-2 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[0.6875rem] text-bone-400">
                          {candidate.width && candidate.height
                            ? `${candidate.width}×${candidate.height}`
                            : 'unknown size'}
                        </span>
                        {candidate.visualScore !== undefined ? (
                          <Badge
                            tone={
                              candidate.visualScore > 0.7
                                ? 'good'
                                : candidate.visualScore > 0.4
                                  ? 'warn'
                                  : 'bad'
                            }
                          >
                            {candidate.visualScore > 0.7
                              ? 'product shot'
                              : candidate.visualScore > 0.4
                                ? 'composed'
                                : 'busy scene'}
                          </Badge>
                        ) : (
                          <Badge tone={candidate.usable ? 'good' : 'warn'}>
                            {candidate.usable ? 'usable' : 'small'}
                          </Badge>
                        )}
                      </div>
                      <a
                        href={candidate.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[0.6875rem] text-bone-600 hover:text-gold-300"
                        title={candidate.pageUrl}
                      >
                        {hostOf(candidate.pageUrl)}
                      </a>
                      <Button
                        size="sm"
                        variant={isCurrent ? 'secondary' : 'primary'}
                        className="w-full"
                        loading={accepting === candidate.id}
                        disabled={Boolean(accepting) || isCurrent}
                        onClick={() => onAccept(candidate.id)}
                      >
                        {isCurrent ? 'In use' : 'Use this bottle'}
                      </Button>
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-bone-600">
            Choose the cleanest, most front-facing shot on a plain background. That single
            decision drives bottle fidelity through every generation, and accepting a new one
            clears the existing bottle analysis.
          </p>
        </>
      ) : null}

      {candidates.length === 0 && !searching && failures.length === 0 ? (
        <p className="mt-4 text-sm text-bone-600">No candidates yet.</p>
      ) : null}
    </Card>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

export function ReferenceError({ message }: { message: string }) {
  return <ErrorState message={message} />;
}
