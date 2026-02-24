import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipForward, RotateCcw, CheckCircle2, Circle, Plus, Settings2, Trash2 } from 'lucide-react';
import { PomodoroState, PomodoroConfig, PomodoroTask, PomodoroMode } from '../types';

interface PomodoroWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  state: PomodoroState;
  config: PomodoroConfig;
  tasks: PomodoroTask[];
  activeTaskId: string | null;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  updateConfig: (config: Partial<PomodoroConfig>) => void;
  setTasks: (tasks: PomodoroTask[]) => void;
  setActiveTaskId: (id: string | null) => void;
}

export const PomodoroWidget: React.FC<PomodoroWidgetProps> = ({
  isOpen, onClose, state, config, tasks, activeTaskId,
  toggleTimer, resetTimer, skipTimer, updateConfig, setTasks, setActiveTaskId
}) => {
  const [view, setView] = useState<'timer' | 'tasks' | 'settings'>('timer');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (!isOpen) return null;

  // --- Helpers ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getProgress = () => {
    let total = config.workDuration * 60;
    if (state.mode === 'shortBreak') total = config.shortBreakDuration * 60;
    if (state.mode === 'longBreak') total = config.longBreakDuration * 60;
    return ((total - state.timeLeft) / total) * 100;
  };

  const getModeLabel = () => {
    switch (state.mode) {
      case 'work': return 'Focus Time';
      case 'shortBreak': return 'Short Break';
      case 'longBreak': return 'Long Break';
    }
  };

  const getModeColor = () => {
    switch (state.mode) {
      case 'work': return 'text-rose-500';
      case 'shortBreak': return 'text-emerald-400';
      case 'longBreak': return 'text-blue-400';
    }
  };
  const getModeBg = () => {
    switch (state.mode) {
      case 'work': return 'bg-rose-500';
      case 'shortBreak': return 'bg-emerald-500';
      case 'longBreak': return 'bg-blue-500';
    }
  };

  // --- Task Handlers ---
  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const newTask: PomodoroTask = {
      id: crypto.randomUUID(),
      title: newTaskTitle,
      completed: false,
      estimatedPomodoros: 1,
      completedPomodoros: 0
    };
    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (activeTaskId === id) setActiveTaskId(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl w-[400px] h-[600px] flex flex-col overflow-hidden z-[70]"
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/5">
          <div className="flex gap-4">
            <button
              onClick={() => setView('timer')}
              className={`text-sm font-medium uppercase tracking-wider transition-colors ${view === 'timer' ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              Timer
            </button>
            <button
              onClick={() => setView('tasks')}
              className={`text-sm font-medium uppercase tracking-wider transition-colors ${view === 'tasks' ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              Tasks
            </button>
            <button
              onClick={() => setView('settings')}
              className={`text-sm font-medium uppercase tracking-wider transition-colors ${view === 'settings' ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              Config
            </button>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative p-6">
          <AnimatePresence mode="wait">
            {view === 'timer' && (
              <motion.div
                key="timer"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col items-center h-full justify-center space-y-8"
              >
                {/* Circle Timer */}
                <div className="relative w-64 h-64 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#2a2a2a" strokeWidth="4" />
                    <motion.circle
                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4"
                      className={getModeColor()}
                      strokeDasharray="283"
                      strokeDashoffset={283 - (283 * getProgress() / 100)}
                      initial={{ strokeDashoffset: 283 }}
                      animate={{ strokeDashoffset: 283 - (283 * getProgress() / 100) }}
                      transition={{ duration: 0.5, ease: "linear" }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span className="text-6xl font-light text-white tracking-tighter tabular-nums mb-1">
                      {formatTime(state.timeLeft)}
                    </span>
                    <span className={`text-sm font-medium uppercase tracking-widest ${getModeColor()}`}>
                      {getModeLabel()}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-6">
                  <button onClick={resetTimer} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
                    <RotateCcw size={20} />
                  </button>
                  <button
                    onClick={toggleTimer}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-xl ${state.isActive ? 'bg-white/10 text-white border border-white/20' : 'bg-white text-black'}`}
                  >
                    {state.isActive ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                  </button>
                  <button onClick={skipTimer} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all">
                    <SkipForward size={20} />
                  </button>
                </div>

                {/* Active Task Info */}
                <div className="mt-auto pt-4 w-full">
                  <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 flex items-center justify-between cursor-pointer hover:border-white/20 transition-colors" onClick={() => setView('tasks')}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`w-2 h-2 rounded-full ${state.isActive ? 'animate-pulse ' + getModeBg() : 'bg-white/20'}`} />
                      <div className="flex flex-col">
                        <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Current Task</span>
                        <span className="text-sm text-white truncate max-w-[200px]">
                          {activeTaskId ? tasks.find(t => t.id === activeTaskId)?.title || 'Task Not Found' : 'No task selected'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Cycles</span>
                      <span className="text-sm text-white font-mono">{state.cyclesCompleted} / {config.longBreakInterval}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'tasks' && (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col"
              >
                <form onSubmit={addTask} className="relative mb-6">
                  <input
                    type="text"
                    placeholder="Add a new task..."
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    className="w-full bg-[#1a1a1a] text-white placeholder:text-white/20 text-sm p-4 rounded-xl border border-white/10 focus:border-white/30 outline-none pr-12 transition-colors"
                  />
                  <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                    <Plus size={20} />
                  </button>
                </form>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                  {tasks.length === 0 && (
                    <div className="text-center text-white/20 py-12 text-sm italic">
                      No tasks yet. Stay focused!
                    </div>
                  )}
                  {tasks.map(task => (
                    <div
                      key={task.id}
                      className={`
                                        group bg-[#1a1a1a] p-4 rounded-xl border flex items-center justify-between transition-all hover:bg-[#202020]
                                        ${activeTaskId === task.id ? 'border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'border-white/5'}
                                        ${task.completed ? 'opacity-50' : 'opacity-100'}
                                    `}
                    >
                      <div className="flex items-center gap-4 flex-1 overflow-hidden">
                        <button onClick={() => toggleTask(task.id)} className={`transition-colors ${task.completed ? 'text-emerald-500' : 'text-white/20 hover:text-white/50'}`}>
                          {task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => setActiveTaskId(task.id)}
                        >
                          <div className={`text-sm text-white font-medium truncate ${task.completed ? 'line-through text-white/40' : ''}`}>{task.title}</div>
                          <div className="text-xs text-white/30 mt-0.5">{task.completedPomodoros} pomodoros</div>
                        </div>
                      </div>
                      <button onClick={() => deleteTask(task.id)} className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col space-y-6"
              >
                <div className="space-y-4">
                  <h3 className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-4">Timers (Minutes)</h3>

                  <div className="space-y-2">
                    <label className="text-sm text-white/70 flex justify-between">
                      Focus Time
                      <span className="text-white font-mono">{config.workDuration}</span>
                    </label>
                    <input
                      type="range" min="15" max="60" step="5"
                      value={config.workDuration}
                      onChange={e => updateConfig({ workDuration: Number(e.target.value) })}
                      className="w-full accent-rose-500 h-1 bg-white/10 rounded-full appearance-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-white/70 flex justify-between">
                      Short Break
                      <span className="text-white font-mono">{config.shortBreakDuration}</span>
                    </label>
                    <input
                      type="range" min="1" max="15"
                      value={config.shortBreakDuration}
                      onChange={e => updateConfig({ shortBreakDuration: Number(e.target.value) })}
                      className="w-full accent-emerald-500 h-1 bg-white/10 rounded-full appearance-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-white/70 flex justify-between">
                      Long Break
                      <span className="text-white font-mono">{config.longBreakDuration}</span>
                    </label>
                    <input
                      type="range" min="10" max="45" step="5"
                      value={config.longBreakDuration}
                      onChange={e => updateConfig({ longBreakDuration: Number(e.target.value) })}
                      className="w-full accent-blue-500 h-1 bg-white/10 rounded-full appearance-none"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h3 className="text-white/40 text-xs uppercase tracking-widest font-semibold mb-4">Behavior</h3>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/80">Auto-start Breaks</span>
                    <button
                      onClick={() => updateConfig({ autoStart: !config.autoStart })}
                      className={`w-12 h-6 rounded-full relative transition-colors ${config.autoStart ? 'bg-green-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.autoStart ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="mt-auto pt-6 text-center">
                  <div className="text-6xl font-semibold text-white/5 tracking-tighter">ZENITH</div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

    </div>
  );
};
