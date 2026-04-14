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

/** True quando as faixas Pomodoro/cronómetro devem manter o overlay “interativo” (sem hide-window). */
export function compactTimerHudShouldShow(
  isPomodoroOpen: boolean,
  isStopwatchOpen: boolean,
  state: PomodoroState,
  cfg: PomodoroConfig,
  snap: StopwatchHudSnapshot | null,
): boolean {
  return (
    pomodoroCompactHudVisible(isPomodoroOpen, state, cfg) ||
    stopwatchCompactHudVisible(isStopwatchOpen, snap)
  );
}
