import React, { useState, useRef, useEffect } from 'react';
import { RadialMenu } from './components/RadialMenu';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { NotesWidget } from './components/NotesWidget';
import { AlarmWidget } from './components/AlarmWidget';
import { StopwatchWidget } from './components/StopwatchWidget';
import { PomodoroWidget } from './components/PomodoroWidget';
import { WelcomeScreen } from './components/WelcomeScreen';
import { usePomodoro } from './hooks/usePomodoro';
import { Coordinates, AppItem, UIConfig, Note, Alarm, UserProfile, Workspace } from './types';
import { DEFAULT_APPS, DEFAULT_UI_CONFIG, DEFAULT_WORKSPACES } from './defaults';
import { BellRing, MousePointer2, Settings, Minus, X, Maximize, Square, AlertTriangle } from 'lucide-react';
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

  const [windowState, setWindowState] = useState<'maximized' | 'windowed'>('windowed');
  const [isLoaded, setIsLoaded] = useState(false);

  // User / Auth State (Defaults to null)
  const [user, setUser] = useState<UserProfile | null>(null);

  // Alarm Ringing State
  const [ringingAlarm, setRingingAlarm] = useState<Alarm | null>(null);

  const [menuPosition, setMenuPosition] = useState<Coordinates>({ x: 0, y: 0 });
  const [triggerSource, setTriggerSource] = useState<'mmb' | 'shortcut'>('shortcut');
  const [lastLaunched, setLastLaunched] = useState<AppItem | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  const [isAppReady, setIsAppReady] = useState(true); // Defaults to true so initial loading works normally

  // State for Apps and Config (Defaults to initial constants)
  const [apps, setApps] = useState<AppItem[]>(DEFAULT_APPS);

  const [config, setConfig] = useState<UIConfig>(DEFAULT_UI_CONFIG);
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

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

  // ICON NORMALIZATION CACHE-BUST:
  // When the extract-icon.ps1 normalization algorithm changes, bump this version
  // so all stored base64 icons get cleared and re-fetched with the new format.
  const ICON_NORMALIZATION_VERSION = 'v3-onedirectional-75pct-threshold';
  useEffect(() => {
    if (!window.electron?.getFileIcon) return;
    const storedVersion = localStorage.getItem('zenith_icon_normalization_version');
    if (storedVersion === ICON_NORMALIZATION_VERSION) return; // Already using new format

    // Version mismatch: clear all stored customIconUrl so healing re-fetches them
    setConfig(prev => {
      const clearIcons = (items: AppItem[]): AppItem[] =>
        items.map(item => ({
          ...item,
          customIconUrl: item.iconSource === 'native' ? undefined : item.customIconUrl,
          children: item.children ? clearIcons(item.children) : undefined,
        }));
      return {
        ...prev,
        workspaces: prev.workspaces.map(ws => ({
          ...ws,
          apps: clearIcons(ws.apps),
        })),
      };
    });

    localStorage.setItem('zenith_icon_normalization_version', ICON_NORMALIZATION_VERSION);
    // console.log('[Icons] Cache-busted: re-fetching icons with new normalization.');
  }, []);

  // Listen for execution errors from backend
  useEffect(() => {
    if (window.electron?.onExecutionError) {
      return window.electron.onExecutionError((errorMsg: string) => {
        setExecutionError(errorMsg);
        setTimeout(() => setExecutionError(null), 5000);
      });
    }
  }, []);

  // ICON HEALING: Automatically re-fetch missing native icons
  useEffect(() => {
    if (!window.electron?.getFileIcon) return;

    const findMissingIcons = (items: AppItem[]): AppItem[] => {
      let missing: AppItem[] = [];
      const traverse = (list: AppItem[]) => {
        list.forEach(item => {
          if (item.iconSource === 'native' && !item.customIconUrl && item.command) {
            missing.push(item);
          }
          if (item.children) traverse(item.children);
        });
      };
      traverse(items);
      return missing;
    };

    const appsToHeal = findMissingIcons(config.workspaces.flatMap(ws => ws.apps));
    if (appsToHeal.length === 0) return;

    // console.log(`[Icon Healing] Attempting to fix ${appsToHeal.length} icons...`);

    const heal = async () => {
      let hasUpdates = false;
      const updatedWorkspaces = await Promise.all(config.workspaces.map(async (ws) => {
        const healRecursive = async (items: AppItem[]): Promise<AppItem[]> => {
          return Promise.all(items.map(async (item) => {
            let newItem = { ...item };
            if (item.iconSource === 'native' && !item.customIconUrl && item.command) {
              try {
                const iconUrl = await window.electron.getFileIcon(item.command);
                if (iconUrl) {
                  newItem.customIconUrl = iconUrl;
                  hasUpdates = true;
                }
              } catch (e) {
                console.warn(`[Icon Healing] Failed for ${item.label}`);
              }
            }
            if (newItem.children) {
              newItem.children = await healRecursive(newItem.children);
            }
            return newItem;
          }));
        };

        const newApps = await healRecursive(ws.apps);
        return { ...ws, apps: newApps };
      }));

      if (hasUpdates) {
        setConfig(prev => ({ ...prev, workspaces: updatedWorkspaces }));
      }
    };

    heal();
  }, [config.workspaces.length]); // Re-run mainly if workspaces are added/loaded


  // Onboarding: Fetch Top 5 Apps on First Run
  useEffect(() => {
    const isInitialized = localStorage.getItem('zenith_initialized');
    if (!isInitialized && window.electron && window.electron.getOnboardingApps) {
      window.electron.getOnboardingApps().then(async (onboardingApps: any[]) => {
        if (onboardingApps && onboardingApps.length > 0) {
          // Fetch icons for onboarding apps to avoid empty icons in production
          const appsWithIcons = await Promise.all(onboardingApps.map(async (app, idx) => {
            let iconUrl = '';
            try {
              if (window.electron?.getFileIcon) {
                iconUrl = await window.electron.getFileIcon(app.Path) || '';
              }
            } catch (e) {
              console.warn(`Onboarding: Failed to fetch icon for ${app.Name}`);
            }

            return {
              id: crypto.randomUUID(),
              type: 'app' as const,
              label: app.Name,
              iconName: '',
              iconSource: 'native' as const,
              customIconUrl: iconUrl,
              command: app.Path,
              commandType: 'app' as const,
              description: `System shortcut for ${app.Name}`,
              // Map directions in a circular way
              direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][idx % 8]
            };
          }));

          setConfig(prev => {
            const newWorkspaces = [...prev.workspaces];
            const mainWsIndex = newWorkspaces.findIndex(ws => ws.name === 'Main');

            if (mainWsIndex !== -1) {
              newWorkspaces[mainWsIndex] = {
                ...newWorkspaces[mainWsIndex],
                apps: appsWithIcons
              };
            }

            return { ...prev, workspaces: newWorkspaces };
          });
        }
        localStorage.setItem('zenith_initialized', 'true');
      });
    }
  }, []);


  // 1. PRIMARY PERSISTENCE: Load from Electron Main or Migrate from LocalStorage
  useEffect(() => {
    const loadPersistence = async () => {
      let finalData: any = null;

      if (window.electron?.getFullConfig) {
        finalData = await window.electron.getFullConfig();
      }

      // Migration Fallback
      if (!finalData) {
        const userStr = localStorage.getItem('zenith_user');
        const appsStr = localStorage.getItem('zenith_apps');
        const configStr = localStorage.getItem('zenith_config');
        const notesStr = localStorage.getItem('zenith_notes');
        const alarmsStr = localStorage.getItem('zenith_alarms');

        if (userStr || appsStr || configStr || notesStr || alarmsStr) {
          finalData = {
            user: userStr ? JSON.parse(userStr) : null,
            apps: appsStr ? JSON.parse(appsStr) : DEFAULT_APPS,
            config: configStr ? JSON.parse(configStr) : DEFAULT_UI_CONFIG,
            notes: notesStr ? JSON.parse(notesStr) : [],
            alarms: alarmsStr ? JSON.parse(alarmsStr) : [],
          };
          // Save to main process immediately
          window.electron?.saveFullConfig(finalData);
        }
      }

      if (finalData) {
        if (finalData.user) setUser(finalData.user);
        if (finalData.apps) setApps(finalData.apps);
        if (finalData.config) setConfig(finalData.config);
        if (finalData.notes) setNotes(finalData.notes);
        if (finalData.alarms) setAlarms(finalData.alarms);
      }
      setIsLoaded(true);
    };

    loadPersistence();
  }, []);

  // 2. UNIFIED SAVE EFFECT: Sync to Main Process and LocalStorage
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      const fullData = { user, apps, config, notes, alarms };
      
      // Secondary Fallback
      localStorage.setItem('zenith_user', JSON.stringify(user));
      localStorage.setItem('zenith_apps', JSON.stringify(apps));
      localStorage.setItem('zenith_config', JSON.stringify(config));
      localStorage.setItem('zenith_notes', JSON.stringify(notes));
      localStorage.setItem('zenith_alarms', JSON.stringify(alarms));

      // Primary Persistence
      if (window.electron?.saveFullConfig) {
        window.electron.saveFullConfig(fullData);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [user, apps, config, notes, alarms, isLoaded]);

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
      const isShortcutError = errorMsg.toLowerCase().includes('shortcut');

      setLastLaunched({
        id: 'error',
        label: isShortcutError ? 'Erro de Atalho' : 'Erro de Execução',
        command: '',
        iconName: 'AlertTriangle',
        description: errorMsg
      });
      setTimeout(() => setLastLaunched(null), 6000);
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
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (window.electron && isDesktopMode) {
      const isAnyInteractive = isMenuOpen || isSettingsOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || !!ringingAlarm || isDashboardOpen;
      const targetMode: 'fullscreen' | 'windowed' | 'small' = (isMenuOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || !!ringingAlarm)
        ? 'fullscreen'
        : (isDashboardOpen || isSettingsOpen) ? 'windowed' : 'small';

      const modeChanged = lastWindowState.current !== targetMode;
      const visibilityChanged = lastVisibility.current !== isAnyInteractive;

      // 1. Handle mode changes if they happen while visible (avoids resize flicker)
      if (modeChanged && lastVisibility.current && isAnyInteractive && targetMode !== 'small') {
        // dip visibility during resize
        window.electron.hideWindow();
        setTimeout(() => {
          window.electron.setWindowSize(targetMode);
          setTimeout(() => {
            window.electron.showWindow();
          }, 80); // Stabilization delay for resize + paint
        }, 10);
        lastWindowState.current = targetMode;
        return; 
      }

      // 2. Standard mode update (non-flicker-prone or hidden)
      if (modeChanged) {
        window.electron.setWindowSize(targetMode);
        lastWindowState.current = targetMode;
      }

      // 3. Standard visibility update
      if (visibilityChanged) {
        if (isAnyInteractive) {
          if (hideTimeout.current) {
            clearTimeout(hideTimeout.current);
            hideTimeout.current = null;
          }
          
          // Flash Prevention phase 1: Cover everything with black
          setIsAppReady(false);

          setTimeout(() => {
             window.electron.showWindow();
             
             // Flash Prevention phase 2: Reveal the app only after the native window 
             // is fully opaque and Chromium has had time to paint the first frame.
             setTimeout(() => setIsAppReady(true), 150);
          }, 60);
        } else {
          // Immediately cover with black to avoid flashing of stale exit frames
          setIsAppReady(false);

          hideTimeout.current = setTimeout(() => {
            window.electron.hideWindow();
          }, 500); // 500ms safety margin for all exit animations
        }
        lastVisibility.current = isAnyInteractive;
      }
    }
  }, [isMenuOpen, isSettingsOpen, isNotesOpen, isAlarmWidgetOpen, isStopwatchOpen, isPomodoroOpen, ringingAlarm, isDashboardOpen, isDesktopMode]);

  const openMenu = (x: number, y: number, source: 'mmb' | 'shortcut' = 'shortcut') => {
    // console.log(`[App.tsx] openMenu called. Source: ${source}`);
    console.log(`[App.tsx] Current config activeWorkspaceIndex: ${config.activeWorkspaceIndex}`);
    console.log(`[App.tsx] Config workspaces length: ${config.workspaces?.length}`);
    // IMPACT: Force fullscreen immediately to avoid "inside app" feel
    if (window.electron && isDesktopMode) {
      // Avoid redundant IPC if already in fullscreen
      if (lastWindowState.current !== 'fullscreen') {
        window.electron.setWindowSize('fullscreen');
        lastWindowState.current = 'fullscreen';
      }

      if (configRef.current.fixedPosition) {
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
    // setIsDashboardOpen(false); // REMOVED: Keep dashboard state open so it persists behind radial menu
  };

  // Workspace Switching Handler
  const handleWorkspaceSwitch = React.useCallback((workspaceIndex: number) => {
    if (workspaceIndex >= 0 && workspaceIndex < configRef.current.workspaces.length) {
      const workspace = configRef.current.workspaces[workspaceIndex];
      if (workspace && workspace.enabled) {
        setConfig(prev => ({
          ...prev,
          activeWorkspaceIndex: workspaceIndex
        }));
      }
    }
  }, []); // Stable reference since we use configRef.current inside if needed, or just let setConfig handle it

  // Centralized function to open settings and handle dashboard logic
  const handleOpenSettings = () => {
    if (isMenuOpen) setIsMenuOpen(false);
    setIsSettingsOpen(true);
    setIsDashboardOpen(true); // Ensure settings opens in "page" mode (full window)
    // When opening settings from dashboard, we keep track of it via existing props
    // or we can just let SettingsModal call onOpenDashboard when closed.
    if (isDesktopMode && window.electron) {
      window.electron.setWindowSize('windowed');
      window.electron.showWindow();
    }
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
    if (!isMenuOpen && !isSettingsOpen && !isNotesOpen && !isPomodoroOpen) {
      handleOpenSettings();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    /* Removed hardcoded Alt+Z */
    if (e.key === 'Escape' && isMenuOpen) {
      setIsMenuOpen(false);
    }
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

  const executeAction = (command: string, commandType: "app" | "url" | "folder", itemForToast?: AppItem, options?: { openTerminal?: boolean }) => {
    // console.log("🚀 Zenith executing:", command, "Type:", commandType, itemForToast);
    if (!command) {
      console.warn("Attempted to execute an empty command");
      return;
    }

    if (command === 'internal:notes') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsNotesOpen(true); return; }
    if (command === 'internal:alarm') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsAlarmWidgetOpen(true); return; }
    if (command === 'internal:stopwatch') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsStopwatchOpen(true); return; }
    if (command === 'internal:pomodoro') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen'); setIsPomodoroOpen(true); return; }

    if (itemForToast) {
      setLastLaunched(itemForToast);
      setTimeout(() => setLastLaunched(null), 3000);
    } else {
      setLastLaunched({ id: 'custom', label: 'Terminal', command: command, iconName: 'Terminal', description: 'Executando...' });
      setTimeout(() => setLastLaunched(null), 3000);
    }

    if (isDesktopMode && window.electron) {
      // console.log("Calling electron.executeCommand...");
      window.electron.executeCommand(command, commandType, options);
      setTimeout(() => {
        if (!isSettingsOpen && !isNotesOpen && !isPomodoroOpen && !isDashboardOpen) {
          window.electron?.setWindowSize('small');
          // Unified visibility effect will handle hiding automatically based on state
        }
      }, 1000);
    }
  }

  const handleMenuClose = (selectedId: string | null) => {
    // console.log("Menu closing, selectedId:", selectedId);
    setIsMenuOpen(false);
    isHolding.current = false;

    if (!selectedId && isDesktopMode && !isSettingsOpen && !isNotesOpen && !isPomodoroOpen && !ringingAlarm && !isDashboardOpen) {
      window.electron?.setWindowSize('small');
      // Unified visibility effect will handle hiding
      return;
    }

    if (selectedId) {
      // If an external app is launched, ensure dashboard is closed
      const currentWorkspaceApps = config.workspaces[config.activeWorkspaceIndex]?.apps || apps;
      const app = findAppRecursive(currentWorkspaceApps, selectedId);
      
      // Only close dashboard if it's NOT an internal widget (like Pomodoro, Notes, etc.)
      const isInternalWidget = app?.command?.startsWith('internal:');
      if (!isInternalWidget) {
        setIsDashboardOpen(false);
      }
    }

    if (selectedId === '__CENTER__') {
      const centerConfig = config.centerButton;
      
      if (centerConfig.type === 'cancel') {
        if (isDesktopMode && !isSettingsOpen && !isNotesOpen && !isPomodoroOpen && !ringingAlarm && !isDashboardOpen) {
          window.electron?.setWindowSize('small');
          // Unified visibility effect will handle hiding
        }
        return;
      }

      const currentWorkspaceApps = config.workspaces[config.activeWorkspaceIndex]?.apps || apps;

      if (centerConfig.type === 'app' || centerConfig.type === 'widget') {
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
        executeAction(app.command, app.commandType || 'app', app, { openTerminal: app.openTerminal });
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
  const isAnyModalOpen = isSettingsOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || ringingAlarm || isMenuOpen || isDashboardOpen;

  return (
    <div
      className={`
        fixed inset-0 w-full h-full overflow-hidden cursor-default select-none group
        ${isDesktopMode ? 'bg-transparent' : 'bg-[#0D0D0D]'}
        ${isDesktopMode && !isAnyModalOpen ? 'pointer-events-none' : ''}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isMenuOpen) setIsMenuOpen(false);
      }}
    >




      {/* Visibility Wrapper for the whole app content */}
      <div className={`
        relative w-full h-full transition-opacity duration-200 overflow-hidden
        ${isAnyModalOpen ? 'opacity-100' : 'opacity-0'}
        ${(isDashboardOpen || isSettingsOpen) ? 'border border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-[#0A0A0A]' : ''}
      `}>
        {/* CUSTOM TITLE BAR OVERLAY (for drag region + app name) */}
        {(isDashboardOpen || isSettingsOpen) && !isMenuOpen && (
          <div
            className="absolute top-0 left-0 right-0 h-[38px] z-[999] flex items-center justify-between px-4 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/[0.05]"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <div className="w-5 h-5 bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-md flex items-center justify-center bg-black shadow-inner">
                <img src="icon.png" alt="Zenith" className="w-3.5 h-3.5 opacity-90" />
              </div>
            </div>

            {/* Custom Window Controls */}
            <div className="flex items-center gap-1 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200"
                onClick={() => window.electron?.minimizeWindow()}
                title="Minimizar"
              >
                <Minus size={13} strokeWidth={2} />
              </button>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200"
                onClick={() => window.electron?.toggleMaximize()}
                title={windowState === 'maximized' ? "Restaurar" : "Maximizar"}
              >
                {windowState === 'maximized' ? <Square size={11} strokeWidth={2.5} /> : <Maximize size={11} strokeWidth={2.5} />}
              </button>
              <button
                className="w-8 h-6 flex items-center justify-center text-white/30 hover:text-red-500/80 rounded-md transition-all duration-200"
                onClick={() => window.electron?.quitApp()}
                title="Fechar Zenith"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* GLOBAL TITLE BAR (Native Software Controls) */}


        {/* BACKGROUND (Simulator Only OR First Run Dashboard) */}
        {/* DELETED: Removed redundant background to allow RadialMenu to handle it exclusively */}

        {/* WELCOME SCREEN / DASHBOARD */}
        <AnimatePresence>
          {isDashboardOpen && !isSettingsOpen && !isNotesOpen && !isAlarmWidgetOpen && !isStopwatchOpen && !isPomodoroOpen && !ringingAlarm && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              transition={{ duration: 0.4 }}
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
              <button onClick={() => setRingingAlarm(null)} className="px-12 py-4 bg-white text-black text-lg font-bold rounded-full hover:scale-105 transition-transform">FECHAR</button>
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

        <NotesWidget isOpen={isNotesOpen} onClose={() => { setIsNotesOpen(false); }} notes={notes} setNotes={setNotes} config={config} />
        <AlarmWidget isOpen={isAlarmWidgetOpen} onClose={() => { setIsAlarmWidgetOpen(false); }} alarms={alarms} setAlarms={setAlarms} config={config} />
        <StopwatchWidget isOpen={isStopwatchOpen} onClose={() => { setIsStopwatchOpen(false); }} config={config} />
        <PomodoroWidget isOpen={isPomodoroOpen} onClose={() => { setIsPomodoroOpen(false); }} {...pomodoro} uiConfig={config} />

        <SettingsModal
          isOpen={isSettingsOpen}
          isPage={isDashboardOpen}
          onClose={() => {
            setIsSettingsOpen(false);
          }}
          apps={apps} setApps={setApps} config={config} setConfig={setConfig} onReset={() => { setApps(DEFAULT_APPS); setConfig(DEFAULT_UI_CONFIG); }}
          onOpenDashboard={() => {
            setIsSettingsOpen(false);
            setIsDashboardOpen(true);
          }}
          user={user}
        />

        <Toast app={lastLaunched} />
        
        <AnimatePresence>
          {executionError && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1000]">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="px-6 py-4 bg-red-500/90 backdrop-blur-xl border border-red-400/50 rounded-2xl shadow-2xl flex items-center gap-4 min-w-[320px]"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Erro de Execução</div>
                  <div className="text-sm font-bold text-white leading-tight">{executionError}</div>
                </div>
                <button onClick={() => setExecutionError(null)} className="text-white/40 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* FLASH PREVENTION BLANKER */}
        {!isAppReady && (
          <div 
            className="fixed inset-0 z-[99999] bg-black flex items-center justify-center" 
            style={{ opacity: 1, pointerEvents: 'none' }}
          />
        )}

        <style>{`
          .group:active { cursor: ${isAnyModalOpen ? 'default' : 'crosshair'}; }
        `}</style>
      </div>

    </div>
  );
}