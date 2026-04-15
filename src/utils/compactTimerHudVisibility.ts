import type { PomodoroConfig, PomodoroState, PomodoroMode } from '../types';
import type { StopwatchHudSnapshot } from '../stopwatchHudStore';

function segmentSeconds(mode: PomodoroMode, cfg: PomodoroConfig): number {
  if (mode === 'shortBreak') return cfg.shortBreakDuration * 60;
  if (mode === 'longBreak') return cfg.longBreakDuration * 60;
  return cfg.workDuration * 60;
}

export function pomodoroCompactHudVisible(
  modalOpen: boolean,
  state: PomodoroState,
  cfg: PomodoroConfig,
): boolean {
  if (modalOpen) return false;
  const full = segmentSeconds(state.mode, cfg);
  if (state.timeLeft <= 0) return false;
  return state.isActive || state.timeLeft < full;
}

export function stopwatchCompactHudVisible(
  modalOpen: boolean,
  snap: StopwatchHudSnapshot | null,
): boolean {
  if (modalOpen || !snap) return false;
  return snap.isRunning || snap.ms > 0;
}

/**
 * Overlay must stay visible (no hide-window) when strips are active or when idle island is enabled.
 * `suppressFloatingClock`: e.g. radial open — hide island clock & avoid treating idle island as active.
 */
export function compactTimerHudShouldShow(
  isPomodoroOpen: boolean,
  isStopwatchOpen: boolean,
  state: PomodoroState,
  cfg: PomodoroConfig,
  snap: StopwatchHudSnapshot | null,
  isDesktopMode: boolean,
  suppressFloatingClock: boolean,
  deskIslandClockWhileIdle: boolean,
): boolean {
  const strips =
    pomodoroCompactHudVisible(isPomodoroOpen, state, cfg) ||
    stopwatchCompactHudVisible(isStopwatchOpen, snap);
  if (!isDesktopMode) return strips;
  if (suppressFloatingClock) return strips;
  if (deskIslandClockWhileIdle) return true;
  return strips;
}

