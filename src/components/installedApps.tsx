import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Shape returned by the `get-installed-apps` IPC handler (Get-StartApps). */
export type InstalledApp = { Name?: string; Path?: string; DisplayName?: string; IconPath?: string };

/**
 * Shared across every mount so reopening the picker is instant and two pickers
 * never race the same PowerShell scan. The main process caches too, but that
 * still costs an IPC round trip per mount.
 */
let appsCache: InstalledApp[] | null = null;
let inFlight: Promise<InstalledApp[]> | null = null;

function fetchInstalledApps(forceRefresh: boolean): Promise<InstalledApp[]> {
  if (forceRefresh) {
    appsCache = null;
    inFlight = null;
  } else {
    if (appsCache) return Promise.resolve(appsCache);
    if (inFlight) return inFlight;
  }

  const request = window.electron?.getInstalledApps?.(forceRefresh);
  if (!request) return Promise.reject(new Error('electron bridge unavailable'));

  inFlight = request
    .then((items) => {
      const list = (Array.isArray(items) ? items : []).filter(
        (item: InstalledApp) => item && item.Path && (item.DisplayName || item.Name),
      );
      appsCache = list;
      return list;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

/**
 * Loads the installed-app list once `enabled` turns true.
 *
 * The request is tracked in a ref rather than in state: deriving the guard from
 * state made the effect re-run on its own `setLoading(true)`, whose cleanup
 * cancelled the pending response and left the picker spinning forever.
 */
export function useInstalledApps(enabled: boolean) {
  const [apps, setApps] = useState<InstalledApp[]>(() => appsCache ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const requestedRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = useCallback((forceRefresh = false) => {
    requestedRef.current = true;
    setError(false);
    setLoading(true);
    fetchInstalledApps(forceRefresh)
      .then((list) => {
        if (!aliveRef.current) return;
        setApps(list);
        setError(list.length === 0);
      })
      .catch(() => {
        if (!aliveRef.current) return;
        setApps([]);
        setError(true);
      })
      .finally(() => { if (aliveRef.current) setLoading(false); });
  }, []);

  useEffect(() => {
    if (!enabled || requestedRef.current) return;
    load();
  }, [enabled, load]);

  return { apps, loading, error, reload: load };
}

// ─── Native icon, fetched only once the row is actually on screen ──────────────
const iconMemo = new Map<string, string | null>();
const ICON_MEMO_LIMIT = 200;

function rememberIcon(path: string, value: string | null) {
  // Data URLs are much larger than their Map keys. Keep the picker fast without
  // retaining every icon ever visited for the lifetime of the renderer.
  iconMemo.delete(path);
  iconMemo.set(path, value);
  while (iconMemo.size > ICON_MEMO_LIMIT) {
    const oldest = iconMemo.keys().next().value as string | undefined;
    if (!oldest) break;
    iconMemo.delete(oldest);
  }
}

/**
 * Renders the real Windows icon for `path`. Each cache miss costs a PowerShell
 * spawn in the main process, so the fetch waits until the row is visible and
 * results are memoised per path for the session.
 */
export const NativeAppIcon: React.FC<{
  path?: string;
  size?: number;
  className?: string;
  fallback: React.ReactNode;
}> = ({ path, size = 28, className, fallback }) => {
  const [iconUrl, setIconUrl] = useState<string | null>(() => (path ? iconMemo.get(path) ?? null : null));
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!path || path.length < 2) return;
    if (iconMemo.has(path)) {
      setIconUrl(iconMemo.get(path) ?? null);
      return;
    }
    setIconUrl(null);

    const host = hostRef.current;
    if (!host) return;

    let alive = true;
    const run = () => {
      const getFileIcon = window.electron?.getFileIcon;
      if (!getFileIcon) { rememberIcon(path, null); return; }
      Promise.resolve(getFileIcon(path))
        .then((url) => {
          rememberIcon(path, url || null);
          if (alive && url) setIconUrl(url);
        })
        .catch(() => { rememberIcon(path, null); });
    };

    if (typeof IntersectionObserver === 'undefined') {
      run();
      return () => { alive = false; };
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    }, { root: null, rootMargin: '120px' });
    observer.observe(host);

    return () => { alive = false; observer.disconnect(); };
  }, [path]);

  return (
    <span ref={hostRef} className={className} style={{ width: size, height: size }} aria-hidden>
      {iconUrl
        ? <img src={iconUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : fallback}
    </span>
  );
};
