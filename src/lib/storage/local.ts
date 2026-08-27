import 'server-only';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '@/lib/errors';
import { env } from '@/lib/config/env';
import { sniffImageMime } from '@/lib/utils/image';
import type { FetchedFile, PutFileInput, StorageDriver, StoredFile } from './driver';
import { isExternalReference, readExternalImage } from './remote';

/**
 * Filesystem storage driver.
 *
 * Files land under `.data/storage/<prefix>/<filename>` and are served back through
 * the `/api/files/[...path]` route, so nothing large ever ends up inside /public
 * or in the database.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  // The storage root is configurable, so the bundler cannot statically scope it.
  // Files live outside the build output and are served through /api/files, so
  // opting out of dependency tracing here is both safe and necessary.
  private readonly root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.local.storageDir);

  async put(input: PutFileInput): Promise<StoredFile> {
    const key = joinKey(input.prefix, input.filename);
    const absolute = this.resolve(key);
    await mkdir(path.dirname(absolute), { recursive: true });
    try {
      await writeFile(absolute, input.bytes, input.upsert === false ? { flag: 'wx' } : undefined);
    } catch (cause) {
      throw new AppError('STORAGE_FAILED', 'Could not write the file to local storage.', { cause });
    }
    return {
      path: key,
      url: localUrlFor(key),
      mimeType: input.mimeType,
      byteLength: input.bytes.byteLength,
    };
  }

  async remove(key: string): Promise<void> {
    try {
      await rm(this.resolve(key), { force: true });
    } catch (cause) {
      throw new AppError('STORAGE_FAILED', 'Could not delete the file from local storage.', {
        cause,
      });
    }
  }

  async read(pathOrUrl: string): Promise<FetchedFile> {
    const key = fromLocalUrl(pathOrUrl);
    if (key === undefined) {
      if (isExternalReference(pathOrUrl)) return readExternalImage(pathOrUrl);
      return this.readKey(pathOrUrl);
    }
    return this.readKey(key);
  }

  async urlFor(key: string): Promise<string> {
    return localUrlFor(key);
  }

  private async readKey(key: string): Promise<FetchedFile> {
    try {
      const bytes = new Uint8Array(await readFile(this.resolve(key)));
      return { bytes, mimeType: sniffImageMime(bytes) ?? 'application/octet-stream' };
    } catch (cause) {
      throw new AppError('STORAGE_FAILED', 'The requested file is missing from local storage.', {
        cause,
      });
    }
  }

  /** Guards against `..` traversal in stored keys. */
  private resolve(key: string): string {
    const absolute = path.resolve(this.root, key.replace(/^\/+/, ''));
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new AppError('STORAGE_FAILED', 'Invalid storage path.');
    }
    return absolute;
  }
}

export const LOCAL_FILES_ROUTE = '/api/files/';

export function localUrlFor(key: string): string {
  return `${LOCAL_FILES_ROUTE}${key.split('/').map(encodeURIComponent).join('/')}`;
}

export function fromLocalUrl(value: string): string | undefined {
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, '');
  if (!withoutOrigin.startsWith(LOCAL_FILES_ROUTE)) return undefined;
  return withoutOrigin
    .slice(LOCAL_FILES_ROUTE.length)
    .split('/')
    .map(decodeURIComponent)
    .join('/');
}

function joinKey(prefix: string, filename: string): string {
  return `${prefix.replace(/\/+$/, '')}/${filename.replace(/^\/+/, '')}`;
}
