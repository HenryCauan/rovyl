import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PomodoroConfig, PomodoroState } from '../types';
import type { StopwatchHudSnapshot } from '../stopwatchHudStore';
import { getTranslation } from '../translations';
import {
  pomodoroCompactHudVisible,
  stopwatchCompactHudVisible,
} from '../utils/compactTimerHudVisibility';

/**
 * “Ambient pill” — compacto, sem backdrop-blur (overlay transparente no Windows).
 * Borda em cabelo, sombra suave, leve highlight interno.
 */
const islandPillClass =
  'inline-flex min-w-0 items-center gap-2.5 rounded-full border border-white/[0.08] bg-[rgba(11,11,13,0.92)] px-3.5 py-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.055)]';

const islandPulseDot =
  'h-[5px] w-[5px] shrink-0 rounded-full bg-emerald-400/95 shadow-[0_0_10px_rgba(52,211,153,0.5)]';

/** Faixa no topo: largura = viewport; ilha centrada em X com flex (sem translate). */
function islandTopStripClass(paintReady: boolean): string {
  return [
    'fixed inset-x-0 top-0 z-[45] flex justify-center pt-[max(1.25rem,env(safe-area-inset-top,0px))] px-4 pb-4 pointer-events-none overflow-visible transition-opacity duration-150',
    paintReady ? 'opacity-100' : 'opacity-0',
  ].join(' ');
}

/** Só este bloco entra no rect do hit-shape — deve envolver só a pill, não a faixa inteira. */
function islandClusterClassNames(sideBySideTimerStrips: boolean): string {
  const base =
    'pointer-events-auto items-center max-w-[min(100vw-1rem,52rem)] justify-center';
  if (sideBySideTimerStrips) {
    return `${base} flex flex-row flex-wrap gap-2`;
  }
  return `${base} flex flex-col gap-2 max-w-[min(100vw-1.5rem,24rem)]`;
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

/** Sempre HH:MM (24h), sem segundos — formato mínimo para a ilha de relógio. */
function formatIdleClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  /** Evita mostrar a ilha durante vários frames em que o HWND / viewport ainda mudam (saltava entre cantos). */
  const [paintReady, setPaintReady] = useState(false);
  const lastSentBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const showPomodoro = pomodoroCompactHudVisible(isPomodoroOpen, pomodoroState, pomodoroConfig);
  const showStopwatch = stopwatchCompactHudVisible(isStopwatchOpen, stopwatchSnap);
  const allowIdleClock = config.deskIslandClockWhileIdle !== false;
  /** Relógio HH:MM só em repouso — some quando há faixa de widget (Pomodoro e/ou Cronómetro). */
  const showIdleClock =
    allowIdleClock && !suppressFloatingClock && !showPomodoro && !showStopwatch;

  const sideBySideTimerStrips = showPomodoro && showStopwatch;
  const pillClass = islandPillClass;
  const labelMicro = 'text-[8px] font-semibold uppercase tracking-[0.2em]';
  const timeSize = 'text-[15px]';

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
      setPaintReady(false);
      lastSentBoundsRef.current = null;
      void window.electron.setWindowHitShape([]);
      return;
    }

    const el = rootRef.current;
    if (!el) return;

    const pad = 20;

    const applyNow = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const next = {
        x: Math.round(window.screenX + r.left - pad),
        y: Math.round(window.screenY + r.top - pad),
        width: Math.round(r.width + pad * 2),
        height: Math.round(r.height + pad * 2),
      };
      const prev = lastSentBoundsRef.current;
      if (
        prev &&
        Math.abs(prev.x - next.x) < 3 &&
        Math.abs(prev.y - next.y) < 3 &&
        Math.abs(prev.width - next.width) < 3 &&
        Math.abs(prev.height - next.height) < 3
      ) {
        return;
      }
      lastSentBoundsRef.current = next;
      void window.electron!.setWindowHitShape!([next], { coordinateSpace: 'screen' });
    };

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const applyDebounced = () => {
      if (debounce !== null) clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        applyNow();
      }, 140);
    };

    setPaintReady(false);
    let cancelled = false;
    let raf2Id = 0;
    let ro: ResizeObserver | null = null;

    const raf1 = requestAnimationFrame(() => {
      raf2Id = requestAnimationFrame(() => {
        if (cancelled) return;
        applyNow();
        queueMicrotask(() => {
          if (!cancelled) applyNow();
        });
        setPaintReady(true);
        ro = new ResizeObserver(applyDebounced);
        ro.observe(el);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2Id);
      if (debounce !== null) clearTimeout(debounce);
      ro?.disconnect();
      setPaintReady(false);
      lastSentBoundsRef.current = null;
      void window.electron?.setWindowHitShape?.([]);
    };
  }, [isDesktopMode, visible, showPomodoro, showStopwatch, showIdleClock, suppressFloatingClock]);

  if (!visible) return null;

  const pm = Math.floor(Math.max(0, pomodoroState.timeLeft) / 60);
  const ps = Math.max(0, pomodoroState.timeLeft) % 60;
  const pomodoroLabel = `${pm}:${String(ps).padStart(2, '0')}`;
  const timeStyleBase = 'font-mono font-semibold tabular-nums leading-none text-white/[0.96]';
  const timeStyleDynamic = `${timeStyleBase} ${timeSize}`;

  return (
    <div className={islandTopStripClass(paintReady)}>
      <div ref={rootRef} className={islandClusterClassNames(sideBySideTimerStrips)}>
        {showPomodoro && (
          <div
            className={`${pillClass} min-w-[8.25rem] max-w-[min(42vw,20rem)] shrink-0 justify-between`}
            title={t('pomodoro.timer')}
          >
            <span className={`${labelMicro} text-white/40 font-semibold uppercase`}>{t('hud.island_label_pom')}</span>
            <span className={timeStyleDynamic}>{pomodoroLabel}</span>
          </div>
        )}
        {showStopwatch && stopwatchSnap && (
          <div
            className={`${pillClass} min-w-[8.25rem] max-w-[min(42vw,20rem)] shrink-0 justify-between`}
            title={t('stopwatch.title')}
          >
            <span className={`${labelMicro} text-white/40 font-semibold uppercase`}>{t('hud.island_label_stop')}</span>
            <span className={timeStyleDynamic}>{formatStopwatchMs(stopwatchSnap.ms)}</span>
          </div>
        )}
        {showIdleClock && (
          <div
            className={`${pillClass} pl-2.5 pr-3.5 gap-2.5 justify-between`}
            title={t('hud.island_clock')}
          >
            <span className={islandPulseDot} aria-hidden />
            <span ref={idleTimeRef} className={`${timeStyleBase} text-[15px] tracking-tight`} />
          </div>
        )}
      </div>
    </div>
  );
};

