/**
 * Clipboard helpers for handing a prompt and its reference image to another tool.
 *
 * What is and is not possible here matters, because the obvious expectation does not
 * hold:
 *
 *  - A single clipboard write CAN carry several representations at once (`text/plain`
 *    and `image/png` together). That is worth doing: whichever type the destination
 *    asks for, it finds it, so one click serves a text box and an image drop zone.
 *  - But a destination reads ONE representation per paste. Pasting into a chat prompt
 *    yields either the text or the image, never both, so a real workflow is still two
 *    pastes. The UI says so rather than implying otherwise.
 *  - Image writes must be `image/png`; browsers reject JPEG on the clipboard. Bottle
 *    references are usually JPEG, so they are converted through a canvas first.
 *  - `navigator.clipboard.write` needs a secure context and is not universally
 *    implemented for images, so every path degrades to text-only rather than failing.
 */

export type ClipboardOutcome = 'text-and-image' | 'text-only' | 'image-only' | 'failed';

export interface CopyResult {
  outcome: ClipboardOutcome;
  /** Safe explanation for the user when something was left out. */
  detail?: string;
}

/** Writes the prompt and the image together, degrading to text if images are refused. */
export async function copyPromptWithImage(
  prompt: string,
  imageUrl: string | undefined,
): Promise<CopyResult> {
  if (!imageUrl) {
    return (await copyText(prompt))
      ? { outcome: 'text-only', detail: 'No bottle image is attached, so only the prompt was copied.' }
      : { outcome: 'failed', detail: 'The clipboard is unavailable in this browser.' };
  }

  if (supportsRichWrite()) {
    try {
      const png = await toPngBlob(imageUrl);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([prompt], { type: 'text/plain' }),
          'image/png': png,
        }),
      ]);
      return { outcome: 'text-and-image' };
    } catch {
      // Fall through to text-only rather than leaving the clipboard untouched.
    }
  }

  return (await copyText(prompt))
    ? {
        outcome: 'text-only',
        detail: 'This browser would not accept an image on the clipboard. Use Copy image separately.',
      }
    : { outcome: 'failed', detail: 'The clipboard is unavailable in this browser.' };
}

/** Puts only the image on the clipboard, as PNG. */
export async function copyImage(imageUrl: string): Promise<CopyResult> {
  if (!supportsRichWrite()) {
    return {
      outcome: 'failed',
      detail: 'This browser cannot put images on the clipboard. Use Download instead.',
    };
  }
  try {
    const png = await toPngBlob(imageUrl);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return { outcome: 'image-only' };
  } catch {
    return {
      outcome: 'failed',
      detail: 'The image could not be copied. Use Download instead.',
    };
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves the image to disk, for when the clipboard route is unavailable. */
export async function downloadImage(imageUrl: string, filename: string): Promise<boolean> {
  try {
    const png = await toPngBlob(imageUrl);
    const href = URL.createObjectURL(png);
    const link = document.createElement('a');
    link.href = href;
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    link.click();
    // Revoke on the next tick so the click has consumed the URL.
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ internals */

function supportsRichWrite(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem !== 'undefined' &&
    window.isSecureContext
  );
}

/**
 * Re-encodes any image as PNG.
 *
 * Required rather than optional: clipboard image writes are PNG-only in practice, and
 * stored bottle references are usually JPEG or WebP.
 */
async function toPngBlob(imageUrl: string): Promise<Blob> {
  const image = await loadImage(imageUrl);

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('encode failed'));
    }, 'image/png');
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Stored images are same-origin; this keeps the canvas untainted if a driver ever
    // serves a CORS-enabled absolute URL instead.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = url;
  });
}
