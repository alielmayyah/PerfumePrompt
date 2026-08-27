import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Exercises the persistence layer against a real temp directory.
 *
 * The patch-clearing tests exist because a previous implementation filtered
 * `undefined` out of patches, which silently broke every intended field clear:
 * deselecting a variation and clearing a stale error both became no-ops.
 */

let dataDir: string;

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'studio-db-test-'));
  process.env['STUDIO_LOCAL_DATA_DIR'] = dataDir;
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function freshDb() {
  // Imported lazily so the env var above is read by the module on first load.
  const { LocalDatabaseDriver } = await import('@/lib/db/local');
  return new LocalDatabaseDriver();
}

describe('LocalDatabaseDriver', () => {
  it('creates and reads a perfume with defaults filled in', async () => {
    const db = await freshDb();
    const perfume = await db.createPerfume({ brand: 'Ibraq', name: 'Black Diamond Incense' });

    expect(perfume.id).toBeTruthy();
    expect(perfume.status).toBe('draft');
    expect(perfume.topNotes).toEqual([]);
    expect(perfume.notesApproved).toBe(false);
    expect(await db.getPerfume(perfume.id)).toMatchObject({ brand: 'Ibraq' });
  });

  it('leaves fields absent from a patch untouched', async () => {
    const db = await freshDb();
    const created = await db.createPerfume({
      brand: 'Ibraq',
      name: 'Black Diamond Incense',
      topNotes: ['Frankincense'],
    });

    const updated = await db.updatePerfume(created.id, { variant: 'Extrait' });
    expect(updated.variant).toBe('Extrait');
    expect(updated.topNotes).toEqual(['Frankincense']);
    expect(updated.brand).toBe('Ibraq');
  });

  it('clears a field when a patch explicitly passes undefined', async () => {
    const db = await freshDb();
    const created = await db.createPerfume({ brand: 'Ibraq', name: 'Black Diamond Incense' });

    const withBottle = await db.updatePerfume(created.id, {
      bottleImageUrl: '/api/files/perfumes/x/bottle/b.jpg',
      bottleSourceUrl: 'https://example.com/product',
    });
    expect(withBottle.bottleSourceUrl).toBe('https://example.com/product');
    expect(withBottle.status).toBe('bottle_ready');

    // Clearing the reference must also drop its provenance and reset the status.
    const cleared = await db.updatePerfume(created.id, {
      bottleImageUrl: '',
      bottleSourceUrl: undefined,
    });
    expect(cleared.bottleSourceUrl).toBeUndefined();
    expect(cleared.status).toBe('draft');
  });

  it('derives perfume status from the data rather than trusting the input', async () => {
    const db = await freshDb();
    const created = await db.createPerfume({
      brand: 'Ibraq',
      name: 'Black Diamond Incense',
      topNotes: ['Frankincense'],
      notesApproved: true,
    });
    expect(created.status).toBe('notes_ready');
  });

  it('serialises concurrent mutations without losing writes', async () => {
    const db = await freshDb();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        db.createPerfume({ brand: 'Ibraq', name: `Concurrent ${i}` }),
      ),
    );
    const all = await db.listPerfumes();
    const concurrent = all.filter((p) => p.name.startsWith('Concurrent'));
    expect(concurrent).toHaveLength(12);
  });
});
