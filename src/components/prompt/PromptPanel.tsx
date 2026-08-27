'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api/client';
import {
  copyImage,
  copyPromptWithImage,
  copyText,
  downloadImage,
  type ClipboardOutcome,
} from '@/lib/utils/clipboard';
import { Toast, toast, type ToastMessage } from '@/components/ui/Toast';
import type { Perfume } from '@/lib/types';

export interface PromptPanelProps {
  perfume: Perfume;
  prompt: string;
  variationPrompts?: string[];
  className?: string;
}

/**
 * The output of the app: a prompt and the raw bottle image, both one click from the
 * clipboard.
 *
 * A single component so the home page and the perfume page cannot drift apart on the
 * one interaction that matters most.
 */
export function PromptPanel({ perfume, prompt, variationPrompts = [], className }: PromptPanelProps) {
  const [copied, setCopied] = useState<string | undefined>();
  const [notice, setNotice] = useState<ToastMessage | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [savedTo, setSavedTo] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const bottleUrl = perfume.bottleImageUrl || undefined;

  const flash = (key: string, outcome: ClipboardOutcome, detail?: string) => {
    setCopied(key);
    const text = detail ?? OUTCOME_NOTES[outcome];
    if (text) setNotice(toast(text, 'good'));
    setTimeout(() => setCopied(undefined), 2500);
  };

  /** Text only, for when the image is already where it needs to be. */
  const copyPromptOnly = async (text: string, key: string) => {
    setError(undefined);
    if (!(await copyText(text))) {
      setError('The clipboard is unavailable in this browser.');
      return;
    }
    flash(key, 'text-only');
  };

  const copyBoth = async (text: string, key: string) => {
    setError(undefined);
    const { outcome, detail } = await copyPromptWithImage(text, bottleUrl);
    if (outcome === 'failed') {
      setError(detail ?? 'The clipboard is unavailable in this browser.');
      return;
    }
    flash(key, outcome, detail);
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
    if (!bottleUrl) return;
    const ok = await downloadImage(bottleUrl, `${slug(perfume)}-bottle`);
    if (!ok) setError('The bottle image could not be saved.');
  };

  const savePrompt = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const response = await api.get<{ savedTo?: string }>(
        `/api/perfumes/${perfume.id}/prompt?save=true`,
      );
      setSavedTo(response.savedTo);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader
        title="Prompt for Google Flow"
        description={
          bottleUrl
            ? 'Flow reads one thing per paste, so Copy both still means two pastes: the text into the prompt box, the image as a reference. Copy them separately if that suits you better.'
            : 'No bottle image is attached, so only the text can be copied. Add a reference below for product fidelity.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copyPromptOnly(prompt, 'prompt')}>
              {copied === 'prompt' ? 'Copied' : 'Copy prompt'}
            </Button>
            {bottleUrl ? (
              <>
                <Button size="sm" onClick={() => void copyBottle()}>
                  {copied === 'image' ? 'Copied' : 'Copy image'}
                </Button>
                <Button size="sm" variant="primary" onClick={() => void copyBoth(prompt, 'both')}>
                  {copied === 'both' ? 'Copied' : 'Copy both'}
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" loading={saving} onClick={() => void savePrompt()}>
              Save to exports
            </Button>
          </div>
        }
      />

      {bottleUrl ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-2.5">
          <div className="studio-alpha-grid h-16 w-16 shrink-0 overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bottleUrl}
              alt="The bottle reference copied with the prompt"
              className="h-full w-full object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-bone-200">This raw bottle image travels with the prompt.</p>
            <button
              type="button"
              onClick={() => void saveBottle()}
              className="mt-0.5 text-xs text-gold-300 underline-offset-2 hover:underline"
            >
              Download it instead
            </button>
          </div>
        </div>
      ) : null}

      {savedTo ? <p className="mb-3 text-xs text-jade-400">Written to {savedTo}</p> : null}
      {error ? <ErrorState className="mb-3" message={error} /> : null}

      <pre className="max-h-96 overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3 text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-bone-400">
        {prompt}
      </pre>

      {variationPrompts.length > 0 ? (
        <>
          <p className="studio-label mt-4 mb-1">Alternative takes on the same concept</p>
          <p className="mb-2 text-xs text-bone-600">
            Text only — the bottle reference is the same for every take, so copy it once.
          </p>
          <div className="flex flex-wrap gap-2">
            {variationPrompts.map((variation, index) => (
              <Button
                key={index}
                size="sm"
                variant="ghost"
                onClick={() => void copyPromptOnly(variation, `v${index}`)}
              >
                {copied === `v${index}` ? 'Copied' : `Copy take ${index + 1}`}
              </Button>
            ))}
          </div>
        </>
      ) : null}

      <Toast message={notice} />
    </Card>
  );
}

/** What actually landed on the clipboard, stated plainly. */
const OUTCOME_NOTES: Record<ClipboardOutcome, string | undefined> = {
  'text-and-image':
    'Prompt and bottle image are both on the clipboard. Paste twice: text into the prompt box, image as a reference.',
  'text-only': 'Prompt copied.',
  'image-only': 'Bottle image copied.',
  failed: undefined,
};

function slug(perfume: Perfume): string {
  return [perfume.brand, perfume.name, perfume.variant]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
