import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem } from '../types';

interface ToastProps {
  app: AppItem | null;
}

export const Toast: React.FC<ToastProps> = ({ app }) => {
  return (
    <AnimatePresence>
      {app && (
        <div className="fixed bottom-12 left-0 w-full flex justify-center z-[100] pointer-events-none">
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "backOut" }}
            className="bg-[#1A1A1A] border border-white/10 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3"
            >
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-white/60 text-sm font-light">Launching</span>
            <span className="text-white font-medium">{app.label}</span>
            </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};