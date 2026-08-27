'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import type { CreativeDirection, Perfume, ReferenceCandidate } from '@/lib/types';
import { samplePalette } from '@/services/paletteExtraction';
import { scoreProductShots } from '@/services/productShotDetection';
import { BatchPrepare } from '@/components/prompt/BatchPrepare';
import {
  copyImage,
  copyPromptWithImage,
  copyText,
  downloadImage,
  type ClipboardOutcome,
} from '@/lib/utils/clipboard';

interface ScrapeField<T> {
  value: T;
  source?: string;
  strategy?: string;
}

interface PrepareResponse {
  perfume: Perfume;
  scrape: {
    query: string;
    notes: ScrapeField<{
      topNotes: string[];
      heartNotes: string[];
      baseNotes: string[];
      strategy: string;
    }>;
    accords: ScrapeField<{ name: string; weight: number }[]>;
    meta: ScrapeField<{ year?: number; audience?: string }>;
    pagesRead: { url: string; ok: boolean; note: string }[];
  };
  candidates: ReferenceCandidate[];
  acceptedCandidateId?: string;
  creativeDirection?: CreativeDirection;
  directionRationale?: string;
  prompt?: string;
  variationPrompts?: string[];
  warnings: string[];
}

/**
 * The one-screen version of the whole free workflow.
 *
 * After the scrape returns, the bottle palette is sampled in the browser and sent back,
 * which re-derives the creative direction from the product's own colours. That second
 * pass is what makes the direction genuinely bottle-led rather than a world default.
 */
