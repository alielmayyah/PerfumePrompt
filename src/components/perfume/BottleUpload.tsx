'use client';

import { useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/States';
import { ACCEPTED_IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from '@/lib/config/constants';
import { cn } from '@/lib/utils/cn';

export interface BottleUploadProps {
  currentUrl?: string;
  uploading?: boolean;
  onSelect: (file: File) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Bottle upload with client-side validation.
 *
 * Client validation is convenience only: the server re-validates from magic bytes,
 * because the browser can be bypassed.
 */
export function BottleUpload({ currentUrl, uploading = false, onSelect, disabled }: BottleUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const handle = async (file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    if (!(ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Use a PNG, JPEG, WebP or AVIF image.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`That image is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1_048_576} MB.`);
      return;
    }
    await onSelect(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    void handle(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'studio-alpha-grid relative flex aspect-4/5 items-center justify-center overflow-hidden',
          'rounded-[var(--radius-card)] border border-dashed transition-colors',
          dragging ? 'border-gold-400 bg-gold-400/5' : 'border-ink-600 bg-ink-900',
        )}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Uploaded bottle"
            className="h-full w-full object-contain p-6"
          />
        ) : (
          <div className="px-6 text-center">
            <p className="studio-display text-base text-bone-50">Upload the real bottle</p>
            <p className="mt-2 text-xs text-bone-400">
              Drag an image here, or choose a file. A clean, front-facing photo on a plain
              background gives the best fidelity.
            </p>
          </div>
        )}

        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-950/70">
            <span className="studio-label">Uploading</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_MIME_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            void handle(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          loading={uploading}
          size="sm"
        >
          {currentUrl ? 'Replace bottle image' : 'Choose bottle image'}
        </Button>
      </div>

      {error ? <ErrorState message={error} /> : null}
    </div>
  );
}
