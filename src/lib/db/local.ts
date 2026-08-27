import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '@/lib/config/env';
import { AppError, errors } from '@/lib/errors';
import { newId } from '@/lib/utils/id';
import type { Perfume, PerfumeCreateInput, PerfumeUpdateInput } from '@/lib/types';
import type { DatabaseDriver, ListPerfumesOptions } from './driver';
import { normalisePerfume, sortByCreatedAtDesc } from './shared';

interface LocalDbShape {
  version: 2;
  perfumes: Perfume[];
}

const EMPTY: LocalDbShape = { version: 2, perfumes: [] };

/**
 * JSON-file database. The only driver, and the whole persistence layer.
 *
 * Writes are serialised through a promise chain and written atomically via a temp file
 * plus rename, so a crash mid-write cannot corrupt the store. This is explicitly a
 * single-process driver: it assumes one server writing one file.
 *
 * Patch semantics: a key present in a patch is applied, including when its value is
 * `undefined`, which clears the field. A key absent from the patch is left alone.
 * Request bodies come from zod, which omits absent optional keys rather than emitting
 * them as `undefined`, so an HTTP PATCH can never clear a field by accident.
 */
export class LocalDatabaseDriver implements DatabaseDriver {
  readonly name = 'local' as const;

  private readonly file = path.resolve(process.cwd(), env.local.dataDir, 'studio.json');
  private queue: Promise<unknown> = Promise.resolve();

  async healthCheck() {
    try {
      await this.read();
      return {
        ok: true,
        message: `Local JSON store at ${path.relative(process.cwd(), this.file)}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'unknown error' };
    }
  }

  async createPerfume(input: PerfumeCreateInput): Promise<Perfume> {
    return this.mutate((db) => {
      const now = new Date().toISOString();
      const perfume = normalisePerfume({ ...input, id: newId(), createdAt: now, updatedAt: now });
      db.perfumes.push(perfume);
      return perfume;
    });
  }

  async getPerfume(id: string): Promise<Perfume | undefined> {
    const db = await this.read();
    return db.perfumes.find((p) => p.id === id);
  }

  async listPerfumes(options: ListPerfumesOptions = {}): Promise<Perfume[]> {
    const db = await this.read();
    let rows = sortByCreatedAtDesc(db.perfumes);

    if (options.search) {
      const needle = options.search.toLowerCase();
      rows = rows.filter((p) =>
        [p.brand, p.name, p.arabicName ?? '', p.variant ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }

    const offset = options.offset ?? 0;
    return rows.slice(offset, options.limit ? offset + options.limit : undefined);
  }

  async updatePerfume(id: string, patch: PerfumeUpdateInput): Promise<Perfume> {
    return this.mutate((db) => {
      const index = db.perfumes.findIndex((p) => p.id === id);
      const existing = db.perfumes[index];
      if (index === -1 || !existing) throw errors.notFound('Perfume');

      const next = normalisePerfume({
        ...existing,
        ...patch,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      db.perfumes[index] = next;
      return next;
    });
  }

  async deletePerfume(id: string): Promise<void> {
    await this.mutate((db) => {
      db.perfumes = db.perfumes.filter((p) => p.id !== id);
      return undefined;
    });
  }

  /* -------------------------------------------------------------- internals */

  private async read(): Promise<LocalDbShape> {
    try {
      const text = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(text) as Partial<LocalDbShape>;
      return { version: 2, perfumes: (parsed.perfumes ?? []).map(normalisePerfume) };
    } catch (error) {
      if (isMissingFile(error)) return structuredClone(EMPTY);
      throw new AppError('DATABASE_FAILED', 'The local data store could not be read.', {
        cause: error,
      });
    }
  }

  /** Serialises read-modify-write cycles to avoid lost updates. */
  private mutate<T>(fn: (db: LocalDbShape) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.read();
      const result = fn(db);
      await this.write(db);
      return result;
    });
    // Keep the chain alive even when this operation rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(db: LocalDbShape): Promise<void> {
    const temp = `${this.file}.${process.pid}.tmp`;
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
      await rename(temp, this.file);
    } catch (cause) {
      throw new AppError('DATABASE_FAILED', 'The local data store could not be written.', {
        cause,
      });
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
