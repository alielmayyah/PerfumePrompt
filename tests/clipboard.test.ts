import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { copyImage, copyPromptWithImage, copyText } from '@/lib/utils/clipboard';

/**
 * The clipboard path has several failure modes that all look the same to a user (the
 * paste is empty), so each one is pinned here:
 *
 *  - no image attached
 *  - browser refuses image writes
 *  - image encoding fails
 *
 * In every case the prompt must still reach the clipboard. Losing the text because the
 * image could not be attached would be a strictly worse outcome than before.
 */

interface FakeClipboard {
  writeText: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
}

let clipboard: FakeClipboard;

function installBrowser(options: { richWrite: boolean; encodeSucceeds: boolean }) {
  clipboard = {
    writeText: vi.fn(async () => undefined),
    write: vi.fn(async () => undefined),
  };

  vi.stubGlobal('navigator', { clipboard });
  vi.stubGlobal('window', { isSecureContext: true });

  if (options.richWrite) {
    vi.stubGlobal(
      'ClipboardItem',
      class {
        readonly types: string[];
        constructor(items: Record<string, Blob>) {
          this.types = Object.keys(items);
        }
      },
    );
  } else {
    vi.stubGlobal('ClipboardItem', undefined);
  }

  // Minimal canvas + image stubs: the encode path is what varies between cases.
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') return {};
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          callback(options.encodeSucceeds ? new Blob(['png'], { type: 'image/png' }) : null);
        },
      };
    },
  });

  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 100;
      naturalHeight = 100;
      crossOrigin = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        // Resolve asynchronously, as a real image load would.
        setTimeout(() => this.onload?.(), 0);
      }
    },
  );
}

beforeEach(() => {
  installBrowser({ richWrite: true, encodeSucceeds: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyPromptWithImage', () => {
  it('writes the prompt and the image in one clipboard item', async () => {
    const result = await copyPromptWithImage('a prompt', '/api/files/perfumes/x/bottle/b.jpg');

    expect(result.outcome).toBe('text-and-image');
    expect(clipboard.write).toHaveBeenCalledTimes(1);

    const item = clipboard.write.mock.calls[0]?.[0]?.[0] as { types: string[] };
    expect(item.types).toContain('text/plain');
    expect(item.types).toContain('image/png');
  });

  it('copies text only, and says so, when no image is attached', async () => {
    const result = await copyPromptWithImage('a prompt', undefined);

    expect(result.outcome).toBe('text-only');
    expect(result.detail).toMatch(/no bottle image/i);
    expect(clipboard.writeText).toHaveBeenCalledWith('a prompt');
    expect(clipboard.write).not.toHaveBeenCalled();
  });

  it('falls back to text when the browser cannot write images', async () => {
    installBrowser({ richWrite: false, encodeSucceeds: true });

    const result = await copyPromptWithImage('a prompt', '/api/files/x.jpg');

    expect(result.outcome).toBe('text-only');
    expect(result.detail).toMatch(/would not accept an image/i);
    expect(clipboard.writeText).toHaveBeenCalledWith('a prompt');
  });

  it('still copies the prompt when the image fails to encode', async () => {
    installBrowser({ richWrite: true, encodeSucceeds: false });

    const result = await copyPromptWithImage('a prompt', '/api/files/x.jpg');

    expect(result.outcome).toBe('text-only');
    expect(clipboard.writeText).toHaveBeenCalledWith('a prompt');
  });

  it('reports failure when even the text cannot be copied', async () => {
    installBrowser({ richWrite: false, encodeSucceeds: false });
    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));

    const result = await copyPromptWithImage('a prompt', '/api/files/x.jpg');

    expect(result.outcome).toBe('failed');
    expect(result.detail).toBeTruthy();
  });
});

describe('copyImage', () => {
  it('writes a png-only clipboard item', async () => {
    const result = await copyImage('/api/files/x.jpg');

    expect(result.outcome).toBe('image-only');
    const item = clipboard.write.mock.calls[0]?.[0]?.[0] as { types: string[] };
    expect(item.types).toEqual(['image/png']);
  });

  it('reports a usable message when images are unsupported', async () => {
    installBrowser({ richWrite: false, encodeSucceeds: true });

    const result = await copyImage('/api/files/x.jpg');

    expect(result.outcome).toBe('failed');
    expect(result.detail).toMatch(/download/i);
  });
});

describe('copyText', () => {
  it('reports success and failure without throwing', async () => {
    expect(await copyText('x')).toBe(true);

    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    expect(await copyText('x')).toBe(false);
  });
});
