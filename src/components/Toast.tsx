import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem } from '../types';

interface ToastProps {
  app: AppItem | null;
}

export const Toast: React.FC<ToastProps> = ({ app }) => {
  /** Ações bem-sucedidas são silenciosas; este overlay fica reservado a falhas acionáveis. */
  const error = app?.id === 'error' ? app : null;

  return (
    <AnimatePresence>
      {error && (
        <div className="fixed bottom-12 left-0 w-full flex justify-center z-[100] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "backOut" }}
            className="border px-6 py-3 rounded-full shadow-2xl flex flex-col items-center gap-1 min-w-[200px] bg-red-950/40 border-red-500/50 backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full animate-pulse bg-red-500" />
              <span className="text-white/60 text-sm font-light">
                System Error
              </span>
              <span className="text-white font-medium">{error.label}</span>
            </div>
            {error.description && (
              <span className="text-[10px] text-red-200/60 font-medium max-w-xs text-center">{error.description}</span>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
