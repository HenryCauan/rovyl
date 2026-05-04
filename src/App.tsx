import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { RadialMenu } from './components/RadialMenu';
import { Toast } from './components/Toast';
import { SettingsModal } from './components/SettingsModal';
import { NotesWidget } from './components/NotesWidget';
import { AlarmWidget } from './components/AlarmWidget';
import { StopwatchWidget } from './components/StopwatchWidget';
import { PomodoroWidget } from './components/PomodoroWidget';
import { WelcomeScreen } from './components/WelcomeScreen';
import { usePomodoro } from './hooks/usePomodoro';
import { Coordinates, AppItem, UIConfig, Note, NoteWorkspace, Alarm, UserProfile, Workspace, PomodoroMode } from './types';
import {
  DEFAULT_APPS,
  DEFAULT_UI_CONFIG,
  MINIMAL_MAIN_WORKSPACE_APPS,
  workspaceContainsBundledDemoApp,
} from './defaults';
import { MousePointer2, Settings, Minus, X, Maximize, Square, AlertTriangle } from 'lucide-react';
import { startAlarmRingtone } from './alarmAudio';
import { AlarmRingingOverlay } from './components/AlarmRingingOverlay';
import { PomodoroCompleteOverlay } from './components/PomodoroCompleteOverlay';
import { StartMenuResolvingOverlay } from './components/StartMenuResolvingOverlay';
import type { Language } from './translations';
import {
  loadPomodoroUiPrefs,
  playPomodoroSegmentEnd,
  resumePomodoroAudio,
  shouldPlayPomodoroSounds,
} from './pomodoroSounds';
import { motion, AnimatePresence } from 'framer-motion';
import { useStopwatchHudSnapshot } from './stopwatchHudStore';
import { compactTimerHudShouldShow } from './utils/compactTimerHudVisibility';
import { CompactTimerHud } from './components/CompactTimerHud';
import { isLikelyWebUrl, resolveWebsiteIconFields } from './siteFavicon';

const LS_MAIN_DISCOVERY_DONE = 'zenith_main_discovery_done';

/** Favicons remotos não devem ser apagados pelo cache-bust de ícones de .exe nem healing via getFileIcon. */
function isRemoteIconUrl(u: string | undefined): boolean {
  return /^https?:\/\//i.test(String(u ?? '').trim());
}

function isWebShortcutItem(item: AppItem): boolean {
  return item.commandType === 'url' || isLikelyWebUrl(item.command);
}

/** Legacy first-run flag — used only to avoid double-running in odd edge cases; repair no longer skips on this alone. */
const LS_ZENITH_INITIALIZED_LEGACY = 'zenith_initialized';

/** Atrasar Get-StartApps/PowerShell no arranque — competir com o login do Windows satura disco/CPU e pode deixar o PC (e o Edge) lento. */
const START_MENU_DISCOVERY_DEFER_MS = 20_000;

type StartMenuDiscoveryRow = { Name?: string; Path?: string; Command?: string };

/** Builds Main workspace apps from `get-startup-apps` and appends internal Zenith shortcuts from defaults. */
async function buildMainAppsFromStartMenuDiscovery(
  raw: StartMenuDiscoveryRow[],
): Promise<AppItem[]> {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const built = await Promise.all(
    raw.map(async (app, idx) => {
      const cmd = String(app.Command || app.Path || '').trim();
      let iconUrl = '';
      try {
        if (window.electron?.getFileIcon && cmd) {
          iconUrl = (await window.electron.getFileIcon(cmd)) || '';
        }
      } catch {
        /* ignore */
      }
      return {
        id: crypto.randomUUID(),
        type: 'app' as const,
        label: app.Name?.trim() || 'App',
        iconName: '',
        iconSource: 'native' as const,
        customIconUrl: iconUrl,
        command: cmd,
        commandType: 'app' as const,
        description: cmd ? `Menu Iniciar: ${cmd}` : '',
        direction: directions[idx % 8],
      };
    }),
  );
  return [...built, ...MINIMAL_MAIN_WORKSPACE_APPS];
}

/** Main já tem atalhos reais ou apps fora do conjunto mínimo de widgets — não reimportar Menu Iniciar após reboot. */
function mainWorkspaceAlreadyCustomized(mainWs: Workspace | undefined): boolean {
  if (!mainWs?.apps?.length) return false;
  const minimalIds = new Set(
    MINIMAL_MAIN_WORKSPACE_APPS.map((a) => a.id).filter((id): id is string => !!id),
  );
  if (mainWs.apps.length > MINIMAL_MAIN_WORKSPACE_APPS.length) return true;
  for (const a of mainWs.apps) {
    if (a.id && !minimalIds.has(a.id)) return true;
    if (typeof a.command === 'string' && !a.command.startsWith('internal:')) return true;
  }
  return false;
}

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

/**
 * Preferir ao cursor como âncora em `setWindowSize('fullscreen'|'small')`: o processo principal usa
 * `getDisplayNearestPoint` — com vários monitores o cursor pode estar noutro ecrã enquanto o HWND
 * (radial / ilha) já cobre o monitor certo.
 */
function windowCenterScreenPoint(): { x: number; y: number } {
  const w = window.outerWidth || window.innerWidth || 1;
  const h = window.outerHeight || window.innerHeight || 1;
  return {
    x: window.screenX + Math.round(w / 2),
    y: window.screenY + Math.round(h / 2),
  };
}

