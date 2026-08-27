import 'server-only';

import type { Perfume, PerfumeCreateInput, PerfumeUpdateInput } from '@/lib/types';

export interface ListPerfumesOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * Persistence abstraction.
 *
 * Implementations return fully-hydrated domain objects, so no service or route ever
 * deals with storage-level shapes. Only the local JSON driver exists; the interface is
 * the seam for adding a hosted driver later.
 */
export interface DatabaseDriver {
  readonly name: string;

  /** Verifies the store is readable. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;

  createPerfume(input: PerfumeCreateInput): Promise<Perfume>;
  getPerfume(id: string): Promise<Perfume | undefined>;
  listPerfumes(options?: ListPerfumesOptions): Promise<Perfume[]>;
  updatePerfume(id: string, patch: PerfumeUpdateInput): Promise<Perfume>;
  deletePerfume(id: string): Promise<void>;
}
