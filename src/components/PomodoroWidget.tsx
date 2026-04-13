import React, { useMemo, useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence, useAnimation, useReducedMotion } from 'framer-motion';
import {
  X,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  ChevronLeft,
  List,
  Droplets,
  Sparkles,
  Bell,
  FolderOpen,
} from 'lucide-react';
import { PomodoroConfig, PomodoroTask, UIConfig, PomodoroState, PomodoroMode } from '../types';
import { getTranslation } from '../translations';
import {
  loadPomodoroUiPrefs,
  savePomodoroUiPrefs,
  resumePomodoroAudio,
  playPomodoroUiTap,
  playPomodoroUiSoftTap,
  type AmbientPresetId,
} from '../pomodoroSounds';
import { POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY } from '../pomodoroAmbient';

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
  setConfig: Dispatch<SetStateAction<UIConfig>>;
  /** Temporary preview of the full-screen end card (same as when the timer finishes). */
  onPreviewSessionEnd?: (endedMode: PomodoroMode) => void;
}

const R = 44;
const CIRC = 2 * Math.PI * R;

export const PomodoroWidget: React.FC<PomodoroWidgetProps> = ({
  isOpen,
  onClose,
  state,
  config,
  tasks,
  activeTaskId,
  toggleTimer,
  resetTimer,
  skipTimer,
  updateConfig,
  setTasks,
  setActiveTaskId,
  uiConfig,
  setConfig,
  onPreviewSessionEnd,
}) => {
  const [showPanel, setShowPanel] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deepFocus, setDeepFocusState] = useState(() => loadPomodoroUiPrefs().deepFocus);
  const [soundsEnabled, setSoundsEnabledState] = useState(() => loadPomodoroUiPrefs().soundsEnabled);
  const [ambientPreset, setAmbientPresetState] = useState<AmbientPresetId>(
    () => loadPomodoroUiPrefs().ambientPreset,
  );
  const [ambientVolume, setAmbientVolumeState] = useState(() => loadPomodoroUiPrefs().ambientVolume);
  const [customAmbientPath, setCustomAmbientPathState] = useState<string | null>(
    () => loadPomodoroUiPrefs().customAmbientPath ?? null,
  );
  const [webAmbientBlobUrl, setWebAmbientBlobUrl] = useState<string | null>(null);
  const ambientFileInputRef = useRef<HTMLInputElement>(null);

  const ringControls = useAnimation();
  const reducedMotion = useReducedMotion();
  const prevModeRef = useRef<PomodoroMode | null>(null);

  const setDeepFocus = useCallback((v: boolean) => {
    setDeepFocusState(v);
    savePomodoroUiPrefs({ deepFocus: v });
  }, []);

  const setSoundsEnabled = useCallback((v: boolean) => {
    setSoundsEnabledState(v);
    savePomodoroUiPrefs({ soundsEnabled: v });
  }, []);

  const setAmbientPreset = useCallback((p: AmbientPresetId) => {
    setAmbientPresetState(p);
    savePomodoroUiPrefs({ ambientPreset: p });
  }, []);

  const setAmbientVolume = useCallback((v: number) => {
    setAmbientVolumeState(v);
    savePomodoroUiPrefs({ ambientVolume: v });
  }, []);

  const setPersistedCustomAmbientPath = useCallback((path: string | null) => {
    setCustomAmbientPathState(path);
    savePomodoroUiPrefs({ customAmbientPath: path });
  }, []);

  useEffect(() => {
    return () => {
      if (webAmbientBlobUrl) URL.revokeObjectURL(webAmbientBlobUrl);
    };
  }, [webAmbientBlobUrl]);

  const onChooseAmbientFile = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.electron : undefined;
    if (api?.selectPomodoroAudio) {
      const p = await api.selectPomodoroAudio();
      if (p) {
        if (webAmbientBlobUrl) {
          URL.revokeObjectURL(webAmbientBlobUrl);
          setWebAmbientBlobUrl(null);
        }
        try {
          sessionStorage.removeItem(POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY);
        } catch {
          /* ignore */
        }
        setPersistedCustomAmbientPath(p);
        setAmbientPreset('custom');
      }
      return;
    }
    ambientFileInputRef.current?.click();
  }, [webAmbientBlobUrl, setPersistedCustomAmbientPath, setAmbientPreset]);

  const onWebAmbientFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (!f) return;
      if (webAmbientBlobUrl) URL.revokeObjectURL(webAmbientBlobUrl);
      const url = URL.createObjectURL(f);
      setWebAmbientBlobUrl(url);
      try {
        sessionStorage.setItem(POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY, url);
      } catch {
        /* ignore */
      }
      setCustomAmbientPathState(null);
      savePomodoroUiPrefs({ customAmbientPath: null });
      setAmbientPreset('custom');
    },
    [webAmbientBlobUrl, setAmbientPreset],
  );

  const onClearAmbientCustom = useCallback(async () => {
    const path = customAmbientPath;
    if (webAmbientBlobUrl) {
      URL.revokeObjectURL(webAmbientBlobUrl);
      setWebAmbientBlobUrl(null);
    }
    try {
      sessionStorage.removeItem(POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY);
    } catch {
      /* ignore */
    }
    const api = typeof window !== 'undefined' ? window.electron : undefined;
    if (path && api?.removeManagedPomodoroAudio) {
      await api.removeManagedPomodoroAudio(path);
    }
    setPersistedCustomAmbientPath(null);
    setAmbientPreset('off');
  }, [customAmbientPath, webAmbientBlobUrl, setPersistedCustomAmbientPath, setAmbientPreset]);

  const t = (key: string) => getTranslation(uiConfig, key);

  const onToggleTimer = useCallback(() => {
    void resumePomodoroAudio();
    if (soundsEnabled) playPomodoroUiTap();
    toggleTimer();
  }, [soundsEnabled, toggleTimer]);

  const onResetTimer = useCallback(() => {
    void resumePomodoroAudio();
    if (soundsEnabled) playPomodoroUiTap();
    resetTimer();
  }, [soundsEnabled, resetTimer]);

  const onSkipTimer = useCallback(() => {
    void resumePomodoroAudio();
    if (soundsEnabled) playPomodoroUiTap();
    skipTimer();
  }, [soundsEnabled, skipTimer]);

  useEffect(() => {
    if (prevModeRef.current === null) {
      prevModeRef.current = state.mode;
      return;
    }
    if (prevModeRef.current === state.mode) return;
    prevModeRef.current = state.mode;
    if (reducedMotion) return;
    void ringControls.start({
      scale: [1, 1.06, 1],
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    });
  }, [state.mode, reducedMotion, ringControls]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        onToggleTimer();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onResetTimer();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onSkipTimer();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showPanel) setShowPanel(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, onToggleTimer, onResetTimer, onSkipTimer, showPanel]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const progressPct = useMemo(() => {
    const total =
      (state.mode === 'work'
        ? config.workDuration
        : state.mode === 'shortBreak'
          ? config.shortBreakDuration
          : config.longBreakDuration) * 60;
    if (total <= 0) return 0;
    return ((total - state.timeLeft) / total) * 100;
  }, [state.mode, state.timeLeft, config.workDuration, config.shortBreakDuration, config.longBreakDuration]);

  const strokeOffset = CIRC * (1 - progressPct / 100);

  const getModeLabel = () => {
    if (state.mode === 'shortBreak') return t('pomodoro.short_break');
    if (state.mode === 'longBreak') return t('pomodoro.long_break');
    return t('pomodoro.focus_time');
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setTasks([
      ...tasks,
      {
        id: crypto.randomUUID(),
        title: newTaskTitle,
        completed: false,
        estimatedPomodoros: 1,
        completedPomodoros: 0,
      },
    ]);
    setNewTaskTitle('');
  };

  const toggleTask = (id: string) =>
    setTasks(tasks.map((tk) => (tk.id === id ? { ...tk, completed: !tk.completed } : tk)));
  const deleteTask = (id: string) => {
    setTasks(tasks.filter((tk) => tk.id !== id));
    if (activeTaskId === id) setActiveTaskId(null);
  };

  const activeTask = tasks.find((tk) => tk.id === activeTaskId);
  const completedTasks = tasks.filter((x) => x.completed).length;

  if (!isOpen) return null;

  const backdropAlpha = Math.min(
    1,
    Math.max(0, uiConfig.pomodoroWidgetBackdropOpacity ?? 0.55),
  );

  const glassSurface =
    'bg-[rgba(12,12,14,0.88)] backdrop-blur-[48px] border border-white/[0.06] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 cursor-default">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="absolute inset-0 backdrop-blur-[40px]"
        style={{ backgroundColor: `rgba(6, 6, 8, ${backdropAlpha})` }}
        onClick={onClose}
      />

      {!deepFocus && !showPanel && (
        <label
          className="pointer-events-auto absolute right-5 top-5 z-[65] flex cursor-pointer items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/25 px-3 py-2 backdrop-blur-md"
          title={t('pomodoro.backdrop_opacity')}
          onClick={(e) => e.stopPropagation()}
        >
          <Droplets size={14} className="shrink-0 text-white/45" strokeWidth={1.5} />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(backdropAlpha * 100)}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                pomodoroWidgetBackdropOpacity: Number(e.target.value) / 100,
              }))
            }
            className="h-1 w-[80px] cursor-pointer appearance-none rounded-full bg-white/15 accent-white [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/85"
          />
        </label>
      )}

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Pomodoro"
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        className={`relative z-[70] w-full max-w-[min(92vw,380px)] overflow-hidden rounded-[28px] ${glassSurface}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          {deepFocus && !showPanel ? (
            <>
              <span className="mr-auto text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
                {t('pomodoro.deep_focus')}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (soundsEnabled) playPomodoroUiSoftTap();
                  setDeepFocus(false);
                }}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-medium text-white/40 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/70"
                title={t('pomodoro.exit_deep_focus')}
              >
                <Sparkles size={15} strokeWidth={1.5} />
                {t('pomodoro.exit_deep_focus')}
              </button>
            </>
          ) : (
            <>
              <span className="mr-auto" />
              {!showPanel && (
                <button
                  type="button"
                  onClick={() => {
                    setDeepFocus(true);
                    if (soundsEnabled) playPomodoroUiSoftTap();
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/25 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/55"
                  title={t('pomodoro.deep_focus')}
                >
                  <Sparkles size={17} strokeWidth={1.5} />
                </button>
              )}
              {!showPanel && (
                <button
                  type="button"
                  onClick={() => {
                    setShowPanel(true);
                    setDeepFocus(false);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/25 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/55"
                  title={t('pomodoro.secondary_panel')}
                >
                  <List size={17} strokeWidth={1.5} />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/25 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white/55"
          >
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!showPanel ? (
            <motion.div
              key="focus"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="px-6 pb-10 pt-2"
            >
              <div className="flex flex-col items-center">
                <motion.p
                  key={`${state.mode}-${state.isActive}`}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: 1 }}
                  className="mb-8 text-center text-[10px] font-medium uppercase tracking-[0.28em] text-white/32"
                >
                  {getModeLabel()}
                  {!state.isActive && state.timeLeft > 0 && (
                    <span className="text-white/18"> · {t('pomodoro.paused')}</span>
                  )}
                </motion.p>

                <motion.div
                  className="relative grid place-items-center"
                  initial={{ scale: 1 }}
                  animate={ringControls}
                >
                  <svg
                    viewBox="0 0 100 100"
                    className="h-[min(58vw,260px)] w-[min(58vw,260px)] -rotate-90"
                    aria-hidden
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r={R}
                      fill="none"
                      stroke="rgba(255,255,255,0.055)"
                      strokeWidth="2"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r={R}
                      fill="none"
                      stroke="rgba(255,255,255,0.78)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      initial={false}
                      animate={{ strokeDashoffset: strokeOffset }}
                      transition={{
                        duration: state.isActive ? 1 : 0.45,
                        ease: state.isActive ? 'linear' : [0.22, 1, 0.36, 1],
                      }}
                    />
                  </svg>

                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <motion.span
                      key={state.timeLeft}
                      initial={{ opacity: 0.85 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className={`font-light tabular-nums tracking-[-0.04em] ${state.isActive ? 'text-white' : 'text-white/45'}`}
                      style={{
                        fontSize: 'clamp(2.35rem, 8vw, 3rem)',
                        fontFamily: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
                      }}
                    >
                      {formatTime(state.timeLeft)}
                    </motion.span>
                  </div>
                </motion.div>

                {!deepFocus && (
                  <p className="mt-8 max-w-[240px] truncate text-center text-[13px] font-light text-white/28">
                    {activeTask ? activeTask.title : t('pomodoro.no_task_selected')}
                  </p>
                )}

                <div
                  className={`mt-12 flex w-full max-w-[280px] items-center justify-center gap-5 ${deepFocus ? 'justify-center' : ''}`}
                >
                  {!deepFocus && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={onResetTimer}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-white/28 transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-white/55"
                      title="Reset"
                    >
                      <RotateCcw size={18} strokeWidth={1.5} />
                    </motion.button>
                  )}

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={onToggleTimer}
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full border transition-all duration-300"
                    style={
                      state.isActive
                        ? {
                            background: 'rgba(255,255,255,0.06)',
                            borderColor: 'rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.88)',
                          }
                        : {
                            background: 'rgba(255,255,255,0.94)',
                            borderColor: 'rgba(255,255,255,0.2)',
                            color: '#0a0a0a',
                          }
                    }
                  >
                    {state.isActive ? (
                      <Pause size={28} fill="currentColor" className="opacity-90" />
                    ) : (
                      <Play size={28} fill="currentColor" className="ml-1 opacity-95" />
                    )}
                  </motion.button>

                  {!deepFocus && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={onSkipTimer}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-white/28 transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.06] hover:text-white/55"
                      title="Skip"
                    >
                      <SkipForward size={18} strokeWidth={1.5} />
                    </motion.button>
                  )}
                </div>

                {!deepFocus && (
                  <>
                    <p className="mt-8 text-center text-[10px] leading-relaxed text-white/[0.14]">
                      {t('pomodoro.today_summary').replace('{n}', String(state.totalPomodorosCompleted))}
                    </p>
                    <p className="mt-2 text-center text-[9px] text-white/[0.1]">{t('pomodoro.shortcuts_hint')}</p>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="panel"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-[min(72vh,560px)] flex-col px-5 pb-8 pt-0"
            >
              <button
                type="button"
                onClick={() => setShowPanel(false)}
                className="mb-4 flex items-center gap-2 self-start rounded-xl py-2 pl-1 pr-3 text-[11px] font-medium text-white/35 transition-colors hover:text-white/60"
              >
                <ChevronLeft size={16} strokeWidth={1.5} />
                {t('pomodoro.back_to_timer')}
              </button>

              <div className="min-h-0 flex-1 space-y-8 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <section>
                  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
                    {t('pomodoro.tasks')}
                  </h3>
                  <form onSubmit={addTask} className="relative mb-3">
                    <input
                      type="text"
                      placeholder={t('pomodoro.add_task_placeholder')}
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] py-3 pl-4 pr-11 text-xs text-white/70 outline-none transition-all placeholder:text-white/20 focus:border-white/[0.1] focus:bg-white/[0.05]"
                    />
                    <button
                      type="submit"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/55"
                    >
                      <Plus size={16} strokeWidth={2} />
                    </button>
                  </form>

                  <div className="space-y-0.5">
                    {tasks.length === 0 && (
                      <p className="py-6 text-center text-[11px] text-white/15">{t('pomodoro.no_tasks')}</p>
                    )}
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTaskId(task.id)}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveTaskId(task.id)}
                        className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors ${
                          activeTaskId === task.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(task.id);
                          }}
                          className={`shrink-0 transition-colors ${
                            task.completed ? 'text-white/45' : 'text-white/18'
                          }`}
                        >
                          {task.completed ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                        <span
                          className={`min-w-0 flex-1 truncate text-[13px] ${
                            task.completed ? 'text-white/25 line-through' : 'text-white/55'
                          }`}
                        >
                          {task.title}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(task.id);
                          }}
                          className="shrink-0 text-white/12 opacity-0 transition-all group-hover:opacity-100 hover:text-white/35"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {tasks.length > 0 && (
                    <p className="mt-2 text-[10px] text-white/15">
                      {completedTasks}/{tasks.length}
                    </p>
                  )}
                </section>

                <section className="border-t border-white/[0.05] pt-6">
                  <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
                    {t('pomodoro.timers_title')}
                  </h3>
                  <div className="space-y-5">
                    {(
                      [
                        {
                          label: t('pomodoro.focus_time'),
                          key: 'workDuration',
                          range: [15, 60] as [number, number],
                        },
                        {
                          label: t('pomodoro.short_break'),
                          key: 'shortBreakDuration',
                          range: [1, 15] as [number, number],
                        },
                        {
                          label: t('pomodoro.long_break'),
                          key: 'longBreakDuration',
                          range: [10, 45] as [number, number],
                        },
                      ] as const
                    ).map((item) => {
                      const v = config[item.key];
                      const [mn, mx] = item.range;
                      const pct = ((v - mn) / (mx - mn)) * 100;
                      return (
                        <div key={item.key}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] text-white/35">{item.label}</span>
                            <span
                              className="text-sm tabular-nums text-white/55"
                              style={{
                                fontFamily: "'Space Grotesk', ui-sans-serif, sans-serif",
                              }}
                            >
                              {v}
                              <span className="ml-0.5 text-[10px] text-white/25">m</span>
                            </span>
                          </div>
                          <input
                            type="range"
                            min={mn}
                            max={mx}
                            step={1}
                            value={v}
                            onChange={(e) => updateConfig({ [item.key]: Number(e.target.value) })}
                            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.06] accent-white/70"
                            style={{
                              background: `linear-gradient(to right, rgba(255,255,255,0.22) ${pct}%, rgba(255,255,255,0.06) ${pct}%)`,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-white/[0.05] pt-6">
                    <span className="text-[12px] text-white/40">{t('pomodoro.auto_start_breaks')}</span>
                    <button
                      type="button"
                      onClick={() => updateConfig({ autoStart: !config.autoStart })}
                      className="relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor: config.autoStart ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <motion.span
                        layout
                        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm"
                        style={{ left: config.autoStart ? 22 : 3 }}
                      />
                    </button>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-[12px] text-white/40">{t('pomodoro.ui_sounds')}</span>
                    <button
                      type="button"
                      onClick={() => setSoundsEnabled(!soundsEnabled)}
                      className="relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-300"
                      style={{
                        backgroundColor: soundsEnabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <motion.span
                        layout
                        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm"
                        style={{ left: soundsEnabled ? 22 : 3 }}
                      />
                    </button>
                  </div>

                  <div className="mt-6 border-t border-white/[0.05] pt-6">
                    <div className="mb-3 flex items-center gap-2">
                      <Bell size={14} className="shrink-0 text-white/30" strokeWidth={1.5} />
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
                        {t('pomodoro.ambient_title')}
                      </h3>
                    </div>
                    <p className="mb-3 text-[10px] leading-relaxed text-white/20">{t('pomodoro.ambient_hint')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['off', 'beep', 'siren', 'pulse', 'custom'] as const).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setAmbientPreset(id)}
                          className={`rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                            ambientPreset === id
                              ? 'bg-white/[0.12] text-white/85'
                              : 'bg-white/[0.03] text-white/35 hover:bg-white/[0.06] hover:text-white/55'
                          }`}
                        >
                          {t(`pomodoro.ambient_${id}`)}
                        </button>
                      ))}
                    </div>
                    {ambientPreset !== 'off' && (
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] text-white/35">{t('pomodoro.ambient_volume')}</span>
                          <span className="text-[11px] tabular-nums text-white/45">
                            {Math.round(ambientVolume * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(ambientVolume * 100)}
                          onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
                          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.06] accent-white/70"
                        />
                      </div>
                    )}
                    {ambientPreset === 'custom' && (
                      <div className="mt-4 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void onChooseAmbientFile()}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/75"
                          >
                            <FolderOpen size={14} strokeWidth={1.5} />
                            {t('pomodoro.ambient_choose_file')}
                          </button>
                          {(customAmbientPath || webAmbientBlobUrl) && (
                            <button
                              type="button"
                              onClick={() => void onClearAmbientCustom()}
                              className="rounded-xl border border-white/[0.08] bg-transparent px-3 py-2 text-[11px] text-white/35 hover:text-white/55"
                            >
                              {t('pomodoro.ambient_clear_file')}
                            </button>
                          )}
                        </div>
                        <input
                          ref={ambientFileInputRef}
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={onWebAmbientFileChange}
                        />
                        {customAmbientPath && (
                          <p className="truncate text-[10px] text-white/20" title={customAmbientPath}>
                            {customAmbientPath.split(/[/\\]/).pop()}
                          </p>
                        )}
                        {webAmbientBlobUrl && !customAmbientPath && (
                          <p className="text-[10px] text-white/20">{t('pomodoro.ambient_browser_file')}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {onPreviewSessionEnd && (
                    <div className="mt-6 border-t border-white/[0.05] pt-6">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25">
                        {t('pomodoro.preview_section')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onPreviewSessionEnd('work')}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/75"
                        >
                          {t('pomodoro.preview_focus_end')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onPreviewSessionEnd('shortBreak')}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/75"
                        >
                          {t('pomodoro.preview_break_end')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onPreviewSessionEnd('longBreak')}
                          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-white/45 transition-colors hover:border-white/[0.14] hover:bg-white/[0.06] hover:text-white/75"
                        >
                          {t('pomodoro.preview_long_break_end')}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
