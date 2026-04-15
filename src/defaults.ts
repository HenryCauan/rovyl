import { AppItem, UIConfig, WidgetDefinition, Workspace } from "./types";

export const DEFAULT_APPS: AppItem[] = [
  {
    id: "1a7a5818-4c99-4e4f-8a4d-3e28d4d7f5d7",
    type: "app",
    label: "Browser",
    direction: "N",
    iconName: "Globe",
    iconSource: "native",
    command: "msedge",
    description: "Web Browser",
  },
  {
    id: "2b8b6818-5d99-4e4f-8a4d-3e28d4d7f5d8",
    type: "folder",
    label: "Media Hub",
    direction: "NE",
    iconName: "Folder",
    iconSource: "lucide",
    command: "",
    description: "Entertainment",
    children: [
      {
        id: "3c9c7818-6e99-4e4f-8a4d-3e28d4d7f5d9",
        type: "app",
        label: "Spotify",
        iconName: "Music",
        iconSource: "native",
        command: "spotify",
        description: "Music Player",
      },
      {
        id: "4da08818-7f99-4e4f-8a4d-3e28d4d7f5da",
        type: "app",
        label: "YouTube",
        iconName: "Youtube",
        iconSource: "lucide",
        command: "https://www.youtube.com/",
        commandType: "url",
        description: "Web Video",
      },
      {
        id: "5eb19818-8099-4e4f-8a4d-3e28d4d7f5db",
        type: "app",
        label: "Netflix",
        iconName: "Clapperboard",
        iconSource: "lucide",
        command: "https://www.netflix.com/",
        commandType: "url",
        description: "Streaming",
      },
    ],
  },
  {
    id: "6fc2a818-9199-4e4f-8a4d-3e28d4d7f5dc",
    type: "app",
    label: "Games",
    direction: "SE",
    iconName: "Gamepad2",
    iconSource: "native",
    command: "steam",
    description: "Steam",
  },
  {
    id: "70d3b818-a299-4e4f-8a4d-3e28d4d7f5dd",
    type: "app",
    label: "Chat",
    direction: "S",
    iconName: "MessageSquare",
    iconSource: "native",
    command: "discord",
    description: "Discord",
  },
  {
    id: "81e4c818-b399-4e4f-8a4d-3e28d4d7f5de",
    type: "app",
    label: "Files",
    direction: "SW",
    iconName: "FolderOpen",
    iconSource: "native",
    command: "explorer",
    description: "File Manager",
  },
  {
    id: "92f5d818-c499-4e4f-8a4d-3e28d4d7f5df",
    type: "app",
    label: "Notes",
    direction: "W",
    iconName: "FileText",
    iconSource: "lucide",
    command: "internal:notes",
    description: "Quick Notes",
  },
  {
    id: "a306e818-d599-4e4f-8a4d-3e28d4d7f5e0",
    type: "app",
    label: "Calculator",
    direction: "NW",
    iconName: "Calculator",
    iconSource: "native",
    command: "calc",
    description: "Calculator",
  },
  {
    id: "antigravity-default",
    type: "app",
    label: "Antigravity",
    iconName: "Binary",
    iconSource: "lucide",
    command: "antigravity",
    description: "Next-gen AI IDE",
    hasRecents: true,
  },
  {
    id: "cursor-default",
    type: "app",
    label: "Cursor",
    iconName: "Code2",
    iconSource: "lucide",
    command: "cursor",
    description: "AI Code Editor",
    hasRecents: true,
  },
];

/**
 * IDs from the bundled demo radial (Browser, Media Hub, Steam, etc.) — not real Start Menu picks.
 * If Main still contains any of these after a previous bug, we re-run Start Menu discovery to replace them.
 */
export const BUNDLED_DEMO_APP_IDS: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  const walk = (items: AppItem[]) => {
    for (const a of items) {
      if (typeof a.command === "string" && a.command.startsWith("internal:")) continue;
      if (a.id) s.add(a.id);
      if (a.children?.length) walk(a.children);
    }
  };
  walk(DEFAULT_APPS);
  return s;
})();

export function workspaceContainsBundledDemoApp(workspace: Workspace): boolean {
  const scan = (items: AppItem[]): boolean => {
    for (const a of items) {
      if (a.id && BUNDLED_DEMO_APP_IDS.has(a.id)) return true;
      if (a.children?.length && scan(a.children)) return true;
    }
    return false;
  };
  return scan(workspace.apps);
}

