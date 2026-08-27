'use client';

import { useState, type KeyboardEvent } from 'react';

import { cn } from '@/lib/utils/cn';

export interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
}

/**
 * Editable, reorderable list of short strings. Used for fragrance notes and accords.
 *
 * Reordering matters here: note order is conventionally significant, and the
 * Creative Director sees the notes in the order they are listed.
 */
export function TagInput({
  label,
  values,
  onChange,
  placeholder = 'Add and press Enter',
  disabled = false,
  maxItems = 20,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    // A pasted comma-separated list is the common case, so split on commas.
    const additions = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (additions.length === 0) return;

    const existing = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const addition of additions) {
      if (next.length >= maxItems) break;
      if (existing.has(addition.toLowerCase())) continue;
      existing.add(addition.toLowerCase());
      next.push(addition);
    }
    onChange(next);
    setDraft('');
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(target, 0, item);
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft.length === 0 && values.length > 0) {
      remove(values.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="studio-label">{label}</span>
        <span className="text-[0.6875rem] text-bone-600">
          {values.length}
          {values.length >= maxItems ? ' (max)' : ''}
        </span>
      </div>

      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="group flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800 py-1 pr-1 pl-2.5"
            >
              <span className="text-sm text-bone-50">{value}</span>
              {!disabled ? (
                <span className="flex items-center opacity-40 transition-opacity group-hover:opacity-100">
                  <IconButton label={`Move ${value} earlier`} onClick={() => move(index, -1)}>
                    &#8592;
                  </IconButton>
                  <IconButton label={`Move ${value} later`} onClick={() => move(index, 1)}>
                    &#8594;
                  </IconButton>
                  <IconButton label={`Remove ${value}`} onClick={() => remove(index)}>
                    &#215;
                  </IconButton>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-bone-600">No notes yet.</p>
      )}

      {!disabled && values.length < maxItems ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={placeholder}
          aria-label={`Add to ${label}`}
          className={cn(
            'w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm',
            'text-bone-50 placeholder:text-bone-600 focus:border-gold-500 focus:outline-none',
          )}
        />
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-5 w-5 items-center justify-center rounded text-xs text-bone-400 hover:bg-ink-700 hover:text-bone-50"
    >
      {children}
    </button>
  );
}
