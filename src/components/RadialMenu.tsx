import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coordinates, AppItem, UIConfig } from '../types';
import { getIcon } from '../iconMap';
import { Settings2, CornerUpLeft } from 'lucide-react';

interface RadialMenuProps {
  isOpen: boolean;
  position: Coordinates;
  onClose: (selectedId: string | null) => void;
  apps: AppItem[];
  config: UIConfig;
  triggerSource?: 'mmb' | 'shortcut';
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ isOpen, position, onClose, apps, config, triggerSource = 'shortcut' }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isCenterActive, setIsCenterActive] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Folder Navigation State
  const [currentLevelApps, setCurrentLevelApps] = useState<AppItem[]>(apps);
  const [folderStack, setFolderStack] = useState<{ label: string, apps: AppItem[] }[]>([]);

  const menuRef = useRef<HTMLDivElement>(null);

  const iconSizePx = config.iconSize || 64;
  const minGap = config.appSpacing || 0;
  const numberOfApps = currentLevelApps.length;

  let actualMenuRadius = config.menuRadius;

  if (numberOfApps > 1) {
    const effectiveIconDiameter = iconSizePx + minGap;
    const anglePerSliceRad = (360 / numberOfApps) * (Math.PI / 180);
    const sinHalfAngle = Math.sin(anglePerSliceRad / 2);
    if (sinHalfAngle > 0) {
      const requiredRadiusForSpacing = (effectiveIconDiameter / 2) / sinHalfAngle;
      actualMenuRadius = Math.max(config.menuRadius, requiredRadiusForSpacing);
    } else {
      actualMenuRadius = config.menuRadius + effectiveIconDiameter;
    }
  }

  // Sync props to internal state when menu opens or props change
  useEffect(() => {
    if (isOpen && folderStack.length === 0) {
      setCurrentLevelApps(apps);
    }
  }, [apps, isOpen, folderStack.length]);

  // Determine Center Icon
  // If we are deep in a folder, show Back arrow. Otherwise show configured icon.
  const isRoot = folderStack.length === 0;
  const CenterIcon = !isRoot ? CornerUpLeft : (config.centerButton?.iconName ? getIcon(config.centerButton.iconName) : Settings2);
  const centerLabel = !isRoot ? 'BACK' : (config.centerButton?.label || 'CENTER');

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
      setActiveIndex(null);
      setIsCenterActive(false);
      setHasMoved(false);
      // We do NOT reset folderStack here to allow "remembering" position if desired, 
      // but standard behavior is usually reset. Let's reset for consistency.
      setFolderStack([]);
      setCurrentLevelApps(apps);
    }
  }, [isOpen]);

  // Interaction Logic
  useEffect(() => {
    if (!isOpen || currentLevelApps.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(null);
      }
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isOpen, position, activeIndex, onClose, currentLevelApps, config, isCenterActive, hasMoved, folderStack, apps]);

  // MMB Release Logic (Hold to Open -> Release to Execute)
  // MMB Release Logic (Hold to Open -> Release to Execute)
  useEffect(() => {
    if (!isOpen || triggerSource !== 'mmb' || !window.electron?.onMmbRelease) return;

    const handleMmbRelease = () => {
      console.log("MMB Release detected. Active Index:", activeIndex);

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

    const cleanup = window.electron.onMmbRelease(handleMmbRelease);
    return () => {
      if (cleanup) cleanup();
    };
  }, [isOpen, triggerSource, activeIndex, isCenterActive, folderStack, currentLevelApps, onClose, apps]);

  const getClockStyles = () => {
    const base = "fixed text-white pointer-events-none flex flex-col z-50 p-8";
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
          {/* Unified Backdrop (Fullscreen + Optional Circular Highlight) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 pointer-events-auto"
            style={{
              background: config.menuBackgroundStyle === 'fullscreen'
                ? `radial-gradient(circle at center, rgba(0, 0, 0, ${config.backdropOpacity * 0.5}) 0%, rgba(0, 0, 0, ${config.backdropOpacity * 0.95}) 100%)`
                : `radial-gradient(circle at ${position.x}px ${position.y}px, rgba(0, 0, 0, ${config.backdropOpacity + 0.2}) 0%, rgba(0, 0, 0, ${config.backdropOpacity * 0.6}) ${config.menuRadius * 1.5}px, rgba(0, 0, 0, 0) 100%)`,
              backdropFilter: config.backdropBlur > 0 ? `blur(${config.backdropBlur}px)` : 'none'
            }}
          />

          {/* Clock */}
          {config.showClock && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={getClockStyles()}
            >
              <div className="text-4xl font-[300] tracking-tight tabular-nums leading-none drop-shadow-md">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </div>
              <div className="text-xs font-medium tracking-[0.2em] text-white/60 uppercase mt-1 drop-shadow-sm">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </motion.div>
          )}

          {/* Menu Container */}
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              left: Math.round(position.x),
              top: Math.round(position.y),
              width: 0,
              height: 0
            }}
            className="fixed z-50 pointer-events-none"
          >


            {/* Central Hub */}
            <motion.div
              className={`
                absolute top-0 left-0
                w-24 h-24 rounded-full flex items-center justify-center z-20
                transition-all duration-300 pointer-events-auto cursor-pointer
                ${isCenterActive
                  ? 'bg-white text-black border-2 border-white shadow-[0_0_50px_rgba(255,255,255,0.4)]'
                  : 'bg-[#0D0D0D] border border-white/10 text-white/50 shadow-lg'
                }
              `}
              initial={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
              animate={{
                scale: isCenterActive ? 1.1 : 1,
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
                  <CenterIcon size={24} strokeWidth={1.5} />
                  <span className="text-[8px] font-bold tracking-widest mt-1 max-w-[80px] truncate text-center px-1">
                    {centerLabel}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] tracking-[0.2em] font-medium text-white/60">
                    {folderStack.length > 0 ? folderStack[folderStack.length - 1].label.toUpperCase() : 'APPS'}
                  </span>
                  {folderStack.length > 0 && (
                    <div className="flex gap-0.5">
                      {folderStack.map((_, i) => (
                        <div key={i} className="w-1 h-1 rounded-full bg-white/40" />
                      ))}
                    </div>
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
                const labelDist = (iconSizePx * 0.75) + 8;
                const labelPos = {
                  x: Math.cos(angleRad) * labelDist,
                  y: Math.sin(angleRad) * labelDist
                };

                const shouldUseCustomIcon = app.iconSource === 'native' && app.customIconUrl;

                if (isActive && shouldUseCustomIcon) {
                  // Debug: console.log(`Menu Rendering: Item ${app.label} using custom icon. URL length: ${app.customIconUrl?.length || 0}`);
                }

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
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="absolute top-0 left-0 pointer-events-auto cursor-pointer"
                    style={{ zIndex: 100 }}
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
                          width: `${iconSizePx}px`,
                          height: `${iconSizePx}px`
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
                            backgroundColor: isActive ? config.accentColor : '#0D0D0D',
                            border: isActive ? `1px solid ${config.accentColor}` : '1px solid rgba(255,255,255,0.1)',
                            color: isActive ? '#000' : '#fff'
                          }}
                        >
                          {/* Icon Container: Native icon on top, Vector icon behind */}
                          <div className="w-full h-full flex items-center justify-center relative">
                            {/* Vector Fallback (Always there, behind) */}
                            <div className="absolute inset-0 flex items-center justify-center text-white/20">
                              <Icon size={Math.round(iconSizePx * 0.45)} strokeWidth={1.5} />
                            </div>

                            {/* Native Icon (On top) */}
                            {shouldUseCustomIcon && (
                              <img
                                src={app.customIconUrl}
                                alt={app.label}
                                className="w-full h-full object-contain p-2 relative z-10 bg-inherit"
                                onError={(e) => {
                                  console.warn(`Radial Icon Error: Falling back for ${app.label}`);
                                  (e.target as HTMLImageElement).classList.add('hidden');
                                }}
                              />
                            )}

                            {/* If not using custom icon at all, show vector icon in full color */}
                            {!shouldUseCustomIcon && (
                              <div className="absolute inset-0 flex items-center justify-center z-20">
                                <Icon size={Math.round(iconSizePx * 0.45)} strokeWidth={1.5} />
                              </div>
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
                          className="absolute flex flex-col items-center justify-center w-48 pointer-events-none z-30"
                          style={{
                            left: '50%', top: '50%',
                            x: labelPos.x, y: labelPos.y,
                            translateX: '-50%', translateY: '-50%'
                          }}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.9 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                        >
                          <div className="bg-[#050505] px-3 py-1.5 rounded-lg border border-white/10 shadow-xl flex flex-col items-center">
                            <span className="text-white font-semibold text-sm tracking-wide whitespace-nowrap">
                              {app.label}
                            </span>
                            {isActive && (
                              <span className="text-white/50 text-[10px] uppercase tracking-wider mt-0.5">
                                {app.type === 'folder' ? `${app.children?.length || 0} Apps` : app.description}
                              </span>
                            )}
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