export function PrepareRunner() {
  const router = useRouter();
  const [brand, setBrand] = useState('Ibraq');
  const [name, setName] = useState('Black Diamond Incense');
  const [variant, setVariant] = useState('');
  const [urls, setUrls] = useState('');
  const [running, setRunning] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<PrepareResponse | undefined>();
  const [copied, setCopied] = useState<string | undefined>();
  const [clipboardNote, setClipboardNote] = useState<string | undefined>();
  const [savedTo, setSavedTo] = useState<string | undefined>();
  const [mode, setMode] = useState<'one' | 'list'>('one');

  const run = async () => {
    setError(undefined);
    setResult(undefined);
    setSavedTo(undefined);
    setRunning('Searching and reading product pages');

    try {
      const list = urls
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter(Boolean);

      const response = await api.post<PrepareResponse>('/api/perfumes/scrape', {
        brand: brand.trim(),
        name: name.trim(),
        ...(variant.trim() ? { variant: variant.trim() } : {}),
        ...(list.length > 0 ? { urls: list } : {}),
      });
      setResult(response);

      /*
       * Second pass: look at the actual pixels.
       *
       * The scrape ranks candidates from filenames and alt text, which cannot tell a
       * product photograph from a campaign render sitting in the same gallery. Only
       * the browser can decode the images, so the visual check happens here and the
       * server re-ranks with the result.
       */
      let current = response;
      const shortlist = response.candidates.filter((c) => c.usable).slice(0, 8);
      if (shortlist.length > 1) {
        setRunning('Looking at the images');
        try {
          const scores = await scoreProductShots(
            shortlist.map((c) => ({ id: c.id, url: c.url })),
          );
          if (Object.keys(scores).length > 0) {
            const ranked = await api.post<{ perfume: Perfume }>(
              `/api/perfumes/${response.perfume.id}/references/rank`,
              { scores, accept: true },
            );
            current = { ...current, perfume: ranked.perfume };
            setResult(current);
          }
        } catch {
          // The metadata ranking already stands; this pass only improves on it.
        }
      }

      // Third pass: read the accepted bottle's own colours and rebuild the direction.
      if (current.perfume.bottleImageUrl) {
        setRunning('Sampling the bottle colours');
        try {
          const palette = await samplePalette(current.perfume.bottleImageUrl);
          if (palette.length >= 3) {
            const refreshed = await api.post<{
              perfume: Perfume;
              creativeDirection?: CreativeDirection;
              directionRationale?: string;
              prompt?: string;
              variationPrompts?: string[];
            }>(`/api/perfumes/${current.perfume.id}/palette`, { palette });

            setResult({
              ...current,
              perfume: refreshed.perfume,
              ...(refreshed.creativeDirection
                ? { creativeDirection: refreshed.creativeDirection }
                : {}),
              ...(refreshed.directionRationale
                ? { directionRationale: refreshed.directionRationale }
                : {}),
              ...(refreshed.prompt ? { prompt: refreshed.prompt } : {}),
              ...(refreshed.variationPrompts
                ? { variationPrompts: refreshed.variationPrompts }
                : {}),
            });
          }
        } catch {
          // Sampling is an enhancement; the world default palette already works.
        }
      }

      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(undefined);
    }
  };

  const bottleUrl = result?.perfume.bottleImageUrl || undefined;

  const flash = (key: string, outcome: ClipboardOutcome, detail?: string) => {
    setCopied(key);
    setClipboardNote(detail ?? OUTCOME_NOTES[outcome]);
    setTimeout(() => setCopied(undefined), 2500);
  };

  /** Copies a prompt and, where the browser allows it, the bottle image alongside. */
  const copy = async (text: string, key: string) => {
    setError(undefined);
    const { outcome, detail } = await copyPromptWithImage(text, bottleUrl);
    if (outcome === 'failed') {
      setError(detail ?? 'The clipboard is unavailable in this browser.');
      return;
    }
    flash(key, outcome, detail);
  };

  /*
   * Text only, deliberately separate from `copy` above.
   *
   * With a bottle attached the primary button becomes "copy prompt + image", which
   * writes a multi-format clipboard entry and needs two pastes. Sometimes the prompt is
   * all that is wanted — the reference is already in the tool, or it is going into a
   * notes app — and there was no way to get just the text.
   */
  const copyPromptText = async (text: string) => {
    setError(undefined);
    if (!(await copyText(text))) {
      setError('The clipboard is unavailable in this browser.');
      return;
    }
    flash('prompt-only', 'text-only', 'Prompt copied.');
  };

  const copyBottle = async () => {
    if (!bottleUrl) return;
    setError(undefined);
    const { outcome, detail } = await copyImage(bottleUrl);
    if (outcome === 'failed') {
      setError(detail ?? 'The image could not be copied.');
      return;
    }
    flash('image', outcome, detail);
  };

  const saveBottle = async () => {
    if (!bottleUrl || !result) return;
    const stem = [result.perfume.brand, result.perfume.name, result.perfume.variant]
      .filter(Boolean)
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const ok = await downloadImage(bottleUrl, `${stem}-bottle`);
    if (!ok) setError('The bottle image could not be saved.');
  };

  const savePrompt = async () => {
    if (!result) return;
    setRunning('Writing the prompt file');
    try {
      const response = await api.get<{ savedTo?: string }>(
        `/api/perfumes/${result.perfume.id}/prompt?save=true`,
      );
      setSavedTo(response.savedTo);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(undefined);
    }
  };

  const direction = result?.creativeDirection;

  if (mode === 'list') {
    return (
      <div className="space-y-6">
        <ModeSwitch mode={mode} onChange={setMode} />
        <BatchPrepare onFinished={() => router.refresh()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModeSwitch mode={mode} onChange={setMode} />

      <Card>
        <CardHeader title="Perfume" description="Brand and name are enough." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Brand" required>
            {({ id }) => (
              <TextInput id={id} value={brand} onChange={(e) => setBrand(e.target.value)} />
            )}
          </Field>
          <Field label="Name" required>
            {({ id }) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Variant" hint="Optional">
            {({ id }) => (
              <TextInput id={id} value={variant} onChange={(e) => setVariant(e.target.value)} />
            )}
          </Field>
        </div>

        {/*
          Open by default, because this is the reliable path rather than the advanced one.
          Keyless web search is blocked from this machine, so leaving this collapsed hides
          the field that actually works behind a toggle labelled as an exception.
        */}
        <details className="mt-4" open>
          <summary className="cursor-pointer text-xs text-bone-400 hover:text-bone-200">
            Pages to read (recommended)
          </summary>
          <div className="mt-3">
            <Field
              label="Product page URLs"
              hint="One per line. A Fragrantica perfume page is the best single source: it gives the full note pyramid, the accords and the real bottle photograph."
            >
              {({ id }) => (
                <TextArea
                  id={id}
                  rows={3}
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  placeholder={
                    'https://www.fragrantica.com/perfume/Lattafa-Perfumes/Teriaq-Intense-99586.html'
                  }
                />
              )}
            </Field>
            <p className="mt-2 text-xs text-bone-600">
              Leaving this empty makes the app search for pages itself, which is currently
              blocked from this machine and will usually fail.
            </p>
          </div>
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            loading={Boolean(running)}
            disabled={brand.trim().length < 1 || name.trim().length < 2}
            onClick={() => void run()}
          >
            Prepare campaign
          </Button>
          {running ? <span className="text-sm text-bone-400">{running}…</span> : null}
        </div>
        <p className="mt-3 text-xs text-bone-600">
          Reads a handful of pages with a pause between each. Expect around 30 to 60 seconds.
        </p>
      </Card>

      {error ? <ErrorState message={error} /> : null}

      {result ? (
        <>
          <Card>
            <CardHeader
              title="What was found"
              description={`Search: ${result.scrape.query}`}
              actions={
                <Link
                  href={`/perfumes/${result.perfume.id}`}
                  className="text-xs text-gold-300 hover:text-gold-400"
                >
                  Open in the wizard
                </Link>
              }
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-3">
                <NoteRow label="Top" notes={result.perfume.topNotes} />
                <NoteRow label="Heart" notes={result.perfume.heartNotes} />
                <NoteRow label="Base" notes={result.perfume.baseNotes} />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge tone={result.scrape.notes.strategy === 'pyramid' ? 'good' : 'warn'}>
                    {result.scrape.notes.strategy ?? 'none'}
                  </Badge>
                  <Badge tone="neutral">unapproved</Badge>
                  {result.perfume.fragranceFamily ? (
                    <Badge tone="neutral">{result.perfume.fragranceFamily}</Badge>
                  ) : null}
                </div>
                {result.scrape.notes.source ? (
                  <p className="text-xs text-bone-600">
                    From{' '}
                    <a
                      href={result.scrape.notes.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-300 hover:text-gold-400"
                    >
                      {hostOf(result.scrape.notes.source)}
                    </a>
                  </p>
                ) : null}
              </div>

              <div>
                {result.perfume.bottleImageUrl ? (
                  <figure className="studio-alpha-grid overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.perfume.bottleImageUrl}
                      alt="Accepted bottle reference"
                      className="mx-auto h-48 w-full object-contain p-3"
                    />
                    <figcaption className="border-t border-ink-700 px-3 py-2 text-xs text-bone-600">
                      Accepted from {result.candidates.length} candidates
                    </figcaption>
                  </figure>
                ) : (
                  <p className="text-sm text-bone-600">No bottle image was accepted.</p>
                )}
              </div>
            </div>

            <details className="mt-5">
              <summary className="cursor-pointer text-xs text-bone-400 hover:text-bone-200">
                {result.scrape.pagesRead.length} pages read
              </summary>
              <ul className="mt-2 space-y-1">
                {result.scrape.pagesRead.map((page) => (
                  <li key={page.url} className="text-xs text-bone-600">
                    <span className={page.ok ? 'text-jade-400' : 'text-rose-500'}>
                      {page.ok ? 'ok' : 'err'}
                    </span>{' '}
                    {hostOf(page.url)} — {page.note}
                  </li>
                ))}
              </ul>
            </details>
          </Card>

          {direction ? (
            <Card>
              <CardHeader
                title="Creative direction"
                description={result.directionRationale}
                actions={<Badge tone="gold">rules, no API</Badge>}
              />
              <dl className="grid gap-3 sm:grid-cols-2">
                <Spec label="Concept" value={direction.concept} />
                <Spec label="Mood" value={direction.mood} />
                <Spec label="Environment" value={direction.environment} />
                <Spec label="Surface" value={direction.surface} />
                <Spec label="Lighting" value={direction.lighting} />
                <Spec label="Camera" value={direction.cameraAngle} />
                <Spec label="Hero elements" value={direction.heroElements.join(', ')} />
                <Spec label="Symbolic" value={direction.symbolicElement ?? 'none'} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {direction.colorPalette.map((colour) => (
                  <span
                    key={colour}
                    title={colour}
                    className="h-8 w-8 rounded-md border border-ink-600"
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {result.prompt ? (
            <Card>
              <CardHeader
                title="Generation prompt"
                description={
                  bottleUrl
                    ? 'Copies the prompt and the bottle image together. Most tools take one per paste, so paste twice: text into the prompt box, image into the reference slot.'
                    : 'Ready to paste into any image tool. No bottle image is attached, so only the prompt will be copied.'
                }
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => void copy(result.prompt!, 'base')}
                    >
                      {copied === 'base'
                        ? 'Copied'
                        : bottleUrl
                          ? 'Copy prompt + image'
                          : 'Copy prompt'}
                    </Button>
                    {bottleUrl ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void copyPromptText(result.prompt!)}
                        >
                          {copied === 'prompt-only' ? 'Copied' : 'Copy prompt'}
                        </Button>
                        <Button size="sm" onClick={() => void copyBottle()}>
                          {copied === 'image' ? 'Copied' : 'Copy image'}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      loading={running === 'Writing the prompt file'}
                      onClick={() => void savePrompt()}
                    >
                      Save to exports
                    </Button>
                  </div>
                }
              />

              {bottleUrl ? (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-2.5">
                  <div className="studio-alpha-grid h-14 w-14 shrink-0 overflow-hidden rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bottleUrl}
                      alt="Bottle reference that will be copied with the prompt"
                      className="h-full w-full object-contain p-1"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-bone-200">
                      This reference travels with the prompt.
                    </p>
                    <button
                      type="button"
                      onClick={() => void saveBottle()}
                      className="mt-0.5 text-xs text-gold-300 underline-offset-2 hover:underline"
                    >
                      Download the image instead
                    </button>
                  </div>
                </div>
              ) : null}

              {clipboardNote ? (
                <p className="mb-3 text-xs text-jade-400">{clipboardNote}</p>
              ) : null}
              {savedTo ? (
                <p className="mb-3 text-xs text-jade-400">Written to {savedTo}</p>
              ) : null}
              <pre className="max-h-96 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-bone-400">
                {result.prompt}
              </pre>

              {result.variationPrompts && result.variationPrompts.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.variationPrompts.map((variation, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant="ghost"
                      onClick={() => void copy(variation, `v${index}`)}
                    >
                      {copied === `v${index}`
                        ? 'Copied'
                        : bottleUrl
                          ? `Variation ${index + 1} + image`
                          : `Copy variation ${index + 1}`}
                    </Button>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {result.warnings.length > 0 ? (
            <Card>
              <CardHeader title="Worth checking" />
              <ul className="space-y-1.5">
                {result.warnings.map((warning) => (
                  <li key={warning} className="text-sm text-[var(--color-amber-warn)]">
                    {warning}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function NoteRow({ label, notes }: { label: string; notes: string[] }) {
  return (
    <div>
      <p className="studio-label mb-1">{label}</p>
      <p className={cn('text-sm', notes.length > 0 ? 'text-bone-50' : 'text-bone-600')}>
        {notes.length > 0 ? notes.join(', ') : 'none found'}
      </p>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="studio-label">{label}</dt>
      <dd className="mt-0.5 text-sm text-bone-200">{value}</dd>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

/** What actually landed on the clipboard, stated plainly. */
const OUTCOME_NOTES: Record<ClipboardOutcome, string | undefined> = {
  'text-and-image':
    'Prompt and bottle image are both on the clipboard. Paste twice: once into the prompt box, once into the image slot.',
  'text-only': 'Prompt copied.',
  'image-only': 'Bottle image copied.',
  failed: undefined,
};

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: 'one' | 'list';
  onChange: (mode: 'one' | 'list') => void;
}) {
  return (
    <div className="flex gap-1">
      {(
        [
          ['one', 'One perfume'],
          ['list', 'A whole list'],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-current={mode === key ? 'true' : undefined}
          className={
            mode === key
              ? 'rounded-lg bg-ink-800 px-3 py-1.5 text-xs tracking-[0.1em] text-bone-50 uppercase'
              : 'rounded-lg px-3 py-1.5 text-xs tracking-[0.1em] text-bone-400 uppercase hover:bg-ink-850 hover:text-bone-200'
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
