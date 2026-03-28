import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Plus, Trash2, Clock } from 'lucide-react';
import { Alarm, UIConfig } from '../types';
import { getTranslation } from '../translations';

interface AlarmWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    alarms: Alarm[];
    setAlarms: (alarms: Alarm[]) => void;
    config: UIConfig;
}

export const AlarmWidget: React.FC<AlarmWidgetProps> = ({ isOpen, onClose, alarms, setAlarms, config }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newTime, setNewTime] = useState('08:00');
    const [newLabel, setNewLabel] = useState('');

    const t = (key: string) => getTranslation(config, key);
    const accent = config.accentColor || '#ffffff';

    const handleSave = () => {
        if (!newTime) return;
        const newAlarm: Alarm = {
            id: crypto.randomUUID(),
            time: newTime,
            label: newLabel || t('alarm.default_label'),
            enabled: true
        };
        setAlarms([...alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time)));
        setNewTime('08:00');
        setNewLabel('');
        setIsAdding(false);
    };

    const toggleAlarm = (id: string) =>
        setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));

    const deleteAlarm = (id: string) =>
        setAlarms(alarms.filter(a => a.id !== id));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.96, opacity: 0, y: 6 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: 6 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-[440px] z-[70] overflow-hidden"
                style={{
                    background: 'rgba(10, 10, 13, 0.92)',
                    backdropFilter: 'blur(40px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(40px) saturate(150%)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '20px',
                    boxShadow: '0 32px 80px -8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                        <Bell size={12} className="text-white/25" />
                        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Alarms</span>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white/60 transition-colors duration-150">
                        <X size={15} />
                    </button>
                </div>

                {/* Alarm list — rows only, no cards */}
                <div className="px-4 max-h-[320px] overflow-y-auto custom-scrollbar">
                    {alarms.length === 0 && !isAdding && (
                        <div className="flex flex-col items-center justify-center py-10 opacity-15 gap-2">
                            <Clock size={28} strokeWidth={1.2} />
                            <span className="text-[10px] font-medium uppercase tracking-widest">{t('alarm.no_alarms')}</span>
                        </div>
                    )}

                    <AnimatePresence mode="popLayout">
                        {alarms.map(alarm => (
                            <motion.div
                                key={alarm.id}
                                layout
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: alarm.enabled ? 1 : 0.3, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="group flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0"
                            >
                                <div className="flex items-baseline gap-3">
                                    <span
                                        className="text-2xl font-medium tabular-nums text-white tracking-tight"
                                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                                    >
                                        {alarm.time}
                                    </span>
                                    <span className="text-xs text-white/35 font-normal">{alarm.label}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => deleteAlarm(alarm.id)}
                                        className="opacity-0 group-hover:opacity-100 text-white/15 hover:text-red-400/60 transition-all duration-200 active:scale-95"
                                    >
                                        <Trash2 size={13} />
                                    </button>

                                    {/* Toggle */}
                                    <button
                                        onClick={() => toggleAlarm(alarm.id)}
                                        className="w-10 h-[22px] rounded-full relative transition-all duration-300 shrink-0"
                                        style={{ backgroundColor: alarm.enabled ? accent : 'rgba(255,255,255,0.08)' }}
                                    >
                                        <motion.div
                                            animate={{ x: alarm.enabled ? 20 : 3 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                            className="absolute top-[3px] w-4 h-4 rounded-full shadow"
                                            style={{ backgroundColor: alarm.enabled ? '#000' : 'rgba(255,255,255,0.4)' }}
                                        />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Inline add form — expands below list */}
                <AnimatePresence>
                    {isAdding && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pt-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={e => setNewTime(e.target.value)}
                                        className="flex-1 bg-white/[0.05] border border-white/[0.07] rounded-xl px-4 py-2.5 text-white text-xl font-medium outline-none focus:border-white/20 transition-all duration-200 text-center tabular-nums [color-scheme:dark]"
                                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Label…"
                                        value={newLabel}
                                        autoFocus
                                        onChange={e => setNewLabel(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsAdding(false); }}
                                        className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-white/15 transition-all duration-200 placeholder:text-white/20"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-98"
                                        style={{ backgroundColor: accent, color: '#000' }}
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setIsAdding(false)}
                                        className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/35 hover:text-white/60 transition-colors duration-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer: add button */}
                {!isAdding && (
                    <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="flex items-center gap-2 text-xs font-medium text-white/25 hover:text-white/60 transition-colors duration-150"
                        >
                            <Plus size={13} strokeWidth={2} />
                            New alarm
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};