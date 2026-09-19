import 'server-only';

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { createLogger } from '@/lib/logger';

const execFileAsync = promisify(execFile);
const log = createLogger('update-check');

export interface UpdateCheckResult {
  upToDate: boolean;
  localCommit: string | null;
  remoteCommit: string | null;
  remoteMessage?: string;
  remoteDate?: string;
  behind: boolean;
  checkedAt: string;
  error?: string;
}

const GITHUB_REPO = 'alielmayyah/PerfumePrompt';
const CACHE_TTL_MS = 30_000; // 30 seconds

let cachedResult: { result: UpdateCheckResult; expiresAt: number } | null = null;

/**
 * Resolves the current local commit hash.
 * First tries `git rev-parse HEAD`, then falls back to direct .git filesystem inspection.
 */
export async function getLocalCommit(): Promise<string | null> {
  // 1. Try git CLI
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      timeout: 3000,
      cwd: process.cwd(),
    });
    const sha = stdout.trim();
    if (/^[0-9a-f]{40}$/i.test(sha)) {
      return sha;
    }
  } catch {
    // Git command failed or not in PATH; fall through to filesystem fallback
  }

  // 2. Direct .git folder inspection
  try {
    const gitDir = path.resolve(process.cwd(), '.git');
    const headContent = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();

    if (/^[0-9a-f]{40}$/i.test(headContent)) {
      return headContent;
    }

    if (headContent.startsWith('ref:')) {
      const refPath = headContent.replace(/^ref:\s*/, '').trim();
      const directRefFile = path.join(gitDir, refPath);

      try {
        const refContent = (await readFile(directRefFile, 'utf8')).trim();
        if (/^[0-9a-f]{40}$/i.test(refContent)) {
          return refContent;
        }
      } catch {
        // May be in packed-refs
      }

      // Check packed-refs
      try {
        const packedRefs = await readFile(path.join(gitDir, 'packed-refs'), 'utf8');
        for (const line of packedRefs.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed) continue;
          const [sha, name] = trimmed.split(/\s+/);
          if (name === refPath && sha && /^[0-9a-f]{40}$/i.test(sha)) {
            return sha;
          }
        }
      } catch {
        // packed-refs not found
      }
    }
  } catch (err) {
    log.warn('Could not read local git HEAD from filesystem', { err });
  }

  return null;
}

/**
 * Fetches the latest remote commit on `main`.
 * Tries GitHub REST API first (provides commit message & date), with git ls-remote as fallback.
 */
export async function getRemoteCommit(): Promise<{
  sha: string;
  message?: string;
  date?: string;
} | null> {
  // 1. Try GitHub REST API
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
      headers: {
        'User-Agent': 'PerfumePrompt-UpdateChecker/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        sha?: string;
        commit?: { message?: string; author?: { date?: string } };
      };

      if (data.sha && /^[0-9a-f]{40}$/i.test(data.sha)) {
        return {
          sha: data.sha,
          message: data.commit?.message?.split('\n')[0],
          date: data.commit?.author?.date,
        };
      }
    }
  } catch {
    // Network or rate-limit issue, try git ls-remote below
  }

  // 2. Fallback: git ls-remote (no API rate-limits)
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', 'origin', 'refs/heads/main'],
      { timeout: 5000, cwd: process.cwd() },
    );
    const line = stdout.trim().split('\n')[0] ?? '';
    const sha = line.split(/\s+/)[0];
    if (sha && /^[0-9a-f]{40}$/i.test(sha)) {
      return { sha };
    }
  } catch {
    // git ls-remote failed
  }

  return null;
}

/**
 * Checks if local HEAD is up-to-date with remote main.
 */
export async function checkUpdateStatus(options?: { force?: boolean }): Promise<UpdateCheckResult> {
  const now = Date.now();
  if (!options?.force && cachedResult && cachedResult.expiresAt > now) {
    return cachedResult.result;
  }

  try {
    const [local, remote] = await Promise.all([getLocalCommit(), getRemoteCommit()]);

    if (!local || !remote) {
      const result: UpdateCheckResult = {
        upToDate: true, // Fail-open: don't annoy user if offline or git not detected
        localCommit: local ? local.slice(0, 7) : null,
        remoteCommit: remote ? remote.sha.slice(0, 7) : null,
        behind: false,
        checkedAt: new Date().toISOString(),
        error: !local ? 'Local git repository not detected' : 'Could not reach remote GitHub repository',
      };
      cachedResult = { result, expiresAt: now + CACHE_TTL_MS };
      return result;
    }

    const isMatch = local.toLowerCase() === remote.sha.toLowerCase();
    const result: UpdateCheckResult = {
      upToDate: isMatch,
      localCommit: local.slice(0, 7),
      remoteCommit: remote.sha.slice(0, 7),
      remoteMessage: remote.message,
      remoteDate: remote.date,
      behind: !isMatch,
      checkedAt: new Date().toISOString(),
    };

    cachedResult = { result, expiresAt: now + CACHE_TTL_MS };
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('Failed to check update status', { error });
    return {
      upToDate: true,
      localCommit: null,
      remoteCommit: null,
      behind: false,
      checkedAt: new Date().toISOString(),
      error: msg,
    };
  }
}
