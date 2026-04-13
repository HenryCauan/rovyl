import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { UIConfig } from '../types';
import { getTranslation } from '../translations';

const DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const UI = "'Inter', ui-sans-serif, system-ui, sans-serif";

const ITEM = 40;
const PAD = (200 - ITEM) / 2;

function parseHHMM(v: string): { h: number; m: number } {
    const [a, b] = v.trim().split(':');
    const h = Math.min(23, Math.max(0, parseInt(a, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(b, 10) || 0));
    return { h, m };
}

function toHHMM(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12(h: number, m: number): { hh: string; mm: string; ap: string } {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { hh: String(hour).padStart(2, '0'), mm: String(m).padStart(2, '0'), ap: period };
}

interface AlarmTimePickerProps {
    value: string;
    onChange: (next: string) => void;
    config: UIConfig;
}

export const AlarmTimePicker: React.FC<AlarmTimePickerProps> = ({ value, onChange, config }) => {
    const t = (k: string) => getTranslation(config, k);
    const [open, setOpen] = useState(false);
    const [draftH, setDraftH] = useState(0);
    const [draftM, setDraftM] = useState(0);

    const hourRef = useRef<HTMLDivElement>(null);
    const minRef = useRef<HTMLDivElement>(null);
    const hourScrollEnd = useRef<number | null>(null);
    const minScrollEnd = useRef<number | null>(null);

    useEffect(() => {
        if (!open) return;
        const { h, m } = parseHHMM(value);
        setDraftH(h);
        setDraftM(m);
        const timer = window.setTimeout(() => {
            if (hourRef.current) hourRef.current.scrollTop = h * ITEM;
            if (minRef.current) minRef.current.scrollTop = m * ITEM;
        }, 0);
        return () => clearTimeout(timer);
    }, [open, value]);

    const scrollHourTo = useCallback((h: number) => {
        const nh = ((h % 24) + 24) % 24;
        setDraftH(nh);
        requestAnimationFrame(() => {
            if (hourRef.current) hourRef.current.scrollTop = nh * ITEM;
        });
    }, []);

    const bumpHour = useCallback((delta: number) => {
        setDraftH((prev) => {
            const nh = (prev + delta + 24) % 24;
            requestAnimationFrame(() => {
                if (hourRef.current) hourRef.current.scrollTop = nh * ITEM;
            });
            return nh;
        });
    }, []);

    const scrollMinTo = useCallback((m: number) => {
        const nm = ((m % 60) + 60) % 60;
        setDraftM(nm);
        requestAnimationFrame(() => {
            if (minRef.current) minRef.current.scrollTop = nm * ITEM;
        });
    }, []);

    const bumpMin = useCallback((delta: number) => {
        setDraftM((prev) => {
            const nm = (prev + delta + 60) % 60;
            requestAnimationFrame(() => {
                if (minRef.current) minRef.current.scrollTop = nm * ITEM;
            });
            return nm;
        });
    }, []);

    const onHourScroll = () => {
        const el = hourRef.current;
        if (!el) return;
        const i = Math.round(el.scrollTop / ITEM);
        setDraftH(Math.min(23, Math.max(0, i)));
    };

    const onMinScroll = () => {
        const el = minRef.current;
        if (!el) return;
        const i = Math.round(el.scrollTop / ITEM);
        setDraftM(Math.min(59, Math.max(0, i)));
    };

    const apply = () => {
        onChange(toHHMM(draftH, draftM));
        setOpen(false);
    };

    const cancel = useCallback(() => {
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, cancel]);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);
    const { hh, mm, ap } = formatTime12(draftH, draftM);

    const wheelClass =
        'h-[200px] overflow-y-scroll snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

    const modal = (
        <AnimatePresence>
            {open && (
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="alarm-time-modal-title"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center p-5"
                    style={{ fontFamily: DISPLAY }}
                    onDoubleClick={(e) => e.stopPropagation()}
                >
                    <motion.div
                        role="presentation"
                        className="absolute inset-0 bg-black/75 backdrop-blur-md"
                        onClick={cancel}
                        onDoubleClick={(e) => e.stopPropagation()}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className="relative w-full max-w-[300px] overflow-hidden rounded-[22px] border border-white/[0.1] bg-black shadow-[0_32px_80px_-20px_rgba(0,0,0,0.95)]"
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="pointer-events-none absolute inset-0 opacity-[0.04]"
                            style={{
                                backgroundImage:
                                    'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                                backgroundSize: '24px 24px',
                            }}
                        />

                        <div className="relative px-6 pb-5 pt-6">
                            <h2
                                id="alarm-time-modal-title"
                                className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-white/35"
                                style={{ fontFamily: DISPLAY }}
                            >
                                {t('alarm.time_modal_title')}
                            </h2>
                            <p className="mb-6 text-center text-[11px] tabular-nums text-white/22" style={{ fontFamily: UI }}>
                                {hh}:{mm} <span className="text-white/30">{ap}</span>
                            </p>

                            <div className="relative mx-auto flex max-w-[240px] justify-center gap-1">
                                <div className="relative flex-1">
                                    <p className="mb-2 text-center text-[8px] font-semibold uppercase tracking-[0.2em] text-white/20" style={{ fontFamily: UI }}>
                                        {t('alarm.time_hours')}
                                    </p>
                                    <div className="mb-1.5 flex items-center justify-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => bumpHour(-1)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-white/50 transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"
                                            aria-label={t('alarm.time_hour_prev')}
                                        >
                                            <Minus size={14} strokeWidth={2} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => bumpHour(1)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-white/50 transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"
                                            aria-label={t('alarm.time_hour_next')}
                                        >
                                            <Plus size={14} strokeWidth={2} />
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <div
                                            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 border-y border-white/[0.08]"
                                            aria-hidden
                                        />
                                        <div
                                            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/3 bg-gradient-to-b from-black via-black/40 to-transparent"
                                        />
                                        <div
                                            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-black via-black/40 to-transparent"
                                        />
                                        <div
                                            ref={hourRef}
                                            onScroll={() => {
                                                if (hourScrollEnd.current) clearTimeout(hourScrollEnd.current);
                                                hourScrollEnd.current = window.setTimeout(onHourScroll, 46);
                                            }}
                                            className={wheelClass}
                                        >
                                            <div style={{ height: PAD }} className="shrink-0" />
                                            {hours.map((h) => (
                                                <button
                                                    key={h}
                                                    type="button"
                                                    onClick={() => scrollHourTo(h)}
                                                    className={`flex h-10 w-full shrink-0 cursor-pointer snap-center items-center justify-center text-[15px] font-medium tabular-nums transition-colors ${
                                                        draftH === h ? 'text-white' : 'text-white/22 hover:text-white/55'
                                                    }`}
                                                >
                                                    {String(h).padStart(2, '0')}
                                                </button>
                                            ))}
                                            <div style={{ height: PAD }} className="shrink-0" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center pb-6 text-xl font-light text-white/15">:</div>

                                <div className="relative flex-1">
                                    <p className="mb-2 text-center text-[8px] font-semibold uppercase tracking-[0.2em] text-white/20" style={{ fontFamily: UI }}>
                                        {t('alarm.time_minutes')}
                                    </p>
                                    <div className="mb-1.5 flex items-center justify-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => bumpMin(-1)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-white/50 transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"
                                            aria-label={t('alarm.time_min_prev')}
                                        >
                                            <Minus size={14} strokeWidth={2} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => bumpMin(1)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-white/50 transition-colors hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white"
                                            aria-label={t('alarm.time_min_next')}
                                        >
                                            <Plus size={14} strokeWidth={2} />
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <div
                                            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 border-y border-white/[0.08]"
                                            aria-hidden
                                        />
                                        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/3 bg-gradient-to-b from-black via-black/40 to-transparent" />
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/3 bg-gradient-to-t from-black via-black/40 to-transparent" />
                                        <div
                                            ref={minRef}
                                            onScroll={() => {
                                                if (minScrollEnd.current) clearTimeout(minScrollEnd.current);
                                                minScrollEnd.current = window.setTimeout(onMinScroll, 46);
                                            }}
                                            className={wheelClass}
                                        >
                                            <div style={{ height: PAD }} className="shrink-0" />
                                            {minutes.map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => scrollMinTo(m)}
                                                    className={`flex h-10 w-full shrink-0 cursor-pointer snap-center items-center justify-center text-[15px] font-medium tabular-nums transition-colors ${
                                                        draftM === m ? 'text-white' : 'text-white/22 hover:text-white/55'
                                                    }`}
                                                >
                                                    {String(m).padStart(2, '0')}
                                                </button>
                                            ))}
                                            <div style={{ height: PAD }} className="shrink-0" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 border-t border-white/[0.06] pt-4">
                                <p className="mb-2 text-center text-[8px] font-semibold uppercase tracking-[0.2em] text-white/22" style={{ fontFamily: UI }}>
                                    {t('alarm.time_quick')}
                                </p>
                                <div className="flex justify-center gap-2">
                                {[0, 15, 30, 45].map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => scrollMinTo(m)}
                                        className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold tabular-nums transition-colors ${
                                            draftM === m ? 'bg-white text-black' : 'text-white/35 hover:bg-white/[0.06] hover:text-white/80'
                                        }`}
                                    >
                                        {String(m).padStart(2, '0')}
                                    </button>
                                ))}
                                </div>
                            </div>

                            <div className="mt-5 flex gap-2">
                                <button
                                    type="button"
                                    onClick={cancel}
                                    className="flex-1 rounded-xl border border-white/[0.1] py-3 text-[12px] font-medium text-white/45 transition-colors hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white/75"
                                    style={{ fontFamily: UI }}
                                >
                                    {t('alarm.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={apply}
                                    className="flex-1 rounded-xl bg-white py-3 text-[12px] font-semibold text-black transition-colors hover:bg-white/92"
                                    style={{ fontFamily: UI }}
                                >
                                    {t('alarm.apply_time')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const { h: vh, m: vm } = parseHHMM(value);
    const disp = formatTime12(vh, vm);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.04]"
                style={{ fontFamily: DISPLAY }}
            >
                <div className="min-w-0">
                    <p className="mb-1 text-[8px] font-semibold uppercase tracking-[0.28em] text-white/28" style={{ fontFamily: UI }}>
                        {t('alarm.set_alarm')}
                    </p>
                    <div className="flex items-baseline gap-1.5 tabular-nums">
                        <span className="text-[1.35rem] font-medium leading-none tracking-[-0.04em] text-white">
                            {String(vh).padStart(2, '0')}
                        </span>
                        <span className="text-lg font-light text-white/25">:</span>
                        <span className="text-[1.35rem] font-medium leading-none tracking-[-0.04em] text-white">
                            {String(vm).padStart(2, '0')}
                        </span>
                        <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">{disp.ap}</span>
                    </div>
                </div>
                <ChevronRight size={16} strokeWidth={1.5} className="shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/45" />
            </button>

            {typeof document !== 'undefined' && createPortal(modal, document.body)}
        </>
    );
};
