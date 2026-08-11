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
 * Overlay must stay visible (no hide-window) while a Pomodoro/Stopwatch strip is active.
 * `panelChromeVisible` (= `panelSurfaceOpen`): Welcome/Definições com **chrome visível** (não só `isDashboardOpen` no estado — com painel recolhido à ilha o dashboard pode continuar “lógico” mas `panelSurfaceOpen` é false).
 * Usar `isDashboardOpen || isSettingsOpen` aqui fazia a ilha saltar ao abrir o dashboard: o HWND passava a `windowed` um instante antes da árvore React alinhar; com `panelSurfaceOpen` o HUD compacto desliga-no mesmo critério que o painel opaco.
 */
export function compactTimerHudShouldShow(
  isPomodoroOpen: boolean,
  isStopwatchOpen: boolean,
  state: PomodoroState,
  cfg: PomodoroConfig,
  snap: StopwatchHudSnapshot | null,
  isDesktopMode: boolean,
  panelChromeVisible: boolean,
): boolean {
  const strips =
    pomodoroCompactHudVisible(isPomodoroOpen, state, cfg) ||
    stopwatchCompactHudVisible(isStopwatchOpen, snap);
  if (!isDesktopMode) return strips;
  if (panelChromeVisible) return false;
  return strips;
}

