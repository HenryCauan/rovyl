import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, RotateCcw, Flag } from 'lucide-react';

interface StopwatchWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const startTimeRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const previousTimeRef = useRef<number>(0);

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

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);

    return (
      <div className="flex items-baseline font-mono tracking-tighter tabular-nums">
        <span className="text-7xl font-light text-white w-24 text-right">
            {minutes.toString().padStart(2, '0')}
        </span>
        <span className="text-7xl font-light text-white/40 px-1">:</span>
        <span className="text-7xl font-light text-white w-24 text-center">
            {seconds.toString().padStart(2, '0')}
        </span>
        <span className="text-4xl font-light text-white/40 ml-2">.</span>
        <span className="text-4xl font-light text-white w-16 text-left">
            {milliseconds.toString().padStart(2, '0')}
        </span>
      </div>
    );
  };

  const formatLapTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-[#0f0f0f] border border-white/10 rounded-3xl shadow-2xl p-8 w-[500px] flex flex-col items-center z-[70]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between w-full mb-8 items-center">
            <h2 className="text-white/50 text-sm font-medium uppercase tracking-widest">Chronometer</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Display */}
        <div className="mb-12 relative">
             {/* Glow effect */}
             <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full" />
             {formatTime(time)}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 mb-8">
            <button 
                onClick={handleReset}
                className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all"
            >
                <RotateCcw size={20} />
            </button>

            <button 
                onClick={isRunning ? handlePause : handleStart}
                className={`
                    w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg
                    ${isRunning 
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
                        : 'bg-white text-black hover:scale-105 border border-white'
                    }
                `}
            >
                {isRunning ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>

            <button 
                onClick={handleLap}
                disabled={!isRunning}
                className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <Flag size={20} />
            </button>
        </div>

        {/* Laps */}
        <div className="w-full h-48 overflow-y-auto overflow-x-hidden custom-scrollbar border-t border-white/5 pt-4 pr-2">
            <AnimatePresence mode="popLayout">
                {laps.map((lapTime, index) => (
                    <motion.div 
                        key={laps.length - index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex justify-between py-3 border-b border-white/5 last:border-0 text-sm"
                    >
                        <span className="text-white/40 font-mono">Lap {laps.length - index}</span>
                        <span className="text-white font-mono">{formatLapTime(lapTime)}</span>
                    </motion.div>
                ))}
                {laps.length === 0 && (
                    <div className="text-center text-white/20 py-12 text-xs uppercase tracking-wider">
                        No laps recorded
                    </div>
                )}
            </AnimatePresence>
        </div>

      </motion.div>
    </div>
  );
};