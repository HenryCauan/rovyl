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

    const handleSave = () => {
        if (!newTime) return;

        const newAlarm: Alarm = {
            id: crypto.randomUUID(),
            time: newTime,
            label: newLabel || t('alarm.default_label'),
            enabled: true
        };

        // Sort alarms by time
        const updatedAlarms = [...alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time));
        setAlarms(updatedAlarms);

        // Reset
        setNewTime('08:00');
        setNewLabel('');
        setIsAdding(false);
    };

    const toggleAlarm = (id: string) => {
        setAlarms(alarms.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
    };

    const deleteAlarm = (id: string) => {
        setAlarms(alarms.filter(a => a.id !== id));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-[#0f0f0f] border border-white/10 rounded-3xl shadow-2xl overflow-hidden w-[400px] h-[600px] flex flex-col z-[70]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#141414]">
                    <div className="flex items-center gap-3">
                        <Bell className="text-white" size={20} />
                        <h2 className="text-white font-medium text-lg">{t('alarm.title')}</h2>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {alarms.map(alarm => (
                        <motion.div
                            key={alarm.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`
                        p-4 rounded-xl border flex items-center justify-between transition-colors
                        ${alarm.enabled ? 'bg-white/5 border-white/10' : 'bg-black/40 border-white/5 opacity-60'}
                    `}
                        >
                            <div>
                                <div className={`text-3xl font-light tracking-tight ${alarm.enabled ? 'text-white' : 'text-white/50'}`}>
                                    {alarm.time}
                                </div>
                                <div className="text-xs text-white/40 uppercase tracking-wide font-medium mt-1">
                                    {alarm.label}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => toggleAlarm(alarm.id)}
                                    className={`
                                w-10 h-6 rounded-full relative transition-colors duration-300
                                ${alarm.enabled ? 'bg-green-500' : 'bg-white/10'}
                            `}
                                >
                                    <div className={`
                                absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300
                                ${alarm.enabled ? 'translate-x-4' : 'translate-x-0'}
                            `} />
                                </button>
                                <button
                                    onClick={() => deleteAlarm(alarm.id)}
                                    className="text-white/20 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}

                    {alarms.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-white/20 gap-4 mt-20">
                            <Clock size={48} strokeWidth={1} />
                            <p className="text-sm">{t('alarm.no_alarms')}</p>
                        </div>
                    )}
                </div>

                {/* Add Section */}
                <div className="p-6 border-t border-white/10 bg-[#141414]">
                    <AnimatePresence mode="wait">
                        {isAdding ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-4"
                            >
                                <div className="flex gap-4">
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={(e) => setNewTime(e.target.value)}
                                        className="bg-[#0f0f0f] border border-white/10 rounded-lg p-3 text-white text-xl w-full outline-none focus:border-white/30"
                                    />
                                </div>
                                <input
                                    type="text"
                                    placeholder={t('alarm.label_placeholder')}
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    className="bg-[#0f0f0f] border border-white/10 rounded-lg p-3 text-white text-sm w-full outline-none focus:border-white/30"
                                />
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={() => setIsAdding(false)}
                                        className="flex-1 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 text-sm font-medium transition-colors"
                                    >
                                        {t('welcome.cancel')}
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="flex-1 py-3 rounded-lg bg-white text-black hover:bg-gray-200 text-sm font-semibold transition-colors"
                                    >
                                        {t('alarm.set_alarm')}
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <button
                                onClick={() => setIsAdding(true)}
                                className="w-full py-4 rounded-xl border border-dashed border-white/20 hover:border-white/40 hover:bg-white/5 text-white/50 hover:text-white transition-all flex items-center justify-center gap-2 group"
                            >
                                <Plus size={20} className="group-hover:scale-110 transition-transform" />
                                <span className="font-medium">{t('alarm.add_new')}</span>
                            </button>
                        )}
                    </AnimatePresence>
                </div>

            </motion.div>
        </div>
    );
};