import 'server-only';

import { STORAGE_PATHS } from '@/lib/config/constants';
import { extensionForMime } from '@/lib/utils/image';
import { shortToken, slugify } from '@/lib/utils/id';
import type { StorageDriver, StoredFile } from './driver';
import { LocalStorageDriver } from './local';

export type { StorageDriver, StoredFile, PutFileInput, FetchedFile } from './driver';
export { LOCAL_FILES_ROUTE, fromLocalUrl } from './local';

let cached: StorageDriver | undefined;

/**
 * The single place the application resolves object storage.
 *
 * One driver today: the local filesystem. The `StorageDriver` interface is kept so
 * an object-store driver can be introduced here later without any service or route
 * changing.
 */
export function getStorage(): StorageDriver {
  if (!cached) cached = new LocalStorageDriver();
  return cached;
}

export type StorageKind = keyof typeof STORAGE_PATHS;

export interface SaveImageInput {
  perfumeId: string;
  kind: StorageKind;
  bytes: Uint8Array;
  mimeType: string;
  /** Human-readable stem, e.g. `bottle` or `variation-2`. */
  label: string;
}

/**
 * Single place that decides storage filenames, so paths stay predictable and
 * collision-free.
 */
export async function saveImage(input: SaveImageInput): Promise<StoredFile> {
  const filename = `${slugify(input.label) || 'image'}-${shortToken(6)}.${extensionForMime(input.mimeType)}`;
  return getStorage().put({
    prefix: STORAGE_PATHS[input.kind](input.perfumeId),
    filename,
    bytes: input.bytes,
    mimeType: input.mimeType,
  });
}

/** Resolves a stored URL or key into bytes for use as an AI reference image. */
export async function readImageBytes(pathOrUrl: string) {
  return getStorage().read(pathOrUrl);
}
