import { useSyncExternalStore } from 'react';

export type StopwatchHudSnapshot = {
  ms: number;
  isRunning: boolean;
};

let snapshot: StopwatchHudSnapshot | null = null;
const listeners = new Set<() => void>();

export function setStopwatchHud(next: StopwatchHudSnapshot | null) {
  if (next === null) {
    if (snapshot === null) return;
    snapshot = null;
    listeners.forEach((l) => l());
    return;
  }
  if (snapshot && snapshot.ms === next.ms && snapshot.isRunning === next.isRunning) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getServerSnapshot(): StopwatchHudSnapshot | null {
  return null;
}

export function useStopwatchHudSnapshot(): StopwatchHudSnapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot, getServerSnapshot);
}
