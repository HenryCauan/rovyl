import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem, UIConfig, UserProfile } from '../types';
import { ICON_MAP, getIcon } from '../iconMap';
import { AVAILABLE_WIDGETS } from '../defaults';
import { AppSelector } from './AppSelector';
import {
    X, Save, RotateCcw, Monitor, LayoutGrid, Palette,
    Plus, Trash2, Clock, Keyboard, AlertTriangle, RotateCw, AlarmClock,
    Gamepad2, AppWindow, Settings2, Folder, ChevronRight, CornerUpLeft,
    Image as ImageIcon, Upload, Search, FileType,
    Lock, LayoutDashboard, Box, Command, Ban, ChevronDown, Play, CheckCircle2,
    HelpCircle, User, MessageSquare, CreditCard, Globe, Eye, Zap,
    Hash, Download, ExternalLink, Moon, Sun, ArrowRight, ArrowLeft, TimerReset,
    FolderPlus, FileText, Edit3, Image, Calendar, Battery, CloudRain,
    Layout, Compass, Laptop, Smartphone, Bell, GripVertical, ChevronLeft
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';
import { IconPicker } from './IconPicker';

const AppEditorModal = React.memo(({
    editingApp,
    setEditingApp,
    handleAppChange,
    handlePickCommand,
    setShowAppSelector,
    handlePickIcon
}: {
    editingApp: { app: AppItem, index: number, workspaceIndex?: number, path: number[] } | null,
    setEditingApp: (v: any) => void,
    handleAppChange: (f: keyof AppItem, v: any) => void,
    handlePickCommand: () => void,
    setShowAppSelector: (v: boolean) => void,
    handlePickIcon: () => void
}) => {
    return (
        <AnimatePresence>
            {editingApp && (
                <div className="absolute inset-0 z-[200] flex items-center justify-center p-8 overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setEditingApp(null)}
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                    />
                    <motion.div
                        className="w-full max-w-md bg-gradient-to-br from-[#0A0A0A] to-[#010101] border border-white/10 rounded-2xl shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col max-h-[90%]"
                        initial={{ opacity: 0, scale: 0.9, y: 40 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    >
                        {/* Modal Header */}
                        <div className="p-5 pb-3 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                            <div>
                                <label className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em] block ml-1 mb-0.5">App Configuration</label>
                                <h3 className="text-base font-light text-white tracking-[0.1em] uppercase">Integration Profile</h3>
                            </div>
                            <button
                                onClick={() => setEditingApp(null)}
                                className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all duration-300 border border-white/5"
                            >
                                <X size={22} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
                            {/* Label Input */}
                            <div className="space-y-3">
                                <label className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] ml-1">App Identity</label>
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={editingApp.app.label}
                                        onChange={e => handleAppChange('label', e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base font-medium text-white focus:border-white/40 outline-none transition-all duration-300 shadow-inner group-hover:bg-black/60"
                                        placeholder="Service Name..."
                                    />
                                </div>
                            </div>

                            {/* Command Input */}
                            {editingApp.app.type === 'app' && (
                                <div className="space-y-3">
                                    <label className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] ml-1">
                                        {editingApp.app.commandType === 'url' ? 'Network Destination' : 'Execution Path'}
                                    </label>
                                    <div className="flex gap-3">
                                        <div className="flex-1 relative group">
                                            <input
                                                type="text"
                                                value={editingApp.app.command}
                                                onChange={e => handleAppChange('command', e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm font-mono text-white/80 focus:border-white/40 outline-none transition-all duration-300 shadow-inner group-hover:bg-black/60 truncate"
                                                placeholder={editingApp.app.commandType === 'url' ? 'https://...' : 'Binary Path...'}
                                            />
                                        </div>
                                        {editingApp.app.commandType === 'url' ? (
                                            <div className="w-14 h-14 bg-white/5 border border-white/10 flex items-center justify-center text-white/40 rounded-xl shrink-0 transition-colors">
                                                <Globe size={22} strokeWidth={1.5} />
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={handlePickCommand}
                                                    className="px-6 bg-white text-black font-semibold text-[10px] uppercase tracking-widest rounded-xl hover:bg-gray-100 transition-all duration-300 shadow-lg active:scale-95 shrink-0"
                                                >
                                                    Scan Disk
                                                </button>
                                                <button
                                                    onClick={() => setShowAppSelector(true)}
                                                    className="w-14 h-14 bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300 shrink-0"
                                                >
                                                    <Search size={22} strokeWidth={1.5} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Icon Customization */}
                            <div className="space-y-6">
                                <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.2em] ml-1">Visual Signature</label>
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
                                    <button
                                        onClick={() => handleAppChange('iconSource', 'native')}
                                        className={`flex-1 py-3 text-[10px] font-semibold uppercase tracking-widest rounded-lg transition-all duration-500 ${editingApp.app.iconSource === 'native' ? 'bg-white text-black shadow-lg translate-y-[-1px]' : 'text-white/20 hover:text-white/40'}`}
                                    >
                                        Neural Native
                                    </button>
                                    <button
                                        onClick={() => handleAppChange('iconSource', 'lucide')}
                                        className={`flex-1 py-3 text-[10px] font-semibold uppercase tracking-widest rounded-lg transition-all duration-500 ${editingApp.app.iconSource === 'lucide' ? 'bg-white text-black shadow-lg translate-y-[-1px]' : 'text-white/20 hover:text-white/40'}`}
                                    >
                                        Symbol Matrix
                                    </button>
                                </div>

                                <div className="min-h-[200px] rounded-2xl border border-white/5 bg-black/40 shadow-inner overflow-hidden">
                                    {editingApp.app.iconSource === 'native' ? (
                                        <div className="h-full flex flex-col items-center justify-center gap-6 p-8">
                                            <div className="relative group">
                                                <div className="w-20 h-20 rounded-2xl bg-black/60 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-all duration-700 cursor-pointer overflow-hidden shadow-2xl"
                                                    onClick={handlePickIcon}>
                                                    {editingApp.app.customIconUrl ? (
                                                        <img
                                                            src={editingApp.app.customIconUrl}
                                                            className="w-full h-full object-contain p-2 transition-transform duration-700 group-hover:scale-110"
                                                            style={{ imageRendering: '-webkit-optimize-contrast' }}
                                                            alt=""
                                                        />
                                                    ) : (
                                                        (() => {
                                                            const Icon = getIcon(editingApp.app.iconName);
                                                            return <Icon size={40} strokeWidth={1} className="text-white/20 group-hover:text-white transition-colors duration-500" />;
                                                        })()
                                                    )}
                                                    <div className="absolute inset-0 bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                </div>
                                                <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-lg transform scale-0 group-hover:scale-100 transition-transform duration-500 delay-100">
                                                    <Edit3 size={14} />
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3 w-full max-w-[280px]">
                                                <button
                                                    onClick={handlePickIcon}
                                                    className="w-full py-3.5 bg-white/5 hover:bg-white/10 text-white font-semibold text-[10px] uppercase tracking-widest rounded-xl border border-white/10 transition-all duration-300"
                                                >
                                                    Inject Custom Asset
                                                </button>
                                                <button
                                                    onClick={() => handleAppChange('customIconUrl', undefined)}
                                                    className="w-full py-2 text-white/20 hover:text-white/40 text-[10px] font-black uppercase tracking-widest transition-colors duration-300"
                                                >
                                                    Revert to Kernel default
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full p-2">
                                            <IconPicker
                                                selectedIcon={editingApp.app.iconName}
                                                onSelect={(name) => handleAppChange('iconName', name)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-white/5 bg-white/[0.01] flex justify-end">
                            <button
                                onClick={() => setEditingApp(null)}
                                className="px-7 py-3 bg-white text-black font-semibold text-xs uppercase tracking-[0.2em] rounded-lg hover:shadow-[0_8px_24px_rgba(255,255,255,0.2)] transition-all duration-300 active:scale-95"
                            >
                                Synchronize
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
});



const WidgetsTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="p-4 sm:p-8 md:p-12 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-5xl mx-auto">
                <motion.div
                    className="mb-8"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">Zenith Widgets</h3>
                    <p className="text-white/30 text-[11px] font-medium tracking-wide">Add powerful system widgets to your menu</p>
                </motion.div>

                {/* Modular Architecture Guidance */}
                <motion.div
                    className="mb-10 p-5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm flex items-center gap-5"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/30 shrink-0">
                        <Zap size={22} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Modular Architecture</h4>
                        <p className="text-[11px] text-white/20 leading-relaxed uppercase tracking-tight">Widgets are autonomous system modules. Toggle their deployment status across your neural workspaces to maintain optimized operational focus.</p>
                    </div>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {AVAILABLE_WIDGETS.map((widget, index) => {
                        const Icon = getIcon(widget.iconName);
                        const isDeployed = config.workspaces.some(ws => ws.apps.some(a => a.command === widget.command));

                        return (
                            <motion.div
                                key={widget.id}
                                className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06] flex flex-col transition-all duration-500 group relative overflow-hidden shadow-lg"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05, duration: 0.5 }}
                            >
                                {isDeployed && (
                                    <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                                        <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-green-500 uppercase tracking-[0.15em]">Active</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-4 relative z-10">
                                    <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-white/30 group-hover:text-white group-hover:border-white/10 transition-all duration-500 shrink-0">
                                        <Icon size={18} strokeWidth={1.25} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-medium text-white text-sm tracking-tight truncate leading-tight">{widget.name}</h4>
                                        <p className="text-[9px] text-white/20 font-semibold uppercase tracking-[0.2em]">{widget.id.split('_')[0]} Module</p>
                                    </div>
                                </div>

                                <div className="mb-6 relative z-10">
                                    <p className="text-[11px] text-white/40 font-medium leading-relaxed line-clamp-2 min-h-[32px]">{widget.description}</p>
                                </div>

                                <div className="mt-auto space-y-4 relative z-10">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-[0.25em]">Module Integration</label>
                                        <div className="h-px flex-1 bg-white/5 mx-3" />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {config.workspaces.map((ws, wsIndex) => {
                                            const isInside = ws.apps.some(a => a.command === widget.command);
                                            return (
                                                <motion.button
                                                    key={ws.id}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => {
                                                        const newWorkspaces = [...config.workspaces];
                                                        if (isInside) {
                                                            newWorkspaces[wsIndex].apps = newWorkspaces[wsIndex].apps.filter(a => a.command !== widget.command);
                                                        } else {
                                                            const newWidgetApp: AppItem = {
                                                                id: crypto.randomUUID(),
                                                                type: 'app',
                                                                label: widget.defaultLabel,
                                                                iconName: widget.iconName,
                                                                iconSource: 'lucide',
                                                                command: widget.command,
                                                                description: widget.description
                                                            };
                                                            newWorkspaces[wsIndex].apps.push(newWidgetApp);
                                                        }
                                                        setConfig({ ...config, workspaces: newWorkspaces });
                                                    }}
                                                    className={`px-3 py-2 rounded-lg text-[9px] font-bold transition-all border duration-200 ${isInside
                                                        ? 'bg-white text-black border-white'
                                                        : 'bg-white/5 text-white/30 border-white/5 hover:border-white/20 hover:text-white'
                                                        }`}
                                                    title={`Toggle for ${ws.name}`}
                                                >
                                                    {ws.name}
                                                </motion.button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/[0.01] rounded-full blur-[40px] group-hover:bg-white/[0.03] transition-colors duration-700" />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
});

const BentoCard = React.memo(({ title, icon: Icon, children, description, className = '' }: any) => (
    <motion.div
        className={`p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition-all duration-500 overflow-hidden relative group ${className}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
    >
        <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all duration-500">
                <Icon size={20} strokeWidth={1.5} />
            </div>
            <div>
                <h4 className="text-[13px] font-bold text-white tracking-tight leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-white/20 font-medium tracking-wide uppercase mt-0.5">{description}</p>}
            </div>
        </div>
        <div className="relative z-10">
            {children}
        </div>
        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/[0.02] rounded-full blur-3xl pointer-events-none group-hover:bg-white/[0.05] transition-colors duration-700" />
    </motion.div>
));

const VisualsTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="p-8 md:p-12 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-5xl mx-auto">
                <div className="mb-10">
                    <h3 className="text-2xl font-bold text-white mb-1.5 tracking-tight">Atmospheric Visuals</h3>
                    <p className="text-white/30 text-[12px] font-medium tracking-wide uppercase">Fine-tune the neural dark field intensity and radial matrix</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <BentoCard
                        title="Radial Matrix"
                        icon={Layout}
                        description="Spatial Expansion"
                        className="md:col-span-2"
                    >
                        <div className="space-y-6">
                            <div className="flex justify-between items-center text-[10px] font-black text-white/20 uppercase tracking-widest">
                                <span>Minimum Scope (150px)</span>
                                <span>Maximum Reach (600px)</span>
                            </div>
                            <div className="relative pt-1">
                                <input
                                    type="range"
                                    min="150"
                                    max="600"
                                    step="10"
                                    value={config.menuRadius}
                                    onChange={e => setConfig({ ...config, menuRadius: Number(e.target.value) })}
                                    className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-white cursor-pointer"
                                />
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 bg-white text-black text-[10px] font-bold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity">
                                    {config.menuRadius}px
                                </div>
                            </div>
                        </div>
                    </BentoCard>

                    <BentoCard title="Module Density" icon={Box} description="Icon Dynamics">
                        <div className="space-y-6">
                            <div className="flex items-end justify-between">
                                <span className="text-3xl font-black text-white tabular-nums">{config.iconSize}</span>
                                <span className="text-[10px] text-white/20 font-bold uppercase mb-1">Standard Unit</span>
                            </div>
                            <input
                                type="range"
                                min="30"
                                max="100"
                                step="2"
                                value={config.iconSize}
                                onChange={e => setConfig({ ...config, iconSize: Number(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                            />
                        </div>
                    </BentoCard>

                    <BentoCard title="Atmospheric Depth" icon={Zap} description="Glassmorphism Calibration">
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <span className="text-2xl font-black text-white tabular-nums">{Math.round(config.backdropOpacity * 100)}%</span>
                                    <span className="text-[9px] text-white/20 font-bold uppercase mb-1 tracking-widest">Opacity</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={config.backdropOpacity}
                                    onChange={e => setConfig({ ...config, backdropOpacity: Number(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                                />
                            </div>

                            <div className="space-y-4 pt-2 border-t border-white/5">
                                <div className="flex items-end justify-between">
                                    <span className="text-2xl font-black text-white tabular-nums">{config.backdropBlur}px</span>
                                    <span className="text-[9px] text-white/20 font-bold uppercase mb-1 tracking-widest">Backdrop Blur Radius</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="60"
                                    step="1"
                                    value={config.backdropBlur}
                                    onChange={e => setConfig({ ...config, backdropBlur: Number(e.target.value) })}
                                    className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                                />
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[8px] text-white/40 uppercase font-bold tracking-tighter">Native Windows Acrylic</span>
                                    <button
                                        onClick={() => setConfig({ ...config, backdropBlur: config.backdropBlur > 0 ? 0 : 20 })}
                                        className={`px-2 py-1 rounded border text-[8px] font-bold uppercase transition-all ${config.backdropBlur > 0 ? 'bg-white text-black border-white' : 'bg-transparent text-white/20 border-white/5'}`}
                                    >
                                        {config.backdropBlur > 0 ? 'Enhanced' : 'Standard'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </BentoCard>

                    <BentoCard
                        title="Accent Signature"
                        icon={Palette}
                        description="Color Synchronization"
                        className="lg:col-span-2"
                    >
                        <div className="flex gap-6 items-center">
                            <div className="relative group/color p-2 rounded-2xl bg-black/40 border border-white/10">
                                <input
                                    type="color"
                                    value={config.accentColor}
                                    onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                                    className="w-16 h-16 rounded-xl cursor-pointer bg-transparent border-none outline-none scale-95 group-hover/color:scale-100 transition-transform"
                                />
                                <div className="absolute inset-2 rounded-lg ring-1 ring-white/10 pointer-events-none" />
                            </div>
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Hex Code</span>
                                    <CheckCircle2 size={14} className="text-white/20" />
                                </div>
                                <input
                                    type="text"
                                    value={config.accentColor}
                                    onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-white/40 focus:bg-white/[0.05] outline-none transition-all"
                                    placeholder="#FFFFFF"
                                />
                            </div>
                        </div>
                    </BentoCard>

                    <BentoCard title="Nomenclature" icon={FileType} description="Semantic Labels">
                        <div className="flex flex-col gap-4">
                            <p className="text-[11px] text-white/30 leading-relaxed">Toggle molecular labels within the radial matrix.</p>
                            <button
                                onClick={() => setConfig({ ...config, showLabels: !config.showLabels })}
                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-500 ${config.showLabels ? 'bg-white border-white' : 'bg-white/[0.02] border-white/10'}`}
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${config.showLabels ? 'text-black' : 'text-white/40'}`}>
                                    {config.showLabels ? 'Visible' : 'Hidden'}
                                </span>
                                <div className={`w-2 h-2 rounded-full ${config.showLabels ? 'bg-black animate-pulse' : 'bg-white/10'}`} />
                            </button>
                        </div>
                    </BentoCard>
                </div>
            </div>
        </motion.div>
    );
});


const WorkspaceCard = React.memo(({
    workspace,
    index,
    dragOverWorkspace,
    dragWorkspaceRef,
    setDragOverWorkspace,
    reorderWorkspaces,
    setSelectedWorkspaceIndex,
    getIcon
}: any) => (
    <motion.div
        draggable
        onDragStart={(e) => {
            dragWorkspaceRef.current = index;
            (e.target as HTMLElement).style.opacity = '0.4';
        }}
        onDragEnd={(e) => {
            (e.target as HTMLElement).style.opacity = '1';
            setDragOverWorkspace(null);
            dragWorkspaceRef.current = null;
        }}
        onDragOver={(e) => {
            e.preventDefault();
            setDragOverWorkspace(index);
        }}
        onDragLeave={() => setDragOverWorkspace(null)}
        onDrop={(e) => {
            e.preventDefault();
            if (dragWorkspaceRef.current !== null) {
                reorderWorkspaces(dragWorkspaceRef.current, index);
            }
            setDragOverWorkspace(null);
        }}
        onClick={() => setSelectedWorkspaceIndex(index)}
        className={`group relative p-0 w-full h-full rounded-3xl cursor-grab active:cursor-grabbing transition-[transform,opacity] duration-300 flex flex-col items-center justify-center ${dragOverWorkspace === index ? 'scale-105 z-30' : ''}`}
        whileHover={{ y: -4 }}
    >
        <div className="relative w-full h-full flex flex-col items-center p-6 transition-[transform,opacity] duration-300">
            <div className="absolute inset-x-[-2%] inset-y-0 z-0 pointer-events-none transition-[transform,filter] duration-300 overflow-visible rounded-3xl will-change-transform">
                <img src="/folder.svg" className="w-full h-full object-fill filter brightness-[0.7] group-hover:brightness-[1] group-hover:scale-[1.01] transition-[transform,filter] duration-500" alt="" />
            </div>

            {/* Top Right Labeling */}
            <div className="absolute top-[12%] right-[10%] flex items-center gap-1.5 z-20">
                <div className={`w-2 h-2 rounded-full ring-2 ring-black/20 ${workspace.enabled ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'bg-white/10'}`} />
                <div className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-[8px] font-black text-white/30 uppercase tracking-widest">
                    MN-{workspace.hotkey}
                </div>
            </div>

            {/* App Matrix (2x2 Grid) */}
            <div className="relative z-10 flex-1 flex items-center justify-center mt-6 w-full px-6">
                <div className="grid grid-cols-2 gap-2 w-fit">
                    {workspace.apps.slice(0, 4).map((app: any, appIdx: number) => {
                        const SmallIcon = getIcon(app.iconName);
                        return (
                            <motion.div
                                key={app.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: appIdx * 0.05 }}
                                className="w-9 h-9 rounded-xl bg-black/40 border border-white/5 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:border-white/20 transition-all duration-500 hover:scale-110 hover:z-30 p-1.5"
                            >
                                {app.iconSource === 'native' && app.customIconUrl ? (
                                    <img src={app.customIconUrl} className="w-full h-full object-contain" alt="" />
                                ) : (
                                    <SmallIcon size={18} className="text-white/30 group-hover:text-white/60 transition-colors" />
                                )}
                            </motion.div>
                        );
                    })}
                    {workspace.apps.length === 0 && (
                        <div className="col-span-2 w-20 flex flex-col items-center justify-center py-4">
                            <div className="w-8 h-8 rounded-full border border-dashed border-white/10 flex items-center justify-center text-white/10">
                                <Plus size={14} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Labeling */}
            <div className="relative z-20 mb-2 w-full px-4">
                <div className="flex flex-col items-center gap-0.5">
                    <h4 className="text-[10px] font-bold text-white tracking-[0.25em] uppercase transition-all duration-500 group-hover:tracking-[0.3em] line-clamp-1 truncate text-center w-full">
                        {workspace.name}
                    </h4>
                    <div className="h-[1px] w-4 bg-white/10 group-hover:w-8 group-hover:bg-white/30 transition-all duration-700" />
                </div>
            </div>

            {dragOverWorkspace === index && (
                <div className="absolute inset-x-[-2%] inset-y-0 border-2 border-white/40 rounded-[2.5rem] z-40 pointer-events-none animate-pulse" />
            )}
        </div>
    </motion.div>
));

const WorkspaceAppItem = React.memo(({
    app, i, isFolder, getIcon, dragAppRef, setDragOverApp, dragOverApp,
    selectedWorkspaceIndex, workspaceFolderPath, reorderAppsInWorkspace,
    setEditingApp, removeAppFromWorkspace, setWorkspaceFolderPath
}: any) => {
    const Icon = getIcon(app.iconName);
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            draggable
            onDragStart={(e) => {
                dragAppRef.current = i;
                (e.currentTarget as HTMLElement).style.opacity = '0.4';
            }}
            onDragEnd={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
                setDragOverApp(null);
                dragAppRef.current = null;
            }}
            onDragOver={(e) => {
                e.preventDefault();
                setDragOverApp(i);
            }}
            onDragLeave={() => setDragOverApp(null)}
            onDrop={(e) => {
                e.preventDefault();
                if (dragAppRef.current !== null && selectedWorkspaceIndex !== null) {
                    reorderAppsInWorkspace(selectedWorkspaceIndex, dragAppRef.current, i, workspaceFolderPath);
                }
                setDragOverApp(null);
            }}
            onClick={() => {
                if (isFolder) {
                    setWorkspaceFolderPath([...workspaceFolderPath, i]);
                } else {
                    setEditingApp({ app, index: i, workspaceIndex: selectedWorkspaceIndex!, path: workspaceFolderPath });
                }
            }}
            className={`group relative p-3.5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border hover:bg-white/[0.08] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition-all duration-300 flex items-center gap-3.5 cursor-grab active:cursor-grabbing ${dragOverApp === i
                ? 'border-white/40 shadow-[0_0_0_2px_rgba(255,255,255,0.1)] scale-[1.01]'
                : 'border-white/[0.05] hover:border-white/[0.15]'
                }`}
        >
            <div className="shrink-0 opacity-0 group-hover:opacity-30 transition-opacity duration-200 text-white -ml-1 mr-0.5 cursor-grab">
                <GripVertical size={14} strokeWidth={1.5} />
            </div>
            <div className="w-12 h-12 rounded-xl bg-black/60 flex items-center justify-center text-white/40 overflow-hidden border border-white/[0.05] group-hover:border-white/20 group-hover:text-white transition-all duration-500 shadow-inner shrink-0 p-2">
                {app.iconSource === 'native' && app.customIconUrl ? (
                    <img
                        src={app.customIconUrl}
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                        style={{ imageRendering: '-webkit-optimize-contrast' }}
                        alt=""
                    />
                ) : (
                    <Icon size={24} strokeWidth={1.2} className={isFolder ? 'text-white/60' : ''} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate text-sm tracking-tight">{app.label}</div>
                <div className="text-[9px] text-white/20 truncate font-semibold uppercase tracking-widest">{app.type}</div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                {!isFolder && (
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingApp({ app, index: i, workspaceIndex: selectedWorkspaceIndex!, path: workspaceFolderPath }); }}
                        className="p-2 text-white/20 hover:text-white transition-all"
                    >
                        <Settings2 size={16} strokeWidth={1.5} />
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        removeAppFromWorkspace(selectedWorkspaceIndex!, i, workspaceFolderPath);
                    }}
                    className="p-2 text-white/20 hover:text-red-400 transition-all"
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
            </div>
        </motion.div>
    );
});





const WorkspacesTab = React.memo(({
    config,
    setConfig,
    selectedWorkspaceIndex,
    setSelectedWorkspaceIndex,
    workspaceFolderPath,
    setWorkspaceFolderPath,
    dragWorkspaceRef,
    dragOverWorkspace,
    setDragOverWorkspace,
    reorderWorkspaces,
    createWorkspace,
    deleteWorkspace,
    getCurrentLevel,
    dragAppRef,
    dragOverApp,
    setDragOverApp,
    reorderAppsInWorkspace,
    setEditingApp,
    removeAppFromWorkspace,
    handleAddApp
}: {
    config: UIConfig,
    setConfig: (c: any) => void,
    selectedWorkspaceIndex: number | null,
    setSelectedWorkspaceIndex: (i: number | null) => void,
    workspaceFolderPath: number[],
    setWorkspaceFolderPath: (p: number[]) => void,
    dragWorkspaceRef: React.MutableRefObject<number | null>,
    dragOverWorkspace: number | null,
    setDragOverWorkspace: (i: number | null) => void,
    reorderWorkspaces: (from: number, to: number) => void,
    createWorkspace: () => void,
    deleteWorkspace: (i: number) => void,
    getCurrentLevel: (root: any[], path: number[]) => any[],
    dragAppRef: React.MutableRefObject<number | null>,
    dragOverApp: number | null,
    setDragOverApp: (i: number | null) => void,
    reorderAppsInWorkspace: (wsIdx: number, from: number, to: number, path: number[]) => void,
    setEditingApp: (app: any) => void,
    removeAppFromWorkspace: (wsIdx: number, appIdx: number, path: number[]) => void,
    handleAddApp: (type: 'app' | 'folder') => void
}) => {
    return (
        <div className="h-full w-full p-6 overflow-y-auto custom-scrollbar">
            <div className="max-w-6xl mx-auto h-full flex flex-col">
                <div className="flex items-center gap-6 mb-8 group/header">
                    {selectedWorkspaceIndex !== null && (
                        <motion.button
                            onClick={() => setSelectedWorkspaceIndex(null)}
                            className="w-10 h-10 flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/40 hover:text-white rounded-xl transition-all duration-300 active:scale-95"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ x: -2 }}
                            title="Back to Workspaces"
                        >
                            <ChevronLeft size={20} />
                        </motion.button>
                    )}

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex-1"
                    >
                        <h3 className="text-2xl font-semibold text-white mb-1 tracking-tight">
                            {selectedWorkspaceIndex !== null ? config.workspaces[selectedWorkspaceIndex].name : 'Workspaces'}
                        </h3>
                        <p className="text-white/30 text-[11px] font-medium tracking-wide">
                            {selectedWorkspaceIndex !== null ? 'Manage apps in this workspace' : 'Organize your apps into switchable environments'}
                        </p>
                    </motion.div>
                </div>

                <AnimatePresence mode="wait">
                    {selectedWorkspaceIndex === null ? (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className="flex flex-col gap-8"
                        >

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[200px]">
                                {config.workspaces.map((workspace, index) => (
                                    <WorkspaceCard
                                        key={workspace.id}
                                        workspace={workspace}
                                        index={index}
                                        dragOverWorkspace={dragOverWorkspace}
                                        dragWorkspaceRef={dragWorkspaceRef}
                                        setDragOverWorkspace={setDragOverWorkspace}
                                        reorderWorkspaces={reorderWorkspaces}
                                        setSelectedWorkspaceIndex={setSelectedWorkspaceIndex}
                                        getIcon={getIcon}
                                    />
                                ))}

                                {config.workspaces.length < 9 && (
                                    <motion.button
                                        onClick={createWorkspace}
                                        className="h-full rounded-[2.5rem] border-2 border-dashed border-white/[0.08] hover:border-white/[0.3] hover:bg-white/[0.03] flex flex-col items-center justify-center gap-4 text-white/20 hover:text-white transition-all group scale-95 hover:scale-100 duration-500"
                                        whileHover={{ y: -4 }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 group-hover:rotate-90 transition-all duration-500">
                                            <Plus size={28} strokeWidth={1.5} />
                                        </div>
                                        <span className="font-semibold text-[10px] uppercase tracking-[0.15em] opacity-40 group-hover:opacity-100 transition-opacity">Expand Matrix</span>
                                    </motion.button>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="detail"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col"
                        >
                            {selectedWorkspaceIndex !== null && config.workspaces[selectedWorkspaceIndex] && (
                                <div className="flex items-center gap-5 mb-6 bg-gradient-to-r from-white/[0.04] to-transparent p-5 rounded-2xl border border-white/10 backdrop-blur-md">
                                    <div className="flex-1">
                                        <label className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.25em] block mb-2">Workspace Alias</label>
                                        <input
                                            type="text"
                                            value={config.workspaces[selectedWorkspaceIndex].name}
                                            onChange={e => {
                                                const nw = [...config.workspaces];
                                                nw[selectedWorkspaceIndex] = { ...nw[selectedWorkspaceIndex], name: e.target.value };
                                                setConfig({ ...config, workspaces: nw });
                                            }}
                                            className="w-full bg-transparent text-xl font-semibold text-white border-none outline-none placeholder-white/10 focus:placeholder-transparent transition-all"
                                            placeholder="Neural Network..."
                                        />
                                        <div className="flex items-center gap-3 mt-3">
                                            {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6B7280'].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => {
                                                        const nw = [...config.workspaces];
                                                        nw[selectedWorkspaceIndex] = { ...nw[selectedWorkspaceIndex], color: c };
                                                        setConfig({ ...config, workspaces: nw });
                                                    }}
                                                    className={`w-5 h-5 rounded-full border-2 transition-all ${config.workspaces[selectedWorkspaceIndex].color === c || (!config.workspaces[selectedWorkspaceIndex].color && c === '#3B82F6') ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-30 hover:opacity-100'}`}
                                                    style={{ backgroundColor: c }}
                                                    title={`Set project color to ${c}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="h-12 w-px bg-white/10 mx-2" />
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                const nw = [...config.workspaces];
                                                nw[selectedWorkspaceIndex] = {
                                                    ...nw[selectedWorkspaceIndex],
                                                    enabled: !nw[selectedWorkspaceIndex].enabled
                                                };
                                                setConfig({ ...config, workspaces: nw });
                                            }}
                                            className={`h-9 px-4 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-all border duration-300 ${config.workspaces[selectedWorkspaceIndex].enabled ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white'}`}
                                        >
                                            {config.workspaces[selectedWorkspaceIndex].enabled ? 'Active' : 'Standby'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (confirm('Decommission this workspace matrix?')) deleteWorkspace(selectedWorkspaceIndex);
                                            }}
                                            className="h-11 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 hover:border-red-500/40 transition-all duration-300 shrink-0"
                                        >
                                            <Trash2 size={20} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* App Grid - Refined 2026 */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/40 rounded-xl border border-white/5 p-5 mb-5 shadow-inner">
                                <div className="flex items-center gap-4 mb-8">
                                    {workspaceFolderPath.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const newPath = [...workspaceFolderPath];
                                                newPath.pop();
                                                setWorkspaceFolderPath(newPath);
                                            }}
                                            className="h-11 px-4 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl border border-white/5 hover:border-white/20 transition-all duration-300 text-xs font-bold uppercase tracking-widest shrink-0"
                                        >
                                            <CornerUpLeft size={18} /> Back to Overview
                                        </button>
                                    )}
                                    <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-1">
                                        {workspaceFolderPath.length === 0 ? 'Root Cluster' : 'Sub-Directory Cluster'}
                                    </div>
                                </div>

                                {getCurrentLevel(config.workspaces[selectedWorkspaceIndex!].apps, workspaceFolderPath).length === 0 ? (
                                    <div className="h-4/5 flex flex-col items-center justify-center text-white/10 animate-pulse">
                                        <Box size={64} strokeWidth={0.5} className="mb-6" />
                                        <p className="text-xl font-bold tracking-tight text-white/20">Empty Matrix</p>
                                        <p className="text-xs uppercase tracking-[0.2em] opacity-30">Deploy modules below</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {getCurrentLevel(config.workspaces[selectedWorkspaceIndex!].apps, workspaceFolderPath).map((app, i) => (
                                            <WorkspaceAppItem
                                                key={app.id}
                                                app={app}
                                                i={i}
                                                isFolder={app.type === 'folder'}
                                                getIcon={getIcon}
                                                dragAppRef={dragAppRef}
                                                setDragOverApp={setDragOverApp}
                                                dragOverApp={dragOverApp}
                                                selectedWorkspaceIndex={selectedWorkspaceIndex}
                                                workspaceFolderPath={workspaceFolderPath}
                                                reorderAppsInWorkspace={reorderAppsInWorkspace}
                                                setEditingApp={setEditingApp}
                                                removeAppFromWorkspace={removeAppFromWorkspace}
                                                setWorkspaceFolderPath={setWorkspaceFolderPath}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Action Bar */}
                            <div className="flex gap-4">
                                <button
                                    onClick={() => handleAddApp('app')}
                                    className="flex-1 py-3 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    <Plus size={20} /> Add Application
                                </button>
                                <button
                                    onClick={() => handleAddApp('folder')}
                                    className="flex-1 py-3 bg-white/10 text-white rounded-lg text-sm font-semibold hover:bg-white/15 transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/10"
                                >
                                    <Folder size={20} /> Add Folder Group
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
});


interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    apps: AppItem[];
    setApps: (value: AppItem[] | ((prev: AppItem[]) => AppItem[])) => void;
    config: UIConfig;
    setConfig: (value: UIConfig | ((prev: UIConfig) => UIConfig)) => void;
    onReset: () => void;
    onOpenDashboard: () => void;
    user: UserProfile | null;
    isPage?: boolean;
}

type SettingsTab = 'apps' | 'zenith_apps' | 'workspaces' | 'interface' | 'visuals' | 'widgets' | 'gamemode' | 'user' | 'dashboard';

const InterfaceTab = React.memo(({ config, setConfig, handleCenterTypeChange, handleCenterTargetChange, setAppSelectorMode, setShowAppSelector }: {
    config: UIConfig,
    setConfig: (c: any) => void,
    handleCenterTypeChange: (type: any) => void,
    handleCenterTargetChange: (target: string, type: string) => void,
    setAppSelectorMode: (mode: any) => void,
    setShowAppSelector: (show: boolean) => void
}) => {
    return (
        <motion.div
            className="p-6 overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-3xl mx-auto">
                <motion.div
                    className="mb-8"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">Interface</h3>
                    <p className="text-white/30 text-[11px] font-medium">Configure interaction and behavior</p>
                </motion.div>

                {/* Interaction Flow Guidance */}
                <motion.div
                    className="mb-10 p-5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm flex items-center gap-5"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                >
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/30 shrink-0">
                        <Keyboard size={22} />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Interaction Flow</h4>
                        <p className="text-[11px] text-white/20 leading-relaxed uppercase tracking-tight">Use the global activation shortcut to manifest the radial matrix. Configure deployment modes and visual descriptors to streamline your workflow.</p>
                    </div>
                </motion.div>
                <div className="space-y-5">
                    {/* GLOBAL SHORTCUT - Refined 2026 */}
                    <motion.div
                        className="space-y-4 bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl hover:bg-white/[0.06] transition-colors duration-500"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                    >
                        <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-0.5">Activation Matrix</label>
                        <h4 className="text-[13px] font-medium text-white">Global Shortcut</h4>
                        <div className="flex gap-6 items-center">
                            <div className="flex-1 relative group">
                                <input
                                    type="text"
                                    value={config.globalShortcut || 'Alt+Space'}
                                    readOnly
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-white font-mono text-center tracking-[0.15em] focus:border-white/40 outline-none transition-all duration-300 shadow-inner group-hover:border-white/20"
                                />
                                <div className="absolute inset-0 rounded-2xl ring-2 ring-white/0 group-hover:ring-white/5 transition-all pointer-events-none" />
                            </div>
                            <button
                                className="px-6 py-3 bg-white text-black font-semibold text-xs uppercase tracking-[0.2em] rounded-lg hover:bg-white hover:shadow-[0_8px_24px_rgba(255,255,255,0.2)] transition-all duration-300 shrink-0"
                            >
                                Re-Sync
                            </button>
                        </div>
                        <p className="text-[10px] text-white/20 px-2 font-medium uppercase tracking-wider">Primary interception sequence for manual deployment.</p>
                    </motion.div>

                    {/* SYSTEM STARTUP - Refined 2026 */}
                    <motion.div
                        className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] flex items-center justify-between hover:bg-white/[0.07] transition-all duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.25 }}
                    >
                        <div className="relative z-10">
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-0.5">System Integration</label>
                            <h4 className="text-[13px] font-medium text-white">Autostart Protocol</h4>
                            <p className="text-[10px] text-white/30 font-medium leading-relaxed mt-1">Automate deployment upon executive kernel initialization.</p>
                        </div>
                        <motion.button
                            onClick={() => {
                                const newValue = !config.openAtLogin;
                                setConfig({ ...config, openAtLogin: newValue });
                                if (window.electron && window.electron.setLoginItemSettings) {
                                    window.electron.setLoginItemSettings({ openAtLogin: newValue });
                                }
                            }}
                            className={`relative w-16 h-10 rounded-2xl transition-all duration-500 p-1.5 shadow-lg ${config.openAtLogin ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <motion.div
                                className={`w-7 h-7 rounded-[0.8rem] shadow-xl ${config.openAtLogin ? 'bg-black' : 'bg-white/20'}`}
                                animate={{ x: config.openAtLogin ? 26 : 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        </motion.button>
                    </motion.div>

                    <div className="h-px bg-white/[0.08]" />

                    {/* CENTER BUTTON - Refined 2026 */}
                    <motion.div
                        className="space-y-5 bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl shadow-[0_12px_40px_-10px_rgba(0,0,0,0.5)]"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                    >
                        <div>
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-4">Center Button Functionality</label>
                            <h4 className="text-sm font-medium text-white tracking-tight">The Neural Center</h4>
                            <p className="text-[10px] text-white/30 font-normal leading-relaxed mt-1">Determine the primary action of the radial menu's nucleus.</p>
                        </div>

                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
                            {(['system', 'app', 'widget', 'command', 'none'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => handleCenterTypeChange(mode)}
                                    className={`flex-1 py-3 rounded-lg text-[10px] font-semibold uppercase tracking-[0.1em] transition-all duration-500 ${config.centerButton.type === mode
                                        ? 'bg-white text-black shadow-lg'
                                        : 'text-white/20 hover:text-white/60 hover:bg-white/5'
                                        }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                        <AnimatePresence mode="wait">
                            {config.centerButton.type === 'app' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-4"
                                >
                                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                                        {config.centerButton.target ? (
                                            <>
                                                <div className="w-10 h-10 bg-black/50 rounded-lg flex items-center justify-center text-white border border-white/10 text-lg">
                                                    {(() => {
                                                        const Icon = getIcon(config.centerButton.iconName);
                                                        return <Icon size={20} />;
                                                    })()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-white truncate">{config.centerButton.label}</div>
                                                    <div className="text-xs text-white/40 truncate">{config.centerButton.target}</div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex-1 text-sm text-white/40 italic pl-1">No app selected</div>
                                        )}
                                        <button
                                            onClick={() => {
                                                setAppSelectorMode('center');
                                                setShowAppSelector(true);
                                            }}
                                            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:scale-105 transition-transform shadow-lg"
                                        >
                                            Select App...
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {config.centerButton.type === 'widget' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-4"
                                >
                                    <select
                                        value={AVAILABLE_WIDGETS.find(w => w.command === config.centerButton.target)?.id || ''}
                                        onChange={(e) => handleCenterTargetChange(e.target.value, 'widget')}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none hover:bg-white/[0.08] transition-colors cursor-pointer"
                                    >
                                        <option value="" disabled className="bg-[#111] text-white/50">Select a widget...</option>
                                        {AVAILABLE_WIDGETS.map(w => (
                                            <option key={w.id} value={w.id} className="bg-[#111] text-white">{w.name}</option>
                                        ))}
                                    </select>
                                </motion.div>
                            )}

                            {config.centerButton.type === 'command' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-4 space-y-3"
                                >
                                    <div>
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block ml-1">Command / Path</label>
                                        <input
                                            type="text"
                                            value={config.centerButton.target}
                                            onChange={(e) => setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: e.target.value, label: prev.centerButton.label === 'CMD' || prev.centerButton.label === '' ? (e.target.value.split(/[\\/]/).pop()?.substring(0, 8).toUpperCase() || 'CMD') : prev.centerButton.label } }))}
                                            placeholder="e.g. C:\Windows\System32\calc.exe"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block ml-1">Button Label</label>
                                        <input
                                            type="text"
                                            value={config.centerButton.label}
                                            onChange={(e) => setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, label: e.target.value } }))}
                                            placeholder="Short Label"
                                            maxLength={10}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <p className="text-xs text-white/30 px-1 mt-2">Choose function for the central button.</p>
                    </motion.div>

                    <div className="h-px bg-white/[0.08]" />

                    {/* MENU POSITION */}
                    <motion.div
                        className="space-y-4"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.35 }}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-normal text-white">Center on Screen</label>
                                <p className="text-xs text-white/40 mt-0.5">Show menu in screen center instead of mouse cursor</p>
                            </div>
                            <motion.button
                                onClick={() => setConfig({ ...config, fixedPosition: !config.fixedPosition })}
                                className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 ${config.fixedPosition ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <motion.div
                                    className={`w-5 h-5 rounded-lg shadow-lg ${config.fixedPosition ? 'bg-black' : 'bg-white/20'}`}
                                    animate={{ x: config.fixedPosition ? 24 : 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            </motion.button>
                        </div>
                    </motion.div>

                    <div className="h-px bg-white/[0.08]" />

                    {/* RESTART APP - Redesigned 2026 */}
                    <motion.div
                        className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] space-y-4 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.5)] relative overflow-hidden group"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/[0.03] rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-yellow-500/[0.06] transition-colors duration-700" />

                        <div className="flex items-start gap-4 text-white/60 relative z-10">
                            <div className="p-2.5 bg-white/5 rounded-xl text-white/80 border border-white/10 shadow-inner group-hover:rotate-12 transition-transform duration-500">
                                <AlertTriangle size={20} strokeWidth={1.5} />
                            </div>
                            <div>
                                <h4 className="text-base font-semibold text-white tracking-tight mb-1">System Relaunch Required</h4>
                                <p className="text-[11px] leading-relaxed text-white/40 font-normal">Some architectural adjustments require a complete application restart to calibrate correctly with the system kernel.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => window.electron?.relaunchApp()}
                            className="w-full py-3 bg-white text-black font-semibold text-xs uppercase tracking-[0.2em] rounded-lg hover:bg-white hover:shadow-[0_8px_24px_rgba(255,255,255,0.2)] transition-all duration-300 flex items-center justify-center gap-3 relative z-10 group/btn"
                        >
                            <RotateCw size={16} strokeWidth={2} className="group-hover/btn:rotate-180 transition-transform duration-700" />
                            Initialize Relaunch Sequence
                        </button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
});

const HUDTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="p-6 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-3xl mx-auto">
                <motion.div
                    className="mb-10"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">HUD Elements</h3>
                    <p className="text-white/30 text-[11px] font-medium">Configure on-screen widgets and overlays</p>
                </motion.div>

                <div className="space-y-4">
                    {/* CLOCK & DATE - Refined 2026 */}
                    <motion.div
                        className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-xl p-5 hover:bg-white/[0.06] transition-colors duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                <Clock size={20} strokeWidth={1.2} />
                            </div>
                            <div>
                                <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.2em] block ml-0.5 mb-0.5">Chronos Module</label>
                                <h4 className="text-sm font-medium text-white tracking-tight">Time &amp; Temporal Flow</h4>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                <div>
                                    <div className="text-[13px] font-medium text-white">Chronometer Display</div>
                                    <div className="text-[10px] text-white/30 font-medium">Render digital clock in active matrix.</div>
                                </div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showClock: !config.showClock })}
                                    className={`relative w-16 h-9 rounded-2xl transition-all duration-500 p-1.5 ${config.showClock ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-6 h-6 rounded-xl shadow-lg ${config.showClock ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showClock ? 28 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                <div>
                                    <div className="text-[13px] font-medium text-white">Calendar Meta-data</div>
                                    <div className="text-[10px] text-white/30 font-medium">Inject current date into system HUD.</div>
                                </div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showDate: !config.showDate })}
                                    className={`relative w-16 h-9 rounded-2xl transition-all duration-500 p-1.5 ${config.showDate ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-6 h-6 rounded-xl shadow-lg ${config.showDate ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showDate ? 28 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>

                    {/* SYSTEM STATUS - Refined 2026 */}
                    <motion.div
                        className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-xl p-5 hover:bg-white/[0.06] transition-colors duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                    >
                        <div className="flex items-center gap-4 mb-7">
                            <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                <Monitor size={20} strokeWidth={1.2} />
                            </div>
                            <div>
                                <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.2em] block ml-0.5 mb-0.5">Vital Telemetry</label>
                                <h4 className="text-sm font-medium text-white tracking-tight">System Status</h4>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                <div>
                                    <div className="text-[13px] font-medium text-white">Energy Capacitor</div>
                                    <div className="text-[10px] text-white/30 font-medium">Monitor battery charge levels.</div>
                                </div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showBattery: !config.showBattery })}
                                    className={`relative w-16 h-9 rounded-2xl transition-all duration-500 p-1.5 ${config.showBattery ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-6 h-6 rounded-xl shadow-lg ${config.showBattery ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showBattery ? 28 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                <div>
                                    <div className="text-[13px] font-medium text-white">Atmospheric Data</div>
                                    <div className="text-[10px] text-white/30 font-medium">Fetch local environmental metrics.</div>
                                </div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showWeather: !config.showWeather })}
                                    className={`relative w-16 h-9 rounded-2xl transition-all duration-500 p-1.5 ${config.showWeather ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-6 h-6 rounded-xl shadow-lg ${config.showWeather ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showWeather ? 28 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>

                            <AnimatePresence>
                                {config.showWeather && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2 pt-2"
                                    >
                                        <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1">Geospatial Tag</label>
                                        <input
                                            type="text"
                                            value={config.weatherLocation || ''}
                                            onChange={(e) => setConfig({ ...config, weatherLocation: e.target.value })}
                                            placeholder="e.g. 01310-100 or São Paulo, BR"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-white/30 outline-none hover:bg-black/60 transition-all shadow-inner font-mono"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* POSITION - Refined 2026 */}
                    <motion.div
                        className="bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] rounded-xl p-5 hover:bg-white/[0.06] transition-colors duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.2em] block ml-1 mb-6">Spatial Quadrant</label>
                        <div className="grid grid-cols-2 gap-4">
                            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                                <button
                                    key={pos}
                                    onClick={() => setConfig({ ...config, clockPosition: pos as any })}
                                    className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2.5 transition-all duration-500 ${config.clockPosition === pos
                                        ? 'bg-white text-black border-white shadow-lg translate-y-[-2px]'
                                        : 'bg-black/40 border-white/5 text-white/30 hover:border-white/20 hover:text-white/60'}`}
                                >
                                    <div className={`w-2.5 h-2.5 rounded-full transition-transform duration-500 ${config.clockPosition === pos ? 'bg-black scale-125' : 'bg-white/10'}`} />
                                    <span className="font-black text-[10px] uppercase tracking-[0.2em]">{pos.replace('-', ' ')}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
});

const GameModeTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="p-6 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-3xl mx-auto">
                <motion.div
                    className="mb-10"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">Game Mode</h3>
                    <p className="text-white/30 text-[11px] font-medium">Prevent interruptions during focused sessions</p>
                </motion.div>

                <div className="space-y-10">
                    <motion.div
                        className={`p-5 rounded-xl border flex items-center justify-between shadow-xl relative overflow-hidden group transition-all duration-700 ${config.gameMode?.enabled
                            ? 'bg-gradient-to-br from-[#0A1A0A] to-[#000000] border-green-500/20'
                            : 'bg-gradient-to-br from-white/[0.04] to-transparent border-white/[0.08]'
                            }`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        <div className="relative z-10">
                            <label className="text-[9px] font-semibold text-white/20 uppercase tracking-[0.25em] block ml-1 mb-1">Protection Matrix</label>
                            <h4 className="text-lg font-medium text-white tracking-tight">Master Toggle</h4>
                            <p className="text-[11px] text-white/30 font-normal leading-relaxed mt-1">Activate neural shielding to block all manual menu requests.</p>
                        </div>

                        <button
                            onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, enabled: !config.gameMode?.enabled } })}
                            className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 shadow-2xl ${config.gameMode?.enabled ? 'bg-green-500 shadow-green-500/20' : 'bg-white/5 border border-white/10'}`}
                        >
                            <motion.div
                                className={`w-5 h-5 rounded-lg shadow-xl ${config.gameMode?.enabled ? 'bg-white' : 'bg-white/20'}`}
                                animate={{ x: config.gameMode?.enabled ? 24 : 0 }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        </button>

                        {config.gameMode?.enabled && (
                            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/5 rounded-full blur-[80px] -mr-32 -mt-32 animate-pulse" />
                        )}
                    </motion.div>

                    <AnimatePresence mode="wait">
                        {config.gameMode?.enabled && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-8"
                            >
                                <div className="bg-white/[0.03] border border-white/[0.08] p-5 rounded-xl space-y-5">
                                    <div>
                                        <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-4">Heuristic Engine</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'all' } })}
                                                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all duration-500 ${config.gameMode?.mode === 'all'
                                                    ? 'bg-white text-black border-white shadow-lg translate-y-[-2px]'
                                                    : 'bg-black/40 border-white/5 text-white/30 hover:border-white/20 hover:text-white/60'}`}
                                            >
                                                <Ban size={22} strokeWidth={1.5} />
                                                <div className="text-center">
                                                    <div className="font-semibold text-sm">Omnipresent</div>
                                                    <div className="text-[9px] uppercase tracking-widest opacity-40">Block all fullscreen</div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'list' } })}
                                                className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all duration-500 ${config.gameMode?.mode === 'list'
                                                    ? 'bg-white text-black border-white shadow-lg translate-y-[-2px]'
                                                    : 'bg-black/40 border-white/5 text-white/30 hover:border-white/20 hover:text-white/60'}`}
                                            >
                                                <Hash size={22} strokeWidth={1.5} />
                                                <div className="text-center">
                                                    <div className="font-semibold text-sm">Targeted</div>
                                                    <div className="text-[9px] uppercase tracking-widest opacity-40">Specific blacklist</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>

                                    {config.gameMode?.mode === 'list' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="space-y-4 pt-6 border-t border-white/5"
                                        >
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.15em] ml-1">Blacklist Protocol</label>
                                                <button
                                                    onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, blockFullscreen: !config.gameMode?.blockFullscreen } })}
                                                    className={`text-[10px] font-semibold uppercase tracking-widest px-4 py-2 rounded-lg transition-all border ${config.gameMode?.blockFullscreen ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-white/20'}`}
                                                >
                                                    Auto-Detect Fullscreen: {config.gameMode?.blockFullscreen ? 'ON' : 'OFF'}
                                                </button>
                                            </div>

                                            {!config.gameMode?.blockFullscreen && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="mt-6 pt-6 border-t border-white/5 space-y-3"
                                                >
                                                    <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.2em] block ml-1">Process Matrix</label>
                                                    <textarea
                                                        value={config.gameMode?.blockedApps || ''}
                                                        onChange={(e) => setConfig(prev => ({ ...prev, gameMode: { ...prev.gameMode, blockedApps: e.target.value } }))}
                                                        placeholder="e.g. valorant.exe, cs2.exe, elden_ring.exe"
                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-white/30 outline-none font-mono resize-none h-32 shadow-inner hover:bg-black/80 transition-all placeholder-white/5"
                                                    />
                                                    <p className="text-[11px] text-white/20 px-2 leading-relaxed">Ensure executable filenames are calibrated correctly, separated by commas.</p>
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
});

const UserTab = React.memo(({ user }: { user: UserProfile | null }) => {
    return (
        <motion.div
            className="p-6 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-3xl mx-auto">
                <motion.div
                    className="mb-10 text-center sm:text-left"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">Neural Profile</h3>
                    <p className="text-white/30 text-[11px] font-normal">Manage your digital identity and nexus status</p>
                </motion.div>

                <div className="space-y-8">
                    {/* Profile Card */}
                    <motion.div
                        className="bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl relative overflow-hidden group"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.02] rounded-full blur-[100px] -mr-40 -mt-40 group-hover:bg-white/[0.04] transition-colors duration-700" />

                        <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shadow-xl group-hover:border-white/30 transition-all duration-500">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                                    ) : (
                                        <div className="text-3xl font-semibold text-white/10 uppercase">{user?.name?.substring(0, 2) || 'ZN'}</div>
                                    )}
                                </div>
                                <button className="absolute -bottom-1 -right-1 w-9 h-9 bg-white text-black rounded-lg flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all">
                                    <Edit3 size={18} strokeWidth={2} />
                                </button>
                            </div>

                            <div className="flex-1 text-center sm:text-left">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                                    <h4 className="text-xl font-semibold text-white tracking-tight">{user?.name || 'Zenith User'}</h4>
                                    <div className={`inline-flex px-3 py-1 rounded-md text-[9px] font-semibold tracking-[0.15em] border self-center sm:self-auto ${user?.isPremium ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                        {user?.isPremium ? 'ZENITH PRIME' : 'STANDARD NEXUS'}
                                    </div>
                                </div>
                                <p className="text-white/40 font-normal mb-6">{user?.email || 'unlinked_identity@zenith.os'}</p>

                                <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                                    <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
                                        <Zap size={16} className="text-yellow-400" />
                                        <div className="text-left">
                                            <div className="text-[10px] font-semibold text-white/20 uppercase tracking-widest leading-none mb-1">Performance</div>
                                            <div className="text-sm font-medium text-white">High Density</div>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
                                        <Globe size={16} className="text-blue-400" />
                                        <div className="text-left">
                                            <div className="text-[10px] font-semibold text-white/20 uppercase tracking-widest leading-none mb-1">Node</div>
                                            <div className="text-sm font-medium text-white">Local Kernel</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Security & Data */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <motion.div
                            className="bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl hover:bg-white/[0.06] transition-all duration-300 group"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                    <Lock size={20} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-white/20 uppercase tracking-widest block mb-0.5">Authentication</label>
                                    <h4 className="font-semibold text-white">Security Keys</h4>
                                </div>
                            </div>
                            <button className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-semibold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all">Manage Credentials</button>
                        </motion.div>

                        <motion.div
                            className="bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl hover:bg-white/[0.06] transition-all duration-300 group"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                                    <TimerReset size={20} strokeWidth={1.5} />
                                </div>
                                <div>
                                    <label className="text-[9px] font-semibold text-white/20 uppercase tracking-widest block mb-0.5">Chronometric Display</label>
                                    <h4 className="font-semibold text-white text-base">System Clock</h4>
                                </div>
                            </div>
                            <button className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-semibold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all">Sync Cloud Matrix</button>
                        </motion.div>
                    </div>

                    {/* Danger Zone */}
                    <motion.div
                        className="p-5 rounded-xl bg-gradient-to-br from-red-500/[0.03] to-transparent border border-red-500/10 space-y-4"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="flex items-start gap-5">
                            <div className="p-2.5 bg-red-500/10 rounded-xl text-red-400 border border-red-500/20">
                                <AlertTriangle size={20} strokeWidth={1.5} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-white tracking-tight mb-1">Critical Operations</h4>
                                <p className="text-[11px] leading-relaxed text-white/30 font-normal">De-linking your profile will purge all local cached credentials and nexus configurations.</p>
                            </div>
                        </div>
                        <button className="w-full py-3 bg-red-500/10 text-red-500 font-semibold text-xs uppercase tracking-[0.2em] rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all duration-300">
                            Terminate Session Profile
                        </button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
});

const SectionHeader = ({ label, isExpanded }: { label: string, isExpanded: boolean }) => (
    <div className="relative">
        <AnimatePresence mode="wait">
            {isExpanded ? (
                <motion.div
                    key="expanded-header"
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -5 }}
                    className="px-4 mt-6 mb-2"
                >
                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.25em] block">
                        {label}
                    </span>
                </motion.div>
            ) : (
                <motion.div
                    key="collapsed-divider"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0 }}
                    className="mx-auto w-4 h-[1px] bg-white/10 mt-6 mb-3 rounded-full"
                />
            )}
        </AnimatePresence>
    </div>
);

const NavButton = React.memo(({
    tab,
    label,
    icon: Icon,
    isSidebarExpanded,
    activeTab,
    setActiveTab
}: {
    tab: SettingsTab,
    label: string,
    icon: any,
    isSidebarExpanded: boolean,
    activeTab: SettingsTab,
    setActiveTab: (tab: SettingsTab) => void
}) => {
    const isActive = activeTab === tab;

    return (
        <button
            onClick={() => setActiveTab(tab)}
            className={`
                w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center'} py-2.5 
                transition-all duration-300 relative group
            `}
        >
            {/* Active Indicator - Expanded (Left Bar) */}
            {isActive && isSidebarExpanded && (
                <motion.div
                    layoutId="active-indicator-bar"
                    className="absolute left-0 w-[3px] h-5 bg-white rounded-r-full shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
            )}

            {/* Active Indicator - Collapsed (Pill Background) */}
            {isActive && !isSidebarExpanded && (
                <motion.div
                    layoutId="active-indicator-pill"
                    className="absolute inset-x-2 inset-y-1 bg-white/[0.08] border border-white/10 rounded-xl shadow-[inset_0_0_12px_rgba(255,255,255,0.02)]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                />
            )}

            {/* Hover Background square for collapsed mode */}
            {!isActive && !isSidebarExpanded && (
                <div className="absolute inset-x-3 inset-y-1.5 bg-white/[0.03] opacity-0 group-hover:opacity-100 rounded-lg transition-all duration-300" />
            )}

            <div className={`
                flex items-center justify-center transition-all duration-500 relative z-10
                ${isActive ? 'text-white' : 'text-white/20 group-hover:text-white/60'}
            `}>
                <motion.div
                    animate={isActive ? { scale: 1.15 } : { scale: 1 }}
                    whileHover={!isActive ? { scale: 1.1 } : {}}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                    <Icon size={isSidebarExpanded ? 17 : 20} strokeWidth={isActive ? 2.5 : 2} />
                </motion.div>
            </div>

            <AnimatePresence mode="wait">
                {isSidebarExpanded ? (
                    <motion.span
                        key="label"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                        className={`text-[12px] font-medium tracking-wide whitespace-nowrap relative z-10 ${isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}
                    >
                        {label}
                    </motion.span>
                ) : (
                    <motion.div
                        key="badge"
                        initial={{ opacity: 0, scale: 0.8, x: -10 }}
                        whileHover={{ opacity: 1, scale: 1, x: 0 }}
                        animate={{ opacity: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 25,
                            delay: 0.05
                        }}
                        className="absolute left-[64px] px-3.5 py-2 bg-black/80 border border-white/10 rounded-xl text-[10px] font-bold text-white pointer-events-none whitespace-nowrap z-[200] shadow-2xl backdrop-blur-xl ring-1 ring-white/5"
                    >
                        {/* Glow effect on hover badge */}
                        <div className="absolute inset-0 bg-white/[0.02] rounded-xl pointer-events-none" />
                        <span className="relative z-10">{label}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </button>
    );
});
export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, apps, setApps, config, setConfig, onReset, onOpenDashboard, user, isPage = false
}) => {
    // --- LOAD & SAVE SETTINGS (Backend Sync) ---
    useEffect(() => {
        // Load initial settings from backend if available
    }, []);

    // Save settings when config changes
    useEffect(() => {
        if (window.electron && config.globalShortcut) {
            // Placeholder for future backend sync
        }
    }, [config.globalShortcut]);

    // Helper for unique IDs
    const generateId = () => {
        try {
            return crypto.randomUUID();
        } catch (e) {
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
    };

    const [activeTab, setActiveTab] = useState<SettingsTab>('workspaces');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingApp, setEditingApp] = useState<{ app: AppItem, index: number, workspaceIndex?: number, path: number[] } | null>(null);
    const [iconSearchTerm, setIconSearchTerm] = useState('');
    const [folderPath, setFolderPath] = useState<number[]>([]);
    const [showAppSelector, setShowAppSelector] = useState(false);
    const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState<number | null>(null);
    const [workspaceFolderPath, setWorkspaceFolderPath] = useState<number[]>([]);
    const [appSelectorMode, setAppSelectorMode] = useState<'edit' | 'center'>('edit');
    const [showAppSelectionModal, setShowAppSelectionModal] = useState(false);
    const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<{ workspaceIndex: number, path: number[] } | null>(null);
    const [isSidebarPinned, setIsSidebarPinned] = useState(true);
    const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
    const isSidebarExpanded = isSidebarPinned || isHoveringSidebar;

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            // Ctrl + [1-6] for tabs
            if (e.ctrlKey && !e.shiftKey && !e.altKey) {
                const tabs: SettingsTab[] = ['workspaces', 'zenith_apps', 'interface', 'visuals', 'widgets', 'gamemode'];
                const tabIndex = parseInt(e.key) - 1;
                if (tabIndex >= 0 && tabIndex < tabs.length) {
                    e.preventDefault();
                    setActiveTab(tabs[tabIndex]);
                }
            }

            // Ctrl + , to close (toggle)
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault();
                onClose();
            }

            // Esc to close
            if (e.key === 'Escape' && !editingApp && !showAppSelector && !showAppSelectionModal) {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, editingApp, showAppSelector, showAppSelectionModal, onClose]);

    // --- DRAG-AND-DROP REORDERING ---
    const dragWorkspaceRef = useRef<number | null>(null);
    const dragAppRef = useRef<number | null>(null);
    const [dragOverWorkspace, setDragOverWorkspace] = useState<number | null>(null);
    const [dragOverApp, setDragOverApp] = useState<number | null>(null);

    // Reset view when tab changes or modal opens/closes
    useEffect(() => {
        setEditingApp(null);
        setFolderPath([]);
    }, [activeTab, isOpen]);

    const isPremiumOrTrial = user ? (user.isPremium || (user.trialEndsAt && new Date(user.trialEndsAt) > new Date())) : false;

    const getCurrentLevel = (rootApps: AppItem[], path: number[]): AppItem[] => {
        let current = rootApps;
        for (const idx of path) {
            if (current[idx] && current[idx].children) {
                current = current[idx].children!;
            } else { return []; }
        }
        return current;
    };

    const updateAppTree = (rootApps: AppItem[], path: number[], action: (list: AppItem[]) => AppItem[]): AppItem[] => {
        if (path.length === 0) return action(rootApps);
        const newApps = [...rootApps];
        const currentIndex = path[0];
        const remainingPath = path.slice(1);
        if (newApps[currentIndex] && newApps[currentIndex].children) {
            newApps[currentIndex] = {
                ...newApps[currentIndex],
                children: updateAppTree(newApps[currentIndex].children!, remainingPath, action)
            };
        }
        return newApps;
    };

    const flatApps = useMemo(() => {
        const flatten = (items: AppItem[]): AppItem[] => {
            let res: AppItem[] = [];
            items.forEach(item => {
                res.push(item);
                if (item.children) { res = [...res, ...flatten(item.children)]; }
            });
            return res;
        };
        return flatten(apps);
    }, [apps]);

    const currentApps = getCurrentLevel(apps, folderPath);
    const currentFolderName = folderPath.length > 0 ? getCurrentLevel(apps, folderPath.slice(0, -1))[folderPath[folderPath.length - 1]]?.label : 'Main Menu';

    const filteredIcons = useMemo(() => {
        const term = iconSearchTerm.toLowerCase();
        if (!term) return Object.keys(ICON_MAP).slice(0, 100);
        return Object.keys(ICON_MAP).filter(iconName => iconName.toLowerCase().includes(term)).slice(0, 100);
    }, [iconSearchTerm]);

    const getBestLucideIcon = (name: string, path: string): string => {
        const text = (name + ' ' + path).toLowerCase();
        if (text.includes('calc')) return 'Calculator';
        if (text.includes('edge')) return 'Globe';
        if (text.includes('chrome') || text.includes('browser')) return 'Globe';
        if (text.includes('terminal') || text.includes('cmd') || text.includes('powershell')) return 'Terminal';
        if (text.includes('steam') || text.includes('game')) return 'Gamepad2';
        if (text.includes('discord')) return 'MessageSquare';
        if (text.includes('code') || text.includes('visual studio')) return 'Code';
        if (text.includes('explorer') || text.includes('folder')) return 'Folder';
        if (text.includes('setting') || text.includes('config')) return 'Settings2';
        if (text.includes('music') || text.includes('spotify')) return 'Music';
        if (text.includes('video') || text.includes('player')) return 'Play';
        if (text.includes('mail') || text.includes('outlook')) return 'Mail';
        if (text.includes('chat') || text.includes('whatsapp') || text.includes('messenger')) return 'MessageSquare';
        if (text.includes('store')) return 'ShoppingBag';
        return 'Layout'; // Default
    };

    const handlePickCommand = async () => {
        if (!window.electron?.selectFile) return;
        try {
            const filePath = await window.electron.selectFile();
            if (filePath && editingApp) {
                const bestIcon = getBestLucideIcon(filePath.split(/[\\/]/).pop() || 'App', filePath);
                handleAppUpdates({
                    command: filePath,
                    iconName: bestIcon,
                    iconSource: 'lucide'
                });
                const nativeIconData = await extractIconFromPath(filePath);
                if (nativeIconData) {
                    handleAppUpdates(nativeIconData);
                }
            }
        } catch (e) {
            console.error("Pick Command Error:", e);
        }
    };

    const handlePickIcon = async () => {
        if (!window.electron?.selectImage) return;
        try {
            const iconPath = await window.electron.selectImage();
            if (iconPath && editingApp) {
                const formattedPath = iconPath.startsWith('http') ? iconPath : `file://${iconPath.replace(/\\/g, '/')}`;
                const updatedApp = {
                    ...editingApp.app,
                    customIconUrl: formattedPath,
                    iconSource: 'native' as const
                };
                handleAppUpdates(updatedApp);
            }
        } catch (e) {
            console.error("Pick Icon Error:", e);
        }
    };

    const handleAppUpdates = (newAppData: Partial<AppItem>) => {
        if (!editingApp) return;
        const targetPath = editingApp.path;

        if (editingApp.workspaceIndex !== undefined) {
            const workspaceIndex = editingApp.workspaceIndex;

            setConfig(prev => {
                const newWorkspaces = [...prev.workspaces];
                // Safe immutable update: copy the workspace object
                newWorkspaces[workspaceIndex] = {
                    ...newWorkspaces[workspaceIndex],
                    apps: updateAppTree(
                        newWorkspaces[workspaceIndex].apps,
                        targetPath,
                        (list) => {
                            const newList = [...list];
                            const currentApp = newList[editingApp.index];
                            if (currentApp) {
                                newList[editingApp.index] = { ...currentApp, ...newAppData };
                            }
                            return newList;
                        }
                    )
                };
                return { ...prev, workspaces: newWorkspaces };
            });
        } else {
            setApps(prev => updateAppTree(prev, targetPath, (list) => {
                const newList = [...list];
                const currentApp = newList[editingApp.index];
                if (currentApp) {
                    newList[editingApp.index] = { ...currentApp, ...newAppData };
                }
                return newList;
            }));
        }

        // Also update the local editing app state so the UI reflects changes immediately
        setEditingApp(prev => prev ? { ...prev, app: { ...prev.app, ...newAppData } } : null);
    };

    const extractIconFromPath = async (command: string): Promise<Partial<AppItem> | null> => {
        if (!window.electron || !window.electron.getFileIcon) return null;
        if (!command || command.length < 3) return null;
        try {
            const cleanCommand = command.replace(/['"]/g, '');
            const iconDataUrl = await window.electron.getFileIcon(cleanCommand);
            if (iconDataUrl) return { customIconUrl: iconDataUrl, iconSource: 'native' };
            return null;
        } catch (e) {
            console.error("Error extracting icon:", e);
            return null;
        }
    };

    const handleAppSelect = async (appData: { name: string; path: string }) => {
        if (!appData.path || appData.path.trim() === '') {
            alert(`Could not find a launch path for "${appData.name}".`);
            return;
        }
        const bestIcon = getBestLucideIcon(appData.name, appData.path);
        if (appSelectorMode === 'center') {
            setConfig(prev => ({
                ...prev,
                centerButton: {
                    ...prev.centerButton,
                    target: appData.path,
                    label: appData.name.toUpperCase().substring(0, 8),
                    iconName: bestIcon
                }
            }));
            setShowAppSelector(false);
            return;
        }
        if (!editingApp) return;
        handleAppUpdates({ command: appData.path, label: appData.name, iconName: bestIcon, iconSource: 'lucide' });
        const nativeIconData = await extractIconFromPath(appData.path);
        if (nativeIconData) handleAppUpdates(nativeIconData);
    };

    const handleAddApp = (type: 'app' | 'folder') => {
        if (type === 'folder') {
            const newFolder: AppItem = {
                id: generateId(), type: 'folder', label: 'New Folder',
                iconName: 'Folder', iconSource: 'lucide', command: '',
                commandType: 'app', description: 'Folder Group',
                children: []
            };
            if (selectedWorkspaceIndex !== null) {
                addAppToWorkspace(selectedWorkspaceIndex, 'folder', workspaceFolderPath);
            } else {
                setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newFolder]));
            }
        } else {
            // It's an app, show selection modal if in workspace, or just add if in main apps?
            // User requested this specifically for workspace section
            if (selectedWorkspaceIndex !== null) {
                setPendingWorkspaceAction({ workspaceIndex: selectedWorkspaceIndex, path: workspaceFolderPath });
                setShowAppSelectionModal(true);
            } else {
                const newApp: AppItem = {
                    id: generateId(), type: 'app', label: 'New App',
                    iconName: 'Layout', iconSource: 'lucide', command: '',
                    commandType: 'app', description: 'Application'
                };
                setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newApp]));
            }
        }
    };

    const goUpFolder = () => {
        if (folderPath.length === 0) return;
        const newPath = [...folderPath];
        newPath.pop();
        setFolderPath(newPath);
    };

    const toggleWidget = (widgetCommand: string, widgetDef: any) => {
        const exists = flatApps.find(a => a.command === widgetCommand);
        if (exists) {
            setApps(prev => prev.filter(a => a.command !== widgetCommand));
        } else {
            const newWidgetApp: AppItem = {
                id: generateId(), type: 'app', label: widgetDef.defaultLabel, iconName: widgetDef.iconName,
                iconSource: 'lucide', command: widgetDef.command, description: widgetDef.name
            };
            setApps(prev => [...prev, newWidgetApp]);
        }
    };

    const handleCenterTypeChange = (type: 'system' | 'app' | 'widget' | 'command' | 'none') => {
        const defaults = {
            system: { target: 'system-center', label: 'SYSTEM', iconName: 'Settings2' },
            app: { target: '', label: 'APP', iconName: 'Box' },
            widget: { target: '', label: 'WIDGET', iconName: 'AppWindow' },
            command: { target: '', label: 'CMD', iconName: 'Terminal' },
            none: { target: '', label: '', iconName: 'Circle' }
        };
        setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, type, ...defaults[type] } }));
    };

    const handleCenterTargetChange = (targetId: string, type: 'app' | 'widget') => {
        if (type === 'app') {
            const app = flatApps.find(a => a.id === targetId);
            if (app) setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: app.id, label: app.label.toUpperCase().substring(0, 8), iconName: app.iconName } }));
        } else if (type === 'widget') {
            const widget = AVAILABLE_WIDGETS.find(w => w.id === targetId);
            if (widget) setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: widget.command, label: widget.defaultLabel.toUpperCase(), iconName: widget.iconName } }));
        }
    };

    const createWorkspace = () => {
        const nextHotkey = config.workspaces.length + 1;
        const newWorkspace = {
            id: `workspace-${nextHotkey}`, name: `Workspace ${nextHotkey}`,
            hotkey: nextHotkey, enabled: true, apps: []
        };
        setConfig(prev => ({ ...prev, workspaces: [...prev.workspaces, newWorkspace] }));
    };

    const deleteWorkspace = (index: number) => {
        if (config.workspaces.length <= 1) { alert("Cannot delete the last workspace"); return; }
        const newWorkspaces = config.workspaces.filter((_, i) => i !== index);
        const renumbered = newWorkspaces.map((ws, i) => ({ ...ws, hotkey: i + 1, id: `workspace-${i + 1}` }));
        setConfig(prev => ({ ...prev, workspaces: renumbered, activeWorkspaceIndex: Math.min(prev.activeWorkspaceIndex, renumbered.length - 1) }));
        if (selectedWorkspaceIndex === index) { setSelectedWorkspaceIndex(null); }
        else if (selectedWorkspaceIndex !== null && selectedWorkspaceIndex > index) { setSelectedWorkspaceIndex(selectedWorkspaceIndex - 1); }
    };

    const reorderWorkspaces = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        setConfig(prev => {
            const newWorkspaces = [...prev.workspaces];
            const [moved] = newWorkspaces.splice(fromIndex, 1);
            newWorkspaces.splice(toIndex, 0, moved);
            const renumbered = newWorkspaces.map((ws, i) => ({ ...ws, hotkey: i + 1, id: `workspace-${i + 1}` }));
            return { ...prev, workspaces: renumbered, activeWorkspaceIndex: Math.min(prev.activeWorkspaceIndex, renumbered.length - 1) };
        });
        setSelectedWorkspaceIndex(null);
    };

    const reorderAppsInWorkspace = (workspaceIndex: number, fromIndex: number, toIndex: number, path: number[]) => {
        if (fromIndex === toIndex) return;
        setConfig(prev => {
            const newWorkspaces = [...prev.workspaces];
            const targetWorkspace = { ...newWorkspaces[workspaceIndex] };
            targetWorkspace.apps = updateAppTree(
                targetWorkspace.apps,
                path,
                (list) => {
                    const newList = [...list];
                    const [moved] = newList.splice(fromIndex, 1);
                    newList.splice(toIndex, 0, moved);
                    return newList;
                }
            );
            newWorkspaces[workspaceIndex] = targetWorkspace;
            return { ...prev, workspaces: newWorkspaces };
        });
    };

    const addAppToWorkspace = (workspaceIndex: number, type: 'app' | 'folder', path: number[], commandType: 'app' | 'url' = 'app') => {
        const newApp: AppItem = {
            id: generateId(),
            type: type,
            label: type === 'folder' ? 'New Folder' : (commandType === 'url' ? 'New URL' : 'New App'),
            iconName: type === 'folder' ? 'Folder' : (commandType === 'url' ? 'Globe' : 'Layout'),
            iconSource: 'lucide',
            command: '',
            commandType: commandType,
            description: type === 'folder' ? 'Folder Group' : (commandType === 'url' ? 'Web Link' : 'Application'),
            children: type === 'folder' ? [] : undefined
        };

        const newWorkspaces = [...config.workspaces];
        const targetWorkspace = { ...newWorkspaces[workspaceIndex] };

        targetWorkspace.apps = updateAppTree(
            targetWorkspace.apps,
            path,
            (list) => [...list, newApp]
        );

        newWorkspaces[workspaceIndex] = targetWorkspace;
        setConfig({ ...config, workspaces: newWorkspaces });

        // If it's an app/url, open editor immediately
        if (type === 'app') {
            const currentLevel = getCurrentLevel(targetWorkspace.apps, path);
            const newIndex = currentLevel.length - 1;
            setEditingApp({ app: newApp, index: newIndex, workspaceIndex, path });

            if (commandType === 'app') {
                setAppSelectorMode('edit');
                setShowAppSelector(true);
            }
        } else {
            // If it's a folder, enter it
            const currentLevel = getCurrentLevel(targetWorkspace.apps, path);
            const newIndex = currentLevel.length - 1;
            setWorkspaceFolderPath([...path, newIndex]);
        }
    };

    const removeAppFromWorkspace = (workspaceIndex: number, appIndex: number, path: number[]) => {
        const newWorkspaces = [...config.workspaces];
        const targetWorkspace = { ...newWorkspaces[workspaceIndex] };

        targetWorkspace.apps = updateAppTree(
            targetWorkspace.apps,
            path,
            (list) => list.filter((_, i) => i !== appIndex)
        );

        newWorkspaces[workspaceIndex] = targetWorkspace;
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const moveAppInWorkspace = (workspaceIndex: number, fromIndex: number, direction: 'up' | 'down', path: number[]) => {
        const newWorkspaces = [...config.workspaces];
        const targetWorkspace = { ...newWorkspaces[workspaceIndex] };
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

        targetWorkspace.apps = updateAppTree(
            targetWorkspace.apps,
            path,
            (list) => {
                if (toIndex < 0 || toIndex >= list.length) return list;
                const newList = [...list];
                [newList[fromIndex], newList[toIndex]] = [newList[toIndex], newList[fromIndex]];
                return newList;
            }
        );

        newWorkspaces[workspaceIndex] = targetWorkspace;
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const updateWorkspaceApp = (workspaceIndex: number, appIndex: number, updatedApp: AppItem, path: number[]) => {
        const newWorkspaces = [...config.workspaces];
        const targetWorkspace = { ...newWorkspaces[workspaceIndex] };

        targetWorkspace.apps = updateAppTree(
            targetWorkspace.apps,
            path,
            (list) => {
                const newList = [...list];
                newList[appIndex] = updatedApp;
                return newList;
            }
        );

        newWorkspaces[workspaceIndex] = targetWorkspace;
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const handleAppChange = (field: string, value: any) => {
        if (!editingApp) return;
        let updatedApp = { ...editingApp.app, [field]: value };

        // Auto-fetch high-quality favicon for URLs - refined for better quality/transparency
        if (field === 'command' && editingApp.app.commandType === 'url' && value.trim()) {
            let domain = value.trim();
            if (domain.startsWith('http')) {
                try { domain = new URL(domain).hostname; } catch (e) { }
            }

            if (domain && domain.includes('.')) {
                // unavatar.io is an aggregator that reaches into Clearbit, Apple, Google, etc.
                const fallbackUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                const faviconUrl = `https://unavatar.io/${domain}?fallback=${encodeURIComponent(fallbackUrl)}`;

                updatedApp = {
                    ...updatedApp,
                    customIconUrl: faviconUrl,
                    iconSource: 'native'
                };
            }
        }

        handleAppUpdates(updatedApp);
    };



    if (!isOpen) return null;

    return (
        <>
            <AppSelector
                isOpen={showAppSelector}
                onClose={() => setShowAppSelector(false)}
                onAppSelect={handleAppSelect}
            />

            {/* App/URL Selection Modal */}
            <AnimatePresence>
                {showAppSelectionModal && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setShowAppSelectionModal(false);
                                setPendingWorkspaceAction(null);
                            }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="relative w-full max-w-sm bg-[#0D0D0D] border border-white/10 rounded-2xl p-7 shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Decorative Glow */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />

                            <div className="text-center mb-7 relative z-10">
                                <h3 className="text-lg font-semibold text-white mb-2">Add to Workspace</h3>
                                <p className="text-[10px] text-white/30 font-medium uppercase tracking-widest">Select entry type</p>
                            </div>

                            <div className="grid grid-cols-1 gap-4 relative z-10">
                                <button
                                    onClick={() => {
                                        if (pendingWorkspaceAction) {
                                            addAppToWorkspace(pendingWorkspaceAction.workspaceIndex, 'app', pendingWorkspaceAction.path, 'app');
                                        }
                                        setShowAppSelectionModal(false);
                                        setPendingWorkspaceAction(null);
                                    }}
                                    className="group flex flex-col items-center gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                                >
                                    <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                        <Monitor size={22} strokeWidth={1.5} />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-white text-sm">Local Application</div>
                                        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">System executables</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        if (pendingWorkspaceAction) {
                                            addAppToWorkspace(pendingWorkspaceAction.workspaceIndex, 'app', pendingWorkspaceAction.path, 'url');
                                        }
                                        setShowAppSelectionModal(false);
                                        setPendingWorkspaceAction(null);
                                    }}
                                    className="group flex flex-col items-center gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                                >
                                    <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                        <Globe size={22} strokeWidth={1.5} />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-white text-sm">Web URL</div>
                                        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">Websites & bookmarks</p>
                                    </div>
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    setShowAppSelectionModal(false);
                                    setPendingWorkspaceAction(null);
                                }}
                                className="mt-5 w-full py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/20 hover:text-white/40 transition-colors"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <div className={`absolute inset-0 z-[100] ${!isPage ? 'flex items-center justify-center' : ''}`}>
                {!isPage && (
                    <motion.div
                        className="absolute inset-0 bg-black/60 backdrop-blur-[20px]"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    />
                )}
                <motion.div
                    className={`relative z-[101] bg-gradient-to-br from-[#0A0A0A] to-[#000000] backdrop-blur-2xl overflow-hidden flex ${!isPage ? 'mx-auto rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/10' : 'w-full h-full border-none'}`}
                    style={!isPage ? { width: '95%', maxWidth: 1400, marginTop: 32, height: 'calc(100% - 44px)' } : { width: '100%', height: '100%', paddingTop: 38 }}
                    onClick={(e) => e.stopPropagation()}
                    initial={!isPage ? { opacity: 0, scale: 0.96, y: 40, filter: 'blur(10px)' } : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0, filter: 'blur(0px)' }}
                    exit={!isPage ? { opacity: 0, scale: 0.98, y: 20, filter: 'blur(10px)' } : { opacity: 0, x: -20 }}
                    transition={!isPage ? { type: "spring", damping: 30, stiffness: 240, mass: 1 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Close Button — floating top-right */}
                    <motion.button
                        onClick={onClose}
                        className={`absolute ${isPage ? 'top-12' : 'top-3'} right-3 z-[200] w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/30 hover:text-white hover:bg-white/[0.10] hover:border-white/20 transition-all duration-200 group`}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        title={isPage ? "Back to dashboard" : "Close settings"}
                    >
                        {isPage ? <ArrowLeft size={16} strokeWidth={2.5} /> : <X size={14} strokeWidth={2} />}
                    </motion.button>
                    {/* Sidebar */}
                    <motion.div
                        className="bg-white/[0.01] border-r border-white/[0.06] p-4 shrink-0 flex flex-col gap-1.5 relative overflow-hidden"
                        animate={{ width: isSidebarExpanded ? 280 : 80 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        onMouseEnter={() => setIsHoveringSidebar(true)}
                        onMouseLeave={() => setIsHoveringSidebar(false)}
                    >
                        <motion.div
                            className="mb-6 flex items-center justify-between px-1"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                        >
                            <AnimatePresence mode="wait">
                                {isSidebarExpanded ? (
                                    <motion.div
                                        key="expanded"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="flex items-center gap-3"
                                    >
                                        <div className="w-8 h-8 bg-white text-black rounded-xl flex items-center justify-center shadow-lg">
                                            <ZenithLogo size={18} />
                                        </div>
                                        <div className="flex flex-col">
                                            <h2 className="text-[12px] font-bold text-white tracking-[0.1em] uppercase">Zenith</h2>
                                            <span className="text-[8px] text-white/30 font-black tracking-widest uppercase">Kernel Settings</span>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="collapsed"
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.5 }}
                                        className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10"
                                    >
                                        <ZenithLogo size={20} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        <AnimatePresence>
                            {isSidebarExpanded && (
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="px-1 mb-4"
                                >
                                    <div className="relative group">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white/50 transition-colors" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search settings..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl py-2 pl-9 pr-4 text-[11px] text-white placeholder:text-white/20 outline-none focus:bg-white/[0.05] focus:border-white/20 transition-all"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Navigation Groups */}
                        <div className="flex flex-col gap-0.5">
                            <SectionHeader label="Core" isExpanded={isSidebarExpanded} />
                            <NavButton tab="workspaces" label="Apps & Workspaces" icon={LayoutGrid} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="zenith_apps" label="Zenith Widgets" icon={AppWindow} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />

                            <SectionHeader label="Personalization" isExpanded={isSidebarExpanded} />
                            <NavButton tab="interface" label="Interface" icon={Settings2} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="visuals" label="Visuals" icon={Palette} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />

                            <SectionHeader label="System" isExpanded={isSidebarExpanded} />
                            <NavButton tab="widgets" label="HUD Elements" icon={Clock} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="gamemode" label="Game Mode" icon={Gamepad2} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="user" label="Profile" icon={User} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                        </div>

                        <div className="mt-auto pt-6 border-t border-white/[0.08] space-y-2.5">
                            <NavButton tab="dashboard" label="Open Dashboard" icon={LayoutDashboard} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={() => onOpenDashboard()} />

                            <button
                                onClick={() => {
                                    if (window.electron && window.electron.openConfigFolder) {
                                        window.electron.openConfigFolder();
                                    }
                                }}
                                className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center'} py-2.5 text-white/30 hover:text-white hover:bg-white/5 transition-all duration-300 group relative`}
                            >
                                <div className="flex items-center justify-center transition-all duration-300 relative z-10">
                                    <motion.div
                                        whileHover={{ scale: 1.1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                    >
                                        <Folder size={isSidebarExpanded ? 16 : 19} strokeWidth={2} />
                                    </motion.div>
                                </div>
                                <AnimatePresence mode="wait">
                                    {isSidebarExpanded && (
                                        <motion.span
                                            key="label-config"
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="text-[11px] font-medium tracking-wide whitespace-nowrap ml-px relative z-10"
                                        >
                                            Config Folder
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </button>

                            <button
                                onClick={() => {
                                    if (confirm("Você tem certeza que deseja resetar todas as configurações? O app será reiniciado.")) {
                                        localStorage.clear();
                                        if (window.electron && window.electron.resetConfig) {
                                            window.electron.resetConfig();
                                        } else {
                                            window.location.reload();
                                        }
                                    }
                                }}
                                className={`w-full flex items-center ${isSidebarExpanded ? 'gap-3 px-4' : 'justify-center'} py-2.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/5 transition-all duration-300 group relative`}
                            >
                                <div className="flex items-center justify-center transition-all duration-300 relative z-10">
                                    <motion.div
                                        whileHover={{ scale: 1.1, rotate: -45 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                    >
                                        <RotateCcw size={isSidebarExpanded ? 16 : 19} strokeWidth={2} />
                                    </motion.div>
                                </div>
                                <AnimatePresence mode="wait">
                                    {isSidebarExpanded ? (
                                        <motion.span
                                            key="label-reset"
                                            initial={{ opacity: 0, x: -8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -8 }}
                                            transition={{ duration: 0.2 }}
                                            className="text-[11px] font-medium tracking-wide whitespace-nowrap ml-px relative z-10"
                                        >
                                            Reset System
                                        </motion.span>
                                    ) : (
                                        <motion.div
                                            key="badge-reset"
                                            initial={{ opacity: 0, scale: 0.8, x: -10 }}
                                            whileHover={{ opacity: 1, scale: 1, x: 0 }}
                                            animate={{ opacity: 0 }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 400,
                                                damping: 25,
                                                delay: 0.05
                                            }}
                                            className="absolute left-[64px] px-3.5 py-2 bg-black/80 border border-white/10 rounded-xl text-[10px] font-bold text-white pointer-events-none whitespace-nowrap z-[200] shadow-2xl backdrop-blur-xl ring-1 ring-white/5"
                                        >
                                            <div className="absolute inset-0 bg-white/[0.02] rounded-xl pointer-events-none" />
                                            <span className="relative z-10 text-red-400">Reset</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        </div>
                    </motion.div>

                    {/* Content */}
                    <div className="flex-1 bg-[#0D0D0D] overflow-hidden flex flex-col relative">

                        {activeTab === 'zenith_apps' && <WidgetsTab config={config} setConfig={setConfig} />}
                        {activeTab === 'visuals' && <VisualsTab config={config} setConfig={setConfig} />}
                        {activeTab === 'workspaces' && (
                            <WorkspacesTab
                                config={config}
                                setConfig={setConfig}
                                selectedWorkspaceIndex={selectedWorkspaceIndex}
                                setSelectedWorkspaceIndex={setSelectedWorkspaceIndex}
                                workspaceFolderPath={workspaceFolderPath}
                                setWorkspaceFolderPath={setWorkspaceFolderPath}
                                dragWorkspaceRef={dragWorkspaceRef}
                                dragOverWorkspace={dragOverWorkspace}
                                setDragOverWorkspace={setDragOverWorkspace}
                                reorderWorkspaces={reorderWorkspaces}
                                createWorkspace={createWorkspace}
                                deleteWorkspace={deleteWorkspace}
                                getCurrentLevel={getCurrentLevel}
                                dragAppRef={dragAppRef}
                                dragOverApp={dragOverApp}
                                setDragOverApp={setDragOverApp}
                                reorderAppsInWorkspace={reorderAppsInWorkspace}
                                setEditingApp={setEditingApp}
                                removeAppFromWorkspace={removeAppFromWorkspace}
                                handleAddApp={handleAddApp}
                            />
                        )}

                        {activeTab === 'interface' && (
                            <InterfaceTab
                                config={config}
                                setConfig={setConfig}
                                handleCenterTypeChange={handleCenterTypeChange}
                                handleCenterTargetChange={handleCenterTargetChange}
                                setAppSelectorMode={setAppSelectorMode}
                                setShowAppSelector={setShowAppSelector}
                            />
                        )}

                        {activeTab === 'widgets' && <HUDTab config={config} setConfig={setConfig} />}
                        {activeTab === 'gamemode' && <GameModeTab config={config} setConfig={setConfig} />}
                        {activeTab === 'user' && <UserTab user={user} />}
                    </div>
                </motion.div>

                <AppEditorModal
                    editingApp={editingApp}
                    setEditingApp={setEditingApp}
                    handleAppChange={handleAppChange}
                    handlePickCommand={handlePickCommand}
                    setShowAppSelector={setShowAppSelector}
                    handlePickIcon={handlePickIcon}
                />


                <style>{`
                .slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 0 4px rgba(0,0,0,0.3);
                }
                .slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 0 4px rgba(0,0,0,0.3);
                }
            `}</style>
            </div>
        </>
    );
};