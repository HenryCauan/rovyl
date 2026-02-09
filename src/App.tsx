import React, { useState, useRef, useEffect } from 'react';
import { RadialMenu } from './components/RadialMenu';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { SystemCenter } from './components/SystemCenter';
import { NotesWidget } from './components/NotesWidget';
import { AlarmWidget } from './components/AlarmWidget';
import { StopwatchWidget } from './components/StopwatchWidget';
import { PomodoroWidget } from './components/PomodoroWidget';
import { WelcomeScreen } from './components/WelcomeScreen';
import { usePomodoro } from './hooks/usePomodoro';
import { Coordinates, AppItem, UIConfig, Note, Alarm, UserProfile, Workspace } from './types';
import { DEFAULT_APPS, DEFAULT_UI_CONFIG, DEFAULT_WORKSPACES } from './defaults';
import { BellRing, MousePointer2, Settings, Minus, X, Maximize, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Helper function to find an app by ID anywhere in the nested structure
const findAppRecursive = (items: AppItem[], id: string): AppItem | undefined => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children && item.children.length > 0) {
      const found = findAppRecursive(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
};

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSystemCenterOpen, setIsSystemCenterOpen] = useState(false);

  // Standalone Settings Window Mode - REMOVED
  // const isSettingsWindow = window.location.hash === '#settings' || window.location.search.includes('window=settings');

  // Widget States
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAlarmWidgetOpen, setIsAlarmWidgetOpen] = useState(false);
  const [isStopwatchOpen, setIsStopwatchOpen] = useState(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);

  const pomodoro = usePomodoro();

  // Dashboard/Welcome Screen State
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);

  // User / Auth State
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('zenith_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Alarm Ringing State
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);

  const [menuPosition, setMenuPosition] = useState<Coordinates>({ x: 0, y: 0 });
  const [triggerSource, setTriggerSource] = useState<'mmb' | 'shortcut'>('shortcut');
  const [lastLaunched, setLastLaunched] = useState<AppItem | null>(null);
  const [isDesktopMode, setIsDesktopMode] = useState(false);

  /* Tutorial State Removed */
  const [windowState, setWindowState] = useState<'maximized' | 'windowed'>('windowed');

  // State for Apps and Config (Persisted in localStorage)
  const [apps, setApps] = useState<AppItem[]>(() => {
    const saved = localStorage.getItem('zenith_apps');
    return saved ? JSON.parse(saved) : DEFAULT_APPS;
  });

  const [config, setConfig] = useState<UIConfig>(() => {
    const saved = localStorage.getItem('zenith_config');
    const loaded = saved ? JSON.parse(saved) : DEFAULT_UI_CONFIG;

    // AUTO-MIGRATION: If user has the old "Work/Gaming" workspaces, or missing commandType in Streaming, force update
    let finalWorkspaces = loaded.workspaces && loaded.workspaces.length > 0 ? loaded.workspaces : DEFAULT_WORKSPACES;

    const isOldDefault = loaded.workspaces &&
      loaded.workspaces.length === 3 &&
      loaded.workspaces[1]?.name === 'Work';

    const isMissingCommandType = loaded.workspaces &&
      loaded.workspaces.some((ws: Workspace) =>
        ws.name === 'Streaming' &&
        ws.apps.some(app => app.command.startsWith('http') && !app.commandType)
      );

    if (isOldDefault || isMissingCommandType || !loaded.workspaces || loaded.workspaces.length === 0) {
      console.log('Zenith: Migrating to new default workspaces (URL fix)...');
      finalWorkspaces = DEFAULT_WORKSPACES;
    }

    return {
      ...DEFAULT_UI_CONFIG,
      ...loaded,
      centerButton: loaded.centerButton || DEFAULT_UI_CONFIG.centerButton,
      gameMode: { ...DEFAULT_UI_CONFIG.gameMode, ...(loaded.gameMode || {}) },
      workspaces: finalWorkspaces,
      activeWorkspaceIndex: loaded.activeWorkspaceIndex ?? 0
    };
  });
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('zenith_notes');
    return saved ? JSON.parse(saved) : [];
  });

  const [alarms, setAlarms] = useState<Alarm[]>(() => {
    const saved = localStorage.getItem('zenith_alarms');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync Settings with Backend
  useEffect(() => {
    if (window.electron && window.electron.getSettings) {
      window.electron.getSettings().then((settings: any) => {
        if (settings.globalShortcut) {
          setConfig(prev => ({ ...prev, globalShortcut: settings.globalShortcut }));
        }
      });
    }
  }, []);

  useEffect(() => {
    if (window.electron && window.electron.setSettings) {
      window.electron.setSettings({ globalShortcut: config.globalShortcut });
    }
  }, [config.globalShortcut]);

  useEffect(() => { localStorage.setItem('zenith_apps', JSON.stringify(apps)); }, [apps]);

  useEffect(() => {
    localStorage.setItem('zenith_config', JSON.stringify(config));
    if (window.electron && config.gameMode) window.electron.setGameMode(config.gameMode);
  }, [config]);

  useEffect(() => {
    if (user) localStorage.setItem('zenith_user', JSON.stringify(user));
    else localStorage.removeItem('zenith_user');
  }, [user]);

  useEffect(() => { localStorage.setItem('zenith_notes', JSON.stringify(notes)); }, [notes]);
  useEffect(() => { localStorage.setItem('zenith_alarms', JSON.stringify(alarms)); }, [alarms]);

  // ALARM LOGIC
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const currentHours = now.getHours().toString().padStart(2, '0');
      const currentMinutes = now.getMinutes().toString().padStart(2, '0');
      const currentTimeString = `${currentHours}:${currentMinutes}`;
      const currentSeconds = now.getSeconds();

      if (currentSeconds === 0 && !ringingAlarm) {
        const matchedAlarm = alarms.find(a => a.enabled && a.time === currentTimeString);
        if (matchedAlarm) {
          setRingingAlarm(matchedAlarm);
          playAlarmSound();
        }
      }
    };
    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [alarms, ringingAlarm]);

  const playAlarmSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 1);
      }
    } catch (e) { console.error(e); }
  };

  const lastMiddleClickTime = useRef<number>(0);
  const isHolding = useRef(false);



  useEffect(() => {
    if (window.electron) {
      setIsDesktopMode(true);
      if (configRef.current.gameMode) window.electron.setGameMode(configRef.current.gameMode);
    }

    const cleanupMenu = window.electron?.onOpenMenu((data: { x: number, y: number, source?: 'mmb' | 'shortcut' }) => {
      // Close settings if open, then open menu
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
      }
      openMenu(data.x, data.y, data.source);
    });

    const cleanupDashboard = window.electron?.onOpenDashboard(() => {
      setIsDashboardOpen(true);
    });

    const cleanupSettings = window.electron?.onOpenSettings(() => {
      handleOpenSettings();
    });

    const cleanupWindowState = window.electron?.onWindowState((state) => {
      setWindowState(state);
    });

    const cleanupMouseUp = window.electron?.onMouseUp(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { button: 1 }));
    });

    const cleanupExecutionError = window.electron?.onExecutionError((errorMsg: string) => {
      console.error('Execution error received:', errorMsg);
      setLastLaunched({
        id: 'error',
        label: 'Erro de Execução',
        command: '',
        iconName: 'AlertTriangle',
        description: errorMsg
      });
      setTimeout(() => setLastLaunched(null), 5000);
    });

    const cleanupSwitchWorkspace = window.electron?.onSwitchWorkspace((index: number) => {
      handleWorkspaceSwitch(index);
    });

    // FIRST RUN CHECK
    const hasRunBefore = localStorage.getItem('zenith_first_run_complete');
    if (!hasRunBefore) {
      setIsDashboardOpen(true);
      if (window.electron) window.electron.setWindowSize('windowed');
      localStorage.setItem('zenith_first_run_complete', 'true');
    }

    return () => {
      cleanupMenu?.();
      cleanupDashboard?.();
      cleanupSettings?.();
      cleanupWindowState?.();
      cleanupMouseUp?.();
      cleanupExecutionError?.();
      cleanupSwitchWorkspace?.();
    };
  }, [isSettingsOpen, isDashboardOpen]);

  // Window State Management (Interactable vs Passive)
  // TRACK WINDOW STATE TO PREVENT REDUNDANT IPC CALLS (Reduces Lag/Flicker)
  const lastWindowState = useRef<'fullscreen' | 'windowed' | 'small' | null>(null);
  const lastVisibility = useRef<boolean | null>(null);

  useEffect(() => {
    if (window.electron && isDesktopMode) {
      const isAnyInteractive = isMenuOpen || isSettingsOpen || isSystemCenterOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || !!ringingAlarm || isDashboardOpen;
      const targetMode: 'fullscreen' | 'windowed' | 'small' = (isMenuOpen || isSystemCenterOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || !!ringingAlarm)
        ? 'fullscreen'
        : (isDashboardOpen || isSettingsOpen) ? 'windowed' : 'small';

      console.log(`[Sync] Interactive: ${isAnyInteractive}, Mode: ${targetMode}, Menu: ${isMenuOpen}, Dash: ${isDashboardOpen}`);

      // 1. Only update window SIZE if mode actually changed
      if (lastWindowState.current !== targetMode) {
        window.electron.setWindowSize(targetMode);
        lastWindowState.current = targetMode;
      }

      // 2. Only update VISIBILITY if status changed
      if (lastVisibility.current !== isAnyInteractive) {
        if (isAnyInteractive) {
          window.electron.showWindow();
        } else {
          window.electron.hideWindow();
        }
        lastVisibility.current = isAnyInteractive;
      }
    }
  }, [isMenuOpen, isSettingsOpen, isSystemCenterOpen, isNotesOpen, isAlarmWidgetOpen, isStopwatchOpen, isPomodoroOpen, ringingAlarm, isDashboardOpen, isDesktopMode]);

  const openMenu = (x: number, y: number, source: 'mmb' | 'shortcut' = 'shortcut') => {
    console.log(`[App.tsx] openMenu called. Source: ${source}`);
    console.log(`[App.tsx] Current config activeWorkspaceIndex: ${config.activeWorkspaceIndex}`);
    console.log(`[App.tsx] Config workspaces length: ${config.workspaces?.length}`);
    // IMPACT: Force fullscreen immediately to avoid "inside app" feel
    if (window.electron && isDesktopMode) {
      window.electron.setWindowSize('fullscreen');
      if (configRef.current.fixedPosition) {
        // Center of the physical screen (More reliable than innerWidth during resize)
        setMenuPosition({ x: window.screen.width / 2, y: window.screen.height / 2 });
      } else {
        setMenuPosition({ x, y });
      }
    } else {
      // In simulator mode, we use relative center or absolute cursor
      if (configRef.current.fixedPosition) {
        setMenuPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      } else {
        setMenuPosition({ x, y });
      }
    }

    setTriggerSource(source);
    setIsMenuOpen(true);
    isHolding.current = true;
    setIsDashboardOpen(false); // Force close dashboard to prevent state conflict and ensure overlay mode
  };

  // Workspace Switching Handler
  const handleWorkspaceSwitch = (workspaceIndex: number) => {
    if (workspaceIndex >= 0 && workspaceIndex < config.workspaces.length) {
      const workspace = config.workspaces[workspaceIndex];
      if (workspace.enabled) {
        setConfig(prev => ({
          ...prev,
          activeWorkspaceIndex: workspaceIndex
        }));
        console.log(`Switched to workspace ${workspaceIndex + 1}: ${workspace.name}`);
      }
    }
  };

  // Centralized function to open settings and handle dashboard logic
  const handleOpenSettings = () => {
    // Integrated Mode: Just open the local modal
    if (isMenuOpen) setIsMenuOpen(false);
    setIsSettingsOpen(true);
    // Ensure window size is updated to show the modal if we are in 'small' mode
    if (isDesktopMode && window.electron) {
      window.electron.setWindowSize('windowed');
      window.electron.showWindow();
    }
    // Also pause the dashboard if it's open, or keep it?
    // User wants it to feel like "part of dashboard", so maybe we don't close dashboard explicitly,
    // BUT SettingsModal traditionally overlays everything.
    // For now, let's keep dashboard state as is, but SettingsModal usually implies a modal on top.
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) { // Botão do meio
      e.preventDefault();
      openMenu(e.clientX, e.clientY);
    }
  };

  // Double Click (Left) to Open Settings
  const handleDoubleClick = (e: React.MouseEvent) => {
    // Allow double click anywhere on the background to open settings
    // Check if other modals are open (SystemCenter, Notes)
    // Note: We allow this even if Dashboard is open, to escape it.
    if (!isMenuOpen && !isSettingsOpen && !isSystemCenterOpen && !isNotesOpen && !isPomodoroOpen) {
      handleOpenSettings();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    /* Removed hardcoded Alt+Z */
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    // Removed Space key logic as it's no longer used for opening/closing the menu
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    }
  }, []);

  const executeAction = (command: string, commandType: "app" | "url", itemForToast?: AppItem) => {
    console.log("🚀 Zenith executing:", command, "Type:", commandType, itemForToast);
    if (!command) {
      console.warn("Attempted to execute an empty command");
      return;
    }

    if (command === 'internal:notes') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsNotesOpen(true); return; }
    if (command === 'internal:alarm') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsAlarmWidgetOpen(true); return; }
    if (command === 'internal:stopwatch') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsStopwatchOpen(true); return; }
    if (command === 'internal:pomodoro') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsPomodoroOpen(true); return; }
    if (command === 'system-center') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsSystemCenterOpen(true); return; }

    if (itemForToast) {
      setLastLaunched(itemForToast);
      setTimeout(() => setLastLaunched(null), 3000);
    } else {
      setLastLaunched({ id: 'custom', label: 'Command', command: command, iconName: 'Terminal', description: 'Executing...' });
      setTimeout(() => setLastLaunched(null), 3000);
    }

    if (isDesktopMode && window.electron) {
      console.log("Calling electron.executeCommand...");
      window.electron.executeCommand(command, commandType);
      setTimeout(() => {
        if (!isSettingsOpen && !isSystemCenterOpen && !isNotesOpen && !isPomodoroOpen) {
          window.electron?.setWindowSize('small');
          window.electron?.hideWindow();
        }
      }, 1000);
    }
  }

  const handleMenuClose = (selectedId: string | null) => {
    console.log("Menu closing, selectedId:", selectedId);
    setIsMenuOpen(false);
    isHolding.current = false; // This was tied to Space hold, but kept for now if other logic relies on it.

    if (!selectedId && isDesktopMode && !isSettingsOpen && !isSystemCenterOpen && !isNotesOpen && !isPomodoroOpen && !ringingAlarm && !isDashboardOpen) {
      window.electron?.setWindowSize('small');
      window.electron?.hideWindow();
      return;
    }

    if (selectedId) {
      // If an app is launched, ensure dashboard is closed
      setIsDashboardOpen(false);
    }

    if (selectedId === '__CENTER__') {
      const centerConfig = config.centerButton;
      const currentWorkspaceApps = config.workspaces[config.activeWorkspaceIndex]?.apps || apps;

      if (centerConfig.type === 'system') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsSystemCenterOpen(true); return; }
      else if (centerConfig.type === 'app' || centerConfig.type === 'widget') {
        const targetApp = findAppRecursive(currentWorkspaceApps, centerConfig.target);
        const command = targetApp ? targetApp.command : centerConfig.target;
        console.log("Center action, target command:", command);
        executeAction(command, targetApp?.commandType || 'app', targetApp);
        return;
      } else if (centerConfig.type === 'command') {
        executeAction(centerConfig.target, centerConfig.commandType || 'app');
        return;
      }
      return;
    }

    if (selectedId) {
      const currentWorkspaceApps = config.workspaces[config.activeWorkspaceIndex]?.apps || apps;
      const app = findAppRecursive(currentWorkspaceApps, selectedId);
      console.log("Selected app found in active workspace:", app);
      if (app) {
        console.log("Attempting to execute app command:", app.command);
        executeAction(app.command, app.commandType || 'app', app);
      } else {
        console.warn("Could not find app with ID in active workspace:", selectedId);
      }
    }
  };




  {/* Auth Functions */ }
  const handleLogin = (provider: 'google' | 'email') => {
    // Simulate API Call
    const trialDate = new Date();
    trialDate.setDate(trialDate.getDate() + 7); // 7 Days Trial

    const newUser: UserProfile = {
      id: '123',
      name: provider === 'google' ? 'Google User' : 'Email User',
      isPremium: false,
      trialEndsAt: trialDate.toISOString(),
      avatarUrl: undefined,
      email: 'user@example.com'
    };
    setUser(newUser);
  };

  // Check if any modal is open
  const isAnyModalOpen = isSettingsOpen || isSystemCenterOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || ringingAlarm || isMenuOpen || isDashboardOpen;

  return (
    <div
      className={`
        fixed inset-0 w-full h-full overflow-hidden cursor-default select-none group
        ${isDesktopMode ? 'bg-transparent' : 'bg-[#0D0D0D]'}
        ${isDesktopMode && !isAnyModalOpen ? 'pointer-events-none' : ''}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >




      {/* Visibility Wrapper for the whole app content */}
      <div className={`relative w-full h-full transition-opacity duration-300 border-2 border-white/10 rounded-xl overflow-hidden ${isAnyModalOpen ? 'opacity-100' : 'opacity-0'}`}>
        {/* CUSTOM TITLE BAR OVERLAY (for drag region + app name) */}
        {(isDashboardOpen || isSettingsOpen) && !isMenuOpen && (
          <div
            className="fixed top-0 left-0 right-0 h-[36px] z-[999] flex items-center justify-between px-3 pt-1"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <div className="w-3 h-3 bg-gradient-to-br from-white/20 to-transparent border border-white/10 rounded-sm flex items-center justify-center relative">
                <img src="/icon.png" alt="Zenith Icon" className="w-3 h-3" />
              </div>
              <span className="text-[9px] text-white/30 font-mono tracking-[0.3em] uppercase select-none">Zenith</span>
            </div>

            {/* Custom Window Controls */}
            <div className="flex items-center space-x-1 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/50 hover:bg-white/10 rounded-md transition-colors"
                onClick={() => window.electron?.minimizeWindow()}
              >
                <Minus size={14} strokeWidth={2} />
              </button>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/50 hover:bg-white/10 rounded-md transition-colors"
                onClick={() => window.electron?.toggleMaximize()}
              >
                {windowState === 'maximized' ? <Square size={14} strokeWidth={2} /> : <Maximize size={14} strokeWidth={2} />}
              </button>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/50 hover:bg-red-500/80 rounded-md transition-colors"
                onClick={() => window.electron?.quitApp()}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {/* GLOBAL TITLE BAR (Native Software Controls) */}


        {/* BACKGROUND (Simulator Only OR First Run Dashboard) */}
        {/* DELETED: Removed redundant background to allow RadialMenu to handle it exclusively */}

        {/* WELCOME SCREEN / DASHBOARD */}
        <AnimatePresence>
          {isDashboardOpen && !isMenuOpen && !isSystemCenterOpen && !isNotesOpen && !isAlarmWidgetOpen && !isStopwatchOpen && !isPomodoroOpen && !ringingAlarm && (
            <motion.div
              key="welcome"
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              transition={{ duration: 0.5 }}
              className={`absolute inset-0 z-10 ${isMenuOpen ? 'hidden' : ''}`} // Double safety: CSS hide
              id="dashboard-container"
            >
              <WelcomeScreen
                onOpenSettings={handleOpenSettings}
                onClose={() => setIsDashboardOpen(false)}
                config={config}
                user={user}
                onLogin={handleLogin}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ALARM OVERLAY */}
        <AnimatePresence>
          {ringingAlarm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl"
            >
              <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, -2, 2, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="mb-8">
                <BellRing size={80} className="text-red-500" />
              </motion.div>
              <h1 className="text-8xl font-thin text-white mb-4 tracking-tighter tabular-nums">{ringingAlarm.time}</h1>
              <h2 className="text-2xl font-light text-white/70 mb-12 uppercase tracking-widest">{ringingAlarm.label}</h2>
              <button onClick={() => setRingingAlarm(null)} className="px-12 py-4 bg-white text-black text-lg font-bold rounded-full hover:scale-105 transition-transform">DISMISS</button>
            </motion.div>
          )}
        </AnimatePresence>

        <RadialMenu
          isOpen={isMenuOpen}
          position={menuPosition}
          onClose={handleMenuClose}
          apps={config.workspaces[config.activeWorkspaceIndex]?.apps || apps}
          config={config}
          triggerSource={triggerSource}
          onWorkspaceSwitch={handleWorkspaceSwitch}
          currentWorkspace={config.workspaces[config.activeWorkspaceIndex]}
        />

        {isSystemCenterOpen && <SystemCenter position={menuPosition} onClose={() => { setIsSystemCenterOpen(false); if (isDesktopMode) window.electron?.hideWindow(); }} />}
        <NotesWidget isOpen={isNotesOpen} onClose={() => { setIsNotesOpen(false); if (isDesktopMode) window.electron?.hideWindow(); }} notes={notes} setNotes={setNotes} />
        <AlarmWidget isOpen={isAlarmWidgetOpen} onClose={() => { setIsAlarmWidgetOpen(false); if (isDesktopMode) window.electron?.hideWindow(); }} alarms={alarms} setAlarms={setAlarms} />
        <StopwatchWidget isOpen={isStopwatchOpen} onClose={() => { setIsStopwatchOpen(false); if (isDesktopMode) window.electron?.hideWindow(); }} />
        <PomodoroWidget isOpen={isPomodoroOpen} onClose={() => { setIsPomodoroOpen(false); if (isDesktopMode) window.electron?.hideWindow(); }} {...pomodoro} />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => {
            setIsSettingsOpen(false);
            // Only hide window if Dashboard is NOT open (and menu is not open)
            if (isDesktopMode && !isMenuOpen && !isDashboardOpen) window.electron?.hideWindow();
          }}
          apps={apps} setApps={setApps} config={config} setConfig={setConfig} onReset={() => { setApps(DEFAULT_APPS); setConfig(DEFAULT_UI_CONFIG); }}
          onOpenDashboard={() => {
            setIsSettingsOpen(false);
            setIsDashboardOpen(true);
          }}
          user={user}
        />

        <Toast app={lastLaunched} />

        <style>{`
          .group:active { cursor: ${isAnyModalOpen ? 'default' : 'crosshair'}; }
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 10px; }
          ${isMenuOpen ? '#dashboard-container { display: none !important; }' : ''}
        `}</style>
      </div>

    </div>
  );
}