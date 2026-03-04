import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coordinates, AppItem, UIConfig, Workspace } from '../types';
import { getIcon } from '../iconMap';
import { Settings2, CornerUpLeft } from 'lucide-react';
import { SmartIcon } from './SmartIcon';
import { getTranslation } from '../translations';

interface RadialMenuProps {
  isOpen: boolean;
  position: Coordinates;
  onClose: (selectedId: string | null) => void;
  apps: AppItem[];
  config: UIConfig;
  triggerSource?: 'mmb' | 'shortcut';
  onWorkspaceSwitch?: (workspaceIndex: number) => void;
  currentWorkspace?: Workspace;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ isOpen, position, onClose, apps, config, triggerSource = 'shortcut', onWorkspaceSwitch, currentWorkspace }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isCenterActive, setIsCenterActive] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const isCenterActiveRef = useRef(isCenterActive);
  const openingTimeRef = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    isCenterActiveRef.current = isCenterActive;
  }, [isCenterActive]);

  // Folder Navigation State
  const [currentLevelApps, setCurrentLevelApps] = useState<AppItem[]>(apps);
  const [folderStack, setFolderStack] = useState<{ label: string, apps: AppItem[] }[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);

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

  // Sync props to internal state when menu opens or props change
  useEffect(() => {
    if (isOpen && folderStack.length === 0) {
      setCurrentLevelApps(apps);
    }
  }, [apps, isOpen, folderStack.length]);

  const t = (key: string) => getTranslation(config, key);

  // Determine Center Icon
  // If we are deep in a folder, show Back arrow. Otherwise show configured icon.
  const isRoot = folderStack.length === 0;
  const CenterIcon = !isRoot ? CornerUpLeft : (config.centerButton?.iconName ? getIcon(config.centerButton.iconName) : Settings2);
  const centerLabel = !isRoot ? t('menu.back') : (config.centerButton?.label || t('menu.center'));

  // Timer for Clock
  useEffect(() => {
    if (!isOpen) return;
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Reset state when menu opens
  useEffect(() => {
    if (isOpen) {
      openingTimeRef.current = Date.now();
      setHasMoved(false);
      setIsCenterActive(false);
      setFolderStack([]);
      setCurrentLevelApps(apps);
      setActiveIndex(null);

      // CRITICAL: Focus window to ensure keyboard events are captured
      // This is especially important when menu is opened via MMB
      window.focus();
      document.body.focus();
    }
  }, [isOpen]);

  // Interaction Logic with Performance Optimization
  useEffect(() => {
    if (!isOpen || currentLevelApps.length === 0) return;

    let rafId: number | null = null;
    let lastMouseEvent: MouseEvent | null = null;

    const processMouseMove = () => {
      if (!lastMouseEvent) return;

      const e = lastMouseEvent;
      const deltaX = e.clientX - position.x;
      const deltaY = e.clientY - position.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const MOVEMENT_BUFFER = 15;

      if (!hasMoved && distance > MOVEMENT_BUFFER) {
        setHasMoved(true);
      }

      if (distance < config.activationThreshold) {
        setActiveIndex(null);
        if (hasMoved) setIsCenterActive(true);
        rafId = null;
        return;
      }

      setIsCenterActive(false);

      let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
      angle = (angle + 90);
      if (angle < 0) angle += 360;

      const sliceAngle = 360 / currentLevelApps.length;
      const index = Math.floor(((angle + (sliceAngle / 2)) % 360) / sliceAngle);

      // Ensure index is valid
      if (index >= 0 && index < currentLevelApps.length) {
        setActiveIndex(index);
      }

      rafId = null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseEvent = e;

      // Throttle using requestAnimationFrame
      if (rafId === null) {
        rafId = requestAnimationFrame(processMouseMove);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;

      // Center / Back Action
      if (isCenterActive) {
        if (folderStack.length > 0) {
          // Go Back Logic
          const newStack = [...folderStack];
          newStack.pop();
          setFolderStack(newStack);

          if (newStack.length === 0) {
            setCurrentLevelApps(apps);
          } else {
            setCurrentLevelApps(newStack[newStack.length - 1].apps);
          }
          // Reset interaction states
          setHasMoved(false);
          setIsCenterActive(false);
        } else {
          // Root Level Center Action
          onClose('__CENTER__');
        }
        return;
      }

      // Item Selection
      const selectedItem = activeIndex !== null ? currentLevelApps[activeIndex] : null;

      if (selectedItem) {
        if (selectedItem.type === 'folder' && selectedItem.children) {
          // Enter Folder Logic
          setFolderStack([...folderStack, { label: selectedItem.label, apps: selectedItem.children }]);
          setCurrentLevelApps(selectedItem.children);
          setHasMoved(false); // Reset to force movement out of center
          setActiveIndex(null);
        } else {
          // Standard App Launch
          onClose(selectedItem.id);
        }
      } else {
        onClose(null);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        // If deep in folder, right click could act as back? Or just close?
        // Let's keep it consistent: Right click closes everything.
        onClose(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousedown', handleMouseDown);
    // Keydown listener moved to specialized stable useEffect
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isOpen, position, activeIndex, onClose, currentLevelApps, config, isCenterActive, hasMoved, folderStack, apps]);

  // STABLE KEYBOARD LISTENER (Decoupled from interaction states to avoid missing events)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      console.log(`[RadialMenu.tsx] KeyDown detected: ${e.key}, Ctrl: ${e.ctrlKey}, Alt: ${e.altKey}, Shift: ${e.shiftKey}`);
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(null);
        return;
      }

      // Workspace Switching (1-9)
      if (onWorkspaceSwitch) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
          console.log('🔄 Stable Listener Switching to workspace:', num - 1, 'Current config.activeWorkspaceIndex:', config.activeWorkspaceIndex);
          e.preventDefault();
          onWorkspaceSwitch(num - 1); // Convert to 0-indexed
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onWorkspaceSwitch, onClose]);

  // MMB Release Logic (Hold to Open -> Release to Execute)
  useEffect(() => {
    if (!isOpen || triggerSource !== 'mmb' || !window.electron?.onMmbRelease) return;

    const handleMmbRelease = () => {
      console.log("MMB Release detected. Active Index:", activeIndex);

      const elapsed = Date.now() - openingTimeRef.current;
      const GRACE_PERIOD_MS = 250; // Ensure menu stays open for at least 250ms to prevent flickers

      const executeClose = () => {
        if (isCenterActive) {
          if (folderStack.length > 0) {
            const newStack = [...folderStack];
            newStack.pop();
            setFolderStack(newStack);
            if (newStack.length === 0) setCurrentLevelApps(apps);
            else setCurrentLevelApps(newStack[newStack.length - 1].apps);
            setHasMoved(false);
            setIsCenterActive(false);
          } else {
            onClose('__CENTER__');
          }
          return;
        }

        const selectedItem = activeIndex !== null ? currentLevelApps[activeIndex] : null;

        if (selectedItem) {
          if (selectedItem.type === 'folder' && selectedItem.children) {
            setFolderStack([...folderStack, { label: selectedItem.label, apps: selectedItem.children }]);
            setCurrentLevelApps(selectedItem.children);
            setHasMoved(false);
            setActiveIndex(null);
          } else {
            onClose(selectedItem.id);
          }
        } else {
          onClose(null);
        }
      };

      if (elapsed < GRACE_PERIOD_MS) {
        console.log(`MMB release too quick (${elapsed}ms), applying grace period...`);
        setTimeout(executeClose, GRACE_PERIOD_MS - elapsed);
      } else {
        executeClose();
      }
    };

    const cleanup = window.electron.onMmbRelease(handleMmbRelease);
    return () => {
      if (cleanup) cleanup();
    };
  }, [isOpen, triggerSource, activeIndex, isCenterActive, folderStack, currentLevelApps, onClose, apps]);

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // Battery & Weather Logic
  useEffect(() => {
    if (!isOpen) return;

    // Battery
    if (config.showBattery && 'getBattery' in navigator) {
      // @ts-ignore
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        // @ts-ignore
        battery.addEventListener('levelchange', () => setBatteryLevel(Math.round(battery.level * 100)));
      });
    }

    // Real Weather Logic (wttr.in)
    if (config.showWeather) {
      const fetchWeather = async () => {
        try {
          const loc = config.weatherLocation || '';
          // Using wttr.in with JSON format. 
          // loc can be "Sao Paulo" or a CEP (like 01310100)
          const response = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`);
          if (!response.ok) throw new Error('Weather fetch failed');

          const data = await response.json();
          const current = data.current_condition[0];
          setWeather({
            temp: parseInt(current.temp_C),
            condition: current.weatherDesc[0].value
          });
        } catch (err) {
          console.error("Failed to fetch weather:", err);
          // Fallback if fetch fails but keep it silent or show old data
          if (!weather) setWeather({ temp: 0, condition: '---' });
        }
      };

      fetchWeather();
      // Update weather every 30 minutes while menu is open? 
      // Actually, since menu is open only for short bursts, fetching on open is enough.
    }
  }, [isOpen, config.showBattery, config.showWeather, config.weatherLocation]);

  const getHUDStyles = () => {
    const base = "fixed text-white pointer-events-none flex flex-col z-50 p-8 gap-4";
    const safePosition = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(config.clockPosition)
      ? config.clockPosition
      : 'top-right';

    switch (safePosition) {
      case 'bottom-left': return `${base} bottom-0 left-0 items-start text-left`;
      case 'bottom-right': return `${base} bottom-0 right-0 items-end text-right`;
      case 'top-left': return `${base} top-0 left-0 items-start text-left`;
      case 'top-right': default: return `${base} top-0 right-0 items-end text-right`;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Layer 1: Adjustable CSS Backdrop Blur (Radius controlled by Slider) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 pointer-events-none"
            style={{
              backgroundColor: config.backdropBlur > 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
              backdropFilter: config.backdropBlur > 0 ? `blur(${config.backdropBlur}px)` : 'none',
              WebkitBackdropFilter: config.backdropBlur > 0 ? `blur(${config.backdropBlur}px)` : 'none',
              willChange: 'backdrop-filter'
            }}
          />

          {/* Layer 2: Color/Gradient Overlay (Opacity controlled by Slider) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[41] pointer-events-auto"
            style={{
              background: config.menuBackgroundStyle === 'fullscreen'
                ? `radial-gradient(circle at center, rgba(0, 0, 0, ${config.backdropOpacity * 0.4}) 0%, rgba(0, 0, 0, ${config.backdropOpacity * 0.85}) 100%)`
                : `radial-gradient(circle at ${position.x}px ${position.y}px, rgba(0, 0, 0, ${config.backdropOpacity + 0.1}) 0%, rgba(0, 0, 0, ${config.backdropOpacity * 0.5}) ${config.menuRadius * 1.5}px, rgba(0, 0, 0, 0) 100%)`,
              willChange: 'opacity'
            }}
          />

          {/* HUD Elements */}
          {(config.showClock || config.showDate || config.showBattery || config.showWeather) && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
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
                  {config.showWeather && weather && (
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
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed top-8 left-8 z-50 pointer-events-none"
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
                    {currentWorkspace.apps.length} {t('workspaces.active_modules')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Menu Container */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', damping: 28, stiffness: 400, mass: 0.8 }}
            style={{
              left: Math.round(position.x),
              top: Math.round(position.y),
              width: 0,
              height: 0,
              willChange: 'transform, opacity'
            }}
            className="fixed z-50 pointer-events-none"
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
              }}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                scale: isCenterActive ? 1.2 : 1,
                opacity: 1,
                x: '-50%',
                y: '-50%'
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                console.log("RadialMenu: Center clicked, label:", centerLabel);
                if (folderStack.length > 0) {
                  const newStack = [...folderStack];
                  newStack.pop();
                  setFolderStack(newStack);
                  if (newStack.length === 0) {
                    setCurrentLevelApps(apps);
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
              {isCenterActive ? (
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

            {/* Connecting Lines (SVG) - Re-rendered on stack change */}
            <svg
              key={`lines-${folderStack.length}`}
              className="absolute overflow-visible opacity-30 pointer-events-none"
              style={{
                width: actualMenuRadius * 3,
                height: actualMenuRadius * 3,
                left: 0, top: 0,
                transform: 'translate(-50%, -50%)',
                zIndex: 0
              }}
            >
              {currentLevelApps.map((_, index) => {
                const isActive = index === activeIndex;
                const sliceAngle = 360 / currentLevelApps.length;
                const angleDeg = (index * sliceAngle) - 90;
                const angleRad = angleDeg * (Math.PI / 180);
                const x = actualMenuRadius * Math.cos(angleRad);
                const y = actualMenuRadius * Math.sin(angleRad);

                return (
                  <motion.line
                    key={`line-${index}`}
                    x1="50%"
                    y1="50%"
                    x2={actualMenuRadius * 1.5 + x}
                    y2={actualMenuRadius * 1.5 + y}
                    stroke={isActive ? config.accentColor : "white"}
                    strokeWidth={isActive ? 2 : 1}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: isActive ? 0.6 : 0.1 }}
                    transition={{ duration: 0.2 }}
                  />
                );
              })}
            </svg>

            {/* App Icons - AnimatePresence handles transition between folders */}
            <AnimatePresence mode="popLayout">
              {currentLevelApps.map((app, index) => {
                const isActive = index === activeIndex;
                const Icon = getIcon(app.iconName);
                const sliceAngle = 360 / currentLevelApps.length;
                const angleDeg = (index * sliceAngle) - 90;
                const angleRad = angleDeg * (Math.PI / 180);
                const pos = {
                  x: actualMenuRadius * Math.cos(angleRad),
                  y: actualMenuRadius * Math.sin(angleRad),
                };

                const shouldUseCustomIcon = (() => {
                  // Lista de apps que devem usar ícone Lucide em vez do nativo por serem problemáticos ou feios
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
                })();

                return (
                  <motion.div
                    key={`${app.id}-${folderStack.length}`} // Key change triggers animation
                    initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                    animate={{
                      scale: isActive ? 1.2 : 1,
                      opacity: isActive ? 1 : 0.5,
                      x: pos.x,
                      y: pos.y
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.8 }}
                    className="absolute top-0 left-0 pointer-events-auto cursor-pointer"
                    style={{ zIndex: isActive ? 200 : 100, willChange: 'transform, opacity' }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log("RadialMenu: Selection clicked:", app.label, "ID:", app.id);
                      if (app.type === 'folder' && app.children) {
                        setFolderStack([...folderStack, { label: app.label, apps: app.children }]);
                        setCurrentLevelApps(app.children);
                        setHasMoved(false);
                        setActiveIndex(null);
                      } else {
                        onClose(app.id);
                      }
                    }}
                  >
                    <div className="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                      {/* WRAPPER FOR BADGE & MASKED CONTENT */}
                      <div
                        className="relative z-20"
                        style={{
                          width: `${actualIconSize}px`,
                          height: `${actualIconSize}px`,
                          filter: !isActive ? `drop-shadow(0 0 ${Math.round(config.backdropOpacity * 12)}px rgba(255,255,255,${config.backdropOpacity * 0.15}))` : 'none'
                        }}
                      >
                        {/* INNER MASKED CONTAINER (Overflow Hidden) */}
                        <div
                          className={`
                            w-full h-full rounded-2xl flex items-center justify-center overflow-hidden
                            transition-all duration-300 relative
                            ${isActive ? 'shadow-[0_0_30px_rgba(255,255,255,0.2)]' : 'hover:bg-white/5'}
                          `}
                          style={{
                            backgroundColor: isActive ? config.accentColor : `rgb(${13 + Math.round(config.backdropOpacity * 15)}, ${13 + Math.round(config.backdropOpacity * 15)}, ${13 + Math.round(config.backdropOpacity * 15)})`,
                            border: isActive ? `1px solid ${config.accentColor}` : `1px solid rgba(255,255,255,${0.1 + config.backdropOpacity * 0.08})`,
                            color: isActive ? '#000' : '#fff'
                          }}
                        >
                          {/* Icon Container: Show either native icon OR vector icon, not both */}
                          <div className="w-full h-full flex items-center justify-center relative">
                            {shouldUseCustomIcon ? (
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

                      {config.showLabels && (
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
                              background: 'rgba(8, 8, 10, 0.72)',
                              backdropFilter: 'blur(16px)',
                              WebkitBackdropFilter: 'blur(16px)',
                              border: `1px solid rgba(255,255,255,0.09)`,
                              boxShadow: `0 8px 32px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.04) inset`,
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
              })}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};