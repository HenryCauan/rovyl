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

        const updatedAlarms = [...alarms, newAlarm].sort((a, b) => a.time.localeCompare(b.time));
        setAlarms(updatedAlarms);

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
                className="absolute inset-0 bg-black/60 backdrop-blur-2xl"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.98, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.98, opacity: 0, y: 10 }}
                className="relative bg-[#080808] border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] w-[920px] h-[640px] flex overflow-hidden z-[70]"
                onClick={e => e.stopPropagation()}
            >
                {/* Main Content: Precision Grid */}
                <div className="flex-1 flex flex-col p-10 relative">
                    <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                                <Bell size={20} />
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg tracking-tight leading-none mb-1">CHRONOS</h2>
                                <p className="text-[9px] text-white/20 font-black uppercase tracking-[0.3em]">{alarms.length} Alarms Tracked</p>
                            </div>
                        </div>
                        <button
                          onClick={() => setIsAdding(true)}
                          className="px-6 py-2.5 rounded-xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-3"
                        >
                          <Plus size={16} /> Deploy New
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        {alarms.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-white/10 gap-6 opacity-40">
                                <Clock size={64} strokeWidth={1} />
                                <p className="text-[10px] font-black uppercase tracking-[0.4em]">{t('alarm.no_alarms')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {alarms.map(alarm => (
                                        <motion.div
                                            key={alarm.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className={`
                                                p-6 rounded-[2rem] border transition-all duration-300 flex flex-col justify-between h-[180px] group
                                                ${alarm.enabled ? 'bg-white/[0.03] border-white/10 shadow-xl' : 'bg-transparent border-white/5 opacity-30 grayscale'}
                                            `}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-[9px] text-white/20 font-black uppercase tracking-widest">{alarm.label}</span>
                                                    <div className="text-5xl font-medium tracking-tight tabular-nums text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                                                        {alarm.time}
                                                    </div>
                                                </div>
                                                <button
                                                  onClick={() => toggleAlarm(alarm.id)}
                                                  className={`w-14 h-7 rounded-full relative transition-all duration-300 ${alarm.enabled ? 'bg-white' : 'bg-white/10'}`}
                                                >
                                                    <motion.div
                                                      animate={{ x: alarm.enabled ? 32 : 4 }}
                                                      className={`absolute top-1 w-5 h-5 rounded-full shadow-md ${alarm.enabled ? 'bg-black' : 'bg-white/40'}`}
                                                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    />
                                                </button>
                                            </div>

                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button
                                                  onClick={() => deleteAlarm(alarm.id)}
                                                  className="p-3 rounded-xl text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    <div className="mt-10 py-4 opacity-5 flex flex-col items-center select-none pointer-events-none grayscale">
                        <div className="text-3xl font-extrabold tracking-tighter" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>ZENITH LABS</div>
                        <div className="text-[7px] uppercase tracking-[0.6em] font-black mt-[-4px]">Precision Instrument</div>
                    </div>
                </div>

                {/* Side Panel: Create/Edit Alarm */}
                <AnimatePresence>
                    {isAdding && (
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="w-[320px] bg-white/[0.02] border-l border-white/10 backdrop-blur-3xl flex flex-col p-8 z-30"
                        >
                            <div className="flex justify-between items-center mb-10">
                                <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">New Schedule</h3>
                                <button onClick={() => setIsAdding(false)} className="text-white/20 hover:text-white transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-10 flex-1">
                                <div className="space-y-4">
                                    <label className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-black ml-1">Precision Time</label>
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={(e) => setNewTime(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white text-5xl font-medium w-full outline-none focus:border-white/30 transition-all text-center [color-scheme:dark]"
                                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[9px] text-white/20 uppercase tracking-[0.2em] font-black ml-1">Identification</label>
                                    <input
                                        type="text"
                                        placeholder={t('alarm.label_placeholder')}
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded-2xl p-5 text-white text-sm w-full outline-none focus:border-white/30 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleSave}
                                    className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.2em] text-[10px] hover:bg-gray-200 transition-all"
                                >
                                    Activate Alarm
                                </button>
                                <button
                                    onClick={() => setIsAdding(false)}
                                    className="w-full py-5 rounded-2xl bg-white/5 text-white/30 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white/10 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Global Close Button */}
                {!isAdding && (
                  <button
                    onClick={onClose}
                    className="absolute top-8 right-8 p-3 rounded-full bg-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all border border-transparent hover:border-white/10 z-20"
                  >
                    <X size={20} />
                  </button>
                )}
            </motion.div>
        </div>
    );
};