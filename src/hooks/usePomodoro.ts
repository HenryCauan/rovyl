import { useState, useEffect, useRef, useCallback } from "react";
import {
  PomodoroConfig,
  PomodoroState,
  PomodoroMode,
  PomodoroTask,
} from "../types";

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

export const usePomodoro = () => {
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
    try {
      const audio = new Audio("/notification.mp3"); // Placeholder - ideally from assets or generated
      // Fallback to oscillator if file not found (Client side only)
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }
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

  useEffect(() => {
    if (state.isActive && state.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setState((prev) => {
          if (prev.timeLeft <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else if (state.timeLeft === 0 && state.isActive) {
      // Handle completion immediately when hitting 0
      handleTimerComplete();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.isActive, state.timeLeft, handleTimerComplete]);

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
