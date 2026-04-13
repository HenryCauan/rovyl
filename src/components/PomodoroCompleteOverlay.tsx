import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { TimerReset, Coffee, X } from 'lucide-react';
import { UIConfig, PomodoroMode } from '../types';
import { getTranslation } from '../translations';
import { loadPomodoroUiPrefs, resumePomodoroAudio } from '../pomodoroSounds';
import {
  POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY,
  startPomodoroAmbientPlayback,
  stopPomodoroAmbientPlayback,
} from '../pomodoroAmbient';

const DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";

interface PomodoroCompleteOverlayProps {
  endedMode: PomodoroMode;
  isPreview: boolean;
  config: UIConfig;
  onDismiss: () => void;
}

function CornerFrame() {
  const L = 20;
  const t = 'border-white/[0.12]';
  return (
    <>
      <div className={`pointer-events-none absolute left-6 top-6 border-l border-t ${t}`} style={{ width: L, height: L }} />
      <div className={`pointer-events-none absolute right-6 top-6 border-r border-t ${t}`} style={{ width: L, height: L }} />
      <div className={`pointer-events-none absolute bottom-6 left-6 border-b border-l ${t}`} style={{ width: L, height: L }} />
      <div className={`pointer-events-none absolute bottom-6 right-6 border-b border-r ${t}`} style={{ width: L, height: L }} />
    </>
  );
}

export const PomodoroCompleteOverlay: React.FC<PomodoroCompleteOverlayProps> = ({
  endedMode,
  isPreview,
  config,
  onDismiss,
}) => {
  const t = (k: string) => getTranslation(config, k);

  const isWork = endedMode === 'work';
  const isLongBreak = endedMode === 'longBreak';

  const title = isWork
    ? t('pomodoro.complete_title_focus')
    : isLongBreak
      ? t('pomodoro.complete_title_long_break')
      : t('pomodoro.complete_title_short_break');

  const subtitle = isWork ? t('pomodoro.complete_hint_after_focus') : t('pomodoro.complete_hint_after_break');

  const Icon = isWork ? TimerReset : Coffee;

  useEffect(() => {
    const prefs = loadPomodoroUiPrefs();
    if (prefs.ambientPreset === 'off') return;
    let customPath: string | null = prefs.customAmbientPath;
    if (prefs.ambientPreset === 'custom') {
      if (!customPath) {
        try {
          customPath = sessionStorage.getItem(POMODORO_WEB_AMBIENT_BLOB_SESSION_KEY);
        } catch {
          customPath = null;
        }
      }
      if (!customPath) return;
    }
    void resumePomodoroAudio();
    startPomodoroAmbientPlayback({
      preset: prefs.ambientPreset,
      volume: prefs.ambientVolume,
      customPath: prefs.ambientPreset === 'custom' ? customPath : null,
    });
    return () => {
      stopPomodoroAmbientPlayback();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pomodoro-complete-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black px-6"
    >
      <CornerFrame />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-[1] flex w-full max-w-[min(100%,22rem)] flex-col items-center">
        {isPreview && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="mb-10 text-[9px] font-medium uppercase tracking-[0.4em] text-white/30"
            style={{ fontFamily: DISPLAY }}
          >
            {t('pomodoro.complete_preview_badge')}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 flex flex-col items-center"
        >
          <div className="mb-6 flex h-px w-8 bg-white/20" aria-hidden />
          <motion.div
            animate={{ opacity: [0.22, 0.45, 0.22] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
            className="mb-8"
          >
            <Icon size={18} strokeWidth={1} className="text-white" />
          </motion.div>

          <h1
            id="pomodoro-complete-title"
            className="text-center text-[clamp(1.35rem,5.5vw,1.75rem)] font-medium leading-tight tracking-[-0.03em] text-white"
            style={{ fontFamily: DISPLAY }}
          >
            {title}
          </h1>

          <p
            className="max-w-[18rem] text-center text-[13px] font-normal leading-snug text-white/38"
            style={{ fontFamily: DISPLAY }}
          >
            {subtitle}
          </p>
        </motion.div>

        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          onClick={onDismiss}
          className="flex min-h-[48px] w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-white py-3 text-[13px] font-semibold text-black transition-colors hover:bg-white/92 sm:min-h-[44px]"
          style={{ fontFamily: DISPLAY }}
        >
          <X size={16} strokeWidth={2} className="opacity-80" />
          {t('pomodoro.complete_dismiss')}
        </motion.button>
      </div>
    </motion.div>
  );
};
