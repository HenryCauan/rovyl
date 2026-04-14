import { LucideIcon } from "lucide-react";

export type SubscriptionTier = "free" | "plus" | "pro";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  isPremium: boolean;
  /** Paid tier when billing supports Plus vs Pro; optional until checkout is wired. */
  planTier?: SubscriptionTier;
  isAdmin?: boolean;
  trialEndsAt?: string; // ISO Date string
  avatarUrl?: string;
  /** Local profile only (billing / account sync can come later). */
  address?: string;
}

export interface AppItem {
  id: string;
  type?: "app" | "folder";
  label: string;
  iconName: string;
  iconSource?: "lucide" | "native"; // New property: 'lucide' for vector, 'native' for custom/extracted image
  customIconUrl?: string; // Supports base64 images or URLs
  direction?: string;
  command: string;
  commandType?: "app" | "url" | "folder"; // New: distinguishes if command is an app path, a web URL, or a folder
  description: string;
  shortcut?: string;
  children?: AppItem[];
  hasRecents?: boolean; // New: indicates if the app should show recent folders
  /** When true, MRU sub-items also spawn a terminal in the selected project folder. */
  openTerminalForRecents?: boolean;
  openTerminal?: boolean; // New: indicates if opening this item should also open a terminal
  terminalCommands?: string[]; // New: list of commands to run automatically in the terminal
}

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  iconName: string;
  command: string;
  defaultLabel: string;
}

export type NoteSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

/** Separate boards for the Notes widget (independent from radial menu workspaces). */
export interface NoteWorkspace {
  id: string;
  name: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  contentHtml?: string; // Rich-text HTML content
  date: string;
  color?: string; // Background accent color key
  size?: NoteSize; // Tile size tier for the bento grid
  position?: { x: number; y: number }; // Infinite canvas floating position
  dimensions?: { width: number; height: number }; // Free-form resizing dimensions
  icon?: string; // Lucide icon name for custom visual categorization
  type?: 'text' | 'todo'; // 'todo' changes rendering to a tick-box list
  todos?: TodoItem[]; // Payload for 'todo' list mode
  /** Which notes board this sticky belongs to (defaults to "default"). */
  workspaceId?: string;
}

export interface Alarm {
  id: string;
  time: string;
  label: string;
  enabled: boolean;
  days?: number[];
}

export type PomodoroMode = "work" | "shortBreak" | "longBreak";

export interface PomodoroConfig {
  workDuration: number; // minutes
  shortBreakDuration: number; // minutes
  longBreakDuration: number; // minutes
  autoStart: boolean;
  longBreakInterval: number; // pomodoros before long break
}

export interface PomodoroTask {
  id: string;
  title: string;
  completed: boolean;
  estimatedPomodoros: number;
  completedPomodoros: number;
}

export interface PomodoroState {
  isActive: boolean;
  mode: PomodoroMode;
  timeLeft: number; // seconds
  cyclesCompleted: number;
  totalPomodorosCompleted: number; // Daily stats
}

