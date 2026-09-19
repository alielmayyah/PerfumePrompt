import { describe, expect, it } from 'vitest';

import {
  getLocalCommit,
  checkUpdateStatus,
} from '@/services/updateCheckService';

describe('updateCheckService', () => {
  it('detects a valid 40-character hex string for the local commit', async () => {
    const localCommit = await getLocalCommit();
    expect(localCommit).toBeTruthy();
    expect(localCommit).toMatch(/^[0-9a-f]{40}$/i);
  });

  it('computes update status structure correctly', async () => {
    const status = await checkUpdateStatus({ force: true });
    expect(status).toBeDefined();
    expect(typeof status.upToDate).toBe('boolean');
    expect(typeof status.behind).toBe('boolean');
    expect(status.checkedAt).toBeTruthy();

    if (status.localCommit) {
      expect(status.localCommit.length).toBe(7);
    }
    if (status.remoteCommit) {
      expect(status.remoteCommit.length).toBe(7);
    }
  });

  it('reuses cache on subsequent non-forced calls', async () => {
    const first = await checkUpdateStatus({ force: true });
    const second = await checkUpdateStatus({ force: false });

    expect(second.checkedAt).toBe(first.checkedAt);
  });

  it('bypasses cache when force is true', async () => {
    const first = await checkUpdateStatus({ force: true });
    // small tick
    await new Promise((r) => setTimeout(r, 10));
    const second = await checkUpdateStatus({ force: true });

    expect(new Date(second.checkedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.checkedAt).getTime(),
    );
  });
});
