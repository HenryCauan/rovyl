import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, Flag } from 'lucide-react';
import { UIConfig } from '../types';
import { getTranslation } from '../translations';

interface StopwatchWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  config: UIConfig;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({ isOpen, onClose, config }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

  const t = (key: string) => getTranslation(config, key);
  const accent = config.accentColor || '#ffffff';

  const animate = (timeNow: number) => {
    const deltaTime = timeNow - startTimeRef.current;
    setTime(previousTimeRef.current + deltaTime);
    requestRef.current = requestAnimationFrame(animate);
  };

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
      previousTimeRef.current = time;
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
    if (isRunning) setLaps([time, ...laps]);
  };

  const fmt = (ms: number) => {
    const min = Math.floor(ms / 60000).toString().padStart(2, '0');
    const sec = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const cs = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return { min, sec, cs, full: `${min}:${sec}.${cs}` };
  };

  if (!isOpen) return null;

  const { min, sec, cs } = fmt(time);
  const bestLap = laps.length > 1 ? Math.min(...laps) : null;
  const worstLap = laps.length > 1 ? Math.max(...laps) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-[420px] z-[70] overflow-hidden"
        style={{
          background: 'rgba(10, 10, 13, 0.92)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px',
          boxShadow: '0 32px 80px -8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ opacity: isRunning ? [1, 0.3, 1] : 0.25 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: isRunning ? accent : 'rgba(255,255,255,0.3)' }}
            />
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
              {t('stopwatch.chronograph')}
            </span>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white/60 transition-colors duration-150">
            <X size={15} />
          </button>
        </div>

        {/* Main digits */}
        <div className="px-6 py-4 flex items-baseline gap-0 select-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <span className="text-[72px] font-medium text-white tracking-[-0.04em] tabular-nums leading-none">{min}</span>
          <span className="text-[72px] font-medium leading-none" style={{ color: 'rgba(255,255,255,0.18)', margin: '0 -2px' }}>:</span>
          <span className="text-[72px] font-medium text-white tracking-[-0.04em] tabular-nums leading-none">{sec}</span>
          <span className="text-[32px] font-medium tabular-nums leading-none ml-2 mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>.{cs}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-6 pb-4">
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              title="Reset"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/30 hover:text-white/70 transition-colors duration-150"
            >
              Reset
            </button>
            <button
              onClick={handleLap}
              disabled={!isRunning}
              title="Lap"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/30 hover:text-white/70 transition-colors duration-150 disabled:opacity-20 disabled:cursor-not-allowed"
            >
              Lap
            </button>
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={isRunning ? handlePause : handleStart}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
            style={
              isRunning
                ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.1)' }
                : { backgroundColor: accent, color: '#000', border: `1px solid ${accent}` }
            }
          >
            {isRunning
              ? <><Pause size={14} fill="currentColor" />Pause</>
              : <><Play size={14} fill="currentColor" className="ml-0.5" />Start</>
            }
          </motion.button>
        </div>

        {/* Lap list — only when there are laps */}
        <AnimatePresence>
          {laps.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div
                className="mx-4 mb-4 rounded-xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
                  {laps.map((lapTime, index) => {
                    const lapNum = (laps.length - index).toString().padStart(2, '0');
                    const isBest = lapTime === bestLap;
                    const isWorst = lapTime === worstLap;
                    return (
                      <motion.div
                        key={laps.length - index}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03] last:border-0"
                      >
                        <span className="text-[10px] font-medium text-white/25 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          LAP {lapNum}
                          {isBest && <span className="ml-2 text-emerald-400/60">↓</span>}
                          {isWorst && <span className="ml-2 text-red-400/40">↑</span>}
                        </span>
                        <span className="text-xs font-medium text-white/70 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
  );
};