import 'server-only';

import type { DatabaseDriver } from './driver';
import { LocalDatabaseDriver } from './local';

export type { DatabaseDriver, ListPerfumesOptions } from './driver';

let cached: DatabaseDriver | undefined;

/**
 * The single place the application resolves a database.
 *
 * One driver: a local JSON store. The `DatabaseDriver` interface is kept so a hosted
 * driver can be introduced here later without any service or route changing.
 */
export function getDb(): DatabaseDriver {
  if (!cached) cached = new LocalDatabaseDriver();
  return cached;
}
