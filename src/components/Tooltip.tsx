import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  children: React.ReactNode;
  label: string;
  subLabel?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  label, 
  subLabel, 
  position = 'top',
  delay = 0.5
}) => {
  const [hover, setHover] = useState(false);
  let timeout: NodeJS.Timeout;

  const handleMouseEnter = () => {
    timeout = setTimeout(() => {
      setHover(true);
    }, delay * 1000);
  };

  const handleMouseLeave = () => {
    clearTimeout(timeout);
    setHover(false);
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'bottom': return 'top-full mt-2';
      case 'left': return 'right-full mr-2 top-1/2 -translate-y-1/2';
      case 'right': return 'left-full ml-2 top-1/2 -translate-y-1/2';
      default: return 'bottom-full mb-2';
    }
  };

  const getAnimationProps = () => {
    switch (position) {
      case 'bottom': return { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 10 }, exit: { opacity: 0, y: -10 } };
      case 'left': return { initial: { opacity: 0, x: 10 }, animate: { opacity: 1, x: -10 }, exit: { opacity: 0, x: 10 } };
      case 'right': return { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 10 }, exit: { opacity: 0, x: -10 } };
      default: return { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: -10 }, exit: { opacity: 0, y: 10 } };
    }
  };

  return (
    <div 
      className="relative flex flex-col items-center group/tooltip"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <AnimatePresence>
        {hover && label && (
          <motion.div
            {...getAnimationProps()}
            className={`absolute ${getPositionClasses()} px-3 py-1.5 bg-[#141414]/90 backdrop-blur-md border border-white/10 rounded-lg whitespace-nowrap z-[1000] pointer-events-none shadow-2xl`}
          >
            <div className="text-[11px] font-bold text-white text-center tracking-wide">{label}</div>
            {subLabel && <div className="text-[9px] text-white/40 text-center mt-0.5 uppercase tracking-widest">{subLabel}</div>}
            
            {/* Simple Triangle Arrow */}
            <div className={`absolute w-2 h-2 bg-[#141414] border-white/10 rotate-45 
              ${position === 'bottom' ? '-top-1 left-1/2 -translate-x-1/2 border-l border-t' : 
                position === 'left' ? '-right-1 top-1/2 -translate-y-1/2 border-r border-t' :
                position === 'right' ? '-left-1 top-1/2 -translate-y-1/2 border-l border-b' :
                '-bottom-1 left-1/2 -translate-x-1/2 border-r border-b'
              }`} 
            />
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </div>
  );
};