/** Main workspace before Start Menu discovery: only Zenith widgets — never the full demo wheel (fixes wrong apps on first paint / disk). */
export const MINIMAL_MAIN_WORKSPACE_APPS: AppItem[] = DEFAULT_APPS.filter(
  (a) => typeof a.command === "string" && a.command.startsWith("internal:"),
);

// Default Workspaces
export const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: "workspace-1",
    name: "Main",
    hotkey: 1,
    enabled: true,
    apps: MINIMAL_MAIN_WORKSPACE_APPS,
    color: "#3B82F6", // Blue
  },
  {
    id: "workspace-2",
    name: "Streaming",
    hotkey: 2,
    enabled: true,
    apps: [
      {
        id: "stream-1",
        type: "app",
        label: "YouTube",
        iconName: "Youtube",
        iconSource: "lucide",
        command: "https://www.youtube.com/",
        commandType: "url",
        description: "Watch videos",
      },
      {
        id: "stream-2",
        type: "app",
        label: "Twitch",
        iconName: "Tv",
        iconSource: "lucide",
        command: "https://www.twitch.tv/",
        commandType: "url",
        description: "Live streaming",
      },
      {
        id: "stream-3",
        type: "app",
        label: "Prime Video",
        iconName: "MonitorPlay",
        iconSource: "lucide",
        command: "https://www.primevideo.com/",
        commandType: "url",
        description: "Amazon Streaming",
      },
      {
        id: "stream-4",
        type: "app",
        label: "Netflix",
        iconName: "Clapperboard",
        iconSource: "lucide",
        command: "https://www.netflix.com/br/",
        commandType: "url",
        description: "Netflix Brasil",
      },
    ],
    color: "#EF4444", // Red
  },
];

export const DEFAULT_UI_CONFIG: UIConfig = {
  accentColor: "#FFFFFF",
  menuRadius: 140,
  iconSize: 64,
  fixedPosition: true,
  backdropBlur: 34,
  backdropOpacity: 1,
  menuOpacity: 0.8,
  menuBackgroundStyle: "circle",
  appSpacing: 10, // Default spacing between apps
  activationThreshold: 60,
  centerButton: {
    type: "none",
    target: "",
    label: "",
    iconName: "Circle",
  },
  showLabels: true,
  showClock: true,
  showDate: true,
  showBattery: false,
  showWeather: false,
  clockPosition: "top-right",
  gameMode: {
    enabled: false,
    mode: "list", // Default to list mode
    blockFullscreen: true,
    blockedApps: "csgo.exe, valorant.exe, dota2.exe, overwatch.exe",
  },
  globalShortcut: "Alt+Z",
  workspaces: DEFAULT_WORKSPACES,
  activeWorkspaceIndex: 0,
  workspaceSwitchMode: 'hotkeys',
  enableMouseTrigger: true,
  language: "pt",
  performanceMode: false,
  deskIslandClockWhileIdle: false,
  notesWidgetBackdropOpacity: 0.85,
  alarmsWidgetBackdropOpacity: 0.85,
  pomodoroWidgetBackdropOpacity: 0.85,
  stopwatchWidgetBackdropOpacity: 0.85,
};

export const AVAILABLE_WIDGETS: WidgetDefinition[] = [
  {
    id: "zenith_notes",
    name: "Zenith Notes",
    description:
      "A minimalist card-based note taking tool with local persistence.",
    iconName: "FileText",
    command: "internal:notes",
    defaultLabel: "Notes",
  },
  {
    id: "zenith_alarm",
    name: "Zenith Alarm",
    description: "Set reminders and alarms. Runs in background.",
    iconName: "AlarmClock",
    command: "internal:alarm",
    defaultLabel: "Alarms",
  },
  {
    id: "zenith_stopwatch",
    name: "Zenith Stopwatch",
    description: "Precision chronograph with lap tracking.",
    iconName: "Timer",
    command: "internal:stopwatch",
    defaultLabel: "Stopwatch",
  },
  {
    id: "zenith_pomodoro",
    name: "Zenith Pomodoro",
    description: "Focus timer with task tracking and stats.",
    iconName: "TimerReset",
    command: "internal:pomodoro",
    defaultLabel: "Pomodoro",
  },
];

