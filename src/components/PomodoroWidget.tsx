import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, SkipForward, RotateCcw, CheckCircle2, Circle, Plus, Trash2, Settings2, ChevronDown } from 'lucide-react';
import { PomodoroState, PomodoroConfig, PomodoroTask, UIConfig } from '../types';
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
  toggleTimer, resetTimer, skipTimer, updateConfig, setTasks, setActiveTaskId, uiConfig
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const t = (key: string) => getTranslation(uiConfig, key);
  const accent = uiConfig.accentColor || '#ffffff';

  if (!isOpen) return null;

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const getProgress = () => {
    const total = (state.mode === 'work' ? config.workDuration : state.mode === 'shortBreak' ? config.shortBreakDuration : config.longBreakDuration) * 60;
    return ((total - state.timeLeft) / total) * 100;
  };

  const getModeColor = () => {
    if (state.mode === 'shortBreak') return '#34d399';
    if (state.mode === 'longBreak') return '#60a5fa';
    return accent;
  };

  const getModeLabel = () => {
    if (state.mode === 'shortBreak') return t('pomodoro.short_break');
    if (state.mode === 'longBreak') return t('pomodoro.long_break');
    return t('pomodoro.focus_time');
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTasks([...tasks, { id: crypto.randomUUID(), title: newTaskTitle, completed: false, estimatedPomodoros: 1, completedPomodoros: 0 }]);
    setNewTaskTitle('');
  };

  const toggleTask = (id: string) => setTasks(tasks.map(tk => tk.id === id ? { ...tk, completed: !tk.completed } : tk));
  const deleteTask = (id: string) => { setTasks(tasks.filter(tk => tk.id !== id)); if (activeTaskId === id) setActiveTaskId(null); };

  const activeTask = tasks.find(tk => tk.id === activeTaskId);
  const modeColor = getModeColor();
  const completedTasks = tasks.filter(t => t.completed).length;

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
        {/* Header: Mode tabs + actions */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-1">
            {(['work', 'shortBreak', 'longBreak'] as const).map(m => {
              const mLabels: Record<string, string> = { work: t('pomodoro.focus_time'), shortBreak: t('pomodoro.short_break'), longBreak: t('pomodoro.long_break') };
              const isActive = state.mode === m;
              return (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-lg text-[9px] font-semibold uppercase tracking-wider transition-all duration-200"
                  style={{
                    color: isActive ? modeColor : 'rgba(255,255,255,0.2)',
                    background: isActive ? `${modeColor}14` : 'transparent',
                  }}
                >
                  {mLabels[m]}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setShowSettings(!showSettings); setShowTasks(false); }}
              className="text-white/20 hover:text-white/60 transition-colors duration-150 p-1"
            >
              <Settings2 size={14} />
            </button>
            <button onClick={onClose} className="text-white/20 hover:text-white/60 transition-colors duration-150 p-1">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Main view */}
        <AnimatePresence mode="wait">
          {!showSettings ? (
            <motion.div
              key="timer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Active task */}
              <div className="px-5 py-1">
                <p className="text-[11px] text-white/35 font-medium truncate">
                  {activeTask ? activeTask.title : 'No task selected'}
                </p>
              </div>

              {/* Timer digits */}
              <div className="px-5 py-4 select-none">
                <div
                  className="text-[72px] font-medium tabular-nums tracking-[-0.04em] leading-none"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: state.isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {formatTime(state.timeLeft)}
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-5 pb-4">
                <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: modeColor }}
                    initial={false}
                    animate={{ width: `${getProgress()}%` }}
                    transition={{ duration: 0.5, ease: 'linear' }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-white/15">
                    {state.cyclesCompleted}/{config.longBreakInterval} sessions
                  </span>
                  <span className="text-[9px]" style={{ color: state.isActive ? `${modeColor}aa` : 'rgba(255,255,255,0.15)' }}>
                    {state.isActive ? getModeLabel() : 'Paused'}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between px-5 pb-4">
                <div className="flex gap-1">
                  <button onClick={resetTimer} title="Reset" className="px-3 py-1.5 text-xs font-medium text-white/25 hover:text-white/60 transition-colors duration-150 rounded-lg">
                    Reset
                  </button>
                  <button onClick={skipTimer} title="Skip" className="px-3 py-1.5 text-xs font-medium text-white/25 hover:text-white/60 transition-colors duration-150 rounded-lg">
                    Skip
                  </button>
                </div>

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={toggleTimer}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={
                    state.isActive
                      ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.1)' }
                      : { backgroundColor: modeColor, color: '#000', border: `1px solid ${modeColor}` }
                  }
                >
                  {state.isActive
                    ? <><Pause size={14} fill="currentColor" />Pause</>
                    : <><Play size={14} fill="currentColor" className="ml-0.5" />Start</>
                  }
                </motion.button>
              </div>

              {/* Task queue collapsible */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                  onClick={() => setShowTasks(!showTasks)}
                  className="w-full flex items-center justify-between px-5 py-3 text-white/25 hover:text-white/50 transition-colors duration-150"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={12} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest">
                      Tasks {tasks.length > 0 && `· ${completedTasks}/${tasks.length}`}
                    </span>
                  </div>
                  <motion.div animate={{ rotate: showTasks ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={13} />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {showTasks && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3">
                        <form onSubmit={addTask} className="relative mb-2">
                          <input
                            type="text"
                            placeholder="Add task…"
                            value={newTaskTitle}
                            onChange={e => setNewTaskTitle(e.target.value)}
                            className="w-full bg-white/[0.04] text-white/60 placeholder:text-white/15 text-xs py-2.5 pl-3.5 pr-9 rounded-xl outline-none transition-all duration-200 focus:bg-white/[0.07]"
                          />
                          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors duration-150">
                            <Plus size={13} strokeWidth={2} />
                          </button>
                        </form>

                        <div className="space-y-px max-h-[140px] overflow-y-auto custom-scrollbar">
                          {tasks.length === 0 && (
                            <div className="text-center py-4 text-[10px] text-white/15 font-medium">{t('pomodoro.no_tasks')}</div>
                          )}
                          {tasks.map(task => (
                            <div
                              key={task.id}
                              onClick={() => setActiveTaskId(task.id)}
                              className={`group flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-all duration-150 ${activeTaskId === task.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                            >
                              <button
                                onClick={e => { e.stopPropagation(); toggleTask(task.id); }}
                                style={{ color: task.completed ? modeColor : 'rgba(255,255,255,0.15)' }}
                                className="shrink-0 transition-colors duration-150"
                              >
                                {task.completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                              </button>
                              <span className={`text-xs flex-1 truncate transition-colors duration-150 ${task.completed ? 'text-white/25 line-through' : 'text-white/60'}`}>
                                {task.title}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                                className="opacity-0 group-hover:opacity-100 text-white/15 hover:text-red-400/60 transition-all duration-150 active:scale-95"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.18 }}
              className="px-5 pb-5 pt-2 space-y-4"
            >
              {[
                { label: t('pomodoro.focus_time'), key: 'workDuration', range: [15, 60] as [number, number] },
                { label: t('pomodoro.short_break'), key: 'shortBreakDuration', range: [1, 15] as [number, number] },
                { label: t('pomodoro.long_break'), key: 'longBreakDuration', range: [10, 45] as [number, number] },
              ].map(item => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">{item.label}</span>
                    <span className="text-sm font-medium text-white/70 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {(config as any)[item.key]}<span className="text-white/25 text-[10px] ml-0.5">m</span>
                    </span>
                  </div>
                  <input
                    type="range" min={item.range[0]} max={item.range[1]} step="1"
                    value={(config as any)[item.key]}
                    onChange={e => updateConfig({ [item.key]: Number(e.target.value) })}
                    className="w-full h-[2px] rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, ${accent} ${((config as any)[item.key] - item.range[0]) / (item.range[1] - item.range[0]) * 100}%, rgba(255,255,255,0.1) 0%)`, accentColor: accent }}
                  />
                </div>
              ))}

              <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-xs font-medium text-white/50">{t('pomodoro.auto_start_breaks')}</span>
                <button
                  onClick={() => updateConfig({ autoStart: !config.autoStart })}
                  className="w-10 h-[22px] rounded-full relative transition-all duration-300 shrink-0"
                  style={{ backgroundColor: config.autoStart ? accent : 'rgba(255,255,255,0.08)' }}
                >
                  <motion.div
                    animate={{ x: config.autoStart ? 20 : 3 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-[3px] w-4 h-4 rounded-full shadow"
                    style={{ backgroundColor: config.autoStart ? '#000' : 'rgba(255,255,255,0.4)' }}
                  />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
