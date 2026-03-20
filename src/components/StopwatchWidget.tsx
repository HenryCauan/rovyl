import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, Flag, Clock } from 'lucide-react';
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

  const animate = (timeNow: number) => {
    if (startTimeRef.current !== undefined) {
      const deltaTime = timeNow - startTimeRef.current;
      setTime(previousTimeRef.current + deltaTime);
      requestRef.current = requestAnimationFrame(animate);
    }
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
    if (isRunning) {
      setLaps([time, ...laps]);
    }
  };

  const formatDigits = (ms: number) => {
    const minutes = Math.floor(ms / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const milliseconds = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    return { minutes, seconds, milliseconds };
  };

  const formatLapTime = (ms: number) => {
    const { minutes, seconds, milliseconds } = formatDigits(ms);
    return `${minutes}:${seconds}.${milliseconds}`;
  };

  if (!isOpen) return null;

  const { minutes, seconds, milliseconds } = formatDigits(time);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-2xl"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.98, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, y: 10 }}
        className="relative bg-[#080808] border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] w-[920px] h-[580px] flex overflow-hidden z-[70]"
        onClick={e => e.stopPropagation()}
      >
        {/* Main: Instrument Area (60%) */}
        <div className="flex-1 flex flex-col p-12 relative overflow-visible">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg tracking-tight leading-none mb-1">{t('stopwatch.chronograph')}</h2>
              <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">{t('stopwatch.precision_module_v')}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center py-10 relative overflow-visible">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] bg-white/[0.015] blur-[120px] rounded-full pointer-events-none" />
            
            <div className="flex items-baseline font-medium tracking-tight tabular-nums text-white leading-none justify-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <span className="text-[12rem] tracking-[-0.05em]">{minutes}</span>
              <span className="text-[12rem] opacity-20 mx-[-0.1em]">:</span>
              <span className="text-[12rem] tracking-[-0.05em]">{seconds}</span>
              <span className="text-6xl opacity-40 ml-4">.{milliseconds}</span>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between">
            <div className="flex gap-4">
              <button 
                onClick={handleReset}
                className="p-5 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all"
              >
                <RotateCcw size={22} />
              </button>
              <button 
                onClick={handleLap}
                disabled={!isRunning}
                className="p-5 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all disabled:opacity-10"
              >
                <Flag size={22} />
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={isRunning ? handlePause : handleStart}
              className={`h-24 px-16 rounded-[2rem] flex items-center gap-4 transition-all shadow-2xl ${isRunning ? 'bg-white/5 text-white border border-white/20' : 'bg-white text-black'}`}
            >
              {isRunning ? (
                <>
                  <Pause size={32} fill="currentColor" />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">{t('stopwatch.halt_session')}</span>
                </>
              ) : (
                <>
                  <Play size={32} fill="currentColor" className="ml-1" />
                  <span className="text-xs font-black uppercase tracking-[0.2em]">{t('stopwatch.initiate_trace')}</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        {/* Sidebar: Lap Grid (40%) */}
        <div className="w-[360px] bg-black/20 border-l border-white/5 flex flex-col">
          <header className="p-10 pb-6">
            <div className="flex justify-between items-center mb-8">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">{t('stopwatch.telemetry')}</span>
              <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5">
                <div className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{t('stopwatch.total_laps')}</div>
                <div className="text-2xl font-bold text-white tracking-tighter">{laps.length}</div>
              </div>
              <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5">
                <div className="text-[8px] font-black uppercase tracking-widest text-white/20 mb-1">{t('stopwatch.status')}</div>
                <div className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isRunning ? 'text-emerald-400' : 'text-rose-400'}`}>
                   {isRunning ? t('status.active') : t('stopwatch.standby')}
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-10 space-y-2">
            <AnimatePresence mode="popLayout">
              {laps.map((lapTime, index) => (
                <motion.div
                  key={laps.length - index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="group flex justify-between items-center py-4 px-5 rounded-xl border border-white/[0.02] bg-white/[0.01] hover:bg-white/[0.05] hover:border-white/10 transition-all"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/10 uppercase tracking-widest">LAP {laps.length - index}</span>
                    <span className="text-lg font-medium text-white tracking-tight tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatLapTime(lapTime)}
                    </span>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-white/5 group-hover:bg-white/20 transition-colors" />
                </motion.div>
              ))}
            </AnimatePresence>
            
            {laps.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 grayscale">
                <Flag size={48} strokeWidth={1} />
                <span className="text-[9px] font-black uppercase tracking-[0.5em] mt-6">NO TELEMETRY</span>
              </div>
            )}
          </div>

          <div className="p-10 border-t border-white/5 bg-black/40">
            <div className="flex flex-col items-center select-none pointer-events-none grayscale opacity-5">
              <div className="text-2xl font-extrabold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>ZENITH LABS</div>
              <div className="text-[6px] uppercase tracking-[1em] font-black mt-[-2px]">INSTRUMENT SPEC</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};