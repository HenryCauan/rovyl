import React, { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Play, Pause, RotateCcw, Flag } from 'lucide-react';
import { UIConfig } from '../types';
import { getTranslation } from '../translations';
import { setStopwatchHud } from '../stopwatchHudStore';
import { WidgetBackdropOpacitySlider } from './WidgetBackdropOpacitySlider';

const FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";

interface StopwatchWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  config: UIConfig;
  setConfig: Dispatch<SetStateAction<UIConfig>>;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({ isOpen, onClose, config, setConfig }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    if (isRunning || time > 0) {
      setStopwatchHud({ ms: time, isRunning });
    } else {
      setStopwatchHud(null);
    }
  }, [isRunning, time]);

  const t = (key: string) => getTranslation(config, key);

  const animate = useCallback((timeNow: number) => {
    const deltaTime = timeNow - startTimeRef.current;
    setTime(previousTimeRef.current + deltaTime);
    requestRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleStart = () => {
    if (!isRunning) {
      setIsRunning(true);
      startTimeRef.current = performance.now();
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  const handlePause = () => {
    if (isRunning) {
      setIsRunning(false);
      cancelAnimationFrame(requestRef.current);
      previousTimeRef.current = timeRef.current;
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    cancelAnimationFrame(requestRef.current);
    setTime(0);
    previousTimeRef.current = 0;
    setLaps([]);
  };

  const handleLap = () => {
    if (isRunning) setLaps((prev) => [timeRef.current, ...prev]);
  };

  const fmt = (ms: number) => {
    const min = Math.floor(ms / 60000)
      .toString()
      .padStart(2, '0');
    const sec = Math.floor((ms % 60000) / 1000)
      .toString()
      .padStart(2, '0');
    const cs = Math.floor((ms % 1000) / 10)
      .toString()
      .padStart(2, '0');
    return { min, sec, cs, full: `${min}:${sec}.${cs}` };
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) handlePause();
        else handleStart();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleLap();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isRunning, onClose]);

  if (!isOpen) return null;

  const { min, sec, cs } = fmt(time);
  const bestLap = laps.length > 1 ? Math.min(...laps) : null;
  const worstLap = laps.length > 1 ? Math.max(...laps) : null;

  const glassSurface =
    'bg-[rgba(12,12,14,0.9)] backdrop-blur-[48px] border border-white/[0.06] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]';

  const backdropAlpha = Math.min(
    1,
    Math.max(0, config.stopwatchWidgetBackdropOpacity ?? 0.85),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="pointer-events-auto absolute inset-0 backdrop-blur-[40px]"
        style={{ backgroundColor: `rgba(6, 6, 8, ${backdropAlpha})` }}
        onClick={onClose}
      />
      <WidgetBackdropOpacitySlider
        value={backdropAlpha}
        onChange={(next) =>
          setConfig((prev) => ({
            ...prev,
            stopwatchWidgetBackdropOpacity: next,
          }))
        }
        label={t('stopwatch.backdrop_opacity')}
      />
      <div className="relative z-[70] w-full max-w-[min(92vw,340px)] cursor-default pointer-events-auto">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={t('stopwatch.title')}
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className={`relative z-[1] w-full overflow-hidden rounded-[28px] ${glassSurface}`}
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <motion.span
              animate={
                reducedMotion
                  ? { opacity: isRunning ? 1 : 0.25 }
                  : { opacity: isRunning ? [0.4, 1, 0.4] : 0.2 }
              }
              transition={
                reducedMotion
                  ? { duration: 0.2 }
                  : { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
              }
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-white"
              style={{ boxShadow: isRunning ? '0 0 12px rgba(255,255,255,0.4)' : 'none' }}
            />
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/28"
              style={{ fontFamily: FONT }}
            >
              {t('stopwatch.title')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/22 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/55"
            aria-label="Close"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-col items-center px-4 pt-6 pb-2">
          <div className="flex items-baseline justify-center" style={{ fontFamily: FONT }}>
            <span
              className="font-light tabular-nums tracking-[-0.05em] text-white"
              style={{ fontSize: 'clamp(3.25rem, 14vw, 4.25rem)', lineHeight: 0.95 }}
            >
              {min}
            </span>
            <span
              className="mx-0.5 font-light tabular-nums text-white/22"
              style={{ fontSize: 'clamp(3.25rem, 14vw, 4.25rem)', lineHeight: 0.95 }}
              aria-hidden
            >
              :
            </span>
            <span
              className="font-light tabular-nums tracking-[-0.05em] text-white"
              style={{ fontSize: 'clamp(3.25rem, 14vw, 4.25rem)', lineHeight: 0.95 }}
            >
              {sec}
            </span>
            <span
              className="ml-1.5 self-end pb-1 font-medium tabular-nums text-white/32"
              style={{ fontSize: 'clamp(1.35rem, 5.5vw, 1.75rem)' }}
            >
              .{cs}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 px-5 pb-6 pt-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={handleReset}
            title={t('stopwatch.reset')}
            aria-label={t('stopwatch.reset')}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/30 transition-colors duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/55"
          >
            <RotateCcw size={18} strokeWidth={1.5} />
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={isRunning ? handlePause : handleStart}
            title={isRunning ? t('stopwatch.pause') : t('stopwatch.start')}
            aria-label={isRunning ? t('stopwatch.pause') : t('stopwatch.start')}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full border transition-all duration-300"
            style={
              isRunning
                ? {
                    background: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.9)',
                  }
                : {
                    background: 'rgba(255,255,255,0.96)',
                    borderColor: 'rgba(255,255,255,0.2)',
                    color: '#0a0a0a',
                  }
            }
          >
            {isRunning ? (
              <Pause size={30} fill="currentColor" className="opacity-90" />
            ) : (
              <Play size={30} fill="currentColor" className="ml-1 opacity-95" />
            )}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={handleLap}
            disabled={!isRunning}
            title={t('stopwatch.lap')}
            aria-label={t('stopwatch.lap')}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/30 transition-colors duration-200 hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-white/55 disabled:pointer-events-none disabled:opacity-[0.15]"
          >
            <Flag size={18} strokeWidth={1.5} />
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {laps.length > 0 && (
            <motion.div
              key="laps"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-white/[0.05]"
            >
              <div className="px-5 pb-5 pt-4">
                <p
                  className="mb-3 text-center text-[9px] font-semibold uppercase tracking-[0.22em] text-white/18"
                  style={{ fontFamily: FONT }}
                >
                  {t('stopwatch.lap')}
                </p>
                <div className="max-h-[min(26vh,180px)] space-y-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {laps.map((lapTime, index) => {
                    const n = laps.length - index;
                    const isBest = lapTime === bestLap;
                    const isWorst = lapTime === worstLap && bestLap !== worstLap;
                    return (
                      <motion.div
                        key={`${n}-${lapTime}`}
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-baseline justify-between gap-4 border-b border-white/[0.04] py-2.5 last:border-0"
                      >
                        <span
                          className="shrink-0 text-[11px] tabular-nums text-white/22"
                          style={{ fontFamily: FONT }}
                        >
                          {String(n).padStart(2, '0')}
                        </span>
                        <span
                          className={`min-w-0 text-right text-[13px] font-medium tabular-nums tracking-tight ${
                            isBest
                              ? 'text-white/75'
                              : isWorst
                                ? 'text-white/38'
                                : 'text-white/52'
                          }`}
                          style={{ fontFamily: FONT }}
                        >
                          {fmt(lapTime).full}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        </motion.div>
      </div>
    </div>
  );
};
