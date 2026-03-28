import { LucideIcon } from "lucide-react";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  isPremium: boolean;
  isAdmin?: boolean;
  trialEndsAt?: string; // ISO Date string
  avatarUrl?: string;
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

export interface Note {
  id: string;
  title: string;
  content: string;
  date: string;
  color?: string;
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
  openAtLogin?: boolean; // New: Start app at login
  enableMouseTrigger: boolean;
  language: "pt" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ko" | "ru";
  performanceMode: boolean; // New: Strict performance mode for zero-lag
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
  setWindowSize: (mode: "small" | "fullscreen" | "windowed") => void;
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
  getInstalledApps: () => Promise<any[]>;
  getOnboardingApps: () => Promise<any[]>;
  onExecutionError: (callback: (errorMsg: string) => void) => () => void;
  relaunchApp: () => void;
  getSettings: () => Promise<any>;
  setSettings: (settings: any) => void;
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
  openSettingsWindow: () => void;
  resetConfig: () => void;
  openConfigFolder: () => void;
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
  getFullConfig: () => Promise<any>;
  getAppRecents: (appName: string, appCommand?: string) => Promise<AppItem[]>;
  setWorkspaceShortcutsState: (isOpen: boolean) => void;
  exportConfig: () => Promise<{ success: boolean; error?: string }>;
  importConfig: () => Promise<{ success: boolean; error?: string }>;
  startGoogleAuth: () => void;
  onGoogleAuthSuccess: (callback: (user: any) => void) => () => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
