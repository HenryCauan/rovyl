import { useState, useEffect, useRef, useCallback } from "react";
import {
  PomodoroConfig,
  PomodoroState,
  PomodoroMode,
  PomodoroTask,
} from "../types";
import {
  loadPomodoroUiPrefs,
  playPomodoroSegmentEnd,
  shouldPlayPomodoroSounds,
} from "../pomodoroSounds";

const DEFAULT_CONFIG: PomodoroConfig = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoStart: false,
  longBreakInterval: 4,
};

const STORAGE_KEY_STATE = "zenith_pomodoro_state";
const STORAGE_KEY_CONFIG = "zenith_pomodoro_config";
const STORAGE_KEY_TASKS = "zenith_pomodoro_tasks";

export type UsePomodoroOptions = {
  /** Called when a work or break segment reaches zero (natural end or skip). */
  onSegmentComplete?: (info: { endedMode: PomodoroMode }) => void;
};

export const usePomodoro = (options?: UsePomodoroOptions) => {
  const onSegmentCompleteRef = useRef(options?.onSegmentComplete);
  onSegmentCompleteRef.current = options?.onSegmentComplete;

  // --- State Initialization ---
  const [config, setConfig] = useState<PomodoroConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  const [state, setState] = useState<PomodoroState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_STATE);
    return saved
      ? JSON.parse(saved)
      : {
          isActive: false,
          mode: "work",
          timeLeft: DEFAULT_CONFIG.workDuration * 60,
          cyclesCompleted: 0,
          totalPomodorosCompleted: 0,
        };
  });

  const [tasks, setTasks] = useState<PomodoroTask[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TASKS);
    return saved ? JSON.parse(saved) : [];
  });

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
  }, [tasks]);

  // --- Timer Logic ---
  const playNotificationSound = () => {
    if (!shouldPlayPomodoroSounds()) return;
    if (loadPomodoroUiPrefs().ambientPreset !== "off") return;
    try {
      playPomodoroSegmentEnd();
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const switchMode = useCallback(
    (nextMode: PomodoroMode) => {
      let duration = config.workDuration;
      if (nextMode === "shortBreak") duration = config.shortBreakDuration;
      if (nextMode === "longBreak") duration = config.longBreakDuration;

      setState((prev) => ({
        ...prev,
        mode: nextMode,
        timeLeft: duration * 60,
        isActive: config.autoStart,
      }));

      if (config.autoStart) {
        // Ensure timer starts if autoStart is on
      } else {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    },
    [config],
  );

  const handleTimerComplete = useCallback(() => {
    playNotificationSound();
    onSegmentCompleteRef.current?.({ endedMode: state.mode });

    // Update stats
    if (state.mode === "work") {
      // Increment cycles
      const newCycles = state.cyclesCompleted + 1;
      const totalCompleted = state.totalPomodorosCompleted + 1;

      // Update Task progress
      if (activeTaskId) {
        setTasks((prevTasks) =>
          prevTasks.map((t) =>
            t.id === activeTaskId
              ? { ...t, completedPomodoros: t.completedPomodoros + 1 }
              : t,
          ),
        );
      }

      // Decide next mode
      if (newCycles % config.longBreakInterval === 0) {
        setState((prev) => ({
          ...prev,
          cyclesCompleted: newCycles,
          totalPomodorosCompleted: totalCompleted,
        }));
        switchMode("longBreak");
      } else {
        setState((prev) => ({
          ...prev,
          cyclesCompleted: newCycles,
          totalPomodorosCompleted: totalCompleted,
        }));
        switchMode("shortBreak");
      }
    } else {
      // Break finished, back to work
      switchMode("work");
    }
  }, [
    state.mode,
    state.cyclesCompleted,
    config.longBreakInterval,
    activeTaskId,
    switchMode,
  ]);

  // One stable interval while running — do NOT depend on `timeLeft` or the effect will tear down
  // and recreate the interval every second (extra main-thread work + janky timing).
  useEffect(() => {
    if (!state.isActive) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (state.timeLeft <= 0) {
      return;
    }

    timerRef.current = setInterval(() => {
      setState((prev) => {
        if (!prev.isActive) return prev;
        if (prev.timeLeft <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return { ...prev, timeLeft: 0 };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.isActive]);

  // Natural end of countdown (interval above sets timeLeft to 0 while still active)
  useEffect(() => {
    if (state.timeLeft !== 0 || !state.isActive) return;
    handleTimerComplete();
  }, [state.timeLeft, state.isActive, handleTimerComplete]);

  // --- Public Controls ---
  const toggleTimer = () => {
    setState((prev) => ({ ...prev, isActive: !prev.isActive }));
  };

  const resetTimer = () => {
    let duration = config.workDuration;
    if (state.mode === "shortBreak") duration = config.shortBreakDuration;
    if (state.mode === "longBreak") duration = config.longBreakDuration;

    setState((prev) => ({ ...prev, isActive: false, timeLeft: duration * 60 }));
  };

  const skipTimer = () => {
    handleTimerComplete();
  };

  const updateConfig = (newConfig: Partial<PomodoroConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
    // If we are currently stopped, update the time left to match new config
    // But only if we are at the "start" of a cycle (detecting if timeLeft == oldDuration would be tricky without tracking original duration)
    // Simpler: Just update config. The next reset or mode switch will pick it up.
  };

  return {
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
    setConfig,
  };
};
