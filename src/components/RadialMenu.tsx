import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coordinates, AppItem, UIConfig, Workspace } from '../types';
import { getIcon } from '../iconMap';
import { Settings2, CornerUpLeft, Cloud } from 'lucide-react';
import { SmartIcon } from './SmartIcon';
import { getTranslation } from '../translations';
import {
  getRootRadialApps,
  isWorkspacePickItem,
  parseWorkspacePickIndex,
} from '../utils/workspaceRadial';

// PERF FIX #3: Module-level weather cache — persists across menu open/close cycles
// Prevents a new HTTP fetch on every menu open; refreshes only after 10 minutes or location change
const weatherCache: { data: { temp: number; condition: string } | null; lastFetch: number; location: string } = {
  data: null, lastFetch: 0, location: ''
};
const WEATHER_TTL_MS = 10 * 60 * 1000; // 10 minutes

const CLOCK_HUD_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

/** Subconjunto da API Battery — evita `BatteryManager` quando o TS/DOM local não o expõe. */
type ZenithBattery = {
  level: number;
  addEventListener(type: 'levelchange', listener: () => void): void;
  removeEventListener(type: 'levelchange', listener: () => void): void;
};

// Helper to extract a normalized path from a command string for deduplication
const normalizePathForDedup = (item: any): string => {
  if (!item) return '';
  // NEVER use item.description as it might be "Quick Access Folder" or "Application"
  let pathStr = item.command || '';
  
  // 1. Handle commands with multiple arguments (e.g. "exe" "path" or code "path")
  // We want the LAST argument which is usually the file/folder path
  const allQuotes = [...pathStr.matchAll(/"([^"]+)"/g)];
  if (allQuotes.length > 0) {
    // If multiple quotes, take the last one (the folder path)
    // If one quote and it's an IDE command, take that quote
    pathStr = allQuotes[allQuotes.length - 1][1];
  } else {
    // No quotes, handle unquoted IDE prefixes (e.g., code C:\Path)
    const lower = pathStr.toLowerCase();
    const ideCommands = ['antigravity', 'cursor', 'code', 'vs code', 'vscode', 'code.exe', 'cursor.exe', 'antigravity.exe'];
    for (const cmd of ideCommands) {
      if (lower.startsWith(cmd + ' ')) {
        pathStr = pathStr.substring(cmd.length + 1).trim();
        break;
      }
    }
  }
  
  // 3. Absolute Normalization
  // - Lowercase for case-insensitivity
  // - Replace all backslashes with forward slashes
  // - Trim any trailing slashes or spaces
  // - Ensure drive letter is consistent (c: vs C:)
  let normalized = pathStr
    .toLowerCase()
    .trim()
    .replace(/[\\/]+/g, '/')     // Multiple slashes to single forward slash
    .replace(/\/+$/, '')         // Remove trailing slashes
    .replace(/^(['"]+)|(['"]+)$/g, ''); // Remove wrapping quotes if they managed to survive
    
  // Handle Windows Drive Letter consistency (e.g., c:/path -> c:/path)
  // We keep it lowercase as we already called .toLowerCase()
  if (/^[a-z]:/.test(normalized)) {
    // Already lowercased, just return
    return normalized;
  }
  
  return normalized;
};

/** When "recent folders" is enabled but MRU fetch is empty or fails, show one explicit slice — never auto-launch the parent IDE. */
function buildRecentsEmptyFallback(parent: AppItem, config: UIConfig): AppItem[] {
  return [
    {
      id: `${parent.id}__recents-empty-fallback`,
      label: getTranslation(config, 'menu.recents_fallback'),
      command: parent.command,
      commandType: parent.commandType || 'app',
      iconName: parent.iconName || 'AppWindow',
      iconSource: parent.iconSource || 'lucide',
      customIconUrl: parent.customIconUrl,
      description: parent.label,
    },
  ];
}

/** Parent IDE setting: MRU slices open a terminal cwd'd to the project path (see executeCommand + IDE branch). */
function applyOpenTerminalForRecents(recents: AppItem[], parent: AppItem): AppItem[] {
  if (!parent.openTerminalForRecents) return recents;
  return recents.map((r) => ({ ...r, openTerminal: true }));
}

interface RadialMenuProps {
  isOpen: boolean;
  position: Coordinates;
  /** Pass `selectedApp` when launching an item that may not exist in saved config (e.g. MRU `recent-*` ids). */
  onClose: (selectedId: string | null, selectedApp?: AppItem | null) => void;
  apps: AppItem[];
  config: UIConfig;
  triggerSource?: 'mmb' | 'mmb-click' | 'shortcut';
  onWorkspaceSwitch?: (workspaceIndex: number) => void;
  currentWorkspace?: Workspace;
}

interface RadialMenuItemProps {
  app: AppItem;
  index: number;
  isActive: boolean;
  actualMenuRadius: number;
  actualIconSize: number;
  totalApps: number;
  /** Narrow style props so parent config identity does not bust memo for every App re-render. */
  accentColor: string;
  backdropOpacity: number;
  showLabels: boolean;
  performanceMode: boolean;
  folderStackLength: number;
  isOpen: boolean;
  onClick: (app: AppItem) => void;
}

const RadialMenuItem = React.memo(({
  app,
  index,
  isActive,
  actualMenuRadius,
  actualIconSize,
  totalApps,
  accentColor,
  backdropOpacity,
  showLabels,
  performanceMode,
  folderStackLength,
  isOpen,
  onClick,
}: RadialMenuItemProps) => {
  const Icon = getIcon(app.iconName);
  const [remoteIconFailed, setRemoteIconFailed] = React.useState(false);
  React.useEffect(() => {
    setRemoteIconFailed(false);
  }, [app.customIconUrl]);
  const sliceAngle = 360 / totalApps;
  const angleDeg = (index * sliceAngle) - 90;
  const angleRad = angleDeg * (Math.PI / 180);
  const pos = {
    x: actualMenuRadius * Math.cos(angleRad),
    y: actualMenuRadius * Math.sin(angleRad),
  };

  // PERF FIX #2: useMemo instead of IIFE so this only recomputes when app.command/label/iconSource change
  const shouldUseCustomIcon = React.useMemo(() => {
    const LUCIDE_ICON_EXCEPTIONS = [
      'Microsoft.WindowsTerminal',
      'WindowsTerminal',
      'Terminal',
      'cmd.exe',
      'powershell.exe'
    ];
    const isException = LUCIDE_ICON_EXCEPTIONS.some(exception =>
      app.command?.toLowerCase().includes(exception.toLowerCase()) ||
      app.label?.toLowerCase().includes(exception.toLowerCase())
    );
    if (isException) return false;
    return app.iconSource === 'native' && !!app.customIconUrl;
  }, [app.command, app.label, app.iconSource, app.customIconUrl]);

  // Fast stagger: max 50ms total across all items for near-instant bloom (skip stagger in performance mode)
  const maxDelay = 0.032;
  const staggerDelay = performanceMode
    ? 0
    : Math.min((index / Math.max(totalApps, 1)) * maxDelay, maxDelay);

  return (
    <motion.div
      key={`${app.id}-${folderStackLength}`}
      initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
      animate={isOpen ? {
        scale: isActive ? 1.15 : 1,
        opacity: isActive ? 1 : 0.6,
        x: pos.x,
        y: pos.y
      } : {
        scale: 0, opacity: 0, x: 0, y: 0
      }}
      exit={{ scale: 0, opacity: 0, transition: { duration: 0.1 } }}
      transition={
        performanceMode
          ? { duration: 0.1, ease: 'easeOut', delay: isOpen ? staggerDelay : 0 }
          : {
              type: 'spring',
              stiffness: 520,
              damping: 28,
              mass: 0.72,
              delay: isOpen ? staggerDelay : 0,
            }
      }
      className="absolute top-0 left-0 pointer-events-auto cursor-pointer"
      style={{ zIndex: isActive ? 200 : 100, willChange: 'transform, opacity' }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick(app);
      }}
    >
      <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
        {/* WRAPPER FOR BADGE & MASKED CONTENT */}
        <div
          className="relative z-20"
          style={{
            width: `${actualIconSize}px`,
            height: `${actualIconSize}px`,
          }}
        >
          {/* INNER MASKED CONTAINER (Overflow Hidden) */}
          <div
            className={`
              w-full h-full rounded-2xl flex items-center justify-center overflow-hidden
              transition-colors duration-200 relative
            `}
            style={{
              backgroundColor: isActive ? accentColor : `rgba(${18 + Math.round(backdropOpacity * 12)}, ${18 + Math.round(backdropOpacity * 12)}, ${20 + Math.round(backdropOpacity * 12)}, 0.85)`,
              border: isActive ? `1px solid ${accentColor}` : `1px solid rgba(255,255,255,${0.08 + backdropOpacity * 0.06})`,
              color: isActive ? '#000' : '#fff',
            }}
          >
            {/* Icon Container: Show either native icon OR vector icon, not both */}
            <div className="w-full h-full flex items-center justify-center relative">
              {app.customIconUrl && !remoteIconFailed ? (
                /* Native / remote favicon */
                <SmartIcon
                  src={app.customIconUrl!}
                  alt={app.label}
                  className="object-contain relative z-10"
                  size={actualIconSize}
                  referenceScale={0.88}
                  onError={() => setRemoteIconFailed(true)}
                />
              ) : (
                /* Vector Icon (Only when no custom icon) */
                <Icon size={Math.round(actualIconSize * 0.55)} strokeWidth={1.5} />
              )}
            </div>
          </div>

          {/* FOLDER BADGE (Outside Mask, Inside Wrapper) */}
          {app.type === 'folder' && (
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border-2 border-[#1A1A1A] z-30 shadow-md">
              <div className="w-1 h-1 bg-black rounded-full" />
              <div className="w-1 h-1 bg-black rounded-full ml-0.5" />
            </div>
          )}
        </div>

        {showLabels && (
          <motion.div
            className="absolute pointer-events-none z-30"
            style={{
              left: '50%',
              top: '50%',
              translateX: '-50%',
              translateY: '0%',
            }}
            initial={{ opacity: 0, scale: 0.85, y: actualIconSize / 2 + 0 }}
            animate={{
              opacity: isActive ? 1 : 0,
              scale: isActive ? 1 : 0.9,
              x: 0,
              y: actualIconSize / 2 + 4,
            }}
            exit={{ opacity: 0, scale: 0.85, y: actualIconSize / 2 + 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 380, mass: 0.6 }}
          >
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl whitespace-nowrap"
              style={{
                background: 'rgba(10, 10, 13, 0.90)',
                border: `1px solid rgba(255,255,255,0.09)`,
                boxShadow: `0 4px 16px rgba(0,0,0,0.45)`,
              }}
            >
              <span
                className="text-white/90 font-medium text-[13px] tracking-wide leading-none"
                style={{ fontFamily: 'Space Grotesk, sans-serif' }}
              >
                {app.label}
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});

/** One SVG spoke; `isActive` only toggles for the hovered slice so React skips other lines on pointer move. */
const RadialSliceLine = React.memo(
  ({
    isActive,
    index,
    total,
    actualMenuRadius,
    accentColor,
  }: {
    isActive: boolean;
    index: number;
    total: number;
    actualMenuRadius: number;
    accentColor: string;
  }) => {
    const sliceAngle = 360 / total;
    const angleDeg = index * sliceAngle - 90;
    const angleRad = angleDeg * (Math.PI / 180);
    const x = actualMenuRadius * Math.cos(angleRad);
    const y = actualMenuRadius * Math.sin(angleRad);
    return (
      <line
        x1="50%"
        y1="50%"
        x2={actualMenuRadius * 1.5 + x}
        y2={actualMenuRadius * 1.5 + y}
        stroke={isActive ? accentColor : 'white'}
        strokeWidth={isActive ? 1.5 : 0.5}
        opacity={isActive ? 0.5 : 0.08}
        style={{ transition: 'opacity 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease' }}
      />
    );
  }
);

const RadialMenuInner: React.FC<RadialMenuProps> = ({
  isOpen,
  position,
  onClose,
  apps,
  config,
  triggerSource = 'shortcut',
  onWorkspaceSwitch,
  currentWorkspace,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isCenterActive, setIsCenterActive] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const isCenterActiveRef = useRef(isCenterActive);
  const openingTimeRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  // PERF FIX #4: Only update clock state when the displayed HH:MM string changes (once/minute vs once/second)
  const lastDisplayedMinute = useRef('');

  useEffect(() => {
    isCenterActiveRef.current = isCenterActive;
  }, [isCenterActive]);

  // Folder Navigation State
  const [currentLevelApps, setCurrentLevelApps] = useState<AppItem[]>(apps);
  const [folderStack, setFolderStack] = useState<{ label: string, apps: AppItem[] }[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const iconSizePx = config.iconSize || 64;
  const minGap = config.appSpacing || 0;
  const numberOfApps = currentLevelApps.length;

  // Intelligent Layout Calibration
  const { actualMenuRadius, actualIconSize } = React.useMemo(() => {
    const baseRadius = config.menuRadius + minGap;
    // Allow the menu to occupy up to 52% of the smallest screen dimension (Phase 3)
    const maxScreenRadius = Math.min(window.innerWidth, window.innerHeight) * 0.52;

    let currentIconSize = iconSizePx;
    let targetRadius = baseRadius;

    if (numberOfApps > 1) {
      // Calculate radius needed to maintain the gap with current icon size
      const anglePerSliceRad = (2 * Math.PI) / numberOfApps;
      const sinHalfAngle = Math.sin(anglePerSliceRad / 2);

      // Phase 3: Extreme Gap Multiplier (2.0x + 16px safe zone)
      const calculateRequiredRadius = (size: number) => {
        const effectiveDiameter = size + (minGap * 2.0) + 16;
        return (effectiveDiameter / 2) / sinHalfAngle;
      };

      let requiredRadius = calculateRequiredRadius(currentIconSize);
      targetRadius = Math.max(baseRadius, requiredRadius);

      // If the target radius exceeds screen bounds, we must scale down icons
      if (targetRadius > maxScreenRadius) {
        // Formula: scale = (2 * maxRadius * sinHalfAngle - (gap * 2.0 + 16)) / iconSize
        const possibleScale = (2 * maxScreenRadius * sinHalfAngle - ((minGap * 2.0) + 16)) / iconSizePx;
        // Clamp scale factor between 50% (Phase 3) and 100%
        const scaleFactor = Math.max(0.5, Math.min(1.0, possibleScale));

        currentIconSize = Math.round(iconSizePx * scaleFactor);
        // Re-calculate radius with scaled icon
        targetRadius = Math.max(baseRadius, calculateRequiredRadius(currentIconSize));

        // CRITICAL FIX: To prevent lateral overlaps, we MUST prioritize the calculated radius 
        // even if it slightly exceeds maxScreenRadius, as long as it fits the icons.
        // We only cap if it's truly massive.
      }
    }

    return {
      actualMenuRadius: targetRadius,
      actualIconSize: currentIconSize
    };
  }, [config.menuRadius, numberOfApps, iconSizePx, minGap]);

  // Sync root radial when workspace config / active workspace apps change while menu stays open
  useEffect(() => {
    if (!isOpen || folderStack.length > 0) return;
    setCurrentLevelApps(getRootRadialApps(config, apps));
  }, [isOpen, folderStack.length, apps, config.workspaceSwitchMode, config.workspaces, config]);

  /** Lista vazia: manter foco visual no centro (volta / centro) — antes o rato não atualizava o hub. */
  useEffect(() => {
    if (!isOpen || currentLevelApps.length > 0) return;
    setActiveIndex(null);
    setIsCenterActive(true);
  }, [isOpen, currentLevelApps.length]);

  const t = (key: string) => getTranslation(config, key);

  // Determine Center Icon
  // If we are deep in a folder, show Back arrow. Otherwise show configured icon.
  const isRoot = folderStack.length === 0;
  const CenterIcon = !isRoot ? CornerUpLeft : (config.centerButton?.iconName ? getIcon(config.centerButton.iconName) : Settings2);
  const centerLabel = !isRoot ? t('menu.back') : (config.centerButton?.label || t('menu.center'));

  // PERF FIX #4: Clock — only trigger re-render when the displayed minute changes
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      const now = new Date();
      const hhmm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (hhmm !== lastDisplayedMinute.current) {
        lastDisplayedMinute.current = hhmm;
        setCurrentTime(now);
      }
    };
    tick(); // run immediately on open
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Reset state when menu opens
  useEffect(() => {
    if (isOpen) {
      openingTimeRef.current = Date.now();
      setHasMoved(false);
      setIsCenterActive(false);
      setFolderStack([]);
      setCurrentLevelApps(getRootRadialApps(configRef.current, apps));
      setActiveIndex(null);

      // CRITICAL: Focus window and body to ensure keyboard events are captured
      // This is especially important when menu is opened via MMB or after dashboard interaction
      window.focus();
      document.body.focus();
      if (menuRef.current) {
        menuRef.current.focus();
      }
    }
  }, [isOpen]);

  // Stable Interaction Logic (Performance Optimization)
  // We use refs to access current state inside stable event listeners
  // to avoid destroying/recreating listeners on every hover (index change).
  const stateRef = useRef({
    isOpen,
    position,
    activeIndex,
    onClose,
    currentLevelApps,
    config,
    isCenterActive,
    hasMoved,
    folderStack,
    apps,
  });

  /** Layout: pointer math uses `position` — must match props before paint or first rAF sees stale center (fullscreen vs ilha small). */
  useLayoutEffect(() => {
    stateRef.current = {
      isOpen,
      position,
      activeIndex,
      onClose,
      currentLevelApps,
      config,
      isCenterActive,
      hasMoved,
      folderStack,
      apps,
    };
  }, [isOpen, position, activeIndex, onClose, currentLevelApps, config, isCenterActive, hasMoved, folderStack, apps]);

  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;
    let lastMouseEvent: MouseEvent | null = null;

    const processMouseMove = () => {
      if (!lastMouseEvent) return;
      const { position, config, currentLevelApps, hasMoved, activeIndex } = stateRef.current;

      const e = lastMouseEvent;
      const deltaX = e.clientX - position.x;
      const deltaY = e.clientY - position.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const MOVEMENT_BUFFER = 15;

      if (currentLevelApps.length === 0) {
        if (!hasMoved && distance > MOVEMENT_BUFFER) {
          setHasMoved(true);
        }
        if (distance < config.activationThreshold) {
          if (activeIndex !== null) setActiveIndex(null);
          if (!stateRef.current.isCenterActive) setIsCenterActive(true);
        } else {
          if (stateRef.current.isCenterActive) setIsCenterActive(false);
          if (activeIndex !== null) setActiveIndex(null);
        }
        rafId = null;
        return;
      }

      if (!hasMoved && distance > MOVEMENT_BUFFER) {
        setHasMoved(true);
      }

      if (distance < config.activationThreshold) {
        if (activeIndex !== null) setActiveIndex(null);
        if (!stateRef.current.isCenterActive) setIsCenterActive(true);
        rafId = null;
        return;
      }

      if (stateRef.current.isCenterActive) setIsCenterActive(false);

      let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      angle = (angle + 90);
      if (angle < 0) angle += 360;

      const sliceAngle = 360 / currentLevelApps.length;
      const index = Math.floor(((angle + (sliceAngle / 2)) % 360) / sliceAngle);

      if (index >= 0 && index < currentLevelApps.length) {
        if (activeIndex !== index) setActiveIndex(index);
      }

      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseEvent = e;
      if (rafId === null) {
        rafId = requestAnimationFrame(processMouseMove);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const { isCenterActive, folderStack, apps, currentLevelApps, activeIndex, onClose, config } = stateRef.current;

      const selectedItemObj = activeIndex !== null ? currentLevelApps[activeIndex] : null;

      if (isCenterActive) {
        if (folderStack.length > 0) {
          const newStack = [...folderStack];
          newStack.pop();
          setFolderStack(newStack);

          if (newStack.length === 0) {
            setCurrentLevelApps(getRootRadialApps(config, apps));
          } else {
            setCurrentLevelApps(newStack[newStack.length - 1].apps);
          }
          setHasMoved(false);
          setIsCenterActive(false);
        } else {
          onClose('__CENTER__');
        }
        return;
      }

      if (selectedItemObj && isWorkspacePickItem(selectedItemObj)) {
        const idx = parseWorkspacePickIndex(selectedItemObj.id);
        if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
        const ws = config.workspaces[idx];
        if (ws?.enabled) {
          const list = ws.apps;
          setFolderStack([{ label: ws.name, apps: list }]);
          setCurrentLevelApps(list);
          setHasMoved(false);
          setActiveIndex(null);
        }
        return;
      }

      const selectedItem = selectedItemObj as any;
      if (!selectedItem) return;
        // Core Folder Integration Logic
        const isKnownIDE = (item: any) => {
          const l = item.label?.toLowerCase() || '';
          return l.includes('antigravity') || l.includes('cursor') || l.includes('vs code') || l.includes('vscode');
        };

        const hasRecentFetch = (selectedItem.hasRecents) && window.electron?.getAppRecents;
        const hasManualFolders = selectedItem.children && selectedItem.children.length > 0;

        if (selectedItem.type === 'folder' && selectedItem.children) {
          // Standard Folder Group
          setFolderStack([...folderStack, { label: selectedItem.label, apps: selectedItem.children }]);
          setCurrentLevelApps(selectedItem.children);
          setHasMoved(false);
          setActiveIndex(null);
        } else if (hasRecentFetch || hasManualFolders) {
          // App with Recents/QuickAccess
          setIsLoadingRecents(true);
          const manualFolders = selectedItem.children || [];

          if (hasRecentFetch) {
            window.electron!.getAppRecents(selectedItem.label, selectedItem.command).then(recents => {
              setIsLoadingRecents(false);
              const seenPathsMap = new Map();
              const seenLabels = new Set();
              manualFolders.forEach(c => {
                 const norm = normalizePathForDedup(c);
                 if (norm) seenPathsMap.set(norm, c.label || c.command);
                 if (c.label) seenLabels.add(c.label.toLowerCase());
              });
              
              const seenPaths = new Set(seenPathsMap.keys());
              
              const seenNormalized = new Set(seenPaths); // Start with manual folders
              const uniqueRecents = recents.filter(r => {
                const normalized = normalizePathForDedup(r);
                if (!normalized) return false;
                
                const isDuplicatePath = seenNormalized.has(normalized);
                const rLabelLower = (r.label || '').toLowerCase();
                const isDuplicateLabel = rLabelLower && seenLabels.has(rLabelLower);
                
                if (isDuplicatePath || isDuplicateLabel) {
                   return false;
                }
                
                seenNormalized.add(normalized);
                if (rLabelLower) seenLabels.add(rLabelLower);
                return true;
              });
              
              const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, selectedItem)];

              if (combined.length > 0) {
                setFolderStack([...folderStack, { label: selectedItem.label, apps: combined }]);
                setCurrentLevelApps(combined);
                setHasMoved(false);
                setActiveIndex(null);
              } else if (selectedItem.hasRecents) {
                setIsLoadingRecents(false);
                const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                setFolderStack([...folderStack, { label: selectedItem.label, apps: fallback }]);
                setCurrentLevelApps(fallback);
                setHasMoved(false);
                setActiveIndex(null);
              } else {
                onClose(selectedItem.id, selectedItem);
              }
            }).catch(() => {
              setIsLoadingRecents(false);
              if (selectedItem.hasRecents) {
                const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                setFolderStack([...folderStack, { label: selectedItem.label, apps: fallback }]);
                setCurrentLevelApps(fallback);
                setHasMoved(false);
                setActiveIndex(null);
              } else {
                onClose(selectedItem.id, selectedItem);
              }
            });
          } else {
            // Only manual folders
            setIsLoadingRecents(false);
            setFolderStack([...folderStack, { label: selectedItem.label, apps: manualFolders }]);
            setCurrentLevelApps(manualFolders);
            setHasMoved(false);
            setActiveIndex(null);
          }
        } else {
          onClose(selectedItem.id, selectedItem);
        }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        stateRef.current.onClose(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      onClose(null);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!onWorkspaceSwitch) return;
      const { config, folderStack } = stateRef.current;
      if (config.workspaceSwitchMode === 'picker' && folderStack.length === 0) return;
      const numWorkspaces = config.workspaces.length;
      if (numWorkspaces <= 1) return;

      const currentIndex = config.activeWorkspaceIndex;
      let nextIndex = currentIndex;

      if (e.deltaY < 0) {
        nextIndex = (currentIndex - 1 + numWorkspaces) % numWorkspaces;
      } else if (e.deltaY > 0) {
        nextIndex = (currentIndex + 1) % numWorkspaces;
      }

      if (nextIndex !== currentIndex) {
        const nextWs = config.workspaces[nextIndex];
        if (!nextWs) return;
        const list = nextWs.apps;
        setFolderStack([]);
        setActiveIndex(null);
        setHasMoved(false);
        setCurrentLevelApps(list);
        onWorkspaceSwitch(nextIndex);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen]);

  // Sync workspace shortcuts state with main process (Fix for initial focus issue)
  useEffect(() => {
    if (window.electron?.setWorkspaceShortcutsState) {
      window.electron.setWorkspaceShortcutsState(
        isOpen,
        config.workspaceSwitchMode === 'picker' ? 'picker' : 'hotkeys',
      );
    }
  }, [isOpen, config.workspaceSwitchMode]);

  // STABLE KEYBOARD LISTENER (Decoupled from interaction states to avoid missing events)
  // NOTE: Workspace switching (1-9) is handled exclusively by global shortcuts registered in
  // the backend (set-workspace-shortcuts IPC). Having a duplicate listener here caused double-firing.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // diagLog(`[RadialMenu.tsx] KeyDown detected: ${e.key}, Ctrl: ${e.ctrlKey}, Alt: ${e.altKey}, Shift: ${e.shiftKey}`);
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(null);
        return;
      }

      // Workspace Switching (1-9) — disabled in picker mode (user chooses workspace on the radial)
      if (
        onWorkspaceSwitch &&
        configRef.current.workspaceSwitchMode !== 'picker'
      ) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          onWorkspaceSwitch(num - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose, onWorkspaceSwitch]);

  // MMB Release Logic (Hold to Open -> Release to Execute)
  // Uses stateRef so the native listener is not torn down on every hover (activeIndex) update.
  useEffect(() => {
    if (!isOpen || triggerSource !== 'mmb' || !window.electron?.onMmbRelease) return;

    const handleMmbRelease = () => {
      const elapsed = Date.now() - openingTimeRef.current;
      const GRACE_PERIOD_MS = 250; // Ensure menu stays open for at least 250ms to prevent flickers

      const executeClose = () => {
        const { isCenterActive, folderStack, currentLevelApps, activeIndex, apps, onClose, config } = stateRef.current;

        if (isCenterActive) {
          if (folderStack.length > 0) {
            const newStack = folderStack.slice(0, -1);
            setFolderStack(newStack);
            if (newStack.length === 0) setCurrentLevelApps(getRootRadialApps(config, apps));
            else setCurrentLevelApps(newStack[newStack.length - 1].apps);
            setHasMoved(false);
            setIsCenterActive(false);
          } else {
            onClose('__CENTER__');
          }
          return;
        }

        const selectedItem = activeIndex !== null ? currentLevelApps[activeIndex] : null;

        if (selectedItem && isWorkspacePickItem(selectedItem)) {
          const idx = parseWorkspacePickIndex(selectedItem.id);
          if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
          const ws = config.workspaces[idx];
          if (ws?.enabled) {
            const list = ws.apps;
            setFolderStack([{ label: ws.name, apps: list }]);
            setCurrentLevelApps(list);
            setHasMoved(false);
            setActiveIndex(null);
          }
          return;
        }

        if (selectedItem) {
          const hasRecentFetch = (selectedItem.hasRecents) && window.electron?.getAppRecents;
          const hasManualFolders = selectedItem.children && selectedItem.children.length > 0;

          if (selectedItem.type === 'folder' && selectedItem.children) {
            setFolderStack(prev => [...prev, { label: selectedItem.label, apps: selectedItem.children! }]);
            setCurrentLevelApps(selectedItem.children);
            setHasMoved(false);
            setActiveIndex(null);
          } else if (hasRecentFetch || hasManualFolders) {
            setIsLoadingRecents(true);
            const manualFolders = selectedItem.children || [];

            if (selectedItem.hasRecents && window.electron?.getAppRecents) {
              window.electron!.getAppRecents(selectedItem.label, selectedItem.command).then(recents => {
                setIsLoadingRecents(false);
                const seenPaths = new Set(manualFolders.map(c => normalizePathForDedup(c)));
                const uniqueRecents = recents.filter(r => {
                  const normalized = normalizePathForDedup(r);
                  return normalized && !seenPaths.has(normalized);
                });
                const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, selectedItem)];

                if (combined.length > 0) {
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: combined }]);
                  setCurrentLevelApps(combined);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else if (selectedItem.hasRecents) {
                  setIsLoadingRecents(false);
                  const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: fallback }]);
                  setCurrentLevelApps(fallback);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else {
                  onClose(selectedItem.id, selectedItem);
                }
              }).catch(() => {
                setIsLoadingRecents(false);
                if (selectedItem.hasRecents) {
                  const fallback = buildRecentsEmptyFallback(selectedItem, stateRef.current.config);
                  setFolderStack(prev => [...prev, { label: selectedItem.label, apps: fallback }]);
                  setCurrentLevelApps(fallback);
                  setHasMoved(false);
                  setActiveIndex(null);
                } else {
                  onClose(selectedItem.id, selectedItem);
                }
              });
            } else {
              setIsLoadingRecents(false);
              setFolderStack(prev => [...prev, { label: selectedItem.label, apps: manualFolders }]);
              setCurrentLevelApps(manualFolders);
              setHasMoved(false);
              setActiveIndex(null);
            }
          } else {
            onClose(selectedItem.id, selectedItem);
          }
        } else {
          onClose(null);
        }
      };

      const { hasMoved } = stateRef.current;
      if (!hasMoved && elapsed < GRACE_PERIOD_MS) {
        setTimeout(executeClose, GRACE_PERIOD_MS - elapsed);
      } else {
        executeClose();
      }
    };

    const cleanup = window.electron.onMmbRelease(handleMmbRelease);
    return () => {
      if (cleanup) cleanup();
    };
  }, [isOpen, triggerSource, onWorkspaceSwitch]);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // Battery & Weather Logic
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let batteryObj: ZenithBattery | null = null;
    const onBatteryLevel = () => {
      if (cancelled || !batteryObj) return;
      setBatteryLevel(Math.round(batteryObj.level * 100));
    };

    const nav = navigator as Navigator & { getBattery?: () => Promise<ZenithBattery> };
    if (config.showBattery && typeof nav.getBattery === 'function') {
      void nav.getBattery().then((battery) => {
        if (cancelled) return;
        batteryObj = battery;
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener('levelchange', onBatteryLevel);
      });
    }

    // Real Weather Logic (wttr.in) with 10-minute cache
    if (config.showWeather) {
      const loc = config.weatherLocation || '';
      const now = Date.now();
      const cacheValid = weatherCache.data &&
        weatherCache.location === loc &&
        (now - weatherCache.lastFetch) < WEATHER_TTL_MS;

      if (cacheValid) {
        setWeather(weatherCache.data);
      } else {
        const fetchWeather = async () => {
          try {
            const response = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`);
            if (!response.ok) throw new Error('Weather fetch failed');
            const data = await response.json();
            const current = data.current_condition[0];
            const result = { temp: parseInt(current.temp_C), condition: current.weatherDesc[0].value };
            weatherCache.data = result;
            weatherCache.lastFetch = Date.now();
            weatherCache.location = loc;
            if (!cancelled) setWeather(result);
          } catch (err) {
            console.error("Failed to fetch weather:", err);
            if (!cancelled && !weatherCache.data) setWeather({ temp: 0, condition: '---' });
          }
        };
        fetchWeather();
      }
    }

    return () => {
      cancelled = true;
      if (batteryObj) {
        try {
          batteryObj.removeEventListener('levelchange', onBatteryLevel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [isOpen, config.showBattery, config.showWeather, config.weatherLocation]);

  const handleAppClick = React.useCallback((app: AppItem) => {
    const cfg = configRef.current;
    if (isWorkspacePickItem(app)) {
      const idx = parseWorkspacePickIndex(app.id);
      if (onWorkspaceSwitch) onWorkspaceSwitch(idx);
      const ws = cfg.workspaces[idx];
      if (ws?.enabled) {
        const list = ws.apps;
        setFolderStack([{ label: ws.name, apps: list }]);
        setCurrentLevelApps(list);
        setHasMoved(false);
        setActiveIndex(null);
      }
      return;
    }
    const hasRecentFetch = (app.hasRecents) && window.electron?.getAppRecents;
    const hasManualFolders = app.children && app.children.length > 0;

    if (app.type === 'folder' && app.children) {
      setFolderStack(prev => [...prev, { label: app.label, apps: app.children! }]);
      setCurrentLevelApps(app.children);
      setHasMoved(false);
      setActiveIndex(null);
    } else if (hasRecentFetch || hasManualFolders) {
      setIsLoadingRecents(true);
      const manualFolders = app.children || [];

      if (app.hasRecents && window.electron?.getAppRecents) {
        window.electron!.getAppRecents(app.label, app.command).then(recents => {
          setIsLoadingRecents(false);
          const seenPaths = new Set(manualFolders.map(c => c.command));
          const uniqueRecents = recents.filter(r => !seenPaths.has(r.command));
          const combined = [...manualFolders, ...applyOpenTerminalForRecents(uniqueRecents, app)];

          if (combined.length > 0) {
            setFolderStack(prev => [...prev, { label: app.label, apps: combined }]);
            setCurrentLevelApps(combined);
            setHasMoved(false);
            setActiveIndex(null);
          } else if (app.hasRecents) {
            setIsLoadingRecents(false);
            const fallback = buildRecentsEmptyFallback(app, cfg);
            setFolderStack(prev => [...prev, { label: app.label, apps: fallback }]);
            setCurrentLevelApps(fallback);
            setHasMoved(false);
            setActiveIndex(null);
          } else {
            onClose(app.id, app);
          }
        }).catch(() => {
          setIsLoadingRecents(false);
          if (app.hasRecents) {
            const fallback = buildRecentsEmptyFallback(app, cfg);
            setFolderStack(prev => [...prev, { label: app.label, apps: fallback }]);
            setCurrentLevelApps(fallback);
            setHasMoved(false);
            setActiveIndex(null);
          } else {
            onClose(app.id, app);
          }
        });
      } else {
        setIsLoadingRecents(false);
        setFolderStack(prev => [...prev, { label: app.label, apps: manualFolders }]);
        setCurrentLevelApps(manualFolders);
        setHasMoved(false);
        setActiveIndex(null);
      }
    } else {
      onClose(app.id, app);
    }
  }, [onClose, onWorkspaceSwitch]);

  /** Região do relógio — usada também para desviar o chip do workspace e evitar sobreposição. */
  const hudRegion: (typeof CLOCK_HUD_POSITIONS)[number] = CLOCK_HUD_POSITIONS.includes(
    config.clockPosition as (typeof CLOCK_HUD_POSITIONS)[number],
  )
    ? (config.clockPosition as (typeof CLOCK_HUD_POSITIONS)[number])
    : 'top-center';

  /** Só posicionamento + translate no ecrã — sem `motion` aqui para o Framer não pisar `-translate-x-1/2`. */
  const hudShellClass = (() => {
    const z = 'fixed z-[10] pointer-events-none text-white';
    switch (hudRegion) {
      case 'bottom-left':
        return `${z} bottom-0 left-0`;
      case 'bottom-right':
        return `${z} bottom-0 right-0`;
      case 'top-left':
        return `${z} top-0 left-0`;
      case 'top-center':
        return `${z} top-0 left-1/2 -translate-x-1/2`;
      case 'top-right':
        return `${z} top-0 right-0`;
      default:
        return `${z} top-0 left-1/2 -translate-x-1/2`;
    }
  })();

  const hudInnerClass = (() => {
    const pad = 'p-5 sm:p-6 md:pt-7 md:px-8 md:pb-8';
    const gap = 'gap-3 sm:gap-4';
    switch (hudRegion) {
      case 'bottom-left':
        return `flex flex-col ${pad} ${gap} items-start text-left max-w-[min(92vw,440px)]`;
      case 'bottom-right':
        return `flex flex-col ${pad} ${gap} items-end text-right max-w-[min(92vw,440px)]`;
      case 'top-left':
        return `flex flex-col ${pad} ${gap} items-start text-left max-w-[min(92vw,440px)]`;
      case 'top-center':
        return `flex flex-col ${pad} ${gap} items-center text-center w-max max-w-[min(92vw,560px)] mx-auto`;
      case 'top-right':
        return `flex flex-col ${pad} ${gap} items-end text-right max-w-[min(92vw,440px)]`;
      default:
        return `flex flex-col ${pad} ${gap} items-center text-center w-max max-w-[min(92vw,560px)] mx-auto`;
    }
  })();

  /** Chip do espaço: canto oposto ao HUD quando este está no topo-esquerda/direita. */
  const workspaceShellClass =
    hudRegion === 'top-left'
      ? 'fixed top-6 right-6 sm:top-8 sm:right-8 z-[10] pointer-events-none'
      : hudRegion === 'top-right'
        ? 'fixed top-6 left-6 sm:top-8 sm:left-8 z-[10] pointer-events-none'
        : 'fixed top-6 left-6 sm:top-8 sm:left-8 z-[10] pointer-events-none';

  const hudStatusRowClass =
    hudRegion === 'top-center'
      ? 'flex flex-wrap items-center justify-center gap-x-5 gap-y-2 w-full'
      : hudRegion === 'top-right' || hudRegion === 'bottom-right'
        ? 'flex flex-wrap items-center justify-end gap-x-5 gap-y-2 w-full'
        : 'flex flex-wrap items-center justify-start gap-x-5 gap-y-2 w-full';

  /** Fundo uniforme — gradientes radiais antigos criavam um “anel” mais claro à volta do menu. */
  const bo = config.backdropOpacity;
  const overlayAlpha = Math.min(0.88, 0.3 + bo * 0.58);
  const overlayDim = `rgba(0, 0, 0, ${overlayAlpha})`;

  return (
    <motion.div
      className="fixed inset-0 z-[70]"
      initial={false}
      animate={{ 
        visibility: isOpen ? 'visible' : 'hidden' 
      }}
      transition={{
        /* Sem atraso ao fechar — senão o HUD (relógio) do radial ficava visível por cima/atras da ilha compacta. */
        visibility: { delay: 0 },
      }}
      style={{ 
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
        <>
          {/* Escurecimento único (sem máscara radial — evita halo / “luz” à volta do radial) */}
          <motion.div
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: isOpen ? 0.18 : 0.1, ease: 'easeOut' }}
            className="fixed inset-0 z-[2]"
            style={{
              pointerEvents: isOpen ? 'auto' : 'none',
              background: overlayDim,
              willChange: 'opacity',
            }}
          />

          {/* HUD: shell estático (translate no ecrã) + motion só com opacity — evita Framer a pisar -translate-x-1/2 no centro. */}
          {(config.showClock || config.showDate || config.showBattery || config.showWeather) && (
            <div className={hudShellClass}>
              <motion.div
                initial={false}
                animate={{
                  opacity: isOpen ? 1 : 0,
                  y: isOpen ? 0 : hudRegion.startsWith('bottom') ? 10 : -10,
                }}
                transition={{ duration: isOpen ? 0.26 : 0.14, ease: [0.22, 1, 0.36, 1] }}
                className={hudInnerClass}
              >
                <div className="w-full min-w-0 rounded-2xl border border-white/[0.09] bg-black/25 px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl supports-[backdrop-filter]:bg-black/[0.14] sm:px-6 sm:py-5">
                  {(config.showClock || config.showDate) && (
                    <div
                      className={
                        hudRegion === 'top-center'
                          ? 'flex flex-col items-center gap-1'
                          : hudRegion === 'top-right' || hudRegion === 'bottom-right'
                            ? 'flex flex-col items-end gap-1'
                            : 'flex flex-col items-start gap-1'
                      }
                    >
                      {config.showClock && (
                        <div
                          className="text-[clamp(2.25rem,5vw,3.25rem)] font-light tabular-nums leading-none tracking-[-0.02em] text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
                          style={{ fontFamily: 'Space Grotesk, ui-sans-serif, system-ui, sans-serif' }}
                        >
                          {currentTime.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })}
                        </div>
                      )}
                      {config.showDate && (
                        <p
                          className={`max-w-[52ch] text-[0.8125rem] font-medium leading-snug tracking-wide text-white/55 sm:text-sm ${
                            hudRegion === 'top-center'
                              ? 'text-center'
                              : hudRegion === 'top-right' || hudRegion === 'bottom-right'
                                ? 'text-right'
                                : 'text-left'
                          }`}
                        >
                          {currentTime.toLocaleDateString([], {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  {(config.showBattery || config.showWeather) && (
                    <div
                      className={`mt-3 border-t border-white/[0.07] pt-3 text-white/85 ${hudStatusRowClass} ${
                        config.showClock || config.showDate ? '' : 'mt-0 border-t-0 pt-0'
                      }`}
                    >
                      {config.showBattery && batteryLevel !== null && (
                        <div className="flex items-center gap-2.5">
                          <div
                            className="relative h-3.5 w-8 shrink-0 rounded-full border border-white/[0.22] bg-white/[0.06] p-[3px]"
                            aria-hidden
                          >
                            <div
                              className="h-full max-w-full rounded-full bg-white transition-[width] duration-500 ease-out"
                              style={{
                                width: `${batteryLevel}%`,
                                backgroundColor: batteryLevel < 20 ? '#f87171' : undefined,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums tracking-wide text-white/75">
                            {batteryLevel}%
                          </span>
                        </div>
                      )}
                      {config.showWeather && !config.performanceMode && weather && (
                        <div className="flex items-center gap-2">
                          <Cloud className="h-4 w-4 shrink-0 text-white/45" strokeWidth={1.75} aria-hidden />
                          <div className="flex flex-col leading-none">
                            <span className="text-sm font-semibold tabular-nums tracking-tight text-white/90">
                              {weather.temp}°
                            </span>
                            {weather.condition && weather.condition !== '---' && (
                              <span className="mt-0.5 max-w-[10rem] truncate text-[10px] font-medium uppercase tracking-wider text-white/40">
                                {weather.condition}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {/* Workspace Indicator */}
          {currentWorkspace && (
            <motion.div
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0 }}
              transition={{ duration: isOpen ? 0.24 : 0.12 }}
              className={workspaceShellClass}
            >
              <div
                className={`flex max-w-[min(88vw,280px)] items-center gap-2.5 rounded-2xl border border-white/[0.1] bg-black/30 px-3.5 py-2.5 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-black/20 sm:gap-3 sm:px-4 sm:py-3 ${
                  hudRegion === 'top-left' ? 'flex-row-reverse' : ''
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-xs font-bold text-white ring-1 ring-white/[0.06] sm:h-8 sm:w-8">
                  {currentWorkspace.hotkey}
                </div>
                <div
                  className={`min-w-0 flex-1 ${hudRegion === 'top-left' ? 'text-right' : 'text-left'}`}
                >
                  <div className="truncate text-xs font-semibold uppercase tracking-wide text-white/90 sm:text-[13px]">
                    {currentWorkspace.name}
                  </div>
                  <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/35">
                    {apps.length} {t('workspaces.active_modules')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Menu Container */}
          <motion.div
            ref={menuRef}
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.92 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              left: Math.round(position.x),
              top: Math.round(position.y),
              width: 0,
              height: 0,
              willChange: 'transform, opacity'
            }}
            className="fixed z-[10] pointer-events-none"
            tabIndex={-1}
          >


            {/* Central Hub */}
            <motion.div
              className={`
                absolute top-0 left-0
                rounded-full flex items-center justify-center z-20
                transition-all duration-300 pointer-events-auto cursor-pointer
                ${isCenterActive
                  ? 'text-black border-2'
                  : 'bg-[#0D0D0D] border border-white/10 text-white/50'
                }
              `}
              style={{
                width: `${Math.round(actualIconSize * 1.2)}px`,
                height: `${Math.round(actualIconSize * 1.2)}px`,
                backgroundColor: isCenterActive ? config.accentColor : undefined,
                borderColor: isCenterActive ? config.accentColor : undefined,
                willChange: 'transform, opacity, background-color'
              }}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                scale: isCenterActive ? 1.06 : 1,
                opacity: 1,
                x: '-50%',
                y: '-50%'
              }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (folderStack.length > 0) {
                  const newStack = [...folderStack];
                  newStack.pop();
                  setFolderStack(newStack);
                  if (newStack.length === 0) {
                    setCurrentLevelApps(getRootRadialApps(config, apps));
                  } else {
                    setCurrentLevelApps(newStack[newStack.length - 1].apps);
                  }
                  setHasMoved(false);
                  setIsCenterActive(false);
                } else {
                  onClose('__CENTER__');
                }
              }}
            >
              {isLoadingRecents ? (
                <div className="flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full"
                  />
                </div>
              ) : isCenterActive ? (
                <div className="flex flex-col items-center animate-in fade-in duration-300">
                  <CenterIcon size={isRoot && config.centerButton?.type === 'none' ? Math.round(actualIconSize * 0.65) : Math.round(actualIconSize * 0.5)} strokeWidth={1.5} />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1">
                  {folderStack.length > 0 ? (
                    // Inside folder: show back icon + depth dots
                    <>
                      <CenterIcon size={Math.round(actualIconSize * 0.45)} strokeWidth={1.5} />
                      <div className="flex gap-0.5 mt-0.5">
                        {folderStack.map((_, i) => (
                          <div key={i} className="w-1 h-1 rounded-full bg-white/40" />
                        ))}
                      </div>
                    </>
                  ) : (
                    // Root: same icon as hover, dimmed
                    <CenterIcon size={isRoot && config.centerButton?.type === 'none' ? Math.round(actualIconSize * 0.65) : Math.round(actualIconSize * 0.5)} strokeWidth={1.5} className="text-white/40" />
                  )}
                </div>
              )}
            </motion.div>

            {/* Connecting Lines (SVG) — one element per slice; omit when costly (performance mode or many slices) */}
            {!config.performanceMode && currentLevelApps.length <= 18 && currentLevelApps.length > 0 && (
            <svg
              className="absolute overflow-visible pointer-events-none"
              style={{
                width: actualMenuRadius * 3,
                height: actualMenuRadius * 3,
                left: 0, top: 0,
                transform: 'translate(-50%, -50%)',
                zIndex: 0
              }}
            >
              {currentLevelApps.map((_, index) => (
                <RadialSliceLine
                  key={`line-${index}`}
                  index={index}
                  isActive={index === activeIndex}
                  total={currentLevelApps.length}
                  actualMenuRadius={actualMenuRadius}
                  accentColor={config.accentColor}
                />
              ))}
            </svg>
            )}

            {/* App Icons - AnimatePresence handles transition between folders */}
            <AnimatePresence>
              {currentLevelApps.map((app, index) => {
                const isActive = index === activeIndex;
                return (
                  <RadialMenuItem
                    key={`${app.id}-${folderStack.length}-${index}`}
                    app={app}
                    index={index}
                    isActive={isActive}
                    actualMenuRadius={actualMenuRadius}
                    actualIconSize={actualIconSize}
                    totalApps={currentLevelApps.length}
                    accentColor={config.accentColor}
                    backdropOpacity={config.backdropOpacity}
                    showLabels={config.showLabels}
                    performanceMode={config.performanceMode}
                    folderStackLength={folderStack.length}
                    isOpen={isOpen}
                    onClick={handleAppClick}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        </>
    </motion.div>
  );
};

export const RadialMenu = React.memo(RadialMenuInner);