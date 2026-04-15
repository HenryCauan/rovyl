import React, { useLayoutEffect, useRef } from 'react';
import type { PomodoroConfig, PomodoroState, UIConfig } from '../types';
import type { StopwatchHudSnapshot } from '../stopwatchHudStore';
import { getTranslation } from '../translations';
import {
  pomodoroCompactHudVisible,
  stopwatchCompactHudVisible,
} from '../utils/compactTimerHudVisibility';

/** Fundo opaco — sem backdrop-blur (GPU / janela transparente no Windows). */
const islandCardClass =
  'rounded-2xl border border-white/15 bg-[rgba(10,10,12,0.92)] px-4 py-2.5 shadow-lg min-w-[7.5rem]';

function islandCornerClass(pos: string | undefined): string {
  switch (pos) {
    case 'top-right':
      return 'top-0 right-0 items-end';
    case 'bottom-left':
      return 'bottom-0 left-0 items-start';
    case 'bottom-right':
      return 'bottom-0 right-0 items-end';
    default:
      return 'top-0 left-0 items-start';
  }
}

function formatStopwatchMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

type Props = {
  config: UIConfig;
  isDesktopMode: boolean;
  suppressFloatingClock: boolean;
  isPomodoroOpen: boolean;
  isStopwatchOpen: boolean;
  pomodoroState: PomodoroState;
  pomodoroConfig: PomodoroConfig;
  stopwatchSnap: StopwatchHudSnapshot | null;
};

function formatIdleClock(): string {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const CompactTimerHud: React.FC<Props> = ({
  config,
  isDesktopMode,
  suppressFloatingClock,
  isPomodoroOpen,
  isStopwatchOpen,
  pomodoroState,
  pomodoroConfig,
  stopwatchSnap,
}) => {
  const t = (k: string) => getTranslation(config, k);
  const rootRef = useRef<HTMLDivElement>(null);
  const idleTimeRef = useRef<HTMLSpanElement>(null);

  const showPomodoro = pomodoroCompactHudVisible(isPomodoroOpen, pomodoroState, pomodoroConfig);
  const showStopwatch = stopwatchCompactHudVisible(isStopwatchOpen, stopwatchSnap);
  const allowIdleClock = config.deskIslandClockWhileIdle === true;
  const showIdleClock =
    allowIdleClock && !suppressFloatingClock && !showPomodoro && !showStopwatch;

  const visible = isDesktopMode && (showPomodoro || showStopwatch || showIdleClock);

  /**
   * Ilha só em repouso: atualizar HH:MM no máximo 1×/minuto e só via textContent — evita
   * re-render React + repintura do overlay transparente a cada segundo (congelava Zen/Edge).
   */
  useLayoutEffect(() => {
    if (!showIdleClock) return;
    const el = idleTimeRef.current;
    if (!el) return;

    const write = () => {
      el.textContent = formatIdleClock();
    };
    write();
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = window.setTimeout(() => {
      write();
      intervalId = window.setInterval(write, 60_000);
    }, msToNextMinute);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [showIdleClock]);

  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.setWindowHitShape) return;

    if (!visible) {
      void window.electron.setWindowHitShape([]);
      return;
    }

    const el = rootRef.current;
    if (!el) return;

    const apply = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const pad = 10;
      /** Rect em coordenadas de ecrã — o main process encolhe o HWND à ilha (sem overlay invisível a ecrã inteiro). */
      void window.electron!.setWindowHitShape!(
        [
          {
            x: Math.round(window.screenX + r.left - pad),
            y: Math.round(window.screenY + r.top - pad),
            width: Math.round(r.width + pad * 2),
            height: Math.round(r.height + pad * 2),
          },
        ],
        { coordinateSpace: 'screen' },
      );
    };

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const applyDebounced = () => {
      if (debounce !== null) clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        apply();
      }, 48);
    };

    apply();
    const ro = new ResizeObserver(applyDebounced);
    ro.observe(el);
    return () => {
      if (debounce !== null) clearTimeout(debounce);
      ro.disconnect();
      void window.electron?.setWindowHitShape?.([]);
    };
  }, [isDesktopMode, visible, showPomodoro, showStopwatch, showIdleClock, suppressFloatingClock]);

  if (!visible) return null;

  const pos = config.clockPosition;
  const corner = islandCornerClass(pos);

  const pm = Math.floor(Math.max(0, pomodoroState.timeLeft) / 60);
  const ps = Math.max(0, pomodoroState.timeLeft) % 60;
  const pomodoroLabel = `${pm}:${String(ps).padStart(2, '0')}`;

  return (
    <div ref={rootRef} className={`pointer-events-auto fixed z-[45] flex flex-col gap-2 p-6 ${corner}`}>
      {showPomodoro && (
        <div className={islandCardClass}>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/45">Pomodoro</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-white">{pomodoroLabel}</div>
        </div>
      )}
      {showStopwatch && stopwatchSnap && (
        <div className={islandCardClass}>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/45">Stopwatch</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-white">
            {formatStopwatchMs(stopwatchSnap.ms)}
          </div>
        </div>
      )}
      {showIdleClock && (
        <div
          className={`${islandCardClass} min-w-0 [contain:paint]`}
          title={t('hud.island_clock')}
        >
          <span
            ref={idleTimeRef}
            className="font-mono text-xl font-semibold tabular-nums text-white tracking-tight"
          />
        </div>
      )}
    </div>
  );
};

