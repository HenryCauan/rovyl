import React, { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Plus, Trash2, Check, Clock, Play } from 'lucide-react';
import { Alarm, UIConfig } from '../types';
import { getTranslation } from '../translations';
import { AlarmTimePicker } from './AlarmTimePicker';
import { WidgetBackdropOpacitySlider } from './WidgetBackdropOpacitySlider';
import {
  WIDGET_GLASS_CARD,
  WIDGET_GLASS_CARD_BG,
  WIDGET_GLASS_CARD_SHINE,
} from './widgetGlassStyles';

interface AlarmWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    alarms: Alarm[];
    setAlarms: (alarms: Alarm[]) => void;
    config: UIConfig;
    setConfig: Dispatch<SetStateAction<UIConfig>>;
    /** Simula o alarme em tela cheia com som (mesmo fluxo do disparo real). */
    onPreviewAlarm?: (alarm: Alarm) => void;
}

const DISPLAY_FONT = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const UI_FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_KEYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

function formatTime12(time: string): { hour: string; minute: string; period: string } {
    const [hStr, mStr] = time.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? '12' : h > 12 ? String(h - 12).padStart(2, '0') : String(h).padStart(2, '0');
    return { hour, minute: mStr, period };
}

function getNextAlarmLabel(time: string): string {
    const now = new Date();
    const [hStr, mStr] = time.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const alarmDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    const diffMs = alarmDate.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);

    if (diffMins <= 0) {
        const tomorrow = diffMins + 24 * 60;
        const hrs = Math.floor(tomorrow / 60);
        const mins = tomorrow % 60;
        if (hrs === 0) return `em ${mins}min`;
        if (mins === 0) return `em ${hrs}h`;
        return `em ${hrs}h ${mins}min`;
    }
    if (diffMins < 60) return `em ${diffMins}min`;
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (mins === 0) return `em ${hrs}h`;
    return `em ${hrs}h ${mins}min`;
}

function daysLabel(days: number[] | undefined): string {
    if (!days || days.length === 0) return 'Uma vez';
    if (days.length === 7) return 'Diariamente';
    if (days.length === 5 && WEEKDAYS.every(d => days.includes(d))) return 'Dias úteis';
    if (days.length === 2 && WEEKEND.every(d => days.includes(d))) return 'Fim de semana';
    return DAY_LABELS.filter((_, i) => days.includes(i)).join(' · ');
}

// Elegant toggle switch
const Toggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={e => { e.stopPropagation(); onChange(); }}
        className="relative shrink-0 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
        style={{
            width: 40,
            height: 22,
            borderRadius: 100,
            background: checked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${checked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}`,
        }}
    >
        <motion.span
            layout
            transition={{ type: 'spring', stiffness: 600, damping: 38 }}
            style={{
                position: 'absolute',
                top: 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: checked ? '#fff' : 'rgba(255,255,255,0.28)',
                left: checked ? 20 : 2,
                boxShadow: checked ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
            }}
        />
    </button>
);

// Day chip button
const DayChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1px solid ${active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)'}`,
            background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: active ? '#fff' : 'rgba(255,255,255,0.22)',
            fontFamily: UI_FONT,
            fontSize: 10,
            fontWeight: active ? 600 : 400,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            transition: 'all 200ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
        }}
    >
        {label}
    </button>
);

/** Moldura tipo viewfinder + grade — mesma linguagem do AlarmRingingOverlay. */
function WidgetCornerFrame() {
    const L = 14;
    const t = 'border-white/[0.1]';
    return (
        <>
            <div className={`pointer-events-none absolute left-5 top-5 border-l border-t ${t}`} style={{ width: L, height: L }} />
            <div className={`pointer-events-none absolute right-5 top-5 border-r border-t ${t}`} style={{ width: L, height: L }} />
            <div className={`pointer-events-none absolute bottom-5 left-5 border-b border-l ${t}`} style={{ width: L, height: L }} />
            <div className={`pointer-events-none absolute bottom-5 right-5 border-b border-r ${t}`} style={{ width: L, height: L }} />
        </>
    );
}

