import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Bell, X, Moon } from 'lucide-react';
import { Alarm, UIConfig } from '../types';
import { getTranslation } from '../translations';

const DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";

interface AlarmRingingOverlayProps {
    alarm: Alarm;
    isPreview: boolean;
    config: UIConfig;
    onDismiss: () => void;
    onSnoozeMinutes: (minutes: number) => void;
}

/** Cantos tipo “viewfinder” — só traço, monocromático. */
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

export const AlarmRingingOverlay: React.FC<AlarmRingingOverlayProps> = ({
    alarm,
    isPreview,
    config,
    onDismiss,
    onSnoozeMinutes,
}) => {
    const t = (k: string) => getTranslation(config, k);

    const { hh, mm } = useMemo(() => {
        const parts = alarm.time.split(':');
        return { hh: parts[0] ?? '00', mm: parts[1] ?? '00' };
    }, [alarm.time]);

    return (
        <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alarm-ringing-time"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black px-6"
        >
            <CornerFrame />

            {/* Grade quase invisível — profundidade sem cor */}
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
                        {t('alarm.preview_badge')}
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
                        <Bell size={18} strokeWidth={1} className="text-white" />
                    </motion.div>

                    <h1
                        id="alarm-ringing-time"
                        className="flex items-baseline justify-center gap-0 tabular-nums text-white"
                        style={{ fontFamily: DISPLAY }}
                    >
                        <span className="text-[clamp(3.25rem,13vw,5.75rem)] font-medium leading-none tracking-[-0.05em]">
                            {hh}
                        </span>
                        <span className="mx-[0.06em] pb-[0.08em] text-[clamp(2rem,8vw,3.25rem)] font-light text-white/25">
                            :
                        </span>
                        <span className="text-[clamp(3.25rem,13vw,5.75rem)] font-medium leading-none tracking-[-0.05em]">
                            {mm}
                        </span>
                    </h1>

                    <p
                        className="mt-6 max-w-[18rem] text-center text-[13px] font-normal leading-snug text-white/38"
                        style={{ fontFamily: DISPLAY }}
                    >
                        {alarm.label}
                    </p>
                </motion.div>

                <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:gap-3">
                    <motion.button
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={onDismiss}
                        className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-white py-3 text-[13px] font-semibold text-black transition-colors hover:bg-white/92 sm:min-h-[44px]"
                        style={{ fontFamily: DISPLAY }}
                    >
                        <X size={16} strokeWidth={2} className="opacity-80" />
                        {t('alarm.stop')}
                    </motion.button>
                    <motion.button
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => onSnoozeMinutes(10)}
                        className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.14] bg-transparent py-3 text-[13px] font-medium text-white/75 transition-colors hover:border-white/25 hover:bg-white/[0.04] hover:text-white sm:min-h-[44px]"
                        style={{ fontFamily: DISPLAY }}
                    >
                        <Moon size={15} strokeWidth={1.5} className="text-white/45" />
                        {t('alarm.snooze_10')}
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
};
