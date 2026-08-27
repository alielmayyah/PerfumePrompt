import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError, errors } from '@/lib/errors';
import { MAX_UPLOAD_BYTES } from '@/lib/config/constants';
import { sniffImageMime } from '@/lib/utils/image';
import type { FetchedFile } from './driver';

const MAX_REFERENCE_BYTES = MAX_UPLOAD_BYTES * 4;

/**
 * Reads an image that lives outside our own object storage:
 *
 *  - an absolute http(s) URL, fetched over the network;
 *  - a root-relative path served from /public, read straight off disk (which is
 *    how the default master style reference ships).
 *
 * Shared by both storage drivers so the behaviour is identical either way.
 */
export async function readExternalImage(pathOrUrl: string): Promise<FetchedFile> {
  const bytes = isAbsoluteUrl(pathOrUrl)
    ? await downloadImage(pathOrUrl)
    : await readPublicImage(pathOrUrl);

  if (bytes.byteLength === 0) {
    throw errors.validation('The reference image is empty.');
  }
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw errors.tooLarge('The reference image is too large to send to the model.');
  }

  return { bytes, mimeType: sniffImageMime(bytes) ?? 'image/png' };
}

async function downloadImage(url: string): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  } catch (cause) {
    throw new AppError('NETWORK_FAILED', 'Could not download the reference image.', { cause });
  }
  if (!response.ok) {
    throw new AppError(
      'STORAGE_FAILED',
      `Reference image request failed with status ${response.status}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function readPublicImage(relativePath: string): Promise<Uint8Array> {
  const publicDir = path.join(process.cwd(), 'public');
  const resolved = path.resolve(publicDir, relativePath.replace(/^\/+/, ''));
  if (!resolved.startsWith(publicDir)) {
    throw errors.validation('Reference path escapes the public directory.');
  }
  try {
    return new Uint8Array(await readFile(resolved));
  } catch (cause) {
    throw new AppError(
      'STORAGE_FAILED',
      `Reference image "${relativePath}" was not found on the server.`,
      { cause },
    );
  }
}

export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** True when the value is not a key inside our own object storage. */
export function isExternalReference(value: string): boolean {
  return isAbsoluteUrl(value) || value.startsWith('/');
}