export interface CenterButtonConfig {
  type: "app" | "widget" | "command" | "none" | "cancel";
  target: string;
  label: string;
  iconName: string;
  commandType?: "app" | "url"; // Add commandType for 'command' type
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface GameModeConfig {
  enabled: boolean;
  mode: "all" | "list"; // New: 'all' to block on any fullscreen, 'list' for specific apps
  blockFullscreen: boolean;
  blockedApps: string;
}

export interface Workspace {
  id: string;
  name: string;
  apps: AppItem[];
  hotkey: number; // 1-9
  enabled: boolean;
  color?: string; // Optional project/workspace color
}

export interface UIConfig {
  accentColor: string;
  menuRadius: number;
  iconSize: number;
  fixedPosition: boolean;
  backdropBlur: number;
  backdropOpacity: number;
  menuOpacity: number;
  menuBackgroundStyle: "circle" | "fullscreen";
  appSpacing: number; // New: spacing between apps in radial menu
  activationThreshold: number;
  centerButton: CenterButtonConfig;
  showLabels: boolean;
  showClock: boolean;
  showDate: boolean; // New
  showBattery: boolean; // New
  showWeather: boolean; // New
  weatherLocation?: string; // New: CEP or city name for weather
  clockPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  gameMode: GameModeConfig;
  globalShortcut: string; // New: Global keyboard shortcut (e.g. 'Alt+Space')
  workspaces: Workspace[]; // New: Workspace configurations
  activeWorkspaceIndex: number; // New: Currently active workspace (0-indexed)
  /**
   * hotkeys: teclas 1–9 (e roda do rato) mudam de workspace com o menu aberto.
   * picker: ao abrir o radial vê-se primeiro a roda de espaços; ao escolher, os apps desse espaço; o centro volta atrás (como pastas).
   */
  workspaceSwitchMode?: 'hotkeys' | 'picker';
  openAtLogin?: boolean; // New: Start app at login
  enableMouseTrigger: boolean;
  language: "pt" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ko" | "ru";
  performanceMode: boolean; // New: Strict performance mode for zero-lag
  /** Notes widget fullscreen overlay darkness (0 = transparent, 1 = opaque). */
  notesWidgetBackdropOpacity?: number;
  /** Alarms widget fullscreen overlay darkness (0 = transparent, 1 = opaque). */
  alarmsWidgetBackdropOpacity?: number;
  /** Pomodoro widget fullscreen overlay darkness (0 = transparent, 1 = opaque). */
  pomodoroWidgetBackdropOpacity?: number;
  /** Stopwatch widget fullscreen overlay darkness (0 = transparent, 1 = opaque). */
  stopwatchWidgetBackdropOpacity?: number;
  persistenceMeta?: {
    isFirstRunCompleted?: boolean;
    lastSuccessfulLoad?: string;
    version?: number;
  };
}

export interface RadialState {
  isOpen: boolean;
  position: Coordinates;
  activeItemIndex: number | null;
}

export interface ElectronAPI {
  executeCommand: (
    command: string,
    commandType: "app" | "url" | "folder",
    options?: { openTerminal?: boolean; terminalCommands?: string[] },
  ) => void;
  hideWindow: () => void;
  showWindow: () => void;
  onOpenMenu: (
    callback: (data: {
      x: number;
      y: number;
      source?: "mmb" | "shortcut";
    }) => void,
  ) => () => void;
  onOpenDashboard: (callback: () => void) => () => void;
  onMouseUp: (callback: () => void) => () => void;
  onMmbRelease: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  /** Fired when the OS hid the window to tray (not a real quit). */
  onWindowHidToTray: (callback: () => void) => () => void;
  onWindowNativeDisplayRestored: (
    callback: (payload: {
      mode: "small" | "fullscreen" | "windowed";
    }) => void,
  ) => () => void;
  setWindowSize: (
    mode: "small" | "fullscreen" | "windowed",
    /** Screen coordinates (e.g. cursor) — which monitor should receive the fullscreen/small overlay */
    anchorScreenPoint?: { x: number; y: number },
  ) => void;
  /** Awaitable resize — use before showing the radial so the first paint is not still windowed bounds. */
  applyWindowSize?: (
    mode: "small" | "fullscreen" | "windowed",
    anchorScreenPoint?: { x: number; y: number },
  ) => Promise<boolean>;
  /** Re-applies desktop passthrough overlay after closing a fullscreen widget (fixes flaky clicks on Windows). */
  reapplySmallOverlay?: () => Promise<boolean>;
  /** Windows/Linux: `BrowserWindow.setShape` — regiões clicáveis em coords de cliente (resto passa para o ambiente). */
  setWindowHitShape?: (
    rects: Array<{ x: number; y: number; width: number; height: number }>,
  ) => Promise<boolean>;
  /** 0–1; used to hide the window during fullscreen resize to avoid DWM stretching the old settings frame (flash). */
  setWindowOpacity: (opacity: number) => void;
  /** Schedules a full Chromium repaint — helps transparent frameless windows on Windows after show/resize. */
  invalidatePaint?: () => Promise<boolean>;
  setGameMode: (config: GameModeConfig) => void;
  getFileIcon: (path: string) => Promise<string | null>;
  minimizeWindow: () => void;
  toggleMaximize: () => void;
  quitApp: () => void;
  onWindowState: (
    callback: (state: "maximized" | "windowed") => void,
  ) => () => void;
  onSwitchWorkspace: (callback: (index: number) => void) => () => void;
  selectFile: () => Promise<string | null>;
  selectFolder: () => Promise<string | null>;
  selectImage: () => Promise<string | null>;
  /** Removes a file only if it lives under userData/custom-icons (safe no-op otherwise). */
  removeManagedCustomIcon: (urlOrPath?: string) => Promise<void>;
  /** Copy user audio into userData/pomodoro-ambient; returns path or null. */
  selectPomodoroAudio: () => Promise<string | null>;
  /** Delete file only if under userData/pomodoro-ambient. */
  removeManagedPomodoroAudio: (filePath?: string) => Promise<void>;
  getInstalledApps: () => Promise<any[]>;
  getOnboardingApps: () => Promise<any[]>;
  getStartupApps: () => Promise<any[]>;
  onExecutionError: (callback: (errorMsg: string) => void) => () => void;
  relaunchApp: () => void;
  getSettings: () => Promise<any>;
  setSettings: (settings: any) => void;
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
  openSettingsWindow: () => void;
  resetConfig: () => void;
  toggleSettings: () => void;
  setBackgroundMaterial: (
    material: "none" | "acrylic" | "mica" | "tabbed",
  ) => void;
  pauseGlobalShortcut: () => void;
  resumeGlobalShortcut: () => void;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => void;
  getBrightness: () => Promise<number>;
  setBrightness: (brightness: number) => void;
  getHardwareCapabilities: () => Promise<{
    hasWifi: boolean;
    hasBluetooth: boolean;
  }>;
  toggleWifi: (enabled: boolean) => Promise<boolean>;
  toggleBluetooth: (enabled: boolean) => Promise<boolean>;
  startShortcutRecording: () => void;
  stopShortcutRecording: () => void;
  onShortcutRecorded: (callback: (shortcut: string) => void) => () => void;
  saveFullConfig: (config: any) => void;
  /** Synchronous save to disk (Electron); use before exit so notes persist across reboot. */
  saveFullConfigSync?: (config: any) => void;
  getFullConfig: () => Promise<any>;
  getAppRecents: (appName: string, appCommand?: string) => Promise<AppItem[]>;
  setWorkspaceShortcutsState: (
    isOpen: boolean,
    workspaceSwitchMode?: 'hotkeys' | 'picker',
  ) => void;
  exportConfig: () => Promise<{ success: boolean; error?: string }>;
  importConfig: () => Promise<{ success: boolean; error?: string }>;
  startGoogleAuth: () => void;
  onGoogleAuthSuccess: (callback: (user: any) => void) => () => void;
  onGoogleAuthError?: (callback: (payload: { code?: string; message?: string; userDataPath?: string }) => void) => () => void;
  savePersistenceLog: (message: string) => void;
  /** Open URL in the OS default browser (shell.openExternal). */
  openExternalUrl?: (url: string) => Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
