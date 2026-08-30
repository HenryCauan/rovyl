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
  /** Quantos dispositivos a licenca cobre; vem do servidor na ativacao. */
  deviceLimit?: number;
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
  /** Diretório explícito para terminal/comandos; evita inferir cwd da linha de lançamento da IDE. */
  workingDirectory?: string;
  /** Estratégia de abertura: normal, reutilizar processo existente ou aquecer ficheiros no cache do Windows. */
  launchMode?: "normal" | "reuse" | "prewarm";
}

export interface CenterButtonConfig {
  /** `widget` mantido só para ler configs antigos — os widgets internos foram removidos. */
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
  mode: "all" | "list"; // 'all' = qualquer app fullscreen; 'list' = só apps da lista em fullscreen
  blockedApps: string;
  /** Detecta automaticamente jogos fullscreen por pasta, launcher e marcadores de engine. */
  autoDetectGames: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  apps: AppItem[];
  /** Number key used while the radial is open. Zero means picker/mouse-wheel only. */
  hotkey: number; // 0 or 1-9
  enabled: boolean;
  color?: string; // Optional project/workspace color
  /** Ícone Lucide na roda inicial quando `workspaceSwitchMode === 'picker'`. Omite → Layers. */
  pickerIconName?: string;
}

export const CLOCK_HUD_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type ClockHudPosition = (typeof CLOCK_HUD_POSITIONS)[number];

