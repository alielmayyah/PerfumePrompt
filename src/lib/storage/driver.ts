import 'server-only';

export interface StoredFile {
  /** Driver-relative key, e.g. `perfumes/<id>/bottle/bottle-ab12cd.png`. */
  path: string;
  /** URL the browser can load. May be a signed URL or a local API route. */
  url: string;
  mimeType: string;
  byteLength: number;
}

export interface PutFileInput {
  /** Directory-ish prefix from `STORAGE_PATHS`. */
  prefix: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
  /** Overwrite an existing object at the same key. */
  upsert?: boolean;
}

export interface FetchedFile {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Object-storage abstraction.
 *
 * `read` exists because every AI stage needs the *bytes* of the bottle image and
 * master reference, and those may live in our own store, under /public, or on a
 * remote https URL.
 */
export interface StorageDriver {
  readonly name: string;
  put(input: PutFileInput): Promise<StoredFile>;
  remove(path: string): Promise<void>;
  /** Resolves any URL or driver path this app produced into raw bytes. */
  read(pathOrUrl: string): Promise<FetchedFile>;
  /** Public or signed URL for a driver path. */
  urlFor(path: string): Promise<string>;
}
