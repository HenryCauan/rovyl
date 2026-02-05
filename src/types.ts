import { LucideIcon } from "lucide-react";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  isPremium: boolean;
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
  commandType?: "app" | "url"; // New: distinguishes if command is an app path or a web URL
  description: string;
  children?: AppItem[];
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

export interface CenterButtonConfig {
  type: "system" | "app" | "widget" | "command" | "none";
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
  clockPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  gameMode: GameModeConfig;
  globalShortcut: string; // New: Global keyboard shortcut (e.g. 'Alt+Space')
}

export interface RadialState {
  isOpen: boolean;
  position: Coordinates;
  activeItemIndex: number | null;
}

export interface ElectronAPI {
  executeCommand: (command: string, commandType: "app" | "url") => void;
  hideWindow: () => void;
  showWindow: () => void;
  onOpenMenu: (
    callback: (data: {
      x: number;
      y: number;
      source?: "mmb" | "shortcut";
    }) => void,
  ) => void;
  onOpenDashboard: (callback: () => void) => void;
  onMouseUp: (callback: () => void) => void;
  onMmbRelease: (callback: () => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  setWindowSize: (mode: "small" | "fullscreen" | "windowed") => void;
  setGameMode: (config: GameModeConfig) => void;
  getFileIcon: (path: string) => Promise<string | null>;
  minimizeWindow: () => void;
  toggleMaximize: () => void;
  quitApp: () => void;
  onWindowState: (callback: (state: "maximized" | "windowed") => void) => void;
  selectFile: () => Promise<string | null>;
  getInstalledApps: () => Promise<any[]>;
  onExecutionError: (callback: (errorMsg: string) => void) => void;
  // System Controls
  getVolume: () => Promise<number>;
  setVolume: (level: number) => void;
  getBrightness: () => Promise<number>;
  setBrightness: (level: number) => void;
  toggleBluetooth: (enabled: boolean) => Promise<boolean>;
  toggleWifi: (enabled: boolean) => Promise<boolean>;
  getSettings: () => Promise<any>;
  setSettings: (settings: any) => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
