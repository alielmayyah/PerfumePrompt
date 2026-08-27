'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { api, errorMessage } from '@/lib/api/client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/utils/cn';
import {
  copyImage,
  copyPromptWithImage,
  copyText,
  downloadImage,
} from '@/lib/utils/clipboard';
import type { Perfume } from '@/lib/types';

export interface MatrixRow {
  perfume: Perfume;
  prompt?: string;
}

export interface PerfumeMatrixProps {
  rows: MatrixRow[];
}

/**
 * Every prepared perfume in one table, with its prompt and bottle a click away.
 *
 * The point of the table over the card grid is throughput: with a dozen perfumes you
 * are not browsing, you are working through a list, and the thing you need from each
 * row is the same two artefacts. Prompts are built on the server and passed down, so a
 * copy is instant and stays inside the click that triggered it — fetching first risks
 * losing the user gesture the clipboard API depends on.
 */
export function PerfumeMatrix({ rows }: PerfumeMatrixProps) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [armedDelete, setArmedDelete] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<string | undefined>();

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.perfume.brand, row.perfume.name, row.perfume.variant ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, filter]);

  const flash = (key: string, message: string) => {
    setCopied(key);
    setNote(message);
    setTimeout(() => setCopied(undefined), 2000);
  };

  const doCopyPrompt = async (row: MatrixRow) => {
    setError(undefined);
    if (!row.prompt) return;
    if (!(await copyText(row.prompt))) {
      setError('The clipboard is unavailable in this browser.');
      return;
    }
    flash(`p-${row.perfume.id}`, `Prompt copied for ${row.perfume.name}.`);
  };

  const doCopyImage = async (row: MatrixRow) => {
    setError(undefined);
    if (!row.perfume.bottleImageUrl) return;
    const { outcome, detail } = await copyImage(row.perfume.bottleImageUrl);
    if (outcome === 'failed') {
      setError(detail ?? 'The image could not be copied.');
      return;
    }
    flash(`i-${row.perfume.id}`, `Bottle image copied for ${row.perfume.name}.`);
  };

  const doCopyBoth = async (row: MatrixRow) => {
    setError(undefined);
    if (!row.prompt) return;
    const { outcome, detail } = await copyPromptWithImage(
      row.prompt,
      row.perfume.bottleImageUrl || undefined,
    );
    if (outcome === 'failed') {
      setError(detail ?? 'The clipboard is unavailable in this browser.');
      return;
    }
    flash(
      `b-${row.perfume.id}`,
      outcome === 'text-and-image'
        ? 'Prompt and image copied. Paste twice: text, then image.'
        : (detail ?? 'Prompt copied.'),
    );
  };

  const doDownload = async (row: MatrixRow) => {
    if (!row.perfume.bottleImageUrl) return;
    const ok = await downloadImage(row.perfume.bottleImageUrl, `${slug(row.perfume)}-bottle`);
    if (!ok) setError('The bottle image could not be saved.');
  };

  const doDelete = async (row: MatrixRow) => {
    setError(undefined);
    const { id, brand, name } = row.perfume;

    // First click arms, second click deletes. Arming one row disarms any other.
    if (armedDelete !== id) {
      setArmedDelete(id);
      setNote(`Click “Sure?” again to remove ${brand} ${name}.`);
      return;
    }

    setDeleting(id);
    try {
      await api.delete(`/api/perfumes/${id}`);
      setArmedDelete(undefined);
      setNote(`${brand} ${name} removed.`);
      // The rows are server-rendered, so the list has to be refetched to drop the row.
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(undefined);
    }
  };

  const ready = rows.filter((row) => row.prompt && row.perfume.bottleImageUrl).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Filter" className="w-64">
          {({ id }) => (
            <TextInput
              id={id}
              value={filter}
              placeholder="Brand or name"
              onChange={(event) => setFilter(event.target.value)}
            />
          )}
        </Field>
        <p className="text-xs text-bone-600">
          {ready} of {rows.length} ready to copy
        </p>
      </div>

      {note ? <p className="text-xs text-jade-400">{note}</p> : null}
      {error ? <ErrorState message={error} /> : null}

      {/* The table scrolls inside its own container so the page never scrolls sideways. */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink-700">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-850 text-left">
              <Th className="w-16">Bottle</Th>
              <Th>Brand</Th>
              <Th>Name</Th>
              <Th>Concept</Th>
              <Th className="w-24">Notes</Th>
              <Th className="w-[19rem]">Copy</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const { perfume } = row;
              const hasImage = Boolean(perfume.bottleImageUrl);
              const noteCount =
                perfume.topNotes.length + perfume.heartNotes.length + perfume.baseNotes.length;

              return (
                <tr key={perfume.id} className="border-b border-ink-800 last:border-b-0">
                  <Td>
                    <div className="studio-alpha-grid h-12 w-12 overflow-hidden rounded-md bg-ink-900">
                      {hasImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={perfume.bottleImageUrl}
                          alt={`${perfume.name} bottle`}
                          loading="lazy"
                          className="h-full w-full object-contain p-0.5"
                        />
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-bone-400">{perfume.brand}</Td>
                  <Td>
                    <Link
                      href={`/perfumes/${perfume.id}`}
                      className="text-bone-50 hover:text-gold-300"
                    >
                      {perfume.name}
                    </Link>
                    {perfume.variant ? (
                      <span className="block text-xs text-bone-600">{perfume.variant}</span>
                    ) : null}
                  </Td>
                  <Td className="text-bone-400">
                    {perfume.creativeDirection?.concept ?? (
                      <span className="text-bone-600">not built</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={noteCount > 0 ? (perfume.notesApproved ? 'good' : 'warn') : 'bad'}>
                      {noteCount > 0 ? `${noteCount}` : 'none'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        disabled={!row.prompt}
                        onClick={() => void doCopyPrompt(row)}
                      >
                        {copied === `p-${perfume.id}` ? 'Copied' : 'Prompt'}
                      </Button>
                      <Button size="sm" disabled={!hasImage} onClick={() => void doCopyImage(row)}>
                        {copied === `i-${perfume.id}` ? 'Copied' : 'Image'}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!row.prompt || !hasImage}
                        onClick={() => void doCopyBoth(row)}
                      >
                        {copied === `b-${perfume.id}` ? 'Copied' : 'Both'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!hasImage}
                        onClick={() => void doDownload(row)}
                      >
                        Save
                      </Button>
                      {/*
                        Two clicks, not a browser confirm(): deleting is unrecoverable
                        here (there is no undo and no trash), and a native dialog is easy
                        to dismiss by reflex. Arming the button in place makes the second
                        click the deliberate one.
                      */}
                      <Button
                        size="sm"
                        variant={armedDelete === perfume.id ? 'primary' : 'ghost'}
                        loading={deleting === perfume.id}
                        onClick={() => void doDelete(row)}
                      >
                        {armedDelete === perfume.id ? 'Sure?' : 'Delete'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-bone-600">Nothing matches that filter.</p>
      ) : null}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2.5 text-[0.6875rem] font-medium tracking-[0.14em] text-bone-400 uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2.5 align-middle', className)}>{children}</td>;
}

function slug(perfume: Perfume): string {
  return [perfume.brand, perfume.name, perfume.variant]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
