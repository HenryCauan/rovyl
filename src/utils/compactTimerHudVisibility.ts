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
 * `deskIslandClockWhileIdle`: omitido/`true` = ilha HH:MM em repouso (some quando há faixa Pomodoro/Cronómetro no HUD); só `false` desliga explicitamente.
 * `anyFullscreenWidgetOpen`: notas / alarmes / pomodoro / stopwatch em painel — não manter ilha nem overlay “só relógio” (evita z-45 sob scrim z-60 e atalhos estranhos).
 * `dashboardOrSettingsRouteOpen`: Welcome ou Definições “abertos” no estado React (`isDashboardOpen` / `isSettingsOpen`).
 * Deve ser independente de `panelSurfaceOpen`: com o painel minimizado à bandeja o chrome fica “despromido”
 * mas o dashboard continua lógico — a ilha não deve ficar visível a saltar com o resize do HWND ao restaurar/abrir.
 */
export function compactTimerHudShouldShow(
  isPomodoroOpen: boolean,
  isStopwatchOpen: boolean,
  state: PomodoroState,
  cfg: PomodoroConfig,
  snap: StopwatchHudSnapshot | null,
  isDesktopMode: boolean,
  suppressFloatingClock: boolean,
  deskIslandClockWhileIdle: boolean | undefined,
  anyFullscreenWidgetOpen: boolean,
  dashboardOrSettingsRouteOpen: boolean,
): boolean {
  const strips =
    pomodoroCompactHudVisible(isPomodoroOpen, state, cfg) ||
    stopwatchCompactHudVisible(isStopwatchOpen, snap);
  if (!isDesktopMode) return strips;
  if (dashboardOrSettingsRouteOpen) return false;
  if (suppressFloatingClock) return strips;
  if (anyFullscreenWidgetOpen) return strips;
  if (deskIslandClockWhileIdle !== false) return true;
  return strips;
}