function WidgetGrid() {
    return (
        <div
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[0.035]"
            style={{
                backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)
                `,
                backgroundSize: '56px 56px',
            }}
        />
    );
}

export const AlarmWidget: React.FC<AlarmWidgetProps> = ({ isOpen, onClose, alarms, setAlarms, config, setConfig, onPreviewAlarm }) => {
    const [composerOpen, setComposerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTime, setNewTime] = useState('08:00');
    const [newLabel, setNewLabel] = useState('');
    const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
    const labelRef = useRef<HTMLInputElement>(null);

    const t = (key: string) => getTranslation(config, key);

    useEffect(() => {
        if (!isOpen) {
            setComposerOpen(false);
            setEditingId(null);
            setNewTime('08:00');
            setNewLabel('');
            setNewDays(ALL_DAYS);
        }
    }, [isOpen]);

    useEffect(() => {
        if (composerOpen) {
            setTimeout(() => labelRef.current?.focus(), 120);
        }
    }, [composerOpen]);

    const openNew = () => {
        setEditingId(null);
        setNewTime('08:00');
        setNewLabel('');
        setNewDays(ALL_DAYS);
        setComposerOpen(true);
    };

    const openEdit = (alarm: Alarm) => {
        setEditingId(alarm.id);
        setNewTime(alarm.time);
        setNewLabel(alarm.label);
        setNewDays(alarm.days ?? ALL_DAYS);
        setComposerOpen(true);
    };

    const closeComposer = () => {
        setComposerOpen(false);
        setEditingId(null);
        setNewTime('08:00');
        setNewLabel('');
        setNewDays(ALL_DAYS);
    };

    const handleSave = () => {
        if (!newTime) return;
        const label = newLabel.trim() || t('alarm.default_label');
        if (editingId) {
            setAlarms(
                alarms
                    .map(a => a.id === editingId ? { ...a, time: newTime, label, days: newDays } : a)
                    .sort((a, b) => a.time.localeCompare(b.time)),
            );
        } else {
            const newAlarm: Alarm = {
                id: crypto.randomUUID(),
                time: newTime,
                label,
                enabled: true,
                days: newDays,
            };
            setAlarms([...alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time)));
        }
        closeComposer();
    };

    const toggleAlarm = (id: string) =>
        setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));

    const deleteAlarm = (id: string) => {
        setAlarms(alarms.filter(a => a.id !== id));
        if (editingId === id) closeComposer();
    };

    const toggleDay = (day: number) =>
        setNewDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());

    const applyPreset = (preset: number[]) => setNewDays(preset);

    if (!isOpen) return null;

    const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
    const enabledCount = alarms.filter(a => a.enabled).length;
    const backdropAlpha = Math.min(1, Math.max(0, config.alarmsWidgetBackdropOpacity ?? 0.85));

    return (
        <div className="pointer-events-none fixed inset-0 z-[85]">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="pointer-events-auto absolute inset-0 backdrop-blur-[40px]"
                style={{ backgroundColor: `rgba(6, 6, 8, ${backdropAlpha})` }}
                onClick={onClose}
            />
            <WidgetBackdropOpacitySlider
                value={backdropAlpha}
                onChange={next =>
                    setConfig(prev => ({
                        ...prev,
                        alarmsWidgetBackdropOpacity: next,
                    }))
                }
                label={t('alarm.backdrop_opacity')}
            />
            <motion.div
                layout
                initial={{ scale: 0.98, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.98, opacity: 0, y: 8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`fixed left-1/2 top-1/2 z-[70] flex -translate-x-1/2 -translate-y-1/2 overflow-hidden ${WIDGET_GLASS_CARD} pointer-events-auto ${composerOpen ? 'w-[min(812px,92%)]' : 'w-[min(460px,92%)]'}`}
                style={{
                    maxHeight: 'min(calc(100dvh - 5.5rem), 660px)',
                    transition: 'max-width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div className={WIDGET_GLASS_CARD_BG} aria-hidden />
                <div className={WIDGET_GLASS_CARD_SHINE} aria-hidden />
                <WidgetGrid />
                <WidgetCornerFrame />
                {/* === Lista === */}
                <div className="relative z-[1] flex min-w-0 flex-1 flex-col" style={{ minWidth: 0 }}>
                    {/* Header */}
                    <header className="relative z-[1] flex shrink-0 items-center justify-between border-b border-white/[0.06] px-7 pb-5 pt-7">
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1]">
                                <Bell size={14} strokeWidth={1} className="text-white/35" />
                            </div>
                            <div>
                                <h1
                                    className="text-[10px] font-semibold uppercase leading-none tracking-[0.32em] text-white/30"
                                    style={{ fontFamily: DISPLAY_FONT }}
                                >
                                    {t('alarm.title')}
                                </h1>
                                <p
                                    className="mt-1.5 text-[10px] leading-tight text-white/22"
                                    style={{ fontFamily: UI_FONT, letterSpacing: '0.02em' }}
                                >
                                    {enabledCount > 0 ? `${enabledCount} ativo${enabledCount !== 1 ? 's' : ''}` : t('alarm.subtitle')}
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-white/25 transition-colors hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white/55 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/15"
                                aria-label={t('action.dismiss')}
                            >
                                <X size={15} strokeWidth={1.5} />
                            </button>
                        </div>
                    </header>

                    {/* Alarm List */}
                    <div
                        className="flex-1 overflow-y-auto"
                        style={{
                            padding: '12px 20px 100px',
                            scrollbarWidth: 'thin',
                        }}
                    >
                        {sorted.length === 0 && !composerOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col items-center justify-center py-16 text-center"
                            >
                                <div className="mb-5 h-px w-8 bg-white/15" aria-hidden />
                                <Clock size={18} strokeWidth={1} className="mb-5 text-white/18" />
                                <p
                                    className="text-[9px] font-medium uppercase tracking-[0.32em] text-white/22"
                                    style={{ fontFamily: DISPLAY_FONT }}
                                >
                                    {t('alarm.no_alarms')}
                                </p>
                            </motion.div>
                        )}

                        <AnimatePresence mode="popLayout">
                            {sorted.map(alarm => {
                                const { hour, minute, period } = formatTime12(alarm.time);
                                const isEditing = editingId === alarm.id && composerOpen;
                                return (
                                    <motion.div
                                        key={alarm.id}
                                        layout
                                        initial={{ opacity: 0, x: -8, height: 0 }}
                                        animate={{ opacity: 1, x: 0, height: 'auto' }}
                                        exit={{ opacity: 0, x: -8, height: 0 }}
                                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                        className="mb-2"
                                    >
                                        <motion.button
                                            type="button"
                                            onClick={() => openEdit(alarm)}
                                            whileHover={{ y: -0.5 }}
                                            whileTap={{ scale: 0.995 }}
                                            className="group/row w-full rounded-2xl border text-left transition-colors duration-200"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 14,
                                                padding: '13px 15px',
                                                borderColor: isEditing
                                                    ? 'rgba(255,255,255,0.14)'
                                                    : alarm.enabled
                                                      ? 'rgba(255,255,255,0.08)'
                                                      : 'rgba(255,255,255,0.05)',
                                                background: isEditing
                                                    ? 'rgba(255,255,255,0.05)'
                                                    : alarm.enabled
                                                      ? 'rgba(255,255,255,0.025)'
                                                      : 'rgba(255,255,255,0.01)',
                                                opacity: alarm.enabled ? 1 : 0.38,
                                            }}
                                        >
                                            {/* Status dot */}
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <div
                                                    style={{
                                                        width: 6,
                                                        height: 6,
                                                        borderRadius: '50%',
                                                        background: alarm.enabled ? '#fff' : 'rgba(255,255,255,0.2)',
                                                        transition: 'background 200ms ease',
                                                    }}
                                                />
                                            </div>

                                            {/* Time Display */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                                    <span
                                                        style={{
                                                            fontFamily: DISPLAY_FONT,
                                                            fontSize: '1.75rem',
                                                            fontWeight: 500,
                                                            letterSpacing: '-0.05em',
                                                            lineHeight: 1,
                                                            fontVariantNumeric: 'tabular-nums',
                                                            color: alarm.enabled ? '#fff' : 'rgba(255,255,255,0.4)',
                                                        } as React.CSSProperties}
                                                    >
                                                        {hour}:{minute}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontFamily: DISPLAY_FONT,
                                                            fontSize: 10,
                                                            fontWeight: 500,
                                                            color: alarm.enabled ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)',
                                                            letterSpacing: '0.08em',
                                                            marginBottom: 1,
                                                        }}
                                                    >
                                                        {period}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                    <span
                                                        style={{
                                                            fontFamily: UI_FONT,
                                                            fontSize: 11,
                                                            fontWeight: 500,
                                                            color: 'rgba(255,255,255,0.28)',
                                                            letterSpacing: '0.01em',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            maxWidth: 100,
                                                        }}
                                                        title={alarm.label}
                                                    >
                                                        {alarm.label}
                                                    </span>
                                                    <span className="text-[8px] text-white/12">·</span>
                                                    <span
                                                        style={{
                                                            fontFamily: UI_FONT,
                                                            fontSize: 10,
                                                            color: 'rgba(255,255,255,0.18)',
                                                            letterSpacing: '0.01em',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {daysLabel(alarm.days)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Right side actions */}
                                            <div
                                                className="flex items-center gap-2 shrink-0"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {alarm.enabled && (
                                                    <span
                                                        style={{
                                                            fontFamily: UI_FONT,
                                                            fontSize: 10,
                                                            color: 'rgba(255,255,255,0.2)',
                                                            letterSpacing: '0.01em',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {getNextAlarmLabel(alarm.time)}
                                                    </span>
                                                )}
                                                {onPreviewAlarm && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onPreviewAlarm(alarm)}
                                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 opacity-0 transition-all duration-200 group-hover/row:opacity-100 hover:bg-white/[0.07] hover:text-white/85"
                                                        aria-label={t('alarm.preview_aria')}
                                                    >
                                                        <Play size={13} strokeWidth={2} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => deleteAlarm(alarm.id)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white/25 opacity-0 transition-all duration-200 group-hover/row:opacity-100 hover:bg-white/[0.07] hover:text-white/80"
                                                    aria-label={t('alarm.delete_aria')}
                                                >
                                                    <Trash2 size={13} strokeWidth={1.5} />
                                                </button>
                                                <Toggle
                                                    checked={alarm.enabled}
                                                    onChange={() => toggleAlarm(alarm.id)}
                                                />
                                            </div>
                                        </motion.button>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    {/* FAB */}
                    <AnimatePresence>
                        {!composerOpen && (
                            <motion.button
                                type="button"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={openNew}
                                className="absolute bottom-6 right-6 z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/20 bg-white/[0.14] text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/[0.22] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                                aria-label={t('alarm.add_fab_aria')}
                            >
                                <Plus size={20} strokeWidth={2.25} />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* === RIGHT PANEL: Composer === */}
                <AnimatePresence>
                    {composerOpen && (
                        <motion.div
                            key="composer"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 328, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                            className="relative z-[1] flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-white/[0.07] bg-[rgba(18,18,22,0.55)] backdrop-blur-xl"
                        >
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ duration: 0.28, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                                className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
                                style={{ width: 328, padding: '28px 22px 24px' }}
                            >
                                {/* Composer Header */}
                                <div className="flex items-center justify-between mb-7">
                                    <h2
                                        style={{
                                            fontFamily: DISPLAY_FONT,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            letterSpacing: '0.28em',
                                            textTransform: 'uppercase',
                                            color: 'rgba(255,255,255,0.3)',
                                        }}
                                    >
                                        {editingId ? t('alarm.edit_title') : t('alarm.new_title')}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={closeComposer}
                                        className="flex items-center justify-center transition-all duration-200 focus:outline-none"
                                        style={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: 8,
                                            color: 'rgba(255,255,255,0.2)',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)';
                                        }}
                                    >
                                        <X size={13} strokeWidth={1.5} />
                                    </button>
                                </div>

                                {/* Horário — abre modal minimalista (portal) */}
                                <div className="mb-5">
                                    <AlarmTimePicker value={newTime} onChange={setNewTime} config={config} />
                                </div>

                                {/* Label Input */}
                                <div style={{ marginBottom: 20 }}>
                                    <label
                                        style={{
                                            fontFamily: UI_FONT,
                                            fontSize: 9,
                                            fontWeight: 600,
                                            letterSpacing: '0.2em',
                                            textTransform: 'uppercase',
                                            color: 'rgba(255,255,255,0.22)',
                                            display: 'block',
                                            marginBottom: 8,
                                        }}
                                    >
                                        {t('alarm.label_placeholder')}
                                    </label>
                                    <input
                                        ref={labelRef}
                                        type="text"
                                        value={newLabel}
                                        onChange={e => setNewLabel(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleSave();
                                            if (e.key === 'Escape') closeComposer();
                                        }}
                                        placeholder={t('alarm.label_placeholder')}
                                        className="w-full outline-none transition-all duration-200"
                                        style={{
                                            fontFamily: UI_FONT,
                                            fontSize: 13,
                                            fontWeight: 400,
                                            color: 'rgba(255,255,255,0.85)',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: 12,
                                            padding: '11px 14px',
                                        }}
                                        onFocus={e => {
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                        }}
                                        onBlur={e => {
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        }}
                                    />
                                </div>

                                {/* Day Selector */}
                                <div style={{ marginBottom: 20 }}>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                                        <label
                                            style={{
                                                fontFamily: UI_FONT,
                                                fontSize: 9,
                                                fontWeight: 600,
                                                letterSpacing: '0.2em',
                                                textTransform: 'uppercase',
                                                color: 'rgba(255,255,255,0.22)',
                                            }}
                                        >
                                            Repetir
                                        </label>
                                        <div className="flex gap-2">
                                            {[
                                                { label: 'Úteis', preset: WEEKDAYS },
                                                { label: 'Todos', preset: ALL_DAYS },
                                            ].map(({ label, preset }) => {
                                                const isActive = preset.length === newDays.length && preset.every(d => newDays.includes(d));
                                                return (
                                                    <button
                                                        key={label}
                                                        type="button"
                                                        onClick={() => applyPreset(preset)}
                                                        style={{
                                                            fontFamily: UI_FONT,
                                                            fontSize: 9,
                                                            fontWeight: 600,
                                                            letterSpacing: '0.1em',
                                                            textTransform: 'uppercase',
                                                            color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)',
                                                            background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                                                            border: `1px solid ${isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
                                                            borderRadius: 6,
                                                            padding: '3px 7px',
                                                            cursor: 'pointer',
                                                            transition: 'all 180ms ease',
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex justify-between">
                                        {DAY_KEYS.map(day => (
                                            <DayChip
                                                key={day}
                                                label={DAY_LABELS[day]}
                                                active={newDays.includes(day)}
                                                onClick={() => toggleDay(day)}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="mt-8 flex gap-2.5">
                                    <button
                                        type="button"
                                        onClick={handleSave}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white py-3 text-[13px] font-semibold text-black transition-colors hover:bg-white/92 active:scale-[0.99]"
                                        style={{ fontFamily: UI_FONT }}
                                    >
                                        <Check size={14} strokeWidth={2.5} />
                                        {t('alarm.save')}
                                    </button>
                                    {editingId && (
                                        <button
                                            type="button"
                                            onClick={() => { deleteAlarm(editingId); closeComposer(); }}
                                            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-white/[0.12] text-white/35 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white/80"
                                            aria-label={t('alarm.delete_aria')}
                                        >
                                            <Trash2 size={15} strokeWidth={1.5} />
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};
