import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PomodoroConfig, PomodoroState, UIConfig } from '../types';
import type { StopwatchHudSnapshot } from '../stopwatchHudStore';
import { getTranslation } from '../translations';
import {
  pomodoroCompactHudVisible,
  stopwatchCompactHudVisible,
} from '../utils/compactTimerHudVisibility';

/**
 * “Ambient pill” — compacto, sem backdrop-blur (overlay transparente no Windows).
 * `box-shadow` em HWND transparente costuma gerar halo/bounding box retangular no DWM — profundidade com `drop-shadow` + borda.
 */
const islandPillClass =
  'inline-flex min-w-0 items-center gap-2.5 rounded-full border border-white/[0.1] bg-[rgba(11,11,13,0.94)] px-3.5 py-1.5 shadow-none [filter:drop-shadow(0_4px_14px_rgba(0,0,0,0.28))_drop-shadow(0_1px_2px_rgba(0,0,0,0.2))]';

/** Faixa no topo: largura = viewport; ilha centrada em X com flex (sem translate). */
function islandTopStripClass(paintReady: boolean): string {
  return [
    'fixed inset-x-0 top-0 z-[55] flex justify-center bg-transparent pt-[max(1.25rem,env(safe-area-inset-top,0px))] px-4 pb-4 pointer-events-none overflow-visible isolate [mix-blend-mode:normal]',
    paintReady ? 'opacity-100 visible' : 'opacity-0 invisible',
  ].join(' ');
}

/** Só este bloco entra no rect do hit-shape — deve envolver só a pill, não a faixa inteira. */
function islandClusterClassNames(sideBySideTimerStrips: boolean): string {
  const base =
    'pointer-events-auto relative isolate z-0 transform-gpu items-center bg-transparent max-w-[min(100vw-1rem,52rem)] justify-center';
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

/** BrowserWindow nasce 1280×800 — hit-shape antes do `small` fullscreen desloca a ilha para o centro do ecrã. */
function looksLikeStartupWindowedViewport(): boolean {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return Math.abs(w - 1280) <= 48 && Math.abs(h - 800) <= 48;
}

/** Em repouso o HWND fica encolhido ao canto: sem reexpandir primeiro, a faixa não tem viewport para medir. */
function viewportTooSmallToMeasure(): boolean {
  return window.innerWidth < 640 || window.innerHeight < 200;
}

async function ensureSmallOverlayBeforeHitShape(): Promise<void> {
  if (!window.electron?.reapplySmallOverlay) return;
  if (!looksLikeStartupWindowedViewport() && !viewportTooSmallToMeasure()) return;
  await window.electron.reapplySmallOverlay();
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

type Props = {
  config: UIConfig;
  isDesktopMode: boolean;
  isPomodoroOpen: boolean;
  isStopwatchOpen: boolean;
  pomodoroState: PomodoroState;
  pomodoroConfig: PomodoroConfig;
  stopwatchSnap: StopwatchHudSnapshot | null;
};

export const CompactTimerHud: React.FC<Props> = ({
  config,
  isDesktopMode,
  isPomodoroOpen,
  isStopwatchOpen,
  pomodoroState,
  pomodoroConfig,
  stopwatchSnap,
}) => {
  const t = (k: string) => getTranslation(config, k);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Evita mostrar a ilha durante vários frames em que o HWND / viewport ainda mudam (saltava entre cantos). */
  const [paintReady, setPaintReady] = useState(false);
  const lastSentBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const showPomodoro = pomodoroCompactHudVisible(isPomodoroOpen, pomodoroState, pomodoroConfig);
  const showStopwatch = stopwatchCompactHudVisible(isStopwatchOpen, stopwatchSnap);
  const sideBySideTimerStrips = showPomodoro && showStopwatch;
  const pillClass = islandPillClass;
  const labelMicro = 'text-[8px] font-semibold uppercase tracking-[0.2em]';
  const timeSize = 'text-[15px]';

  const visible = isDesktopMode && (showPomodoro || showStopwatch);

  /**
   * Não enviar `setWindowHitShape([])` ao desmontar — no main isso repõe o overlay a ecrã inteiro em `small` e
   * compete com `set-window-size` `windowed` (flash / retângulo). O App força `windowed` ou `reapplySmallOverlay`.
   */
  /** Medição + hit-shape — cleanup só cancela observers. */
  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.setWindowHitShape || !visible) return;

    const el = rootRef.current;
    if (!el) return;

    let cancelled = false;
    const pad = 20;

    /** Um frame após aplicar hit-shape o DWM costuma estabilizar — evita “vazamento” / rect inicial. */
    const revealPaintReady = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (!cancelled) setPaintReady(true);
      });
    };

    setPaintReady(false);

    const applyNow = async () => {
      if (cancelled) return;
      /** Deixa o layout/viewport estabilizar após resize (evita 1.º rect errado + salto visível). */
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;
      await ensureSmallOverlayBeforeHitShape();
      if (cancelled) return;

      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      /** Após windowed→`small`, `window.screenX`/`screenY` podem ficar desatualizados — o main tem a origem certa. */
      let ox = window.screenX;
      let oy = window.screenY;
      try {
        const cb = await window.electron?.getMainWindowContentBounds?.();
        if (
          cb &&
          typeof cb.x === 'number' &&
          typeof cb.y === 'number' &&
          !Number.isNaN(cb.x) &&
          !Number.isNaN(cb.y)
        ) {
          ox = cb.x;
          oy = cb.y;
        }
      } catch {
        /* ignore */
      }
      const next = {
        x: Math.round(ox + r.left - pad),
        y: Math.round(oy + r.top - pad),
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
        revealPaintReady();
        return;
      }
      lastSentBoundsRef.current = next;
      try {
        await window.electron!.setWindowHitShape!([next], { coordinateSpace: 'screen' });
      } catch {
        /* ignore */
      } finally {
        revealPaintReady();
      }
    };

    let debounce: number | null = null;
    const applyDebounced = () => {
      if (debounce !== null) clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        lastSentBoundsRef.current = null;
        void applyNow();
      }, 140);
    };

    const onResize = () => applyDebounced();

    let raf2Id = 0;
    let ro: ResizeObserver | null = null;
    const raf1 = requestAnimationFrame(() => {
      raf2Id = requestAnimationFrame(() => {
        if (cancelled) return;
        void (async () => {
          await applyNow();
          if (cancelled) return;
          ro = new ResizeObserver(applyDebounced);
          ro.observe(el);
          window.addEventListener('resize', onResize);
        })();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2Id);
      if (debounce !== null) clearTimeout(debounce);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [isDesktopMode, visible, showPomodoro, showStopwatch]);

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
      </div>
    </div>
  );
};

