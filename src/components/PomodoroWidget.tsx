import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipForward, RotateCcw, CheckCircle2, Circle, Plus, Settings2, Trash2 } from 'lucide-react';
import { PomodoroState, PomodoroConfig, PomodoroTask, PomodoroMode, UIConfig } from '../types';
import { getTranslation } from '../translations';

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
  uiConfig: UIConfig;
}

export const PomodoroWidget: React.FC<PomodoroWidgetProps> = ({
  isOpen, onClose, state, config, tasks, activeTaskId,
  toggleTimer, resetTimer, skipTimer, updateConfig, setTasks, setActiveTaskId,
  uiConfig
}) => {
  const [view, setView] = useState<'timer' | 'settings'>('timer');
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const t = (key: string) => getTranslation(uiConfig, key);

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
      case 'work': return t('pomodoro.focus_time');
      case 'shortBreak': return t('pomodoro.short_break');
      case 'longBreak': return t('pomodoro.long_break');
    }
  };

  const getModeColor = () => {
    switch (state.mode) {
      case 'work': return 'text-white';
      case 'shortBreak': return 'text-emerald-400';
      case 'longBreak': return 'text-blue-400';
    }
  };
  
  const getModeAccent = () => {
    switch (state.mode) {
      case 'work': return 'bg-white';
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

  const activeTask = tasks.find(t => t.id === activeTaskId);

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
        className="relative bg-[#080808] border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] w-[920px] h-[640px] flex overflow-hidden z-[70]"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar: Task Explorer (30%) */}
        <div className="w-[320px] bg-black/20 border-r border-white/5 flex flex-col">
          <div className="p-8 pb-4">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                <CheckCircle2 size={16} />
              </div>
              <h2 className="text-white text-sm font-bold tracking-[0.15em] uppercase opacity-40">{t('pomodoro.tasks_tab')}</h2>
            </div>

            <form onSubmit={addTask} className="relative group mb-6">
              <input
                type="text"
                placeholder={t('pomodoro.add_task_placeholder')}
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                className="w-full bg-white/[0.03] text-white placeholder:text-white/10 text-xs py-4 pl-5 pr-12 rounded-xl border border-white/5 focus:border-white/20 outline-none transition-all"
              />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors">
                <Plus size={18} />
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-2">
            {tasks.length === 0 && (
              <div className="text-center py-20 text-[10px] uppercase font-black tracking-widest text-white/10">
                {t('pomodoro.no_tasks')}
              </div>
            )}
            {tasks.map(task => (
              <motion.div
                layout
                key={task.id}
                onClick={() => setActiveTaskId(task.id)}
                className={`
                  group p-4 rounded-xl border border-transparent cursor-pointer transition-all
                  ${activeTaskId === task.id ? 'bg-white/10 border-white/10' : 'hover:bg-white/[0.03]'}
                  ${task.completed ? 'opacity-30' : ''}
                `}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }}
                    className={`transition-colors ${task.completed ? 'text-white' : 'text-white/10 hover:text-white/40'}`}
                  >
                    {task.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs text-white/80 font-medium truncate ${task.completed ? 'line-through' : ''}`}>
                      {task.title}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/20 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="p-8 border-t border-white/5 bg-black/40">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.3em]">Session Status</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/40">{state.cyclesCompleted} of {config.longBreakInterval}</span>
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-white/20" 
                    initial={{ width: 0 }}
                    animate={{ width: `${(state.cyclesCompleted / config.longBreakInterval) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Precision Timer (70%) */}
        <div className="flex-1 flex flex-col relative overflow-visible">
          {/* Header Actions */}
          <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-center z-20">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setView('timer')}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'timer' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
              >
                Instrument
              </button>
              <button
                onClick={() => setView('settings')}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'settings' ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
              >
                Config
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-3 rounded-full bg-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
            >
              <X size={20} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {view === 'timer' ? (
              <motion.div
                key="timer-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col p-12 pt-32"
              >
                {/* Active Indicator */}
                <div className="flex flex-col mb-12">
                  <div className="flex items-center gap-3 mb-2">
                    <motion.div 
                      animate={{ opacity: state.isActive ? [1, 0.4, 1] : 1 }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={`w-2 h-2 rounded-full ${getModeAccent()}`} 
                    />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">{getModeLabel()}</span>
                  </div>
                  <h1 className="text-white text-3xl font-bold tracking-tight line-clamp-1">
                    {activeTask ? activeTask.title : "Ready for focus session"}
                  </h1>
                </div>

                {/* Main Instrument Display */}
                <div className="relative flex-1 flex flex-col justify-center py-20 overflow-visible">
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-[120%] bg-white/[0.01] blur-[150px] rounded-full pointer-events-none" />
                  
                  <motion.div 
                    layoutId="pomodoroDigits"
                    className={`text-[12rem] font-medium tracking-[-0.08em] tabular-nums leading-none ${getModeColor()}`}
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {formatTime(state.timeLeft)}
                  </motion.div>

                  <div className="mt-8 h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      className={`h-full ${getModeAccent()}`}
                      initial={false}
                      animate={{ width: `${getProgress()}%` }}
                      transition={{ duration: 0.5, ease: "linear" }}
                    />
                  </div>
                </div>

                {/* Pro Controls */}
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex gap-4">
                    <button onClick={resetTimer} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all">
                      <RotateCcw size={20} />
                    </button>
                    <button onClick={skipTimer} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all">
                      <SkipForward size={20} />
                    </button>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleTimer}
                    className={`h-24 px-12 rounded-[2rem] flex items-center gap-4 transition-all shadow-2xl relative ${state.isActive ? 'bg-white/5 text-white border border-white/20' : 'bg-white text-black'}`}
                  >
                    {state.isActive ? (
                      <>
                        <Pause size={28} fill="currentColor" />
                        <span className="text-xs font-bold uppercase tracking-widest">Pause Session</span>
                      </>
                    ) : (
                      <>
                        <Play size={28} fill="currentColor" className="ml-1" />
                        <span className="text-xs font-bold uppercase tracking-widest">Start Focus</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="settings-view"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex-1 p-16 pt-32 space-y-12 overflow-y-auto custom-scrollbar"
              >
                <div className="grid grid-cols-2 gap-12">
                  {[
                    { label: t('pomodoro.focus_time'), key: 'workDuration', range: [15, 60] },
                    { label: t('pomodoro.short_break'), key: 'shortBreakDuration', range: [1, 15] },
                    { label: t('pomodoro.long_break'), key: 'longBreakDuration', range: [10, 45] }
                  ].map((item) => (
                    <div key={item.key} className="space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/30">{item.label}</label>
                        <span className="text-2xl font-bold text-white tracking-tighter">
                          {(config as any)[item.key]}
                          <span className="text-[8px] text-white/20 ml-1">MIN</span>
                        </span>
                      </div>
                      <input
                        type="range" min={item.range[0]} max={item.range[1]} step="1"
                        value={(config as any)[item.key]}
                        onChange={e => updateConfig({ [item.key]: Number(e.target.value) })}
                        className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-white"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-12 border-t border-white/5">
                  <div className="flex items-center justify-between bg-white/[0.02] p-8 rounded-[2rem] border border-white/5">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold text-white/80">{t('pomodoro.auto_start_breaks')}</span>
                      <span className="text-[9px] text-white/20 font-black uppercase tracking-widest">Autonomous Workflow</span>
                    </div>
                    <button
                      onClick={() => updateConfig({ autoStart: !config.autoStart })}
                      className={`w-14 h-7 rounded-full relative transition-all duration-300 ${config.autoStart ? 'bg-white' : 'bg-white/10'}`}
                    >
                      <motion.div
                        animate={{ x: config.autoStart ? 32 : 4 }}
                        className={`absolute top-1 w-5 h-5 rounded-full shadow-md ${config.autoStart ? 'bg-black' : 'bg-white/40'}`}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </div>

                <div className="pt-20 opacity-5 flex flex-col items-center select-none pointer-events-none grayscale">
                  <div className="text-4xl font-extrabold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>ZENITH LABS</div>
                  <div className="text-[8px] uppercase tracking-[0.6em] font-black mt-[-4px]">Precision Spec 2026</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
