'use client';

import { Button } from '@/components/ui/Button';

export interface PaletteEditorProps {
  colors: string[];
  onChange: (colors: string[]) => void;
  min?: number;
  max?: number;
}

export function PaletteEditor({ colors, onChange, min = 3, max = 6 }: PaletteEditorProps) {
  const setAt = (index: number, value: string) => {
    onChange(colors.map((color, i) => (i === index ? value.toUpperCase() : color)));
  };

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <li key={`${color}-${index}`} className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 p-2">
            <label className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-md border border-ink-600">
              <span className="sr-only">Colour {index + 1}</span>
              <input
                type="color"
                value={normalise(color)}
                onChange={(event) => setAt(index, event.target.value)}
                className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <input
              value={color}
              onChange={(event) => setAt(index, event.target.value)}
              aria-label={`Colour ${index + 1} hex value`}
              className="w-20 bg-transparent font-mono text-xs text-bone-200 focus:outline-none"
            />
            {colors.length > min ? (
              <button
                type="button"
                aria-label={`Remove colour ${index + 1}`}
                onClick={() => onChange(colors.filter((_, i) => i !== index))}
                className="text-bone-600 hover:text-rose-500"
              >
                &#215;
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {colors.length < max ? (
        <Button size="sm" variant="ghost" onClick={() => onChange([...colors, '#1A1A1A'])}>
          Add colour
        </Button>
      ) : null}
    </div>
  );
}

/** `<input type="color">` only accepts #RRGGBB, so anything else falls back to black. */
function normalise(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
}