export default function App() {
  /* zenith-verify:radial-handshake-renderer — overlays/handshake radial; ver scripts/verify-radial-windowing.mjs */
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  /** Esconde dashboard/definições antes do `await applyWindowSize('fullscreen')` — sem isto, ao restaurar da bandeja aparece um frame da última UI. */
  const [radialOpenAwaitingFullscreen, setRadialOpenAwaitingFullscreen] = useState(false);
  /** Um frame sólido antes de minimizar — evita o Windows guardar bitmap do dashboard e flash ao reabrir o radial. */
  const [minimizeNeutralCoverActive, setMinimizeNeutralCoverActive] = useState(false);
  /** Main: `prepare-radial-show` — pintar antes de `show()` para não expor textura antiga (minimizado/dashboard). */
  const [radialPreShowSolidCover, setRadialPreShowSolidCover] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isDashboardOpenRef = useRef(false);
  const isSettingsOpenRef = useRef(false);

  // Standalone Settings Window Mode - REMOVED
  // const isSettingsWindow = window.location.hash === '#settings' || window.location.search.includes('window=settings');

  // Widget States
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAlarmWidgetOpen, setIsAlarmWidgetOpen] = useState(false);
  const [isStopwatchOpen, setIsStopwatchOpen] = useState(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);
  const [pomodoroEndOverlay, setPomodoroEndOverlay] = useState<{
    endedMode: PomodoroMode;
    isPreview: boolean;
  } | null>(null);

  const onPomodoroSegmentComplete = useCallback((info: { endedMode: PomodoroMode }) => {
    setPomodoroEndOverlay({ endedMode: info.endedMode, isPreview: false });
  }, []);

  const pomodoro = usePomodoro({ onSegmentComplete: onPomodoroSegmentComplete });
  const stopwatchHudSnap = useStopwatchHudSnapshot();

  // Dashboard/Welcome Screen State
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  /**
   * Após minimizar com Welcome/definições, o SO repõe o HWND ao aplicar `small` e o evento `restore` faria o painel
   * voltar a parecer “aberto” em loop. Este flag mantém o chrome do painel recolhido até reabrir / fechar painel.
   */
  const [panelChromeDismissedForIsland, setPanelChromeDismissedForIsland] = useState(false);
  const panelSurfaceOpen = useMemo(
    () => (isDashboardOpen || isSettingsOpen) && !panelChromeDismissedForIsland,
    [isDashboardOpen, isSettingsOpen, panelChromeDismissedForIsland],
  );

  useEffect(() => {
    isDashboardOpenRef.current = isDashboardOpen;
    isSettingsOpenRef.current = isSettingsOpen;
  }, [isDashboardOpen, isSettingsOpen]);

  useEffect(() => {
    if (!isDashboardOpen && !isSettingsOpen) {
      setPanelChromeDismissedForIsland(false);
    }
  }, [isDashboardOpen, isSettingsOpen]);

  const [windowState, setWindowState] = useState<'maximized' | 'windowed'>('windowed');
  const [isLoaded, setIsLoaded] = useState(false);
  /** Full-screen notice while Windows Start menu is scanned for Main workspace (IPC can take several seconds). */
  const [startMenuResolving, setStartMenuResolving] = useState<{
    open: boolean;
    lang: Language;
  }>({ open: false, lang: 'pt' });

  // User / Auth State (Defaults to null)
  const [user, setUser] = useState<UserProfile | null>(null);

  // Alarm Ringing State
  const [alarmRinging, setAlarmRinging] = useState<{ alarm: Alarm; isPreview: boolean } | null>(null);
  const [snoozeWake, setSnoozeWake] = useState<{ alarm: Alarm; at: number } | null>(null);
  const stopAlarmAudioRef = useRef<(() => void) | null>(null);

  const [menuPosition, setMenuPosition] = useState<Coordinates>({ x: 0, y: 0 });
  /** Screen-space anchor for the radial center — keeps client coords correct after fullscreen + multi-monitor. */
  const menuAnchorScreenRef = useRef<{ x: number; y: number } | null>(null);
  const [triggerSource, setTriggerSource] = useState<'mmb' | 'shortcut'>('shortcut');
  /** Evita a ilha compacta aparecer no mesmo instante em que o radial ainda desvanece (flash do relógio do radial). */
  const [islandHoldAfterRadialClose, setIslandHoldAfterRadialClose] = useState(false);
  /** Evita repetir reapply quando já estamos em ilha de repouso; repõe ao sair do estado. */
  const prevIdleIslandHudRef = useRef(false);
  const prevIsMenuOpenRef = useRef(false);
  const [lastLaunched, setLastLaunched] = useState<AppItem | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isDesktopMode, setIsDesktopMode] = useState(false);
  /** Só montar a ilha depois de `setWindowSize('small')` com bounds do monitor — senão o hit-shape usa coords com a janela ainda em 1280×800 (dev). */
  const [electronSmallOverlayReady, setElectronSmallOverlayReady] = useState(false);
  const isDesktopModeRef = useRef(false);
  isDesktopModeRef.current = isDesktopMode;

  /** Após minimizar o painel, o primeiro `setWindowHitShape` pode usar `screenX/screenY` ainda do modo janela — o HWND encolhe ao sítio errado. Reforça overlay `small` no tick seguinte. (Deve ficar abaixo de `isDesktopMode` — senão ReferenceError quebra o render.) */
  const prevPanelChromeDismissedRef = useRef(false);
  useEffect(() => {
    const edge =
      panelChromeDismissedForIsland && !prevPanelChromeDismissedRef.current;
    prevPanelChromeDismissedRef.current = panelChromeDismissedForIsland;
    if (!edge || !isDesktopMode) return;
    const t = window.setTimeout(() => {
      void window.electron?.reapplySmallOverlay?.();
      void window.electron?.invalidatePaint?.();
    }, 100);
    return () => clearTimeout(t);
  }, [isDesktopMode, panelChromeDismissedForIsland]);

  /** Declared before handlers that resize the window — keeps IPC + React in sync. */
  const lastWindowState = useRef<'fullscreen' | 'windowed' | 'small' | null>(null);
  /** Após restaurar da minimização (dashboard→ilha), remonta o HUD para recalcular hit-shape e evitar o “salto” visual. */
  const [islandHudRemountKey, setIslandHudRemountKey] = useState(0);
  const pendingMinimizeIslandRemountRef = useRef(false);
  /**
   * Um commit antes de `setWindowSize('windowed')`: esconde a ilha no mesmo frame em que o painel abre no React,
   * para o DWM não redesenhar o relógio a “voar” para o rect da janela (o HWND muda antes do paint sem isto).
   */
  const [hideIslandForWindowedPanelTransition, setHideIslandForWindowedPanelTransition] = useState(false);

  /** Garante HWND em `windowed` quando o painel/definições estão visíveis (não minimizados). */
  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.setWindowSize) return;
    if (!panelSurfaceOpen) return;
    if (radialOpenAwaitingFullscreen) return;
    try {
      window.electron.setWindowSize('windowed');
      window.electron.showWindow();
      lastWindowState.current = 'windowed';
    } catch {
      /* ignore */
    } finally {
      queueMicrotask(() => setHideIslandForWindowedPanelTransition(false));
    }
  }, [isDesktopMode, panelSurfaceOpen, radialOpenAwaitingFullscreen]);

  useEffect(() => {
    if (!panelSurfaceOpen) {
      setHideIslandForWindowedPanelTransition(false);
    }
  }, [panelSurfaceOpen]);

  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.setWindowSize) {
      setElectronSmallOverlayReady(false);
      return;
    }
    /**
     * Com o radial aberto, `panelSurfaceOpen` fica falso (dashboard fechado no mesmo commit).
     * Sem este guard, aplicávamos `small` aqui e anulávamos o `fullscreen` do `openMenu` — o menu ficava no rect windowed.
     */
    if (isMenuOpen || radialOpenAwaitingFullscreen) {
      setElectronSmallOverlayReady(true);
      return;
    }
    /** Painel / definições visíveis em `windowed` — não forçar `small` aqui (evita sobrescrever o primeiro arranque). */
    if (panelSurfaceOpen) {
      setElectronSmallOverlayReady(true);
      return;
    }
    const { x: ax, y: ay } = windowCenterScreenPoint();
    window.electron.setWindowSize('small', { x: ax, y: ay });
    lastWindowState.current = 'small';
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        setElectronSmallOverlayReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
      setElectronSmallOverlayReady(false);
    };
  }, [isDesktopMode, panelSurfaceOpen, isMenuOpen, radialOpenAwaitingFullscreen]);

  const [isAppReady, setIsAppReady] = useState(true); // Defaults to true so initial loading works normally

  // State for Apps and Config (Defaults to initial constants)
  const [apps, setApps] = useState<AppItem[]>(MINIMAL_MAIN_WORKSPACE_APPS);

  const [config, setConfig] = useState<UIConfig>(DEFAULT_UI_CONFIG);
  const configRef = useRef(config);
  configRef.current = config;
  const targetWorkspaceIndexRef = useRef(config.activeWorkspaceIndex);
  targetWorkspaceIndexRef.current = config.activeWorkspaceIndex;
  const switchDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  /** Notas / alarmes / pomodoro / stopwatch em modo painel — não combinar com ilha de repouso (camadas z-index). */
  const anyFullscreenWidgetOpen =
    isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen;

  /** Faixas compactas + ilha de relógio opcional — mantém overlay visível em modo desktop quando aplicável. */
  const timerHudActive = compactTimerHudShouldShow(
    isPomodoroOpen,
    isStopwatchOpen,
    pomodoro.state,
    pomodoro.config,
    stopwatchHudSnap,
    isDesktopMode,
    isMenuOpen || radialOpenAwaitingFullscreen,
    config.deskIslandClockWhileIdle !== false,
    anyFullscreenWidgetOpen,
    isDashboardOpen || isSettingsOpen,
  );

  const prevTimerHudActiveRef = useRef(timerHudActive);
  /**
   * A ilha encolhe o HWND; já não enviamos `setWindowHitShape([])` ao desmontar (evita flash no main).
   * Quando o HUD compacto desliga sem ir para dashboard/radial, voltamos a aplicar overlay `small` em ecrã inteiro.
   */
  useLayoutEffect(() => {
    if (!isDesktopMode || !window.electron?.reapplySmallOverlay) {
      prevTimerHudActiveRef.current = timerHudActive;
      return;
    }
    const was = prevTimerHudActiveRef.current;
    if (was && !timerHudActive && !panelSurfaceOpen && !isMenuOpen && !radialOpenAwaitingFullscreen) {
      void window.electron.reapplySmallOverlay();
    }
    prevTimerHudActiveRef.current = timerHudActive;
  }, [isDesktopMode, timerHudActive, panelSurfaceOpen, isMenuOpen, radialOpenAwaitingFullscreen]);

  useEffect(() => {
    const wasOpen = prevIsMenuOpenRef.current;
    if (wasOpen && !isMenuOpen) {
      setIslandHoldAfterRadialClose(true);
      /** Alinhar à transição da ilha (~200ms) + 1 frame — evita aparecer antes do overlay `small` estabilizar. */
      const t = window.setTimeout(() => setIslandHoldAfterRadialClose(false), 380);
      prevIsMenuOpenRef.current = false;
      return () => clearTimeout(t);
    }
    prevIsMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen]);

  const [notes, setNotes] = useState<Note[]>([]);
  const defaultNoteWorkspace: NoteWorkspace = { id: 'default', name: 'Geral' };
  const [noteWorkspaces, setNoteWorkspaces] = useState<NoteWorkspace[]>([defaultNoteWorkspace]);
  const [activeNoteWorkspaceId, setActiveNoteWorkspaceId] = useState('default');
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  const alarmsRef = useRef<Alarm[]>(alarms);
  const alarmRingingRef = useRef(alarmRinging);
  const snoozeWakeRef = useRef(snoozeWake);
  /** Evita disparos duplicados no mesmo minuto (e contorna throttling de timers em segundo plano). */
  const lastScheduledAlarmSlotRef = useRef<string | null>(null);

  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);
  useEffect(() => {
    alarmRingingRef.current = alarmRinging;
  }, [alarmRinging]);
  useEffect(() => {
    snoozeWakeRef.current = snoozeWake;
  }, [snoozeWake]);

  /** Latest snapshot for flush on pagehide / sync disk write (survives reboot). */
  const persistenceRef = useRef({
    user: null as UserProfile | null,
    apps: MINIMAL_MAIN_WORKSPACE_APPS,
    config: DEFAULT_UI_CONFIG,
    notes: [] as Note[],
    alarms: [] as Alarm[],
    noteWorkspaces: [defaultNoteWorkspace] as NoteWorkspace[],
    activeNoteWorkspaceId: 'default',
  });
  useEffect(() => {
    persistenceRef.current = {
      user,
      apps,
      config,
      notes,
      alarms,
      noteWorkspaces,
      activeNoteWorkspaceId,
    };
  });

  /** Used by post-launch setTimeout — must never read stale React state or opening the dashboard after launching an app wrongly calls setWindowSize('small') (ignoreMouseEvents → "frozen" UI). */
  const electronShrinkGateRef = useRef({
    isNotesOpen: false,
    isPomodoroOpen: false,
    pomodoroEndOverlay: false as boolean,
    panelSurfaceOpen: false,
  });
  useEffect(() => {
    electronShrinkGateRef.current = {
      isNotesOpen,
      isPomodoroOpen,
      pomodoroEndOverlay: !!pomodoroEndOverlay,
      panelSurfaceOpen,
    };
  }, [isNotesOpen, isPomodoroOpen, pomodoroEndOverlay, panelSurfaceOpen]);

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

    // Version mismatch: clear stored exe icons so healing re-fetches them (skip URL favicons).
    setConfig(prev => {
      const clearIcons = (items: AppItem[]): AppItem[] =>
        items.map(item => ({
          ...item,
          customIconUrl:
            item.iconSource === 'native' &&
            !isWebShortcutItem(item) &&
            !isRemoteIconUrl(item.customIconUrl)
              ? undefined
              : item.customIconUrl,
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
    if (!window.electron?.getFileIcon && !window.electron?.getWebsiteFaviconDataUrl) return;

    const findMissingIcons = (items: AppItem[]): AppItem[] => {
      let missing: AppItem[] = [];
      const traverse = (list: AppItem[]) => {
        list.forEach(item => {
          const web = isWebShortcutItem(item);
          const iconStr = String(item.customIconUrl ?? '').trim();
          if (web && item.command?.trim()) {
            // Falta ícone ou só URL remota (renderer não mostra → migrar para data URL)
            if (!iconStr || isRemoteIconUrl(item.customIconUrl)) {
              missing.push(item);
            }
          } else if (
            item.iconSource === 'native' &&
            !item.customIconUrl &&
            item.command &&
            !web
          ) {
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
      /** Limits concurrent getFileIcon IPC (large configs used to spawn dozens at once and stall the UI). */
      const ICON_HEAL_BATCH = 5;
      const healRecursive = async (items: AppItem[]): Promise<AppItem[]> => {
        const out: AppItem[] = [];
        for (let i = 0; i < items.length; i += ICON_HEAL_BATCH) {
          const chunk = items.slice(i, i + ICON_HEAL_BATCH);
          const done = await Promise.all(
            chunk.map(async (item) => {
              let newItem = { ...item };
              const web = isWebShortcutItem(item);
              const iconStr = String(item.customIconUrl ?? '').trim();
              const webNeedsIcon =
                web &&
                item.command?.trim() &&
                (!iconStr || isRemoteIconUrl(item.customIconUrl));
              if (webNeedsIcon) {
                const iconFields = await resolveWebsiteIconFields(
                  item.command!.trim(),
                );
                const url = iconFields?.customIconUrl;
                if (url?.startsWith('data:')) {
                  newItem = { ...newItem, ...iconFields };
                  hasUpdates = true;
                } else if (!iconStr && url) {
                  newItem = { ...newItem, ...iconFields };
                  hasUpdates = true;
                }
              } else if (
                item.iconSource === 'native' &&
                !item.customIconUrl &&
                item.command &&
                !web &&
                window.electron?.getFileIcon
              ) {
                try {
                  const iconUrl = await window.electron.getFileIcon(
                    item.command,
                  );
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
            })
          );
          out.push(...done);
        }
        return out;
      };

      const updatedWorkspaces: Workspace[] = [];
      for (const ws of config.workspaces) {
        const newApps = await healRecursive(ws.apps);
        updatedWorkspaces.push({ ...ws, apps: newApps });
      }

      if (hasUpdates) {
        setConfig(prev => ({ ...prev, workspaces: updatedWorkspaces }));
      }
    };

    heal();
  }, [config.workspaces.length]); // Re-run mainly if workspaces are added/loaded


  // 1. PRIMARY PERSISTENCE: Load from Electron Main or Migrate from LocalStorage
  useEffect(() => {
    let discoveryDeferTimer: number | undefined;

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
        const noteWsStr = localStorage.getItem('zenith_note_workspaces');
        const activeWsStr = localStorage.getItem('zenith_active_note_workspace');

        if (userStr || appsStr || configStr || notesStr || alarmsStr || noteWsStr) {
          const parsedNotes: Note[] = notesStr ? JSON.parse(notesStr) : [];
          let parsedWs: NoteWorkspace[] = [defaultNoteWorkspace];
          try {
            if (noteWsStr) {
              const w = JSON.parse(noteWsStr) as NoteWorkspace[];
              if (Array.isArray(w) && w.length > 0) parsedWs = w;
            }
          } catch {
            /* keep default */
          }
          finalData = {
            user: userStr ? JSON.parse(userStr) : null,
            apps: appsStr ? JSON.parse(appsStr) : MINIMAL_MAIN_WORKSPACE_APPS,
            config: configStr ? JSON.parse(configStr) : DEFAULT_UI_CONFIG,
            notes: parsedNotes.map((n) => ({ ...n, workspaceId: n.workspaceId || 'default' })),
            alarms: alarmsStr ? JSON.parse(alarmsStr) : [],
            noteWorkspaces: parsedWs,
            activeNoteWorkspaceId:
              activeWsStr && parsedWs.some((w) => w.id === activeWsStr)
                ? activeWsStr
                : 'default',
          };
          // Save to main process immediately
          window.electron?.saveFullConfig(finalData);
        }
      }

      if (finalData) {
        // Older config-v2.json may omit note boards — recover from localStorage mirror
        try {
          const noteWsStr = localStorage.getItem('zenith_note_workspaces');
          const activeWsStr = localStorage.getItem('zenith_active_note_workspace');
          if (!finalData.noteWorkspaces?.length && noteWsStr) {
            const w = JSON.parse(noteWsStr) as NoteWorkspace[];
            if (Array.isArray(w) && w.length > 0) finalData.noteWorkspaces = w;
          }
          if (
            activeWsStr &&
            (finalData.noteWorkspaces as NoteWorkspace[] | undefined)?.some(
              (x) => x.id === activeWsStr,
            )
          ) {
            finalData.activeNoteWorkspaceId = activeWsStr;
          }
        } catch {
          /* ignore */
        }
      }

      let nextApps: AppItem[] = MINIMAL_MAIN_WORKSPACE_APPS;
      let nextConfig: UIConfig = DEFAULT_UI_CONFIG;

      if (finalData) {
        if (finalData.apps) nextApps = finalData.apps;
        if (finalData.config) {
          nextConfig = {
            ...finalData.config,
            gameMode: {
              ...DEFAULT_UI_CONFIG.gameMode,
              ...(finalData.config.gameMode || {}),
            },
          };
        }
      }

      const mainWs = nextConfig.workspaces.find(
        (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
      );
      const lsDiscoveryDone = localStorage.getItem(LS_MAIN_DISCOVERY_DONE) === 'true';
      const legacyOnboardingDone = localStorage.getItem(LS_ZENITH_INITIALIZED_LEGACY);
      const hasDemoFingerprint = mainWs ? workspaceContainsBundledDemoApp(mainWs) : false;
      const mainIsEmpty = !!(mainWs && mainWs.apps.length === 0);
      const canDiscover = !!window.electron?.getStartupApps;
      const mainCustom = mainWorkspaceAlreadyCustomized(mainWs);
      /** Disco + heurística: evita re-scan quando só o localStorage foi limpo (ex.: sessão Electron). */
      let discoveryDoneEffective =
        lsDiscoveryDone ||
        nextConfig.mainStartMenuDiscoveryDone === true ||
        mainCustom;
      if (mainCustom && nextConfig.mainStartMenuDiscoveryDone !== true) {
        nextConfig = { ...nextConfig, mainStartMenuDiscoveryDone: true };
        discoveryDoneEffective = true;
      }

      /** Main só com widgets Zenith (ex.: Notes) ainda não passou pelo scan do Menu Iniciar — não é “vazio” nem usa IDs do demo embutido. */
      const mainAwaitingStartMenuBootstrap =
        !mainCustom &&
        nextConfig.mainStartMenuDiscoveryDone !== true;

      const shouldTryStartMenuIpc =
        canDiscover &&
        !discoveryDoneEffective &&
        !legacyOnboardingDone &&
        (hasDemoFingerprint || mainIsEmpty || mainAwaitingStartMenuBootstrap);

      const stripMainToZenithOnly = () => {
        const mi = nextConfig.workspaces.findIndex(
          (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
        );
        if (mi === -1) return;
        const workspaces = [...nextConfig.workspaces];
        workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
        nextConfig = { ...nextConfig, workspaces };
      };

      if (shouldTryStartMenuIpc) {
        if (hasDemoFingerprint) {
          stripMainToZenithOnly();
        } else if (mainIsEmpty) {
          const miEmpty = nextConfig.workspaces.findIndex(
            (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
          );
          if (miEmpty !== -1) {
            const workspaces = [...nextConfig.workspaces];
            workspaces[miEmpty] = { ...workspaces[miEmpty], apps: MINIMAL_MAIN_WORKSPACE_APPS };
            nextConfig = { ...nextConfig, workspaces };
          }
        }

        const discoverHasDemoFingerprint = hasDemoFingerprint;
        const uiLangDeferred = (nextConfig.language || 'pt') as Language;

        discoveryDeferTimer = window.setTimeout(() => {
          void (async () => {
            flushSync(() =>
              setStartMenuResolving({ open: true, lang: uiLangDeferred }),
            );
            const mainIdx = configRef.current.workspaces.findIndex(
              (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
            );
            try {
              const discovered = (await window.electron!.getStartupApps()) as StartMenuDiscoveryRow[];
              if (discovered?.length > 0 && mainIdx !== -1) {
                const mergedApps = await buildMainAppsFromStartMenuDiscovery(discovered);
                setConfig((prev) => {
                  const workspaces = [...prev.workspaces];
                  workspaces[mainIdx] = { ...workspaces[mainIdx], apps: mergedApps };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
              } else if (discoverHasDemoFingerprint) {
                setConfig((prev) => {
                  const mi = prev.workspaces.findIndex(
                    (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
                  );
                  if (mi === -1) return prev;
                  const workspaces = [...prev.workspaces];
                  workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
              }
            } catch (e) {
              console.warn('[Zenith] Start Menu discovery failed:', e);
              if (discoverHasDemoFingerprint) {
                setConfig((prev) => {
                  const mi = prev.workspaces.findIndex(
                    (ws) => ws.id === 'workspace-1' || ws.name === 'Main',
                  );
                  if (mi === -1) return prev;
                  const workspaces = [...prev.workspaces];
                  workspaces[mi] = { ...workspaces[mi], apps: MINIMAL_MAIN_WORKSPACE_APPS };
                  return { ...prev, workspaces, mainStartMenuDiscoveryDone: true };
                });
              }
            } finally {
              flushSync(() =>
                setStartMenuResolving({ open: false, lang: uiLangDeferred }),
              );
              localStorage.setItem(LS_MAIN_DISCOVERY_DONE, 'true');
              setConfig((prev) =>
                prev.mainStartMenuDiscoveryDone === true
                  ? prev
                  : { ...prev, mainStartMenuDiscoveryDone: true },
              );
            }
          })();
        }, START_MENU_DISCOVERY_DEFER_MS);
      } else if (!lsDiscoveryDone && discoveryDoneEffective) {
        localStorage.setItem(LS_MAIN_DISCOVERY_DONE, 'true');
      }

      if (finalData) {
        if (finalData.user) setUser(finalData.user);
        if (finalData.apps) setApps(finalData.apps);
        setConfig(nextConfig);
        if (finalData.notes) {
          setNotes(
            (finalData.notes as Note[]).map((n) => ({
              ...n,
              workspaceId: n.workspaceId || 'default',
            })),
          );
        }
        if (finalData.noteWorkspaces?.length) {
          setNoteWorkspaces(finalData.noteWorkspaces);
        }
        if (
          finalData.activeNoteWorkspaceId &&
          (finalData.noteWorkspaces as NoteWorkspace[] | undefined)?.some(
            (w) => w.id === finalData.activeNoteWorkspaceId,
          )
        ) {
          setActiveNoteWorkspaceId(finalData.activeNoteWorkspaceId);
        }
        if (finalData.alarms) setAlarms(finalData.alarms);
      } else {
        setApps(nextApps);
        setConfig(nextConfig);
      }
      setIsLoaded(true);
    };

    void loadPersistence();
    return () => {
      if (discoveryDeferTimer !== undefined) {
        window.clearTimeout(discoveryDeferTimer);
      }
    };
  }, []);

  /** Modo jogo vive no main (`shouldOpenMenu`); antes só mandávamos IPC na montagem — antes do config carregar do disco. */
  useEffect(() => {
    if (!window.electron?.setGameMode || !isLoaded) return;
    window.electron.setGameMode(config.gameMode ?? DEFAULT_UI_CONFIG.gameMode);
  }, [
    isLoaded,
    config.gameMode?.enabled,
    config.gameMode?.mode,
    config.gameMode?.blockedApps,
  ]);

  // 2. UNIFIED SAVE EFFECT: Sync to Main Process and LocalStorage (disk + LS mirror survives reboot)
  useEffect(() => {
    if (!isLoaded) return;

    const timer = setTimeout(() => {
      const fullData = {
        user,
        apps,
        config,
        notes,
        alarms,
        noteWorkspaces,
        activeNoteWorkspaceId,
      };

      localStorage.setItem('zenith_user', JSON.stringify(user));
      localStorage.setItem('zenith_apps', JSON.stringify(apps));
      localStorage.setItem('zenith_config', JSON.stringify(config));
      localStorage.setItem('zenith_notes', JSON.stringify(notes));
      localStorage.setItem('zenith_alarms', JSON.stringify(alarms));
      localStorage.setItem('zenith_note_workspaces', JSON.stringify(noteWorkspaces));
      localStorage.setItem('zenith_active_note_workspace', activeNoteWorkspaceId);

      if (window.electron?.saveFullConfig) {
        window.electron.saveFullConfig(fullData);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [user, apps, config, notes, alarms, noteWorkspaces, activeNoteWorkspaceId, isLoaded]);

  /** Flush before exit / background so the last edit is not lost (debounce skipped). */
  useEffect(() => {
    if (!isLoaded) return;

    const flushToDisk = () => {
      const d = persistenceRef.current;
      const fullData = {
        user: d.user,
        apps: d.apps,
        config: d.config,
        notes: d.notes,
        alarms: d.alarms,
        noteWorkspaces: d.noteWorkspaces,
        activeNoteWorkspaceId: d.activeNoteWorkspaceId,
      };
      try {
        localStorage.setItem('zenith_user', JSON.stringify(d.user));
        localStorage.setItem('zenith_apps', JSON.stringify(d.apps));
        localStorage.setItem('zenith_config', JSON.stringify(d.config));
        localStorage.setItem('zenith_notes', JSON.stringify(d.notes));
        localStorage.setItem('zenith_alarms', JSON.stringify(d.alarms));
        localStorage.setItem('zenith_note_workspaces', JSON.stringify(d.noteWorkspaces));
        localStorage.setItem('zenith_active_note_workspace', d.activeNoteWorkspaceId);
      } catch (e) {
        console.warn('localStorage flush failed', e);
      }
      if (window.electron?.saveFullConfigSync) {
        window.electron.saveFullConfigSync(fullData);
      } else if (window.electron?.saveFullConfig) {
        window.electron.saveFullConfig(fullData);
      }
    };

    const onPageHide = () => flushToDisk();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushToDisk();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoaded]);

  const normalizeAlarmTime = (t: string) => {
    const parts = t.trim().split(':');
    if (parts.length < 2) return t;
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  };

  // ALARM: soneca + horário (1 tick/s; dedupe por minuto — não depende só do segundo 0)
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nowMs = now.getTime();
      const ringing = alarmRingingRef.current;
      const snooze = snoozeWakeRef.current;

      if (snooze && nowMs >= snooze.at && !ringing) {
        lastScheduledAlarmSlotRef.current = null;
        setAlarmRinging({ alarm: snooze.alarm, isPreview: false });
        setSnoozeWake(null);
        return;
      }

      if (ringing) return;

      const hh = now.getHours().toString().padStart(2, '0');
      const mm = now.getMinutes().toString().padStart(2, '0');
      const currentTimeString = `${hh}:${mm}`;
      const dow = now.getDay();
      const list = alarmsRef.current;

      const matched = list.find((a) => {
        if (!a.enabled) return false;
        if (normalizeAlarmTime(a.time) !== currentTimeString) return false;
        if (a.days && a.days.length > 0 && !a.days.includes(dow)) return false;
        return true;
      });

      if (!matched) return;

      const slotKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hh}-${mm}-${matched.id}`;
      if (lastScheduledAlarmSlotRef.current === slotKey) return;
      lastScheduledAlarmSlotRef.current = slotKey;
      setAlarmRinging({ alarm: matched, isPreview: false });
    };

    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, []);

  // Garantir janela visível em fullscreen quando o alarme real toca (modo desktop / janela oculta)
  useEffect(() => {
    if (!alarmRinging || alarmRinging.isPreview) return;
    if (!isDesktopMode || !window.electron) return;
    window.electron.showWindow();
    window.electron.setWindowSize('fullscreen', windowCenterScreenPoint());
  }, [alarmRinging, isDesktopMode]);

  useEffect(() => {
    if (!pomodoroEndOverlay) return;
    if (!isDesktopMode || !window.electron) return;
    window.electron.showWindow();
    window.electron.setWindowSize('fullscreen', windowCenterScreenPoint());
  }, [pomodoroEndOverlay, isDesktopMode]);

  useEffect(() => {
    if (alarmRinging) {
      stopAlarmAudioRef.current = startAlarmRingtone();
      return () => {
        stopAlarmAudioRef.current?.();
        stopAlarmAudioRef.current = null;
      };
    }
    stopAlarmAudioRef.current?.();
    stopAlarmAudioRef.current = null;
    return undefined;
  }, [alarmRinging]);

  const lastMiddleClickTime = useRef<number>(0);
  const isHolding = useRef(false);

  // Listen for Google Auth Success
  useEffect(() => {
    if (window.electron?.onGoogleAuthSuccess) {
      return window.electron.onGoogleAuthSuccess((authData: any) => {
        const trialDate = new Date();
        trialDate.setDate(trialDate.getDate() + 7);

        const newUser: UserProfile = {
          id: authData.isAdmin ? 'admin-001' : crypto.randomUUID(),
          name: authData.name,
          email: authData.email,
          isPremium: authData.isPremium,
          isAdmin: authData.isAdmin,
          planTier: authData.planTier ?? (authData.isPremium ? 'pro' : 'free'),
          trialEndsAt: trialDate.toISOString(),
          avatarUrl: authData.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(authData.name)}&background=0D8ABC&color=fff`,
        };
        flushSync(() => {
          setUser(newUser);
          setHideIslandForWindowedPanelTransition(true);
          setPanelChromeDismissedForIsland(false);
          setIsDashboardOpen(true);
        });
      });
    }
  }, []);



  // Window State Management (Interactable vs Passive)
  // TRACK WINDOW STATE TO PREVENT REDUNDANT IPC CALLS (Reduces Lag/Flicker)
  const lastVisibility = useRef<boolean | null>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);
  /** Used to ignore double-clicks right after the radial closes (otherwise dblclick sees isMenuOpen false and opens Settings). */
  const menuJustClosedAtRef = useRef(0);
  const prevIsMenuOpenForCloseRef = useRef(false);
  /** Após fechar widget Pomodoro/Stopwatch com HUD ainda visível — re-aplica overlay `small` no processo principal (Windows). */
  const wasPomodoroOrStopwatchWidgetOpenRef = useRef(false);
  /** OS hid the window (Alt+F4 / close) while React still had dashboard/widgets "open" — sync refs before state so we don't schedule hideWindow twice. */
  const syncAfterMainWindowHidRef = useRef<() => void>(() => {});
  useEffect(() => {
    syncAfterMainWindowHidRef.current = () => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      lastVisibility.current = false;
      lastWindowState.current = 'small';
      setIsMenuOpen(false);
      setIsSettingsOpen(false);
      setIsDashboardOpen(false);
      setIsNotesOpen(false);
      setIsAlarmWidgetOpen(false);
      setIsStopwatchOpen(false);
      setIsPomodoroOpen(false);
      setAlarmRinging(null);
      setPomodoroEndOverlay(null);
      setPanelChromeDismissedForIsland(false);
      setRadialOpenAwaitingFullscreen(false);
      setMinimizeNeutralCoverActive(false);
      setRadialPreShowSolidCover(false);
    };
  });

  useEffect(() => {
    if (prevIsMenuOpenForCloseRef.current && !isMenuOpen) {
      menuJustClosedAtRef.current = Date.now();
    }
    prevIsMenuOpenForCloseRef.current = isMenuOpen;
  }, [isMenuOpen]);

  useEffect(() => {
    if (window.electron && isDesktopMode) {
      /** Inclui dashboard/definições “lógicos” mesmo minimizados — evita `hideWindow` a achar que não há UI ativa. */
      const isAnyInteractive =
        isMenuOpen ||
        radialOpenAwaitingFullscreen ||
        isDashboardOpen ||
        isSettingsOpen ||
        isNotesOpen ||
        isAlarmWidgetOpen ||
        isStopwatchOpen ||
        isPomodoroOpen ||
        !!alarmRinging ||
        !!pomodoroEndOverlay ||
        timerHudActive;

      const visibilityChanged = lastVisibility.current !== isAnyInteractive;

      /**
       * Com o radial aberto, não aplicar `windowed`/`small` aqui (ordem com fecho do dashboard deixava
       * `lastWindowState` ou o HWND desalinhados — o menu aparecia no tamanho do painel).
       */
      if (isMenuOpen || radialOpenAwaitingFullscreen) {
        if (lastWindowState.current !== 'fullscreen') {
          window.electron.setWindowSize('fullscreen', windowCenterScreenPoint());
          lastWindowState.current = 'fullscreen';
        }
        if (visibilityChanged) {
          if (isAnyInteractive) {
            if (hideTimeout.current) {
              clearTimeout(hideTimeout.current);
              hideTimeout.current = null;
            }
            window.electron.showWindow();
          } else {
            hideTimeout.current = setTimeout(() => {
              window.electron.hideWindow();
            }, 300);
          }
          lastVisibility.current = isAnyInteractive;
        }
        return;
      }

      /** Overlay passivo `small` (ecrã inteiro + forward); widgets fullscreen usam `applyWindowSize`. */
      const targetMode: 'fullscreen' | 'windowed' | 'small' = (
        isNotesOpen ||
        isAlarmWidgetOpen ||
        isStopwatchOpen ||
        isPomodoroOpen ||
        !!alarmRinging ||
        !!pomodoroEndOverlay
      )
        ? 'fullscreen'
        : panelSurfaceOpen
          ? 'windowed'
          : 'small';

      const modeChanged = lastWindowState.current !== targetMode;

      let modeResizeHandled = false;

      // 1. Mode changes while visible (not switching to passive "small" overlay).
      //    Always resize directly — never use hideWindow() here. The old "dip" path hit transitions
      //    like small → windowed (after closing the radial menu) and null → windowed, caused
      //    intermittent fullscreen / no-click bugs on the next open-settings.
      const modeAnchor =
        targetMode === 'windowed' ? undefined : windowCenterScreenPoint();

      if (modeChanged && lastVisibility.current && isAnyInteractive && targetMode !== 'small') {
        window.electron.setWindowSize(targetMode, modeAnchor);
        lastWindowState.current = targetMode;
        modeResizeHandled = true;
      }

      // 2. Standard mode update (non-flicker-prone or hidden)
      if (modeChanged && !modeResizeHandled) {
        window.electron.setWindowSize(targetMode, modeAnchor);
        lastWindowState.current = targetMode;
      }

      // 3. Standard visibility update
      if (visibilityChanged) {
        if (isAnyInteractive) {
          if (hideTimeout.current) {
            clearTimeout(hideTimeout.current);
            hideTimeout.current = null;
          }
          window.electron.showWindow();
        } else {
          hideTimeout.current = setTimeout(() => {
            window.electron.hideWindow();
          }, 300); // allow exit animations to complete
        }
        lastVisibility.current = isAnyInteractive;
      }
    }
  }, [
    isMenuOpen,
    radialOpenAwaitingFullscreen,
    isDashboardOpen,
    isSettingsOpen,
    isNotesOpen,
    isAlarmWidgetOpen,
    isStopwatchOpen,
    isPomodoroOpen,
    alarmRinging,
    pomodoroEndOverlay,
    isDesktopMode,
    timerHudActive,
    panelSurfaceOpen,
  ]);

  useEffect(() => {
    const open = isPomodoroOpen || isStopwatchOpen;
    const prev = wasPomodoroOrStopwatchWidgetOpenRef.current;

    if (prev && !open && window.electron?.reapplySmallOverlay && isDesktopMode && timerHudActive) {
      const id = requestAnimationFrame(() => {
        void window.electron?.reapplySmallOverlay?.();
      });
      wasPomodoroOrStopwatchWidgetOpenRef.current = open;
      return () => cancelAnimationFrame(id);
    }
    wasPomodoroOrStopwatchWidgetOpenRef.current = open;
  }, [isPomodoroOpen, isStopwatchOpen, timerHudActive, isDesktopMode]);

  /**
   * Arranque a frio (npm start / início do Windows): o BrowserWindow nasce em rect “windowed” e o primeiro
   * `setWindowSize('small')` pode ficar desincronizado do DWM até haver um ciclo forte (abrir o radial fazia isso).
   * Ao entrar pela primeira vez no estado “ilha de repouso” visível, reforçamos o overlay `small` no main.
   */
  useEffect(() => {
    if (!window.electron?.reapplySmallOverlay) return;
    const wantsIdleIslandHud =
      isDesktopMode &&
      electronSmallOverlayReady &&
      timerHudActive &&
      !panelSurfaceOpen &&
      !isMenuOpen &&
      !radialOpenAwaitingFullscreen;
    const wasIdle = prevIdleIslandHudRef.current;
    prevIdleIslandHudRef.current = wantsIdleIslandHud;
    if (!wantsIdleIslandHud) return;
    if (wasIdle) return;

    const t = window.setTimeout(() => {
      void window.electron?.reapplySmallOverlay?.();
      void window.electron?.invalidatePaint?.();
    }, 320);
    return () => clearTimeout(t);
  }, [
    isDesktopMode,
    electronSmallOverlayReady,
    timerHudActive,
    panelSurfaceOpen,
    isMenuOpen,
    radialOpenAwaitingFullscreen,
  ]);

  const openMenu = async (
    x: number,
    y: number,
    source: 'mmb' | 'shortcut' = 'shortcut',
    /** IPC sends screen coords from the main process; MMB uses client coords relative to the current window. */
    coordSpace: 'client' | 'screen' = 'client',
  ) => {
    console.warn(`[App.tsx] openMenu. Source: ${source}, index: ${config.activeWorkspaceIndex}, wsLength: ${config.workspaces?.length}`);

    const fixed = configRef.current.fixedPosition;
    if (fixed) {
      menuAnchorScreenRef.current = null;
    } else if (coordSpace === 'screen') {
      menuAnchorScreenRef.current = { x, y };
    } else {
      menuAnchorScreenRef.current = {
        x: window.screenX + x,
        y: window.screenY + y,
      };
    }

    const anchorForFullscreen: { x: number; y: number } = fixed
      ? {
          x: window.screenX + window.innerWidth / 2,
          y: window.screenY + window.innerHeight / 2,
        }
      : (menuAnchorScreenRef.current ?? {
          x: window.screenX + window.innerWidth / 2,
          y: window.screenY + window.innerHeight / 2,
        });

    flushSync(() => {
      setRadialOpenAwaitingFullscreen(true);
      setMinimizeNeutralCoverActive(false);
      /** Manter `radialPreShowSolidCover` até ao 2.º flush — senão o `show()` do main pode ocorrer durante o `await` e expor a textura antiga. */
    });

    try {
    /** `applyWindowSize` (invoke) garante que o main aplicou fullscreen antes do flushSync — evita 1.º paint ainda em rect windowed. */
    if (isDesktopModeRef.current && window.electron) {
      try {
        if (window.electron.applyWindowSize) {
          await window.electron.applyWindowSize('fullscreen', anchorForFullscreen);
        } else {
          window.electron.setWindowSize('fullscreen', anchorForFullscreen);
        }
      } catch {
        try {
          window.electron.setWindowSize('fullscreen', anchorForFullscreen);
        } catch {
          /* ignore */
        }
      }
      lastWindowState.current = 'fullscreen';
    }

    flushSync(() => {
      setRadialOpenAwaitingFullscreen(false);
      setRadialPreShowSolidCover(false);
      setIsSettingsOpen(false);
      setIsMenuOpen(true);
      setIsDashboardOpen(false);
      setTriggerSource(source);
      if (fixed) {
        setMenuPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
      } else if (isDesktopModeRef.current && menuAnchorScreenRef.current) {
        const a = menuAnchorScreenRef.current;
        setMenuPosition({
          x: a.x - window.screenX,
          y: a.y - window.screenY,
        });
      } else {
        setMenuPosition({ x, y });
      }
    });

    // Always call show-window when running under Electron — do not gate on isDesktopMode (it is still false for
    // one frame after load; main already set native opacity 0 in showMenuAtCursor).
    if (window.electron) {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      window.electron.showWindow();
      lastVisibility.current = true;
      /** Evitar `invalidatePaint` ao abrir — no Windows costuma causar um flash (dashboard/textura antiga) logo após o radial aparecer. */
    }

    isHolding.current = true;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Do not dip window opacity to 0 here — show-window already sets opacity 1 in main. A 0 → rAF → 1
    // sequence left the BrowserWindow stuck invisible on some systems (clicks still hit; radial UI gone).
    } catch (e) {
      flushSync(() => {
        setRadialOpenAwaitingFullscreen(false);
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
      });
      throw e;
    }
  };

  /** Pinta um frame neutro antes de `minimize()` para o snapshot do Windows não ser o dashboard (flash ao abrir radial depois). */
  const flushNeutralFrameThenMinimize = useCallback(() => {
    if (!window.electron?.minimizeWindow) return;
    flushSync(() => setMinimizeNeutralCoverActive(true));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.electron!.minimizeWindow();
      });
    });
  }, []);

  const openMenuRef = useRef(openMenu);
  openMenuRef.current = openMenu;

  // After setBounds(fullscreen), inner/outer window metrics update a frame late — re-map screen anchor → client so the radial is not clipped (multi-monitor / half-screen).
  const syncMenuPositionFromAnchor = useCallback(() => {
    if (configRef.current.fixedPosition) {
      setMenuPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      return;
    }
    const ax = menuAnchorScreenRef.current;
    if (ax) {
      setMenuPosition({
        x: ax.x - window.screenX,
        y: ax.y - window.screenY,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isMenuOpen || !isDesktopMode) return;
    syncMenuPositionFromAnchor();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        syncMenuPositionFromAnchor();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [isMenuOpen, isDesktopMode, syncMenuPositionFromAnchor]);

  useEffect(() => {
    if (!isMenuOpen || !isDesktopMode) return;

    const sync = () => {
      syncMenuPositionFromAnchor();
    };

    sync();
    let rafB = 0;
    const rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(sync);
    });
    window.addEventListener('resize', sync);
    return () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
      window.removeEventListener('resize', sync);
    };
  }, [isMenuOpen, isDesktopMode, syncMenuPositionFromAnchor]);

  /** Repaint só ao fechar o radial — invalidate ao abrir piscava o frame (dashboard→fullscreen) no Windows. */
  const prevIsMenuOpenForPaintRef = useRef(isMenuOpen);
  useEffect(() => {
    if (!window.electron?.invalidatePaint) return;
    const was = prevIsMenuOpenForPaintRef.current;
    prevIsMenuOpenForPaintRef.current = isMenuOpen;
    const closing = was && !isMenuOpen;
    if (!closing) return;
    const t = window.setTimeout(() => {
      void window.electron?.invalidatePaint?.();
    }, 220);
    return () => clearTimeout(t);
  }, [isMenuOpen]);

  // IPC: menu / dashboard / settings — must run after openMenu exists; use openMenuRef so handler always calls latest openMenu.
  useEffect(() => {
    const hasRunBefore = localStorage.getItem('zenith_first_run_complete');
    if (window.electron) {
      flushSync(() => {
        setIsDesktopMode(true);
        if (!hasRunBefore) {
          setHideIslandForWindowedPanelTransition(true);
          setIsDashboardOpen(true);
        }
      });
    } else {
      flushSync(() => {
        if (!hasRunBefore) {
          setHideIslandForWindowedPanelTransition(true);
          setIsDashboardOpen(true);
        }
      });
    }

    const cleanupMenu = window.electron?.onOpenMenu((data: { x: number, y: number, source?: 'mmb' | 'shortcut' }) => {
      void openMenuRef.current(data.x, data.y, data.source ?? 'shortcut', 'screen');
    });

    const cleanupPrepareRadial = window.electron?.onPrepareRadialShow?.(() => {
      flushSync(() => setRadialPreShowSolidCover(true));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.electron?.notifyRadialPrepPaintDone?.();
        });
      });
    });

    const cleanupDashboard = window.electron?.onOpenDashboard(() => {
      flushSync(() => {
        setHideIslandForWindowedPanelTransition(true);
        setPanelChromeDismissedForIsland(false);
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
        setIsSettingsOpen(false);
        setIsDashboardOpen(true);
      });
      window.electron?.showWindow();
    });

    const cleanupSettings = window.electron?.onOpenSettings(() => {
      flushSync(() => {
        setHideIslandForWindowedPanelTransition(true);
        setPanelChromeDismissedForIsland(false);
        setIsMenuOpen(false);
        setIsSettingsOpen(true);
        setIsDashboardOpen(true);
      });
      window.electron?.showWindow();
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

    const cleanupWindowHidToTray = window.electron?.onWindowHidToTray(() => {
      syncAfterMainWindowHidRef.current();
    });

    const cleanupMainWindowMinimized = window.electron?.onMainWindowMinimized?.(({ minimized }) => {
      if (minimized) {
        setMinimizeNeutralCoverActive(false);
        setRadialPreShowSolidCover(false);
      }
      if (
        minimized &&
        (isDashboardOpenRef.current || isSettingsOpenRef.current)
      ) {
        setPanelChromeDismissedForIsland(true);
        pendingMinimizeIslandRemountRef.current = true;
      } else if (!minimized && pendingMinimizeIslandRemountRef.current) {
        pendingMinimizeIslandRemountRef.current = false;
        setIslandHudRemountKey((k) => k + 1);
      }
    });

    const cleanupNativeDisplayRestored =
      window.electron?.onWindowNativeDisplayRestored?.((payload: {
        mode: 'small' | 'fullscreen' | 'windowed';
      }) => {
        const m = payload?.mode;
        if (m !== 'fullscreen' && m !== 'windowed' && m !== 'small') return;
        const anchor = m === 'windowed' ? undefined : windowCenterScreenPoint();
        window.electron?.setWindowSize(m, anchor);
        window.electron?.showWindow();
        lastWindowState.current = m;
      });

    if (!hasRunBefore) {
      localStorage.setItem('zenith_first_run_complete', 'true');
    }

    return () => {
      cleanupMenu?.();
      cleanupPrepareRadial?.();
      cleanupDashboard?.();
      cleanupSettings?.();
      cleanupWindowState?.();
      cleanupMouseUp?.();
      cleanupExecutionError?.();
      cleanupWindowHidToTray?.();
      cleanupMainWindowMinimized?.();
      cleanupNativeDisplayRestored?.();
    };
  }, []);

  // Workspace Switching Handler (Debounced)
  // Uses a debounce so that rapid presses collapse into a single switch
  // to the LAST pressed workspace after 80ms of inactivity — no flickering.
  const handleWorkspaceSwitch = React.useCallback((workspaceIndex: number) => {
    const configData = configRef.current;
    
    if (workspaceIndex < 0 || workspaceIndex >= configData.workspaces.length) {
      console.warn(`[App.tsx] Invalid workspace index requested: ${workspaceIndex}. Total workspaces: ${configData.workspaces.length}`);
      return;
    }

    const workspace = configData.workspaces[workspaceIndex];
    if (!workspace || !workspace.enabled) {
      console.warn(`[App.tsx] Cannot switch to disabled or non-existent workspace: ${workspaceIndex}`);
      return;
    }

    // Update the target ref synchronously so repeated presses to same workspace are a no-op
    if (workspaceIndex === targetWorkspaceIndexRef.current) return;
    
    console.warn(`[App.tsx] Proceeding with workspace switch to: ${workspace.name} (Index: ${workspaceIndex})`);
    targetWorkspaceIndexRef.current = workspaceIndex;

    // Cancel any pending switch and restart the debounce window
    if (switchDebounceTimer.current) {
      clearTimeout(switchDebounceTimer.current);
    }

    switchDebounceTimer.current = setTimeout(() => {
      setConfig(prev => ({
        ...prev,
        activeWorkspaceIndex: targetWorkspaceIndexRef.current
      }));
      switchDebounceTimer.current = null;
    }, 80); // 80ms: imperceptible for single presses, collapses rapid sequences into one switch
  }, []);

  // Workspace switch IPC listener — ISOLATED in its own stable effect
  // CRITICAL: NOT inside [isSettingsOpen, isDashboardOpen] effect — that effect re-runs on settings/dashboard
  // changes and would accumulate multiple IPC listeners, causing 2-3x fires per keypress (the flicker root cause).
  useEffect(() => {
    const cleanup = window.electron?.onSwitchWorkspace((index: number) => {
      console.warn(`[App.tsx] switch-workspace IPC received for index: ${index}`);
      handleWorkspaceSwitch(index);
    });
    return () => cleanup?.();
  }, [handleWorkspaceSwitch]);

  // STABLE KEYBOARD LISTENER - PARENT LEVEL (Robust Fallback for Production)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle numeric keys if menu is open
      if (!isMenuOpen) return;

      if (configRef.current.workspaceSwitchMode === 'picker') return;

      // Log the event as warn so it shows in diagnostic.log in production
      console.warn(`[App.tsx] Local keyboard event: key=${e.key}, code=${e.code}`);

      let num = parseInt(e.key);
      
      // Fallback to e.code for different keyboard layouts (Digit1, Digit2, etc.)
      if (isNaN(num) && e.code && e.code.startsWith('Digit')) {
        num = parseInt(e.code.replace('Digit', ''));
      }

      if (!isNaN(num) && num >= 1 && num <= 9) {
        console.warn(`[App.tsx] Valid numeric key detected: ${num}. Switching...`);
        e.preventDefault();
        e.stopPropagation();
        handleWorkspaceSwitch(num - 1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
  }, [isMenuOpen, handleWorkspaceSwitch]);

  // Centralized function to open settings and handle dashboard logic
  const handleOpenSettings = () => {
    flushSync(() => {
      if (isMenuOpen) setIsMenuOpen(false);
      setHideIslandForWindowedPanelTransition(true);
      setPanelChromeDismissedForIsland(false);
      setIsSettingsOpen(true);
      setIsDashboardOpen(true);
    });
    if (isDesktopMode) window.electron?.showWindow();
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) { // Botão do meio
      e.preventDefault();
      void openMenu(e.clientX, e.clientY, 'mmb', 'client');
    }
  };

  // Double Click (Left) to Open Settings — não dispara com widgets / alarme / overlay abertos
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (Date.now() - menuJustClosedAtRef.current < 650) {
      return;
    }
    if (
      !isMenuOpen &&
      !radialOpenAwaitingFullscreen &&
      !isSettingsOpen &&
      !isNotesOpen &&
      !isPomodoroOpen &&
      !isAlarmWidgetOpen &&
      !isStopwatchOpen &&
      !alarmRinging &&
      !pomodoroEndOverlay
    ) {
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

  const executeAction = (
    command: string,
    commandType: "app" | "url" | "folder",
    itemForToast?: AppItem,
    options?: { openTerminal?: boolean; terminalCommands?: string[] }
  ) => {
    // console.log("🚀 Zenith executing:", command, "Type:", commandType, itemForToast);
    if (!command) {
      console.warn("Attempted to execute an empty command");
      return;
    }

    if (command === 'internal:notes') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen', windowCenterScreenPoint()); setIsNotesOpen(true); return; }
    if (command === 'internal:alarm') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen', windowCenterScreenPoint()); setIsAlarmWidgetOpen(true); return; }
    if (command === 'internal:stopwatch') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen', windowCenterScreenPoint()); setIsStopwatchOpen(true); return; }
    if (command === 'internal:pomodoro') { if (isDesktopMode) window.electron?.setWindowSize('fullscreen', windowCenterScreenPoint()); setIsPomodoroOpen(true); return; }

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
        const g = electronShrinkGateRef.current;
        if (
          !g.isNotesOpen &&
          !g.isPomodoroOpen &&
          !g.pomodoroEndOverlay &&
          !g.panelSurfaceOpen
        ) {
          window.electron?.setWindowSize('small', windowCenterScreenPoint());
          // Unified visibility effect will handle hiding automatically based on state
        }
      }, 1000);
    }
  };

  const executeActionRef = useRef(executeAction);
  executeActionRef.current = executeAction;

  const handleMenuClose = useCallback((selectedId: string | null, selectedApp?: AppItem | null) => {
    setIsMenuOpen(false);
    setRadialOpenAwaitingFullscreen(false);
    setRadialPreShowSolidCover(false);
    isHolding.current = false;

    const cfg = configRef.current;
    const currentWorkspaceApps = cfg.workspaces[cfg.activeWorkspaceIndex]?.apps || apps;

    if (
      !selectedId &&
      isDesktopMode &&
      !panelSurfaceOpen &&
      !isNotesOpen &&
      !isPomodoroOpen &&
      !alarmRinging &&
      !pomodoroEndOverlay
    ) {
      window.electron?.setWindowSize('small', windowCenterScreenPoint());
      return;
    }

    if (selectedId) {
      const app =
        selectedApp ?? findAppRecursive(currentWorkspaceApps, selectedId);

      const isInternalWidget = app?.command?.startsWith('internal:');
      if (!isInternalWidget) {
        setIsDashboardOpen(false);
      }
    }

    if (selectedId === '__CENTER__') {
      const centerConfig = cfg.centerButton;

      if (centerConfig.type === 'cancel') {
        if (
          isDesktopMode &&
          !panelSurfaceOpen &&
          !isNotesOpen &&
          !isPomodoroOpen &&
          !alarmRinging &&
          !pomodoroEndOverlay
        ) {
          window.electron?.setWindowSize('small', windowCenterScreenPoint());
        }
        return;
      }

      if (centerConfig.type === 'app' || centerConfig.type === 'widget') {
        const targetApp = findAppRecursive(currentWorkspaceApps, centerConfig.target);
        const command = targetApp ? targetApp.command : centerConfig.target;
        console.log("Center action, target command:", command);
        executeActionRef.current(command, targetApp?.commandType || 'app', targetApp, {
          openTerminal: targetApp?.openTerminal,
          terminalCommands: targetApp?.terminalCommands
        });
        return;
      } else if (centerConfig.type === 'command') {
        executeActionRef.current(centerConfig.target, centerConfig.commandType || 'app');
        return;
      }
      return;
    }

    if (selectedId) {
      const app =
        selectedApp ?? findAppRecursive(currentWorkspaceApps, selectedId);
      console.log("Selected app found in active workspace:", app);
      if (app) {
        console.log("Attempting to execute app command:", app.command);
        executeActionRef.current(app.command, app.commandType || 'app', app, {
          openTerminal: app.openTerminal,
          terminalCommands: app.terminalCommands
        });
      } else {
        console.warn("Could not find app with ID in active workspace:", selectedId);
      }
    }
  }, [apps, isDesktopMode, panelSurfaceOpen, isNotesOpen, isPomodoroOpen, alarmRinging, pomodoroEndOverlay]);




  {/* Auth Functions */ }
  const handleLogin = (provider: 'google' | 'email') => {
    /** Google: Electron opens zenithos.online/auth?client=desktop and bridges id_token from localhost:3892. */
    if (provider === 'google' && window.electron?.startGoogleAuth) {
      window.electron.startGoogleAuth();
      return;
    }

    // Simulate Email Login (fallback)
    const trialDate = new Date();
    trialDate.setDate(trialDate.getDate() + 7); // 7 Days Trial

    const newUser: UserProfile = {
      id: 'user-123',
      name: 'Email User',
      isPremium: false,
      isAdmin: false,
      planTier: 'free',
      trialEndsAt: trialDate.toISOString(),
      avatarUrl: undefined,
      email: 'user@example.com',
    };
    setUser(newUser);
  };

  const handleLogout = () => {
    flushSync(() => {
      setUser(null);
      setIsSettingsOpen(false);
      setHideIslandForWindowedPanelTransition(true);
      setPanelChromeDismissedForIsland(false);
      setIsDashboardOpen(true);
    });
    if (isDesktopMode) window.electron?.showWindow();
  };

  const handleUserProfileUpdate = useCallback((patch: Partial<UserProfile>) => {
    setUser((u) => (u ? { ...u, ...patch } : null));
  }, []);

  /** Menu-only slice of config: stable when unrelated settings (e.g. widget opacities) change — keeps RadialMenu from re-rendering the full wheel. */
  const radialMenuConfig = React.useMemo(
    () => config,
    [
      config.accentColor,
      config.menuRadius,
      config.iconSize,
      config.backdropBlur,
      config.backdropOpacity,
      config.menuBackgroundStyle,
      config.appSpacing,
      config.activationThreshold,
      config.centerButton,
      config.showLabels,
      config.showClock,
      config.showDate,
      config.showBattery,
      config.showWeather,
      config.weatherLocation,
      config.clockPosition,
      config.workspaces,
      config.activeWorkspaceIndex,
      config.workspaceSwitchMode,
      config.language,
      config.performanceMode,
    ]
  );

  const radialApps = React.useMemo(() => {
    const w = config.workspaces[config.activeWorkspaceIndex];
    return w?.apps?.length ? w.apps : apps;
  }, [config.workspaces, config.activeWorkspaceIndex, apps]);

  const radialCurrentWorkspace = React.useMemo(
    () => config.workspaces[config.activeWorkspaceIndex],
    [config.workspaces, config.activeWorkspaceIndex]
  );

  // Check if any modal is open
  const isAnyModalOpen =
    panelSurfaceOpen ||
    isNotesOpen ||
    isAlarmWidgetOpen ||
    isStopwatchOpen ||
    isPomodoroOpen ||
    alarmRinging ||
    pomodoroEndOverlay ||
    isMenuOpen ||
    radialOpenAwaitingFullscreen;

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
      {isDesktopMode && (minimizeNeutralCoverActive || radialPreShowSolidCover) && (
        <div
          className="fixed inset-0 z-[99999] bg-[#0A0A0A] pointer-events-none"
          aria-hidden
        />
      )}

      {/* Visibility Wrapper — ONLY for opaque content (Dashboard, Settings, Widgets) */}
      {/* RadialMenu renders OUTSIDE this wrapper to stay truly transparent */}
      {/* When radial opens: hide this layer instantly (no opacity transition) — otherwise the 300ms fade shows a flash of the last settings/dashboard frame */}
      <div className={`
        absolute inset-0 overflow-hidden
        ${isMenuOpen || radialOpenAwaitingFullscreen
          ? 'hidden !transition-none'
          : `${panelSurfaceOpen ? '!transition-none' : 'transition-all duration-300'} ${(panelSurfaceOpen || isNotesOpen || isAlarmWidgetOpen || isStopwatchOpen || isPomodoroOpen || alarmRinging || pomodoroEndOverlay) ? 'opacity-100 visible' : 'opacity-0 pointer-events-none invisible'}`
        }
        ${!isMenuOpen && !radialOpenAwaitingFullscreen && panelSurfaceOpen ? 'bg-[#0A0A0A]' : ''}
        ${!isMenuOpen && !radialOpenAwaitingFullscreen && panelSurfaceOpen ? 'border border-white/10 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.5)]' : ''}
      `}>
        {/* CUSTOM TITLE BAR OVERLAY (for drag region + app name) */}
        {panelSurfaceOpen && !isMenuOpen && !radialOpenAwaitingFullscreen && (
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
                onClick={() => flushNeutralFrameThenMinimize()}
                title="Minimizar para a bandeja (sem ícone na barra de tarefas)"
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

        {/* WELCOME SCREEN / DASHBOARD CONTENT AREA */}
        {!isMenuOpen && !radialOpenAwaitingFullscreen && (
          <AnimatePresence mode="wait">
            {isDashboardOpen && panelSurfaceOpen && !isSettingsOpen && !isNotesOpen && !isAlarmWidgetOpen && !isStopwatchOpen && !isPomodoroOpen && !alarmRinging && !pomodoroEndOverlay && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 z-10"
                id="dashboard-container"
              >
                <WelcomeScreen
                  onOpenSettings={handleOpenSettings}
                  onClose={() => setIsDashboardOpen(false)}
                  config={config}
                  user={user}
                  onLogin={handleLogin}
                  onLogout={handleLogout}
                  onUserProfileUpdate={handleUserProfileUpdate}
                />
              </motion.div>
            )}

            {isSettingsOpen && panelSurfaceOpen && (
              <motion.div
                key="settings-page"
                initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 z-20"
              >
                <SettingsModal
                  isOpen={isSettingsOpen}
                  isPage={true}
                  onClose={() => {
                    setIsSettingsOpen(false);
                  }}
                  apps={apps} setApps={setApps} config={config} setConfig={setConfig} onReset={async () => { 
                    try {
                      setIsDashboardOpen(false);
                      setIsSettingsOpen(false);
                      setIsAppReady(false);
                      setIsLoaded(false);
                    } catch(e) {}
                    setApps(MINIMAL_MAIN_WORKSPACE_APPS); 
                    setConfig(DEFAULT_UI_CONFIG); 
                    if (window.electron?.resetConfig) {
                        try {
                           await window.electron.resetConfig();
                        } catch(e) {}
                    } else {
                        localStorage.clear();
                        window.location.reload();
                    }
                  }}
                  onOpenDashboard={() => {
                    flushSync(() => {
                      setHideIslandForWindowedPanelTransition(true);
                      setIsSettingsOpen(false);
                      setPanelChromeDismissedForIsland(false);
                      setIsDashboardOpen(true);
                    });
                    if (isDesktopMode) window.electron?.showWindow();
                  }}
                  user={user}
                  onLogout={handleLogout}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <NotesWidget
          isOpen={isNotesOpen}
          onClose={() => { setIsNotesOpen(false); }}
          notes={notes}
          setNotes={setNotes}
          config={config}
          setConfig={setConfig}
          noteWorkspaces={noteWorkspaces}
          setNoteWorkspaces={setNoteWorkspaces}
          activeNoteWorkspaceId={activeNoteWorkspaceId}
          setActiveNoteWorkspaceId={setActiveNoteWorkspaceId}
        />
        <AlarmWidget
          isOpen={isAlarmWidgetOpen}
          onClose={() => { setIsAlarmWidgetOpen(false); }}
          alarms={alarms}
          setAlarms={setAlarms}
          config={config}
          setConfig={setConfig}
          onPreviewAlarm={(a) => setAlarmRinging({ alarm: a, isPreview: true })}
        />
        <StopwatchWidget
          isOpen={isStopwatchOpen}
          onClose={() => {
            setIsStopwatchOpen(false);
          }}
          config={config}
          setConfig={setConfig}
        />
        <PomodoroWidget
          isOpen={isPomodoroOpen}
          onClose={() => { setIsPomodoroOpen(false); }}
          {...pomodoro}
          uiConfig={config}
          setConfig={setConfig}
          onPreviewSessionEnd={(mode) => {
            if (shouldPlayPomodoroSounds()) {
              void resumePomodoroAudio();
              if (loadPomodoroUiPrefs().ambientPreset === 'off') {
                playPomodoroSegmentEnd();
              }
            }
            setPomodoroEndOverlay({ endedMode: mode, isPreview: true });
          }}
        />


      </div>

      {/* Durante `applyWindowSize` o painel já está oculto no React — fundo sólido evita flash do wallpaper / última textura do compositor. */}
      {isDesktopMode && radialOpenAwaitingFullscreen && (
        <div
          className="fixed inset-0 z-[65] bg-[#0A0A0A] pointer-events-auto"
          aria-hidden
        />
      )}

      {/* ALARM — fora da camada opaca: visível mesmo com janela “passiva” / nada aberto */}
      <AnimatePresence>
        {alarmRinging && (
          <AlarmRingingOverlay
            key={`${alarmRinging.alarm.id}-${alarmRinging.isPreview ? 'p' : 'r'}`}
            alarm={alarmRinging.alarm}
            isPreview={alarmRinging.isPreview}
            config={config}
            onDismiss={() => setAlarmRinging(null)}
            onSnoozeMinutes={(minutes) => {
              const a = alarmRinging.alarm;
              setAlarmRinging(null);
              setSnoozeWake({ alarm: a, at: Date.now() + minutes * 60 * 1000 });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pomodoroEndOverlay && (
          <PomodoroCompleteOverlay
            key={`pomodoro-end-${pomodoroEndOverlay.endedMode}-${pomodoroEndOverlay.isPreview ? 'p' : 'r'}`}
            endedMode={pomodoroEndOverlay.endedMode}
            isPreview={pomodoroEndOverlay.isPreview}
            config={config}
            onDismiss={() => setPomodoroEndOverlay(null)}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* TRANSPARENT LAYER — no background, RadialMenu + toasts live here    */}
      {/* ------------------------------------------------------------------ */}

        {!isMenuOpen &&
          !radialOpenAwaitingFullscreen &&
          !islandHoldAfterRadialClose &&
          !hideIslandForWindowedPanelTransition &&
          electronSmallOverlayReady &&
          timerHudActive &&
          !anyFullscreenWidgetOpen && (
            <CompactTimerHud
              key={islandHudRemountKey}
              config={config}
              isDesktopMode={isDesktopMode}
              suppressFloatingClock={isMenuOpen}
              isPomodoroOpen={isPomodoroOpen}
              isStopwatchOpen={isStopwatchOpen}
              pomodoroState={pomodoro.state}
              pomodoroConfig={pomodoro.config}
              stopwatchSnap={stopwatchHudSnap}
            />
          )}

        {/* Durante `radialOpenAwaitingFullscreen` o menu não pode ficar montado com `isOpen={false}` — o Framer animava “fechar” e depois “abrir”, causando flash de saída/entrada. */}
        {(!radialOpenAwaitingFullscreen || isMenuOpen) && (
          <RadialMenu
            isOpen={isMenuOpen}
            position={menuPosition}
            onClose={handleMenuClose}
            apps={radialApps}
            config={radialMenuConfig}
            triggerSource={triggerSource}
            onWorkspaceSwitch={handleWorkspaceSwitch}
            currentWorkspace={radialCurrentWorkspace}
          />
        )}

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

        <StartMenuResolvingOverlay
          open={startMenuResolving.open}
          language={startMenuResolving.lang}
          accentColor={config.accentColor}
        />

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
  );
}