export interface UIConfig {
  accentColor: string;
  /** Cor aplicada ao item apontado no menu radial. Opcional para compatibilidade com configs antigas. */
  radialHoverColor?: string;
  menuRadius: number;
  iconSize: number;
  /**
   * @deprecated Deixou de ser configurável — a roda nasce sempre no centro. Mantido só para ler
   * configs antigos (normalizado para `true` na hidratação). Não voltar a expor nas definições.
   */
  fixedPosition: boolean;
  backdropOpacity: number;
  menuOpacity: number;
  menuBackgroundStyle: "circle" | "fullscreen";
  appSpacing: number; // New: spacing between apps in radial menu
  activationThreshold: number;
  centerButton: CenterButtonConfig;
  showLabels: boolean;
  /** When true, app names stay visible for all items; when false, only the hovered/selected item shows its label. */
  alwaysShowAppLabels: boolean;
  showBattery: boolean; // New
  showWeather: boolean; // New
  weatherLocation?: string; // New: CEP or city name for weather
  clockPosition: ClockHudPosition;
  gameMode: GameModeConfig;
  globalShortcut: string; // New: Global keyboard shortcut (e.g. 'Alt+Space')
  workspaces: Workspace[]; // New: Workspace configurations
  activeWorkspaceIndex: number; // New: Currently active workspace (0-indexed)
  /**
   * hotkeys: teclas 1–9 (e roda do rato) mudam de workspace com o menu aberto.
   * picker: ao abrir o radial vê-se primeiro a roda de espaços; ao escolher, os apps desse espaço; o centro volta atrás (como pastas).
   */
  workspaceSwitchMode?: 'hotkeys' | 'picker';
  /**
   * Tema das superfícies opacas (titlebar + Settings). O radial permanece sempre
   * escuro: é um overlay sobre o ambiente de trabalho, não uma superfície do produto.
   */
  appearanceTheme?: 'black' | 'white';
  /**
   * Como a roda decide o alvo.
   * 'angle'  — direcao a partir do centro; a fatia acende mesmo com o cursor longe (por omissao).
   * 'cursor' — so acende quando o ponteiro esta mesmo sobre o icone.
   */
  radialSelectionMode?: 'angle' | 'cursor';
  openAtLogin?: boolean; // New: Start app at login
  enableMouseTrigger: boolean;
  /** click: clique MMB abre e deixa o radial aberto; hold: segurar abre e soltar executa a seleção. */
  mouseTriggerMode?: 'click' | 'hold';
  /**
   * Botão físico que abre a roda. Esquerdo e direito estão fora de propósito: vigiá-los
   * globalmente colidiria com o clique primário e o menu de contexto do sistema.
   */
  mouseTriggerButton?: 'middle' | 'x1' | 'x2';
  language: "pt" | "en" | "es" | "fr" | "de" | "it" | "ja" | "zh" | "ko" | "ru";
  performanceMode: boolean; // New: Strict performance mode for zero-lag
  /**
   * Start Menu discovery já correu ou o Main foi guardado com apps à medida — não voltar a importar atalhos no arranque.
   * Persistido em config-v2.json (localStorage pode ser limpo após reboot).
   */
  mainStartMenuDiscoveryDone?: boolean;
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
    options?: { openTerminal?: boolean; terminalCommands?: string[]; workingDirectory?: string; launchMode?: "normal" | "reuse" | "prewarm" },
  ) => void;
  hideWindow: () => void;
  showWindow: () => void;
  requestKeyboardFocus?: () => void;
  getAppVersion?: () => Promise<string>;
  /** Canal de distribuição: 'store' (MSIX) não tem atualização própria. */
  getBuildChannel?: () => Promise<'store' | 'direct'>;
  onUpdateState?: (
    callback: (payload: { state: 'downloading' | 'ready'; version?: string }) => void,
  ) => () => void;
  getUpdateState?: () => Promise<{ state: string; version?: string | null }>;
  checkForUpdates?: () => Promise<{ ok: boolean; state?: string; version?: string; code?: string; error?: string }>;
  installUpdateNow?: () => void;
  wasOpenedAtLogin?: () => Promise<boolean>;
  /** O main confirma se a app tem mesmo um perfil de IDE com MRU (não adivinhar por nome). */
  appSupportsRecents?: (appName: string, appCommand: string) => Promise<boolean>;
  onOpenMenu: (
    callback: (data: {
      x: number;
      y: number;
      source?: "mmb" | "mmb-click" | "shortcut";
      /** True quando o main já aplicou fullscreen — evita segundo `applyWindowSize` no renderer. */
      preSizedByMain?: boolean;
      /** O painel continua no ecrã por baixo do radial — o renderer não o pode fechar. */
      keepPanel?: boolean;
      /** Rect de ecrã do painel; só quando a janela foi alargada e ele precisa de ser reposicionado. */
      panelRect?: { x: number; y: number; width: number; height: number } | null;
      /** Centro já convertido para coordenadas do novo HWND; evita métricas antigas após Settings. */
      clientPosition?: { x: number; y: number } | null;
      /** Origem nativa correspondente ao clientPosition/panelRect durante o handshake. */
      windowOrigin?: { x: number; y: number } | null;
      /** Viewport autoritativo após o resize; o renderer pode ainda reportar o tamanho do Settings. */
      clientSize?: { width: number; height: number } | null;
      /** Handshake do primeiro frame: o main só revela uma janela oculta após este token ser confirmado. */
      paintToken?: number;
    }) => void,
  ) => () => void;
  /** Antes de abrir o radial a partir do main — cobrir frame antigo (ex.: dashboard ao restaurar). */
  onPrepareRadialShow?: (callback: () => void) => () => void;
  notifyRadialPrepPaintDone?: () => void;
  notifyRadialOpenPaintDone?: (paintToken: number) => void;
  /** A janela nativa já está visível; libera a animação do radial preparado em alfa zero. */
  onRadialNativeRevealed?: (callback: (paintToken: number) => void) => () => void;
  onOpenDashboard: (callback: () => void) => () => void;
  onMouseUp: (callback: () => void) => () => void;
  onMmbRelease: (callback: () => void) => () => void;
  /** Cursor sondado pelo main enquanto o botão do meio está premido (coordenadas de ecrã). */
  onMmbCursor?: (
    callback: (point: { x: number; y: number }) => void,
  ) => (() => void) | void;
  onOpenSettings: (callback: () => void) => () => void;
  /** Fired when the OS hid the window to tray (not a real quit). */
  onWindowHidToTray: (callback: () => void) => () => void;
  /** Minimize/restore da janela principal — painel pode ficar em estado React mas ilha deve voltar ao minimizar. */
  onMainWindowMinimized?: (
    callback: (payload: { minimized: boolean }) => void,
  ) => () => void;
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
  /** Pré-aquece small↔fullscreen uma vez após arranque (HWND da ilha encolhido). */
  warmRadialTransition?: () => Promise<boolean>;
  /** Re-applies desktop passthrough overlay after closing a fullscreen widget (fixes flaky clicks on Windows). */
  reapplySmallOverlay?: () => Promise<boolean>;
  /** Repouso: encolhe o HWND ao canto (sem camada transparente a ecrã inteiro). */
  collapseIdleOverlay?: () => Promise<boolean>;
  /** Lado da caixa do radial (px) + se a posição é fixa — o main dimensiona a janela do menu com isto. */
  setRadialViewport?: (payload: { size: number; fixed: boolean }) => void;
  /** Painel (Settings/Welcome) realmente à vista — decide se o radial abre por cima dele. */
  setPanelSurfaceVisible?: (visible: boolean) => void;
  /** Clears island passthrough / hit-shape so widgets and panels receive clicks immediately. */
  ensureWindowInteractive?: () => Promise<boolean>;
  /** Windows/Linux: ilha — `coordinateSpace: "screen"` encolhe o HWND; sem isso, coords de cliente + setShape. */
  setWindowHitShape?: (
    rects: Array<{ x: number; y: number; width: number; height: number }>,
    opts?: { coordinateSpace?: "screen" | "client" },
  ) => Promise<boolean>;
  /** 0–1; used to hide the window during fullscreen resize to avoid DWM stretching the old settings frame (flash). */
  setWindowOpacity: (opacity: number) => void;
  /** Schedules a full Chromium repaint — helps transparent frameless windows on Windows after show/resize. */
  invalidatePaint?: () => Promise<boolean>;
  /** Área do webview em ecrã — preferir a `screenX`/`screenY` ao calcular hit-shape após resize. */
  getMainWindowContentBounds?: () => Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>;
  setGameMode: (config: GameModeConfig) => void;
  prewarmApps?: (commands: string[]) => void;
  getVolume: () => Promise<number>;
  setVolume: (value: number) => void;
  getBrightness: () => Promise<number>;
  setBrightness: (value: number) => void;
  getHardwareCapabilities: () => Promise<{ hasWifi: boolean; hasBluetooth: boolean }>;
  toggleWifi: (enabled: boolean) => Promise<boolean>;
  toggleBluetooth: (enabled: boolean) => Promise<boolean>;
  getFileIcon: (path: string) => Promise<string | null>;
  /** Favicon obtido no main (data URL) — o renderer costuma falhar com <img https://…>. */
  getWebsiteFaviconDataUrl?: (pageUrl: string) => Promise<string | null>;
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
  getInstalledApps: (forceRefresh?: boolean) => Promise<any[]>;
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
  startShortcutRecording: () => void;
  stopShortcutRecording: () => void;
  onShortcutRecorded: (callback: (shortcut: string) => void) => () => void;
  saveFullConfig: (config: any) => Promise<{ ok: boolean; error?: string }>;
  /** Synchronous save to disk (Electron); returns false if main rejected or IPC failed. */
  saveFullConfigSync?: (config: any) => boolean;
  getFullConfig: () => Promise<any>;
  /** Sizes of config-v2.json (+ .bak + quarantined .broken-*) — used to avoid overwriting real data when load fails. */
  getConfigPersistenceMeta?: () => Promise<{
    primaryBytes: number;
    backupBytes: number;
    quarantineBytes?: number;
  }>;
  /** Main is quitting — flush then call ackQuitFlush (callback may be async). */
  onBeforeQuitFlush?: (callback: () => void | Promise<void>) => () => void;
  ackQuitFlush?: () => void;
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
  /** OS-native uninstall flow (Windows uninstaller / Apps settings; macOS Finder). */
  openSystemUninstall?: () => Promise<{
    ok: boolean;
    mode?: "uninstaller" | "settings" | "finder";
    dev?: boolean;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
