import 'server-only';

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const log = {
  info: (msg: string, meta?: unknown) => console.log(`[Update] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: unknown) => console.warn(`[Update] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: unknown) => console.error(`[Update] ${msg}`, meta ?? ''),
};

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
    const gitHeadPath = path.resolve(process.cwd(), '.git', 'HEAD');
    if (existsSync(gitHeadPath)) {
      const headContent = readFileSync(gitHeadPath, 'utf8').trim();
      if (headContent.startsWith('ref:')) {
        const refPath = headContent.slice(4).trim();
        const fullRefPath = path.resolve(process.cwd(), '.git', refPath);
        if (existsSync(fullRefPath)) {
          return readFileSync(fullRefPath, 'utf8').trim();
        }
        // Check packed-refs
        const packedRefsPath = path.resolve(process.cwd(), '.git', 'packed-refs');
        if (existsSync(packedRefsPath)) {
          const lines = readFileSync(packedRefsPath, 'utf8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.endsWith(refPath)) {
              const [sha] = trimmed.split(' ');
              if (sha && /^[0-9a-f]{40}$/i.test(sha)) {
                return sha;
              }
            }
          }
        }
      } else if (/^[0-9a-f]{40}$/i.test(headContent)) {
        return headContent;
      }
    }
  } catch (err) {
    log.warn('Could not read local git commit from filesystem', { err });
  }

  // 3. Fall back to installed_version.txt if running in standalone mode
  try {
    const vFilePath = path.resolve(process.cwd(), 'installed_version.txt');
    if (existsSync(vFilePath)) {
      const tag = readFileSync(vFilePath, 'utf8').trim();
      if (tag) return tag;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Checks GitHub repository for the latest commit on `main`.
 */
export async function getRemoteCommit(): Promise<{
  sha: string;
  message: string;
  date: string;
} | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/commits/main`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'PerfumePrompt-UpdateChecker/1.0',
      },
    });

    if (!res.ok) {
      log.warn(`GitHub API returned HTTP ${res.status} when checking latest commit`);
      return null;
    }

    const data = (await res.json()) as {
      sha: string;
      commit?: {
        message?: string;
        author?: { date?: string };
      };
    };

    return {
      sha: data.sha,
      message: data.commit?.message?.split('\n')[0] ?? '',
      date: data.commit?.author?.date ?? '',
    };
  } catch (err) {
    log.warn('Failed to reach GitHub API for update check', { err });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Checks if local commit is strictly an ancestor of remote commit.
 */
async function isLocalBehindRemote(localSha: string, remoteSha: string): Promise<boolean> {
  if (localSha.toLowerCase() === remoteSha.toLowerCase()) {
    return false;
  }

  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', localSha, remoteSha], {
      timeout: 3000,
      cwd: process.cwd(),
    });
    return true;
  } catch (err) {
    const exitCode = (err as { code?: number })?.code;
    if (exitCode === 1) {
      return false;
    }

    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/compare/${localSha}...${remoteSha}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'PerfumePrompt-UpdateChecker/1.0',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          status?: string;
          behind_by?: number;
        };
        return (data.behind_by ?? 0) > 0;
      }
    } catch {
      // Ignore API compare failure
    }

    return true;
  }
}

/**
 * Checks if the current local version is behind the remote repository on GitHub.
 */
export async function checkUpdateStatus(
  options?: { force?: boolean } | boolean,
): Promise<UpdateCheckResult> {
  const force = typeof options === 'boolean' ? options : !!options?.force;
  const now = Date.now();
  if (!force && cachedResult && cachedResult.expiresAt > now) {
    return cachedResult.result;
  }

  try {
    const [localCommit, remoteData] = await Promise.all([
      getLocalCommit(),
      getRemoteCommit(),
    ]);

    if (!localCommit || !remoteData) {
      const fallbackResult: UpdateCheckResult = {
        upToDate: true,
        localCommit: localCommit ? localCommit.slice(0, 7) : null,
        remoteCommit: remoteData ? remoteData.sha.slice(0, 7) : null,
        remoteMessage: remoteData?.message,
        remoteDate: remoteData?.date,
        behind: false,
        checkedAt: new Date().toISOString(),
      };
      cachedResult = { result: fallbackResult, expiresAt: now + CACHE_TTL_MS };
      return fallbackResult;
    }

    const isBehind = await isLocalBehindRemote(localCommit, remoteData.sha);

    const result: UpdateCheckResult = {
      upToDate: !isBehind,
      localCommit: localCommit.slice(0, 7),
      remoteCommit: remoteData.sha.slice(0, 7),
      remoteMessage: remoteData.message,
      remoteDate: remoteData.date,
      behind: isBehind,
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

/**
 * Automatically updates the installation:
 * 1. If inside a git repository, pulls latest commits and rebuilds.
 * 2. If standalone / no git, downloads latest release package from GitHub Releases and extracts it!
 */
export async function pullAndRebuild(): Promise<{
  success: boolean;
  output: string;
  newCommit: string | null;
  error?: string;
}> {
  const hasGit = existsSync(path.resolve(process.cwd(), '.git'));

  if (hasGit) {
    try {
      log.info('Running git pull origin main...');
      const { stdout: pullOut, stderr: pullErr } = await execFileAsync(
        'git',
        ['pull', 'origin', 'main'],
        { timeout: 30000, cwd: process.cwd() },
      );

      const pullOutput = (pullOut + '\n' + pullErr).trim();
      cachedResult = null;
      const newCommit = await getLocalCommit();

      let packageOutput = '';
      if (existsSync(path.resolve(process.cwd(), 'scripts', 'package-portable.mjs'))) {
        try {
          const { stdout: pkgOut } = await execFileAsync(
            'node',
            ['scripts/package-portable.mjs'],
            { timeout: 60000, cwd: process.cwd() },
          );
          packageOutput = pkgOut.trim();
        } catch (err) {
          log.warn('Portable packaging threw during update', { err });
        }
      }

      return {
        success: true,
        output: `${pullOutput}\n${packageOutput}`.trim(),
        newCommit: newCommit ? newCommit.slice(0, 7) : null,
      };
    } catch (gitErr) {
      log.warn('git pull failed, falling back to GitHub release pull & extract', { gitErr });
    }
  }

  // Standalone mode: Pull latest release archive directly from GitHub Releases and extract
  try {
    log.info('Performing standalone pull and extract from GitHub Releases...');
    const isWin = process.platform === 'win32';
    const targetAsset = isWin ? 'PerfumePrompt-Portable.zip' : 'PerfumePrompt-linux-x64.tar.gz';

    if (isWin) {
      const psScript = `
        $repo = '${GITHUB_REPO}';
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'PerfumePrompt-Updater' };
        $asset = $rel.assets | Where-Object { $_.name -eq '${targetAsset}' } | Select-Object -First 1;
        if (!$asset) { throw 'Release asset not found on GitHub' };
        $zip = Join-Path $env:TEMP ('PerfumePrompt-update-' + [Guid]::NewGuid().ToString('N') + '.zip');
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -Headers @{ 'User-Agent' = 'PerfumePrompt-Updater' };
        $tempDir = Join-Path $env:TEMP ('PerfumeExtract-' + [Guid]::NewGuid().ToString('N'));
        Expand-Archive -Path $zip -DestinationPath $tempDir -Force;
        $src = if (Test-Path (Join-Path $tempDir 'PerfumePrompt-Portable')) { Join-Path $tempDir 'PerfumePrompt-Portable' } else { $tempDir };
        Get-ChildItem -Path $src | ForEach-Object {
          if ($_.Name -ne '.data' -and $_.Name -ne 'installed_version.txt') {
            Copy-Item -Path $_.FullName -Destination . -Recurse -Force
          }
        };
        Remove-Item $zip -Force -ErrorAction SilentlyContinue;
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue;
        Set-Content -Path 'installed_version.txt' -Value $rel.tag_name;
        Write-Output "Successfully downloaded and extracted $($rel.tag_name)";
      `;
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psScript], {
        timeout: 120000,
        cwd: process.cwd(),
      });
      cachedResult = null;
      return {
        success: true,
        output: stdout.trim(),
        newCommit: 'latest',
      };
    } else {
      const shScript = `
        TEMP_TAR="/tmp/perfumeprompt-$$.tar.gz"
        TEMP_DIR="/tmp/perfumeextract-$$"
        REL="$(curl -s -L -H 'User-Agent: PerfumePrompt-Updater' 'https://api.github.com/repos/${GITHUB_REPO}/releases/latest')"
        TAR_URL="$(echo "$REL" | grep -o '"browser_download_url": *"[^"]*${targetAsset}"' | head -n 1 | cut -d'"' -f4)"
        TAG="$(echo "$REL" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | cut -d'"' -f4)"
        if [ -z "$TAR_URL" ]; then echo "Asset not found" && exit 1; fi
        curl -s -L -H 'User-Agent: PerfumePrompt-Updater' "$TAR_URL" -o "$TEMP_TAR"
        mkdir -p "$TEMP_DIR"
        tar -xzf "$TEMP_TAR" -C "$TEMP_DIR"
        SRC="$TEMP_DIR/PerfumePrompt-linux-x64"
        [ -d "$SRC" ] || SRC="$TEMP_DIR"
        for item in "$SRC"/* "$SRC"/.[!.]*; do
          [ -e "$item" ] || continue
          base="$(basename "$item")"
          if [ "$base" != ".data" ]; then cp -rf "$item" ./; fi
        done
        echo "$TAG" > installed_version.txt
        rm -rf "$TEMP_TAR" "$TEMP_DIR"
        echo "Successfully downloaded and extracted $TAG"
      `;
      const { stdout } = await execFileAsync('bash', ['-c', shScript], {
        timeout: 120000,
        cwd: process.cwd(),
      });
      cachedResult = null;
      return {
        success: true,
        output: stdout.trim(),
        newCommit: 'latest',
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error during pull and extract';
    log.error('Failed to pull and extract update', { err });
    return {
      success: false,
      output: msg,
      newCommit: null,
      error: msg,
    };
  }
}
