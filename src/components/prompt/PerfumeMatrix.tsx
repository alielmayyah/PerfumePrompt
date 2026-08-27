'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { api, errorMessage } from '@/lib/api/client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { Toast, toast, type ToastMessage } from '@/components/ui/Toast';
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

type SortKey = 'brand' | 'name' | 'concept' | 'notes';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'name', label: 'Name' },
  { key: 'concept', label: 'Concept' },
  { key: 'notes', label: 'Notes', className: 'w-24' },
];

/**
 * Every prepared perfume in one table, with its prompt and bottle a click away.
 *
 * The point of the table over the card grid is throughput: with a dozen perfumes you
 * are not browsing, you are working through a list, and the thing you need from each
 * row is the same two artefacts. Prompts are built on the server and passed down, so a
 * copy is instant and stays inside the click that triggered it — fetching first risks
 * losing the user gesture the clipboard API depends on.
 *
 * Below `md` the same rows render as cards. A six-column table on a phone is a
 * horizontal scroll with the action buttons permanently off screen, which defeats the
 * one thing this screen is for.
 */
export function PerfumeMatrix({ rows }: PerfumeMatrixProps) {
  const router = useRouter();
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState<string | undefined>();
  const [notice, setNotice] = useState<ToastMessage | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [armedDelete, setArmedDelete] = useState<string | undefined>();
  const [deleting, setDeleting] = useState<string | undefined>();
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'brand',
    direction: 'asc',
  });

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? rows.filter((row) =>
          [
            row.perfume.brand,
            row.perfume.name,
            row.perfume.variant ?? '',
            // Concept is searchable too: with a library this size "which one did I put
            // in the coffee world?" is a more natural question than the perfume's name.
            row.perfume.creativeDirection?.concept ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : rows;

    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...matched].sort((a, b) => factor * compareRows(a, b, sort.key));
  }, [rows, filter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // Note count is most useful largest-first; text columns read A–Z.
          { key, direction: key === 'notes' ? 'desc' : 'asc' },
    );
  };

  const flash = (key: string, message: string) => {
    setCopied(key);
    setNotice(toast(message, 'good'));
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
      setNotice(toast(`Click “Sure?” again to remove ${brand} ${name}.`, 'info'));
      return;
    }

    setDeleting(id);
    try {
      await api.delete(`/api/perfumes/${id}`);
      setArmedDelete(undefined);
      setNotice(toast(`${brand} ${name} removed.`, 'good'));
      // The rows are server-rendered, so the list has to be refetched to drop the row.
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setDeleting(undefined);
    }
  };

  const ready = rows.filter((row) => row.prompt && row.perfume.bottleImageUrl).length;

  const actions = (row: MatrixRow) => (
    <RowActions
      row={row}
      copied={copied}
      armedDelete={armedDelete}
      deleting={deleting}
      onCopyPrompt={doCopyPrompt}
      onCopyImage={doCopyImage}
      onCopyBoth={doCopyBoth}
      onDownload={doDownload}
      onDelete={doDelete}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Filter" className="w-64">
          {({ id }) => (
            <TextInput
              id={id}
              value={filter}
              placeholder="Brand, name or concept"
              onChange={(event) => setFilter(event.target.value)}
            />
          )}
        </Field>
        <p className="text-xs text-bone-600" aria-live="polite">
          {filter.trim() ? `${visible.length} shown · ` : ''}
          {ready} of {rows.length} ready to copy
        </p>
      </div>

      {error ? <ErrorState message={error} /> : null}

      {/* Desktop: the dense table. */}
      <div className="hidden overflow-x-auto rounded-card border border-ink-700 md:block">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-850 text-left">
              <Th className="w-16">Bottle</Th>
              {COLUMNS.map((column) => (
                <Th key={column.key} className={column.className} sorted={sort.key === column.key ? sort.direction : undefined}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 uppercase hover:text-bone-200"
                  >
                    {column.label}
                    <SortMark
                      active={sort.key === column.key}
                      direction={sort.direction}
                    />
                  </button>
                </Th>
              ))}
              <Th className="w-84">Copy</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const { perfume } = row;
              return (
                <tr key={perfume.id} className="border-b border-ink-800 transition-colors last:border-b-0 hover:bg-ink-850/60">
                  <Td>
                    <BottleThumb perfume={perfume} />
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
                    <NoteBadge perfume={perfume} />
                  </Td>
                  <Td>{actions(row)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: the same rows as cards, so the actions stay reachable. */}
      <ul className="space-y-3 md:hidden">
        {visible.map((row) => {
          const { perfume } = row;
          return (
            <li key={perfume.id} className="studio-card p-3">
              <div className="flex items-start gap-3">
                <BottleThumb perfume={perfume} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-bone-600">{perfume.brand}</p>
                  <Link
                    href={`/perfumes/${perfume.id}`}
                    className="block truncate text-sm text-bone-50 hover:text-gold-300"
                  >
                    {perfume.name}
                    {perfume.variant ? ` · ${perfume.variant}` : ''}
                  </Link>
                  <p className="mt-1 truncate text-xs text-bone-400">
                    {perfume.creativeDirection?.concept ?? 'not built'}
                  </p>
                </div>
                <NoteBadge perfume={perfume} />
              </div>
              <div className="mt-3">{actions(row)}</div>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-bone-600">Nothing matches that filter.</p>
      ) : null}

      <Toast message={notice} />
    </div>
  );
}

function RowActions({
  row,
  copied,
  armedDelete,
  deleting,
  onCopyPrompt,
  onCopyImage,
  onCopyBoth,
  onDownload,
  onDelete,
}: {
  row: MatrixRow;
  copied: string | undefined;
  armedDelete: string | undefined;
  deleting: string | undefined;
  onCopyPrompt: (row: MatrixRow) => Promise<void>;
  onCopyImage: (row: MatrixRow) => Promise<void>;
  onCopyBoth: (row: MatrixRow) => Promise<void>;
  onDownload: (row: MatrixRow) => Promise<void>;
  onDelete: (row: MatrixRow) => Promise<void>;
}) {
  const { perfume } = row;
  const hasImage = Boolean(perfume.bottleImageUrl);
  const armed = armedDelete === perfume.id;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" disabled={!row.prompt} onClick={() => void onCopyPrompt(row)}>
        {copied === `p-${perfume.id}` ? 'Copied' : 'Prompt'}
      </Button>
      <Button size="sm" disabled={!hasImage} onClick={() => void onCopyImage(row)}>
        {copied === `i-${perfume.id}` ? 'Copied' : 'Image'}
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={!row.prompt || !hasImage}
        onClick={() => void onCopyBoth(row)}
      >
        {copied === `b-${perfume.id}` ? 'Copied' : 'Both'}
      </Button>
      <Button size="sm" variant="ghost" disabled={!hasImage} onClick={() => void onDownload(row)}>
        Save
      </Button>

      {/*
        The destructive action is pushed away from the copy cluster and styled as danger.
        It previously sat flush against "Save" in an identical ghost button, one place
        along from the button pressed most often on this screen.

        Two clicks, not a browser confirm(): deleting is unrecoverable here (no undo, no
        trash), and a native dialog is easy to dismiss by reflex. Arming in place makes
        the second click the deliberate one.
      */}
      <Button
        size="sm"
        variant="danger"
        className="ml-auto md:ml-2"
        loading={deleting === perfume.id}
        aria-label={armed ? `Confirm removing ${perfume.brand} ${perfume.name}` : `Remove ${perfume.brand} ${perfume.name}`}
        onClick={() => void onDelete(row)}
      >
        {armed ? 'Sure?' : 'Delete'}
      </Button>
    </div>
  );
}

function BottleThumb({ perfume, size = 'md' }: { perfume: Perfume; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  if (!perfume.bottleImageUrl) {
    return (
      <div
        className={cn(
          box,
          'flex shrink-0 items-center justify-center rounded-md border border-dashed border-ink-600 text-[0.5625rem] text-bone-600',
        )}
      >
        none
      </div>
    );
  }
  return (
    <div className={cn(box, 'studio-alpha-grid shrink-0 overflow-hidden rounded-md bg-ink-900')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={perfume.bottleImageUrl}
        alt={`${perfume.brand} ${perfume.name} bottle`}
        loading="lazy"
        className="h-full w-full object-contain p-0.5"
      />
    </div>
  );
}

function NoteBadge({ perfume }: { perfume: Perfume }) {
  const count =
    perfume.topNotes.length + perfume.heartNotes.length + perfume.baseNotes.length;
  const tone = count === 0 ? 'bad' : perfume.notesApproved ? 'good' : 'warn';
  // The count alone did not say why a row was amber; the title makes the state legible.
  const title =
    count === 0
      ? 'No notes yet'
      : perfume.notesApproved
        ? `${count} notes, approved`
        : `${count} notes, not approved yet`;

  return (
    <span title={title} className="shrink-0">
      <Badge tone={tone}>{count > 0 ? `${count}` : 'none'}</Badge>
      <span className="sr-only">{title}</span>
    </span>
  );
}

function SortMark({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span aria-hidden className={cn('text-[0.625rem]', active ? 'text-gold-300' : 'text-ink-500')}>
      {active ? (direction === 'asc' ? '▲' : '▼') : '▾'}
    </span>
  );
}

function compareRows(a: MatrixRow, b: MatrixRow, key: SortKey): number {
  if (key === 'notes') {
    const count = (row: MatrixRow) =>
      row.perfume.topNotes.length + row.perfume.heartNotes.length + row.perfume.baseNotes.length;
    return count(a) - count(b);
  }
  const value = (row: MatrixRow) =>
    key === 'concept'
      ? (row.perfume.creativeDirection?.concept ?? '')
      : key === 'brand'
        ? row.perfume.brand
        : row.perfume.name;
  return value(a).localeCompare(value(b), undefined, { sensitivity: 'base' });
}

function Th({
  children,
  className,
  sorted,
}: {
  children: React.ReactNode;
  className?: string;
  sorted?: SortDirection | undefined;
}) {
  return (
    <th
      scope="col"
      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
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
