'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface UpdateStatus {
  upToDate: boolean;
  localCommit: string | null;
  remoteCommit: string | null;
  remoteMessage?: string;
  remoteDate?: string;
  behind: boolean;
  checkedAt: string;
  error?: string;
}

const POLL_INTERVAL_MS = 60_000; // Check every 60 seconds

export function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    const performCheck = async (force = false) => {
      try {
        const url = force ? '/api/system/update?force=true' : '/api/system/update';
        const res = await fetch(url);
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as UpdateStatus;
        if (!mounted) return;
        setStatus(data);

        // If user pulled and commits match, auto-clear dismissal and hide popup
        if (data.upToDate) {
          setDismissed(false);
        }
      } catch {
        // Silent error: do not disrupt user if offline
      }
    };

    // Initial check (async, avoids synchronous setState in effect body)
    void performCheck();

    // Infinite recurring poll
    const interval = setInterval(() => {
      void performCheck();
    }, POLL_INTERVAL_MS);

    // Also check when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void performCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/system/update?force=true');
      if (res.ok) {
        const data = (await res.json()) as UpdateStatus;
        setStatus(data);
        if (data.upToDate) {
          setDismissed(false);
        }
      }
    } catch {
      // Silent error
    } finally {
      setChecking(false);
    }
  };

  const copyPullCommand = async () => {
    try {
      await navigator.clipboard.writeText('git pull origin main');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // If no update is needed, or if data hasn't loaded yet
  if (!status || status.upToDate || !status.behind) {
    return null;
  }

  // If user minimized the popup, show a non-intrusive floating indicator
  if (dismissed) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-bounce-subtle">
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="group flex items-center gap-2.5 rounded-full border border-gold-500/50 bg-ink-950/95 px-4 py-2 text-xs text-bone-100 shadow-xl backdrop-blur transition hover:border-gold-400 hover:bg-ink-900"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
          <span className="font-medium text-gold-300">Update Available</span>
          <span className="text-bone-400 group-hover:text-bone-200">
            {status.remoteCommit}
          </span>
        </button>
      </div>
    );
  }

  // Full Alert Modal Popup
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="relative w-full max-w-lg rounded-2xl border border-gold-500/40 bg-ink-900/95 p-6 shadow-2xl shadow-gold-950/40 sm:p-8"
      >
        {/* Top Status Icon & Tag */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <Badge tone="gold">Git Update Required</Badge>
          </div>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Minimize popup"
            className="rounded-lg p-1.5 text-bone-400 hover:bg-ink-800 hover:text-bone-100 transition"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Title & Description */}
        <div className="mt-4">
          <h2
            id="update-dialog-title"
            className="studio-display text-xl sm:text-2xl font-medium text-bone-50"
          >
            You are not on the latest commit
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-bone-300">
            A new version has been pushed to the remote repository. To avoid
            running an outdated version and ensure all features are in sync, please
            pull the latest changes into your local repository.
          </p>
        </div>

        {/* Commit Details Card */}
        <div className="mt-5 rounded-xl border border-ink-800 bg-ink-950/80 p-4 text-xs font-mono">
          <div className="flex items-center justify-between py-1 border-b border-ink-850">
            <span className="text-bone-400">Current Local Commit:</span>
            <span className="text-rose-400 font-semibold">{status.localCommit ?? 'Unknown'}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-ink-850">
            <span className="text-bone-400">Latest on GitHub:</span>
            <span className="text-gold-300 font-semibold">{status.remoteCommit}</span>
          </div>
          {status.remoteMessage && (
            <div className="mt-2 pt-1 text-bone-300 line-clamp-2">
              <span className="text-bone-500 mr-2">Latest commit:</span>
              &ldquo;{status.remoteMessage}&rdquo;
            </div>
          )}
        </div>

        {/* Action Command Box */}
        <div className="mt-5">
          <label className="block text-xs font-medium uppercase tracking-wider text-bone-400 mb-2">
            Run this in your terminal:
          </label>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-750 bg-ink-950 px-3.5 py-2.5">
            <code className="text-sm font-mono text-gold-200 selection:bg-gold-500/30">
              git pull origin main
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={copyPullCommand}
              className="text-xs shrink-0"
            >
              {copied ? '✓ Copied!' : 'Copy Command'}
            </Button>
          </div>
          <div className="mt-2.5 text-right">
            <a
              href="https://github.com/alielmayyah/PerfumePrompt/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gold-300 hover:text-gold-200 underline underline-offset-2 transition"
            >
              Or download the latest Portable Edition (.zip) &rarr;
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            className="w-full sm:w-auto"
          >
            Remind me later
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleManualCheck}
            loading={checking}
            className="w-full sm:w-auto"
          >
            {checking ? 'Checking...' : 'Check Again'}
          </Button>
        </div>
      </div>
    </div>
  );
}
