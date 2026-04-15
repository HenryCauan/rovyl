import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coordinates, AppItem, UIConfig, Workspace } from '../types';
import { getIcon } from '../iconMap';
import { Settings2, CornerUpLeft } from 'lucide-react';
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
  triggerSource?: 'mmb' | 'shortcut';
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
  const maxDelay = 0.05;
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
          ? { duration: 0.12, ease: 'easeOut', delay: isOpen ? staggerDelay : 0 }
          : {
              type: 'spring',
              stiffness: 400,
              damping: 25,
              mass: 0.8,
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
              ${isActive ? 'shadow-[0_0_25px_rgba(255,255,255,0.15)]' : ''}
            `}
            style={{
              backgroundColor: isActive ? accentColor : `rgba(${18 + Math.round(backdropOpacity * 12)}, ${18 + Math.round(backdropOpacity * 12)}, ${20 + Math.round(backdropOpacity * 12)}, 0.85)`,
              border: isActive ? `1px solid ${accentColor}` : `1px solid rgba(255,255,255,${0.08 + backdropOpacity * 0.06})`,
              color: isActive ? '#000' : '#fff',
              boxShadow: !isActive ? `0 2px 12px rgba(0,0,0,0.3)` : undefined
            }}
          >
            {/* Icon Container: Show either native icon OR vector icon, not both */}
            <div className="w-full h-full flex items-center justify-center relative">
              {app.customIconUrl ? (
                /* Native Icon (Automatically normalized) */
                <SmartIcon
                  src={app.customIconUrl!}
                  alt={app.label}
                  className="object-contain relative z-10"
                  size={actualIconSize}
                  referenceScale={0.88}
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
      if (currentLevelApps.length === 0) return;

      const e = lastMouseEvent;
      const deltaX = e.clientX - position.x;
      const deltaY = e.clientY - position.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const MOVEMENT_BUFFER = 15;

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
    let batteryObj: Awaited<ReturnType<typeof navigator.getBattery>> | null = null;
    const onBatteryLevel = () => {
      if (cancelled || !batteryObj) return;
      setBatteryLevel(Math.round(batteryObj.level * 100));
    };

    if (config.showBattery && 'getBattery' in navigator) {
      void navigator.getBattery().then((battery) => {
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

  const getHUDStyles = () => {
    /** z-[10+] dentro do wrapper z-[70] — overlay de dim fica em z-[2] para não cobrir ícones/HUD */
    const base = "fixed text-white pointer-events-none flex flex-col z-[10] p-8 gap-4";
    const safePosition = [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-right',
    ].includes(config.clockPosition)
      ? config.clockPosition
      : 'top-center';

    switch (safePosition) {
      case 'bottom-left': return `${base} bottom-0 left-0 items-start text-left`;
      case 'bottom-right': return `${base} bottom-0 right-0 items-end text-right`;
      case 'top-left': return `${base} top-0 left-0 items-start text-left`;
      case 'top-center': return `${base} top-0 left-1/2 -translate-x-1/2 items-center text-center`;
      case 'top-right': return `${base} top-0 right-0 items-end text-right`;
      default: return `${base} top-0 left-1/2 -translate-x-1/2 items-center text-center`;
    }
  };

  /** Without acrylic/blur (performance mode), the radial overlay used to fade to transparent at the edges — too much of the desktop showed through. Stronger full-screen dimming while respecting `backdropOpacity`. */
  const bo = config.backdropOpacity;
  const perf = config.performanceMode;
  const perfRadialEdge = perf ? Math.min(0.92, 0.2 + bo * 0.72) : 0;
  const overlayFullscreen = perf
    ? `radial-gradient(circle at center, rgba(0, 0, 0, ${0.05 + bo * 0.3 + 0.1 + bo * 0.08}) 0%, rgba(0, 0, 0, ${0.2 + bo * 0.5 + 0.14 + bo * 0.1}) 100%)`
    : `radial-gradient(circle at center, rgba(0, 0, 0, ${0.05 + bo * 0.3}) 0%, rgba(0, 0, 0, ${0.2 + bo * 0.5}) 100%)`;
  const overlayRadial = perf
    ? `radial-gradient(circle at ${position.x}px ${position.y}px, rgba(0, 0, 0, ${0.18 + bo * 0.82}) 0%, rgba(0, 0, 0, ${0.08 + bo * 0.38}) ${config.menuRadius * 2.0}px, rgba(0, 0, 0, ${perfRadialEdge}) 100%)`
    : `radial-gradient(circle at ${position.x}px ${position.y}px, rgba(0, 0, 0, ${0.15 + bo * 0.8}) 0%, rgba(0, 0, 0, ${0.05 + bo * 0.35}) ${config.menuRadius * 2.0}px, rgba(0, 0, 0, 0) 100%)`;

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
          {/* Layer 1: Acrylic Desktop Blur (only CSS can't blur the desktop in Electron) */}
          {config.backdropBlur > 0 && !config.performanceMode && (
            <motion.div
              key="blur-vignette"
              animate={{ opacity: isOpen ? 1 : 0 }}
              className="fixed inset-0 z-[1] pointer-events-none"
              style={{
                // Vignette mask: transparent in the center so the Acrylic blur is visible,
                // dark at the edges to hide the white border that native Acrylic creates.
                background: config.menuBackgroundStyle === 'fullscreen'
                  ? `radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)`
                  : `radial-gradient(circle at ${position.x}px ${position.y}px, transparent 0%, transparent ${config.menuRadius * 1.2}px, rgba(0,0,0,0.65) ${config.menuRadius * 3}px, rgba(0,0,0,0.9) 100%)`,
              }}
            />
          )}

          {/* Layer 2: Color/Gradient Overlay (Opacity controlled by Slider) — Airier */}
          <motion.div
            initial={false}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: isOpen ? 0.25 : 0.12, ease: 'easeOut' }}
            className="fixed inset-0 z-[2]"
            style={{
              pointerEvents: isOpen ? 'auto' : 'none',
              background: config.menuBackgroundStyle === 'fullscreen' ? overlayFullscreen : overlayRadial,
              willChange: 'opacity'
            }}
          />

          {/* HUD Elements */}
          {(config.showClock || config.showDate || config.showBattery || config.showWeather) && (
            <motion.div
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0, x: isOpen ? 0 : 20 }}
              transition={{ duration: isOpen ? 0.22 : 0 }}
              className={getHUDStyles()}
            >
              {/* Clock & Date */}
              {(config.showClock || config.showDate) && (
                <div className="flex flex-col">
                  {config.showClock && (
                    <div className="text-5xl font-[350] tracking-tight tabular-nums leading-none drop-shadow-2xl" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                      {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  )}
                  {config.showDate && (
                    <div className="text-sm font-bold tracking-[0.2em] text-white/60 uppercase mt-1 drop-shadow-md">
                      {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              )}

              {/* Status Info (Battery/Weather) */}
              {(config.showBattery || config.showWeather) && (
                <div className="flex items-center gap-6 text-white/80">
                  {config.showBattery && batteryLevel !== null && (
                    <div className="flex items-center gap-2">
                      <div className="relative w-6 h-3 border border-white/40 rounded-sm p-0.5">
                        <div
                          className="h-full bg-white rounded-[1px] transition-all duration-500"
                          style={{ width: `${batteryLevel}%`, backgroundColor: batteryLevel < 20 ? '#ef4444' : 'white' }}
                        />
                      </div>
                      <span className="text-xs font-bold font-mono">{batteryLevel}%</span>
                    </div>
                  )}
                  {config.showWeather && !config.performanceMode && weather && (
                    <div className="flex items-center gap-2">
                      {/* Simple Weather Icon placeholder */}
                      <div className="text-lg">☁️</div>
                      <div className="flex flex-col leading-none">
                        <span className="text-sm font-bold">{weather.temp}°</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Workspace Indicator */}
          {currentWorkspace && (
            <motion.div
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -20 }}
              className="fixed top-8 left-8 z-[10] pointer-events-none"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-full">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white">
                  {currentWorkspace.hotkey}
                </div>
                <div className="flex flex-col">
                  <div className="text-sm font-medium text-white/80 tracking-wide">
                    {currentWorkspace.name.toUpperCase()}
                  </div>
                  <div className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-0.5">
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
            animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.8 }}
            transition={{ type: 'spring', damping: 24, stiffness: 350, mass: 0.8 }}
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
                  : 'bg-[#0D0D0D] border border-white/10 text-white/50 shadow-lg'
                }
              `}
              style={{
                width: `${Math.round(actualIconSize * 1.2)}px`,
                height: `${Math.round(actualIconSize * 1.2)}px`,
                backgroundColor: isCenterActive ? config.accentColor : undefined,
                borderColor: isCenterActive ? config.accentColor : undefined,
                boxShadow: isCenterActive ? `0 0 50px ${config.accentColor}66` : undefined,
                willChange: 'transform, opacity, background-color'
              }}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                scale: isCenterActive ? 1.12 : 1,
                opacity: 1,
                x: '-50%',
                y: '-50%'
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 250, mass: 0.8 }}
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
            {!config.performanceMode && currentLevelApps.length <= 18 && (
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