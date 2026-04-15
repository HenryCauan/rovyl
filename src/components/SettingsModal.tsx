import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem, UIConfig, UserProfile } from '../types';
import { ICON_MAP, getIcon } from '../iconMap';
import { AVAILABLE_WIDGETS } from '../defaults';
import { AppSelector } from './AppSelector';
import { SmartIcon } from './SmartIcon';
import {
    X, Save, RotateCcw, Monitor, LayoutGrid, Palette, Check,
    Plus, Trash2, Clock, Keyboard, AlertTriangle, RotateCw, AlarmClock,
    Gamepad2, AppWindow, Settings2, Folder, ChevronRight, CornerUpLeft,
    Image as ImageIcon, Upload, Search, FileType,
    Lock, LayoutDashboard, Box, Command, Ban, ChevronDown, Play, CheckCircle2,
    HelpCircle, User, MessageSquare, CreditCard, Globe, Eye, Zap, MousePointer2,
    Hash, Download, ExternalLink, Moon, Sun, ArrowRight, ArrowLeft, TimerReset,
    FolderPlus, FileText, Edit3, Calendar, Battery, CloudRain,
    Layout, Compass, Laptop, Smartphone, Bell, GripVertical, ChevronLeft, LogOut
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';
import { IconPicker } from './IconPicker';
import { getTranslation, LANGUAGES } from '../translations';
import { Tooltip } from './Tooltip';
import { websiteIconFieldsFromUrl } from '../siteFavicon';


const TerminalCommandEditor = ({ commands, config, onChange, onAdd, onRemove, compact = false }) => {
    return (
        <div className="space-y-3">
            {!compact && (
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                        {getTranslation(config, 'editingApp.terminal_commands')}
                    </label>
                    <button
                        onClick={onAdd}
                        className="flex items-center gap-1 text-[10px] font-bold text-purple-400/80 hover:text-purple-400 transition-colors uppercase tracking-widest"
                    >
                        <Plus size={10} />
                        {getTranslation(config, 'editingApp.add_command')}
                    </button>
                </div>
            )}
            
            {commands.length === 0 ? (
                <div className={compact ? "p-4 rounded-xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-2" : "p-6 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-2"}>
                    <p className="text-[9px] text-white/10 uppercase font-bold tracking-widest">
                        {getTranslation(config, 'status.no_app_selected') || 'Nenhum comando'}
                    </p>
                    {compact && (
                        <button
                            onClick={onAdd}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest flex items-center gap-1.5"
                        >
                            <Plus size={12} />
                            {getTranslation(config, 'editingApp.add_command')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {commands.map((cmd, idx) => (
                        <div key={idx} className="flex gap-2 group/cmd animate-in fade-in slide-in-from-left-2 duration-300">
                            <div className="flex-1 relative">
                                <input
                                    type="text"
                                    value={cmd}
                                    onChange={(e) => onChange(idx, e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-purple-400/80 focus:border-purple-400/40 focus:bg-black/60 outline-none transition-all duration-300"
                                    placeholder={getTranslation(config, 'editingApp.command_placeholder') || 'Ex: npm start'}
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-purple-400/20" />
                            </div>
                            <Tooltip label={getTranslation(config, 'action.remove') || 'Remover'}>
                                <button
                                    onClick={() => onRemove(idx)}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/5 text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all active:scale-90"
                                >
                                    <X size={14} />
                                </button>
                            </Tooltip>

                        </div>
                    ))}
                    {compact && commands.length > 0 && (
                        <button
                            onClick={onAdd}
                            className="w-full py-2.5 rounded-xl border border-dashed border-white/5 bg-white/[0.01] text-[9px] font-bold text-white/20 hover:text-purple-400 hover:border-purple-400/20 hover:bg-purple-400/5 transition-all uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
                        >
                            <Plus size={12} />
                            {getTranslation(config, 'editingApp.add_command')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const AppEditorModal = React.memo(({
    editingApp,
    setEditingApp,
    handleAppChange,
    handlePickCommand,
    handlePickFolder,
    setShowAppSelector,
    handlePickIcon,
    config
}: {
    editingApp: { app: AppItem, index: number, workspaceIndex?: number, path: number[] } | null,
    setEditingApp: (v: any) => void,
    handleAppChange: (f: keyof AppItem, v: any) => void,
    handlePickCommand: () => void,
    handlePickFolder: () => void,
    setShowAppSelector: (v: boolean) => void,
    handlePickIcon: () => void,
    config: UIConfig
}) => {
    const [isCompact, setIsCompact] = useState(() => window.innerWidth < 768);
    const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
    useEffect(() => {
        const onResize = () => setIsCompact(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const isIDE = useMemo(() => {
        if (!editingApp) return false;
        const lowerLabel = (editingApp.app.label || '').toLowerCase();
        const lowerCmd = (editingApp.app.command || '').toLowerCase();
        const ideKeywords = ['code', 'cursor', 'antigravity', 'visual studio', 'intellij', 'webstorm', 'pycharm', 'phpstorm', 'sublime', 'atom'];
        return ideKeywords.some(k => lowerLabel.includes(k) || lowerCmd.includes(k));
    }, [editingApp?.app.label, editingApp?.app.command]);



    return (
        <AnimatePresence>
            {editingApp && (
                <div className="absolute inset-0 z-[200] flex items-center justify-center p-4 md:p-8 overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setEditingApp(null)}
                        className="absolute inset-0 bg-black/60 backdrop-blur-2xl"
                    />
                    <motion.div
                        className={`w-full ${isCompact ? 'max-w-2xl' : 'max-w-5xl'} bg-[#080808]/90 border border-white/10 rounded-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col max-h-[95%] md:max-h-[85%]`}
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    >
                        {/* Header do Modal */}
                        <div className="px-6 py-5 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] block ml-0.5">{getTranslation(config, 'editingApp.config_label')}</label>
                                <h3 className="text-lg font-bold text-white tracking-tight">{getTranslation(config, 'editingApp.details_title')}</h3>
                            </div>
                            <button
                                onClick={() => setEditingApp(null)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-white/40 hover:text-white transition-all duration-500 border border-white/5 active:scale-90"
                            >
                                <X size={20} strokeWidth={2} />
                            </button>
                        </div>

                        {isCompact ? (
                            /* ===== Layout Compacto (telas pequenas) ===== */
                            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                                <div className="p-5 space-y-6">
                                    {/* Seção: Identificação + Preview Inline */}
                                    <section className="space-y-3">
                                        <label className="text-sm font-semibold text-white/60 ml-1">{getTranslation(config, 'editingApp.name_label')}</label>
                                        <div className="flex gap-4 items-start">
                                            {/* Icon Preview Inline */}
                                            <div className="shrink-0 flex flex-col items-center gap-2">
                                                <div className="relative group/icon">
                                                    <motion.div
                                                        className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-white/[0.06] to-transparent flex items-center justify-center border border-white/10 group-hover/icon:border-white/30 transition-all duration-500 cursor-pointer overflow-hidden shadow-xl"
                                                        whileHover={{ scale: 1.05 }}
                                                        onClick={editingApp.app.iconSource === 'native' ? handlePickIcon : undefined}
                                                    >
                                                        {editingApp.app.iconSource === 'native' && editingApp.app.customIconUrl ? (
                                                            <SmartIcon
                                                                src={editingApp.app.customIconUrl}
                                                                className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover/icon:scale-110"
                                                                size={72}
                                                                referenceScale={0.7}
                                                            />
                                                        ) : (
                                                            (() => {
                                                                const Icon = getIcon(editingApp.app.iconName);
                                                                return <Icon size={36} strokeWidth={1.2} className="text-white/30 group-hover/icon:text-white/60 transition-all duration-500" />;
                                                            })()
                                                        )}
                                                        {editingApp.app.iconSource === 'native' && (
                                                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/icon:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                                                <div className="w-7 h-7 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                                                                    <Upload size={12} className="text-white" />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </div>
                                                {editingApp.app.iconSource === 'native' && (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <button
                                                            onClick={handlePickIcon}
                                                            className="text-[8px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors duration-300"
                                                        >
                                                            {getTranslation(config, 'editingApp.choose_image') || 'Escolher'}
                                                        </button>
                                                        {editingApp.app.customIconUrl && (
                                                            <button
                                                                onClick={() => handleAppChange('customIconUrl', undefined)}
                                                                className="text-[8px] font-bold text-white/15 hover:text-white/30 uppercase tracking-widest transition-colors duration-300"
                                                            >
                                                                {getTranslation(config, 'action.reset') || 'Reset'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Name + Position */}
                                            <div className="flex-1 min-w-0 space-y-2">
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={editingApp.app.label}
                                                        onChange={e => handleAppChange('label', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-medium text-white focus:border-white/30 focus:bg-black/60 outline-none transition-all duration-500 shadow-inner group-hover:border-white/20"
                                                        placeholder={getTranslation(config, 'editingApp.placeholder_name')}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.15em] ml-1">{getTranslation(config, 'editingApp.menu_pos') || 'Posição no Menu'}: {editingApp.index + 1}</p>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Seção: Alvo/Caminho */}
                                    {editingApp.app.type === 'app' && (
                                        <section className="space-y-3">
                                            <label className="text-sm font-semibold text-white/60 ml-1">
                                                {editingApp.app.commandType === 'url' ? getTranslation(config, 'editingApp.url_label') : getTranslation(config, 'editingApp.path_label')}
                                            </label>
                                            <div className="flex flex-col gap-3">
                                                <div className="flex-1 relative group">
                                                    <input
                                                        type="text"
                                                        value={editingApp.app.command}
                                                        onChange={e => handleAppChange('command', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-mono text-white/50 focus:border-white/30 focus:bg-black/60 outline-none transition-all duration-500 shadow-inner group-hover:border-white/20"
                                                        placeholder={editingApp.app.commandType === 'url' ? getTranslation(config, 'editingApp.placeholder_url') : getTranslation(config, 'editingApp.placeholder_path')}
                                                    />
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    {editingApp.app.commandType === 'url' ? (
                                                        <div className="w-[52px] h-[52px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/20 rounded-xl">
                                                            <Globe size={20} strokeWidth={1} />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Tooltip label={getTranslation(config, 'editingApp.explore_title')}>
                                                                <button
                                                                    onClick={editingApp.app.commandType === 'folder' ? handlePickFolder : handlePickCommand}
                                                                    className="px-5 h-[52px] bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-200 transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center gap-2 group"
                                                                >
                                                                    <Folder size={16} strokeWidth={2.5} />
                                                                    <span>{getTranslation(config, 'action.explore')}</span>
                                                                </button>
                                                            </Tooltip>
                                                            {editingApp.app.commandType === 'app' && (
                                                                <Tooltip label={getTranslation(config, 'editingApp.installed_apps_title')}>
                                                                    <button
                                                                        onClick={() => setShowAppSelector(true)}
                                                                        className="px-4 h-[52px] bg-white/[0.03] border border-white/10 flex items-center justify-center gap-2 text-white/40 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all duration-300 active:scale-90"
                                                                    >
                                                                        <LayoutGrid size={18} strokeWidth={1.5} />
                                                                        <span className="font-bold text-[10px] uppercase tracking-wider">{getTranslation(config, 'editingApp.installed_apps_label')}</span>
                                                                    </button>
                                                                </Tooltip>
                                                            )}
                                                        </>

                                                    )}
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {/* Seção: Estilo do Ícone */}
                                    <section className="space-y-3">
                                        <label className="text-sm font-semibold text-white/60 ml-1">{getTranslation(config, 'visuals.icon_style')}</label>
                                        <div className="flex bg-black/60 p-1.5 rounded-2xl border border-white/10 shadow-inner relative overflow-hidden">
                                            <div
                                                className="absolute inset-y-1.5 rounded-xl bg-white shadow-xl transition-all duration-500 ease-out"
                                                style={{
                                                    width: 'calc(50% - 6px)',
                                                    left: editingApp.app.iconSource === 'native' ? '6px' : 'calc(50%)',
                                                    zIndex: 0
                                                }}
                                            />
                                            <button
                                                onClick={() => handleAppChange('iconSource', 'native')}
                                                className={`relative z-10 flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors duration-500 ${editingApp.app.iconSource === 'native' ? 'text-black' : 'text-white/30 hover:text-white/50'}`}
                                            >
                                                {getTranslation(config, 'editingApp.native_icon') || 'Ícone do Sistema'}
                                            </button>
                                            <button
                                                onClick={() => handleAppChange('iconSource', 'lucide')}
                                                className={`relative z-10 flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors duration-500 ${editingApp.app.iconSource === 'lucide' ? 'text-black' : 'text-white/30 hover:text-white/50'}`}
                                            >
                                                {getTranslation(config, 'editingApp.icon_library') || 'Biblioteca de Ícones'}
                                            </button>
                                        </div>
                                    </section>

                                    {/* Seção: Pastas Recentes */}
                                    {editingApp.app.type === 'app' && isIDE && (
                                        <section className="space-y-3">
                                            <div
                                                onClick={() => handleAppChange('hasRecents', !editingApp.app.hasRecents)}
                                                className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all cursor-pointer group"
                                            >
                                                <div className="space-y-1">
                                                    <span className="text-sm font-semibold text-white/80 block group-hover:text-white transition-colors">{getTranslation(config, 'editingApp.has_recents')}</span>
                                                    <span className="text-[10px] text-white/20 block group-hover:text-white/40 transition-colors uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.has_recents_desc')}</span>
                                                </div>
                                                <div
                                                    className={`w-11 h-6 rounded-full relative transition-all duration-500 ${editingApp.app.hasRecents ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-white/5'}`}
                                                >
                                                    <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ease-out ${editingApp.app.hasRecents ? 'left-6 bg-black' : 'left-1 bg-white/20'}`} />
                                                </div>
                                            </div>
                                            {editingApp.app.hasRecents && (
                                                <div
                                                    onClick={() => handleAppChange('openTerminalForRecents', !editingApp.app.openTerminalForRecents)}
                                                    className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-all cursor-pointer group"
                                                >
                                                    <div className="space-y-1">
                                                        <span className="text-sm font-semibold text-white/80 block group-hover:text-white transition-colors">{getTranslation(config, 'editingApp.recents_open_terminal')}</span>
                                                        <span className="text-[10px] text-white/20 block group-hover:text-white/40 transition-colors uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.recents_open_terminal_desc')}</span>
                                                    </div>
                                                    <div
                                                        className={`w-11 h-6 rounded-full relative transition-all duration-500 ${editingApp.app.openTerminalForRecents ? 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-white/5'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ease-out ${editingApp.app.openTerminalForRecents ? 'left-6 bg-black' : 'left-1 bg-white/20'}`} />
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {/* Seção: Acesso Rápido (Pastas) */}
                                    {editingApp.app.type === 'app' && isIDE && (
                                        <section className="space-y-4 pt-1">
                                            <div className="flex items-center justify-between ml-1">
                                                <label className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'editingApp.quick_access')}</label>
                                                <button
                                                    onClick={async () => {
                                                        const path = await window.electron?.selectFolder?.();
                                                        if (path) {
                                                            const label = path.split(/[\\/]/).pop() || 'Folder';
                                                            const parentCmd = editingApp.app.command;
                                                            const formattedParent = (parentCmd.includes(' ') && !parentCmd.startsWith('"')) ? `"${parentCmd}"` : parentCmd;
                                                            const newFolder: AppItem = {
                                                                id: crypto.randomUUID(),
                                                                label,
                                                                command: `${formattedParent} "${path}"`,
                                                                commandType: 'app',
                                                                iconName: 'Folder',
                                                                iconSource: 'lucide',
                                                                description: 'Quick Access Folder',
                                                                terminalCommands: []
                                                            };
                                                            handleAppChange('children', [...(editingApp.app.children || []), newFolder]);
                                                        }
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all uppercase tracking-wider"
                                                >
                                                    <Plus size={14} />
                                                    {getTranslation(config, 'editingApp.add_folder')}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {!editingApp.app.children || editingApp.app.children.filter(c => c.commandType === 'folder' || c.description === 'Quick Access Folder').length === 0 ? (
                                                    <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-3 text-white/10">
                                                        <Folder size={32} strokeWidth={1} />
                                                        <span className="text-[10px] uppercase font-bold tracking-widest">{getTranslation(config, 'editingApp.no_quick_access')}</span>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {editingApp.app.children
                                                            .filter(child => child.commandType === 'folder' || child.description === 'Quick Access Folder')
                                                            .map((child) => (
                                                                <React.Fragment key={child.id}>
                                                                    <div className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">
                                                                        <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-white/20">
                                                                            <Folder size={16} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-xs font-semibold text-white truncate">{child.label}</div>
                                                                            <div className="text-[9px] text-white/20 font-mono truncate">{child.command}</div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                            <Tooltip label={getTranslation(config, 'editingApp.terminal_commands')}>
                                                                                <button
                                                                                    onClick={() => setExpandedFolderId(expandedFolderId === child.id ? null : child.id)}
                                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                                                        expandedFolderId === child.id 
                                                                                        ? 'text-purple-400 bg-purple-400/10' 
                                                                                        : (child.terminalCommands?.length ? 'text-purple-400/50 bg-purple-400/5' : 'text-white/10 hover:text-white/40 hover:bg-white/5')
                                                                                    }`}
                                                                                >
                                                                                    <Settings2 size={14} />
                                                                                </button>
                                                                            </Tooltip>
                                                                            <Tooltip label={getTranslation(config, 'editingApp.toggle_terminal')}>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const newChildren = editingApp.app.children?.map(c => 
                                                                                            c.id === child.id ? { ...c, openTerminal: !c.openTerminal } : c
                                                                                        );
                                                                                        handleAppChange('children', newChildren);
                                                                                    }}
                                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                                                        child.openTerminal 
                                                                                        ? 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20' 
                                                                                        : 'text-white/10 hover:text-white/40 hover:bg-white/5'
                                                                                    }`}
                                                                                >
                                                                                    <Command size={14} />
                                                                                </button>
                                                                            </Tooltip>
                                                                            <Tooltip label={getTranslation(config, 'action.remove') || 'Remover'}>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const newChildren = editingApp.app.children?.filter(c => c.id !== child.id);
                                                                                        handleAppChange('children', newChildren);
                                                                                    }}
                                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </Tooltip>
                                                                        </div>

                                                                    </div>
                                                                    {expandedFolderId === child.id && (
                                                                        <div className="mt-2 ml-1 p-4 bg-black/40 border border-white/5 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                                                            <TerminalCommandEditor 
                                                                                commands={child.terminalCommands || []}
                                                                                config={config}
                                                                                compact={true}
                                                                                onChange={(tidx, val) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            const ncmds = [...(c.terminalCommands || [])];
                                                                                            ncmds[tidx] = val;
                                                                                            return { ...c, terminalCommands: ncmds };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onAdd={() => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: [...(c.terminalCommands || []), ''] };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onRemove={(tidx) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: (c.terminalCommands || []).filter((_, i) => i !== tidx) };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-white/20 ml-1 italic">{getTranslation(config, 'editingApp.quick_access_desc')}</p>
                                        </section>
                                    )}

                                    {/* Seção: Biblioteca de Ícones Lucide (inline) */}
                                    {editingApp.app.iconSource === 'lucide' && (
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                    <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'editingApp.icon_library') || 'Biblioteca de Ícones'}</span>
                                                </div>
                                                {(() => {
                                                    const CurrentIcon = getIcon(editingApp.app.iconName);
                                                    return (
                                                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10">
                                                            <CurrentIcon size={14} strokeWidth={1.5} className="text-white/60" />
                                                            <span className="text-[10px] text-white/40 font-medium">{editingApp.app.iconName}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="bg-black/30 rounded-xl border border-white/5 p-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                                                <IconPicker
                                                    selectedIcon={editingApp.app.iconName}
                                                    onSelect={(name) => handleAppChange('iconName', name)}
                                                />
                                            </div>
                                        </section>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* ===== Layout Normal (telas grandes) — Duas Colunas ===== */
                            <div className="flex flex-row flex-1 overflow-hidden min-h-0">
                                {/* Coluna Esquerda: Configuração */}
                                <div className="flex-1 p-8 space-y-7 overflow-y-auto custom-scrollbar border-r border-white/5 bg-white/[0.01] min-h-0 min-w-0">
                                    {/* Seção: Identificação */}
                                    <section className="space-y-3">
                                        <label className="text-sm font-semibold text-white/60 ml-1">{getTranslation(config, 'editingApp.name_label')}</label>
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                value={editingApp.app.label}
                                                onChange={e => handleAppChange('label', e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-medium text-white focus:border-white/30 focus:bg-black/60 outline-none transition-all duration-500 shadow-inner group-hover:border-white/20"
                                                placeholder={getTranslation(config, 'editingApp.placeholder_name')}
                                            />
                                        </div>
                                    </section>

                                    {/* Seção: Alvo/Caminho */}
                                    {editingApp.app.type === 'app' && (
                                        <section className="space-y-3">
                                            <label className="text-sm font-semibold text-white/60 ml-1">
                                                {editingApp.app.commandType === 'url' ? getTranslation(config, 'editingApp.url_label') : getTranslation(config, 'editingApp.path_label')}
                                            </label>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <div className="flex-1 relative group">
                                                    <input
                                                        type="text"
                                                        value={editingApp.app.command}
                                                        onChange={e => handleAppChange('command', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-3.5 text-sm font-mono text-white/50 focus:border-white/30 focus:bg-black/60 outline-none transition-all duration-500 shadow-inner group-hover:border-white/20"
                                                        placeholder={editingApp.app.commandType === 'url' ? getTranslation(config, 'editingApp.placeholder_url') : getTranslation(config, 'editingApp.placeholder_path')}
                                                    />
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    {editingApp.app.commandType === 'url' ? (
                                                        <div className="w-[52px] h-[52px] bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/20 rounded-xl">
                                                            <Globe size={20} strokeWidth={1} />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <Tooltip label={getTranslation(config, 'editingApp.explore_title')}>
                                                                <button
                                                                    onClick={editingApp.app.commandType === 'folder' ? handlePickFolder : handlePickCommand}
                                                                    className="px-5 h-[52px] bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-200 transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center gap-2 group"
                                                                >
                                                                    <Folder size={16} strokeWidth={2.5} />
                                                                    <span>{getTranslation(config, 'action.explore')}</span>
                                                                </button>
                                                            </Tooltip>
                                                            {editingApp.app.commandType === 'app' && (
                                                                <Tooltip label={getTranslation(config, 'editingApp.installed_apps_title')}>
                                                                    <button
                                                                        onClick={() => setShowAppSelector(true)}
                                                                        className="px-4 h-[52px] bg-white/[0.03] border border-white/10 flex items-center justify-center gap-2 text-white/40 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all duration-300 active:scale-90"
                                                                    >
                                                                        <LayoutGrid size={18} strokeWidth={1.5} />
                                                                        <span className="font-bold text-[10px] uppercase tracking-wider">{getTranslation(config, 'editingApp.installed_apps_label')}</span>
                                                                    </button>
                                                                </Tooltip>
                                                            )}
                                                        </>

                                                    )}
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {/* Seção: Estilo do Ícone */}
                                    <section className="space-y-3">
                                        <label className="text-sm font-semibold text-white/60 ml-1">{getTranslation(config, 'visuals.icon_style')}</label>
                                        <div className="flex bg-black/60 p-1.5 rounded-2xl border border-white/10 shadow-inner relative overflow-hidden">
                                            <div
                                                className="absolute inset-y-1.5 rounded-xl bg-white shadow-xl transition-all duration-500 ease-out"
                                                style={{
                                                    width: 'calc(50% - 6px)',
                                                    left: editingApp.app.iconSource === 'native' ? '6px' : 'calc(50%)',
                                                    zIndex: 0
                                                }}
                                            />
                                            <button
                                                onClick={() => handleAppChange('iconSource', 'native')}
                                                className={`relative z-10 flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors duration-500 ${editingApp.app.iconSource === 'native' ? 'text-black' : 'text-white/30 hover:text-white/50'}`}
                                            >
                                                {getTranslation(config, 'editingApp.native_icon') || 'Ícone do Sistema'}
                                            </button>
                                            <button
                                                onClick={() => handleAppChange('iconSource', 'lucide')}
                                                className={`relative z-10 flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-colors duration-500 ${editingApp.app.iconSource === 'lucide' ? 'text-black' : 'text-white/30 hover:text-white/50'}`}
                                            >
                                                {getTranslation(config, 'editingApp.icon_library') || 'Biblioteca de Ícones'}
                                            </button>
                                        </div>
                                    </section>
                                    {/* Seção: Pastas Recentes */}
                                    {editingApp.app.type === 'app' && isIDE && (
                                        <section className="space-y-3 pb-4">
                                            <div
                                                onClick={() => handleAppChange('hasRecents', !editingApp.app.hasRecents)}
                                                className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-all cursor-pointer group"
                                            >
                                                <div className="space-y-1">
                                                    <span className="text-sm font-semibold text-white/70 block group-hover:text-white transition-colors">{getTranslation(config, 'editingApp.has_recents')}</span>
                                                    <span className="text-[10px] text-white/20 block group-hover:text-white/40 transition-colors uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.has_recents_desc')}</span>
                                                </div>
                                                <div
                                                    className={`w-11 h-6 rounded-full relative transition-all duration-500 ${editingApp.app.hasRecents ? 'bg-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-white/5'}`}
                                                >
                                                    <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ease-out ${editingApp.app.hasRecents ? 'left-6 bg-black' : 'left-1 bg-white/20'}`} />
                                                </div>
                                            </div>
                                            {editingApp.app.hasRecents && (
                                                <div
                                                    onClick={() => handleAppChange('openTerminalForRecents', !editingApp.app.openTerminalForRecents)}
                                                    className="flex items-center justify-between p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-all cursor-pointer group"
                                                >
                                                    <div className="space-y-1">
                                                        <span className="text-sm font-semibold text-white/70 block group-hover:text-white transition-colors">{getTranslation(config, 'editingApp.recents_open_terminal')}</span>
                                                        <span className="text-[10px] text-white/20 block group-hover:text-white/40 transition-colors uppercase tracking-wider font-bold">{getTranslation(config, 'editingApp.recents_open_terminal_desc')}</span>
                                                    </div>
                                                    <div
                                                        className={`w-11 h-6 rounded-full relative transition-all duration-500 ${editingApp.app.openTerminalForRecents ? 'bg-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-white/5'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ease-out ${editingApp.app.openTerminalForRecents ? 'left-6 bg-black' : 'left-1 bg-white/20'}`} />
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {/* Seção: Acesso Rápido (Pastas) */}
                                    {editingApp.app.type === 'app' && isIDE && (
                                        <section className="space-y-3">
                                            <div className="flex items-center justify-between ml-1">
                                                <label className="text-sm font-semibold text-white/60">{getTranslation(config, 'editingApp.quick_access')}</label>
                                                <button
                                                    onClick={async () => {
                                                        const path = await window.electron?.selectFolder?.();
                                                        if (path) {
                                                            const label = path.split(/[\\/]/).pop() || 'Folder';
                                                            const parentCmd = editingApp.app.command;
                                                            const formattedParent = (parentCmd.includes(' ') && !parentCmd.startsWith('"')) ? `"${parentCmd}"` : parentCmd;
                                                            
                                                            let idePrefix = formattedParent;
                                                            const lowerParent = editingApp.app.label.toLowerCase();
                                                            const lowerCmd = editingApp.app.command.toLowerCase();
                                                            
                                                            if (lowerParent.includes('antigravity') || lowerCmd.includes('antigravity')) idePrefix = 'antigravity';
                                                            else if (lowerParent.includes('cursor') || lowerCmd.includes('cursor')) idePrefix = 'cursor';
                                                            const newFolder: AppItem = {
                                                                id: crypto.randomUUID(),
                                                                label,
                                                                command: `${formattedParent} "${path}"`,
                                                                commandType: 'app',
                                                                iconName: 'Folder',
                                                                iconSource: 'lucide',
                                                                description: 'Quick Access Folder',
                                                                terminalCommands: []
                                                            };
                                                            handleAppChange('children', [...(editingApp.app.children || []), newFolder]);
                                                        }
                                                    }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all uppercase tracking-wider"
                                                >
                                                    <Plus size={14} />
                                                    {getTranslation(config, 'editingApp.add_folder')}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {!editingApp.app.children || editingApp.app.children.filter(c => c.commandType === 'folder' || c.description === 'Quick Access Folder').length === 0 ? (
                                                    <div className="p-8 rounded-2xl border border-dashed border-white/5 bg-white/[0.01] flex flex-col items-center justify-center gap-3 text-white/10">
                                                        <Folder size={32} strokeWidth={1} />
                                                        <span className="text-[10px] uppercase font-bold tracking-widest">{getTranslation(config, 'editingApp.no_quick_access')}</span>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {editingApp.app.children
                                                            .filter(child => child.commandType === 'folder' || child.description === 'Quick Access Folder')
                                                            .map((child) => (
                                                                <React.Fragment key={child.id}>
                                                                    <div className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">
                                                                        <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-white/20">
                                                                            <Folder size={16} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="text-xs font-semibold text-white truncate">{child.label}</div>
                                                                            <div className="text-[9px] text-white/20 font-mono truncate">{child.command}</div>
                                                                        </div>
                                                                          <div className="flex items-center gap-1 opacity-100 transition-all">
                                                                              <Tooltip label={getTranslation(config, 'editingApp.terminal_commands')}>
                                                                                  <button
                                                                                      onClick={() => setExpandedFolderId(expandedFolderId === child.id ? null : child.id)}
                                                                                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                                                          expandedFolderId === child.id 
                                                                                          ? 'text-purple-400 bg-purple-400/10' 
                                                                                          : (child.terminalCommands?.length ? 'text-purple-400/50 bg-purple-400/5' : 'text-white/10 hover:text-white/40 hover:bg-white/5')
                                                                                      }`}
                                                                                  >
                                                                                      <Settings2 size={14} />
                                                                                  </button>
                                                                              </Tooltip>
                                                                              <Tooltip label={getTranslation(config, 'editingApp.toggle_terminal')}>
                                                                                  <button
                                                                                      onClick={() => {
                                                                                          const newChildren = editingApp.app.children?.map(c => 
                                                                                              c.id === child.id ? { ...c, openTerminal: !c.openTerminal } : c
                                                                                          );
                                                                                          handleAppChange('children', newChildren);
                                                                                      }}
                                                                                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                                                                          child.openTerminal 
                                                                                          ? 'text-blue-400 bg-blue-400/10 hover:bg-blue-400/20' 
                                                                                          : 'text-white/10 hover:text-white/40 hover:bg-white/5'
                                                                                      }`}
                                                                                  >
                                                                                      <Command size={14} />
                                                                                  </button>
                                                                              </Tooltip>
                                                                              <Tooltip label={getTranslation(config, 'action.remove') || 'Remover'}>
                                                                                  <button
                                                                                      onClick={() => {
                                                                                          const newChildren = editingApp.app.children?.filter(c => c.id !== child.id);
                                                                                          handleAppChange('children', newChildren);
                                                                                      }}
                                                                                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/10 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                                                  >
                                                                                      <Trash2 size={14} />
                                                                                  </button>
                                                                              </Tooltip>
                                                                          </div>

                                                                    </div>
                                                                    {expandedFolderId === child.id && (
                                                                        <div className="mt-2 ml-1 p-4 bg-black/40 border border-white/5 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                                                                            <TerminalCommandEditor 
                                                                                commands={child.terminalCommands || []}
                                                                                config={config}
                                                                                compact={true}
                                                                                onChange={(tidx, val) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            const ncmds = [...(c.terminalCommands || [])];
                                                                                            ncmds[tidx] = val;
                                                                                            return { ...c, terminalCommands: ncmds };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onAdd={() => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: [...(c.terminalCommands || []), ''] };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                                onRemove={(tidx) => {
                                                                                    const newChildren = editingApp.app.children?.map(c => {
                                                                                        if (c.id === child.id) {
                                                                                            return { ...c, terminalCommands: (c.terminalCommands || []).filter((_, i) => i !== tidx) };
                                                                                        }
                                                                                        return c;
                                                                                    });
                                                                                    handleAppChange('children', newChildren);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </React.Fragment>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-white/20 ml-1 italic">{getTranslation(config, 'editingApp.quick_access_desc')}</p>
                                        </section>
                                    )}

                                    {/* Seção: Auto-run Command (Global) */}
                                    {isIDE && (
                                        <section className="space-y-4 pt-4 border-t border-white/5 mt-4">
                                            <TerminalCommandEditor 
                                                commands={editingApp.app.terminalCommands || []}
                                                config={config}
                                                onChange={(idx, val) => {
                                                    const newCmds = [...(editingApp.app.terminalCommands || [])];
                                                    newCmds[idx] = val;
                                                    handleAppChange('terminalCommands', newCmds);
                                                }}
                                                onAdd={() => handleAppChange('terminalCommands', [...(editingApp.app.terminalCommands || []), ''])}
                                                onRemove={(idx) => handleAppChange('terminalCommands', (editingApp.app.terminalCommands || []).filter((_, i) => i !== idx))}
                                            />
                                        </section>
                                    )}
                                </div>

                                {/* Coluna Direita: Preview or Icon Library */}
                                {editingApp.app.iconSource === 'lucide' ? (
                                    <div className="w-[340px] shrink-0 bg-black/40 flex flex-col min-h-0 border-l border-white/5">
                                        <div className="px-5 py-4 flex items-center justify-between border-b border-white/5 shrink-0">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'editingApp.icon_library') || 'Biblioteca de Ícones'}</span>
                                            </div>
                                            {(() => {
                                                const CurrentIcon = getIcon(editingApp.app.iconName);
                                                return (
                                                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10">
                                                        <CurrentIcon size={14} strokeWidth={1.5} className="text-white/60" />
                                                        <span className="text-[10px] text-white/40 font-medium">{editingApp.app.iconName}</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 min-h-0">
                                            <IconPicker
                                                selectedIcon={editingApp.app.iconName}
                                                onSelect={(name) => handleAppChange('iconName', name)}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-[300px] shrink-0 bg-black/40 p-8 flex flex-col items-center justify-between gap-6 relative min-h-0 border-l border-white/5">
                                        <div className="w-full space-y-10 flex flex-col items-center">
                                            <div className="flex items-center gap-2 w-full">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'editingApp.preview') || 'Pré-visualização'}</span>
                                            </div>
                                            <div className="relative group">
                                                <motion.div
                                                    className="w-28 h-28 rounded-2xl bg-gradient-to-br from-white/[0.05] to-transparent flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-all duration-700 cursor-pointer overflow-hidden shadow-2xl"
                                                    whileHover={{ scale: 1.05, y: -4 }}
                                                    onClick={handlePickIcon}
                                                >
                                                    {editingApp.app.customIconUrl ? (
                                                        <SmartIcon
                                                            src={editingApp.app.customIconUrl}
                                                            className="w-full h-full object-contain p-4 transition-transform duration-700 group-hover:scale-110"
                                                            size={112}
                                                            referenceScale={0.7}
                                                        />
                                                    ) : (
                                                        (() => {
                                                            const Icon = getIcon(editingApp.app.iconName);
                                                            return <Icon size={56} strokeWidth={1} className="text-white/20 group-hover:text-white transition-all duration-500" />;
                                                        })()
                                                    )}
                                                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center">
                                                        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                                                            <Upload size={16} className="text-white" />
                                                        </div>
                                                    </div>
                                                </motion.div>
                                                <div className="absolute inset-0 bg-white/[0.01] rounded-[2rem] blur-2xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                                            </div>
                                            <div className="text-center space-y-1.5">
                                                <h4 className="text-base font-bold text-white tracking-tight truncate max-w-[220px]">
                                                    {editingApp.app.label || getTranslation(config, 'editingApp.no_name') || 'Sem Nome'}
                                                </h4>
                                                <p className="text-[10px] text-white/20 font-bold uppercase tracking-[0.15em]">{getTranslation(config, 'editingApp.menu_pos') || 'Posição no Menu'}: {editingApp.index + 1}</p>
                                            </div>
                                        </div>
                                        <div className="w-full space-y-3">
                                            <button
                                                onClick={handlePickIcon}
                                                className="w-full py-3.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/80 font-bold text-[11px] uppercase tracking-widest rounded-xl border border-white/5 hover:border-white/20 transition-all duration-300 active:scale-[0.98]"
                                            >
                                                {getTranslation(config, 'editingApp.choose_image') || 'Escolher Imagem'}
                                            </button>
                                            <button
                                                onClick={() => handleAppChange('customIconUrl', undefined)}
                                                className="w-full py-2 text-white/20 hover:text-white/40 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300"
                                            >
                                                {getTranslation(config, 'editingApp.restore_default') || 'Restaurar Padrão'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rodapé do Modal */}
                        <div className="px-8 py-5 border-t border-white/5 bg-black/20 flex justify-between items-center">
                            <div className="hidden sm:flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{getTranslation(config, 'editingApp.sync_active') || 'Sincronização Ativa'}</span>
                            </div>
                            <button
                                onClick={() => setEditingApp(null)}
                                className="px-8 py-3.5 bg-white text-black font-bold text-xs uppercase tracking-widest rounded-xl hover:shadow-[0_15px_40px_rgba(255,255,255,0.15)] hover:scale-[1.02] transition-all duration-500 active:scale-[0.98] shadow-2xl"
                            >
                                {getTranslation(config, 'action.save') || 'Save and Close'}
                            </button>
                        </div>
                    </motion.div>
                </div >
            )}
        </AnimatePresence >
    );
});



const WidgetsTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    const commandsInWorkspaces = useMemo(() => {
        const s = new Set<string>();
        for (const ws of config.workspaces) {
            for (const a of ws.apps) {
                if (a.command) s.add(a.command);
            }
        }
        return s;
    }, [config.workspaces]);

    const appCommandsByWorkspace = useMemo(
        () => config.workspaces.map(ws => {
            const cmd = new Set<string>();
            for (const a of ws.apps) {
                if (a.command) cmd.add(a.command);
            }
            return cmd;
        }),
        [config.workspaces]
    );

    return (
        <motion.div
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'tabs.widgets')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'widgets.desc') || 'Adicione ferramentas independentes e utilitários ao seu hub radial. Melhore sua produtividade com cronômetros, alarmes e sensores de sistema integrados.'}
                    </p>
                </motion.div>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {AVAILABLE_WIDGETS.map((widget, index) => {
                        const Icon = getIcon(widget.iconName);
                        const isDeployed = commandsInWorkspaces.has(widget.command);

                        return (
                            <motion.div
                                key={widget.id}
                                className="p-5 rounded-xl bg-white/[0.015] border border-white/5 hover:border-white/10 hover:bg-white/[0.03] flex flex-col transition-all duration-500 group relative overflow-hidden shadow-lg"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05, duration: 0.5 }}
                            >
                                {isDeployed && (
                                    <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                                        <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-green-500 uppercase tracking-[0.15em]">{getTranslation(config, 'status.active') || 'Active'}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mb-4 relative z-10">
                                    <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-white/30 group-hover:text-white group-hover:border-white/10 transition-all duration-500 shrink-0">
                                        <Icon size={18} strokeWidth={1.25} />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="font-medium text-white text-sm tracking-tight truncate leading-tight">
                                            {getTranslation(config, `widgets.${widget.id}.name`) || widget.name}
                                        </h4>
                                        <p className="text-[9px] text-white/20 font-semibold uppercase tracking-[0.2em]">{widget.id.split('_')[0]} {getTranslation(config, 'widgets.module') || 'Module'}</p>
                                    </div>
                                </div>

                                <div className="mb-6 relative z-10">
                                    <p className="text-[11px] text-white/40 font-medium leading-relaxed line-clamp-2 min-h-[32px]">
                                        {getTranslation(config, `widgets.${widget.id}.desc`) || widget.description}
                                    </p>
                                </div>

                                <div className="mt-auto space-y-4 relative z-10">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[9px] font-black text-white/20 uppercase tracking-[0.25em]">{getTranslation(config, 'widgets.integration') || 'Module Integration'}</label>
                                        <div className="h-px flex-1 bg-white/5 mx-3" />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {config.workspaces.map((ws, wsIndex) => {
                                            const isInside = appCommandsByWorkspace[wsIndex]?.has(widget.command) ?? false;
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
                                                    title={`${getTranslation(config, 'action.toggle') || 'Toggle'} for ${ws.name}`}
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
        className={`p-6 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition-all duration-500 overflow-hidden relative group ${className}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
    >
        <div className="flex items-center gap-3 mb-6 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all duration-500">
                <Icon size={20} strokeWidth={1.5} />
            </div>
            <div>
                <h4 className="text-[13px] font-semibold text-white tracking-tight leading-tight">{title}</h4>
                {description && <p className="text-[10px] text-white/30 font-medium tracking-wide uppercase mt-0.5">{description}</p>}
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
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'visuals.title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'visuals.desc')}
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <BentoCard
                        title={getTranslation(config, 'visuals.menu_size')}
                        icon={Layout}
                        description={getTranslation(config, 'visuals.hub_expansion') || 'Expansão do Hub'}
                        className="md:col-span-2 lg:col-span-2"
                    >
                        <div className="space-y-6">
                            <div className="flex justify-between items-center text-[10px] font-black text-white/20 uppercase tracking-widest">
                                <span>{getTranslation(config, 'visuals.min_range') || 'Alcance Mínimo'} (150px)</span>
                                <span>{getTranslation(config, 'visuals.max_range') || 'Alcance Máximo'} (600px)</span>
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

                    <BentoCard title={getTranslation(config, 'visuals.icon_density')} icon={Box} description={getTranslation(config, 'visuals.icon_scale') || 'Escala dos Atalhos'} className="md:col-span-1 lg:col-span-1">
                        <div className="space-y-6">
                            <div className="flex items-end justify-between">
                                <span className="text-3xl font-black text-white tabular-nums">{config.iconSize}</span>
                                <span className="text-[10px] text-white/20 font-bold uppercase mb-1">{getTranslation(config, 'visuals.default_size') || 'Tamanho Padrão'}</span>
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

                    <BentoCard title={getTranslation(config, 'visuals.transparency')} icon={ImageIcon} description={getTranslation(config, 'visuals.glass_effect') || 'Efeito de Vidro'} className="md:col-span-1 lg:col-span-1">
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-end justify-between">
                                    <span className="text-2xl font-black text-white tabular-nums">{Math.round(config.backdropOpacity * 100)}%</span>
                                    <span className="text-[9px] text-white/20 font-bold uppercase mb-1 tracking-widest">{getTranslation(config, 'visuals.opacity') || 'Opacidade'}</span>
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
                                    <span className="text-[9px] text-white/20 font-bold uppercase mb-1 tracking-widest">{getTranslation(config, 'visuals.blur_radius') || 'Raio de Desfoque'}</span>
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
                                    <span className="text-[8px] text-white/40 uppercase font-bold tracking-tighter">{getTranslation(config, 'visuals.native_acrylic') || 'Acrylic Nativo (Windows)'}</span>
                                    <button
                                        onClick={() => setConfig({ ...config, backdropBlur: config.backdropBlur > 0 ? 0 : 20 })}
                                        className={`px-2 py-1 rounded border text-[8px] font-bold uppercase transition-all ${config.backdropBlur > 0 ? 'bg-white text-black border-white' : 'bg-transparent text-white/20 border-white/5'}`}
                                    >
                                        {config.backdropBlur > 0 ? getTranslation(config, 'status.activated') || 'Ativado' : getTranslation(config, 'status.default') || 'Padrão'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </BentoCard>

                    <BentoCard
                        title={getTranslation(config, 'visuals.accent_color')}
                        icon={Palette}
                        description={getTranslation(config, 'visuals.accent_custom') || 'Personalização de Tom'}
                        className="md:col-span-2 lg:col-span-2"
                    >
                        <div className="flex gap-6 items-center">
                            <div className="relative group/color p-2 rounded-xl bg-black/40 border border-white/10">
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
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'visuals.hex_code') || 'Hex Code'}</span>
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


                    <BentoCard title={getTranslation(config, 'visuals.spacing')} icon={GripVertical} description={getTranslation(config, 'visuals.visual_rhythm') || 'Ritmo Visual'} className="md:col-span-1 lg:col-span-1">
                        <div className="space-y-6">
                            <div className="flex items-end justify-between">
                                <span className="text-3xl font-black text-white tabular-nums">{config.appSpacing}</span>
                                <span className="text-[10px] text-white/20 font-bold uppercase mb-1">{getTranslation(config, 'visuals.distance') || 'Distância (px)'}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="50"
                                step="2"
                                value={config.appSpacing}
                                onChange={e => setConfig({ ...config, appSpacing: Number(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                            />
                        </div>
                    </BentoCard>

                    <BentoCard title={getTranslation(config, 'visuals.activation_limit')} icon={Zap} description={getTranslation(config, 'visuals.sensitivity') || 'Sensibilidade'} className="md:col-span-1 lg:col-span-1">
                        <div className="space-y-6">
                            <div className="flex items-end justify-between">
                                <span className="text-3xl font-black text-white tabular-nums">{config.activationThreshold}</span>
                                <span className="text-[10px] text-white/20 font-bold uppercase mb-1">{getTranslation(config, 'visuals.trigger_pixels') || 'Pixels de Gatilho'}</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="150"
                                step="5"
                                value={config.activationThreshold}
                                onChange={e => setConfig({ ...config, activationThreshold: Number(e.target.value) })}
                                className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white cursor-pointer"
                            />
                        </div>
                    </BentoCard>

                    <BentoCard title={getTranslation(config, 'visuals.labels') || 'Legendas'} icon={FileType} description={getTranslation(config, 'visuals.text_labels') || 'Rótulos de Texto'} className="md:col-span-1 lg:col-span-1">
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => setConfig({ ...config, showLabels: !config.showLabels })}
                                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all duration-500 ${config.showLabels ? 'bg-white border-white' : 'bg-white/[0.02] border-white/10'}`}
                            >
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${config.showLabels ? 'text-black' : 'text-white/40'}`}>
                                    {config.showLabels ? getTranslation(config, 'status.visible') || 'Visível' : getTranslation(config, 'status.hidden') || 'Oculto'}
                                </span>
                                <div className={`w-2 h-2 rounded-full ${config.showLabels ? 'bg-black animate-pulse' : 'bg-white/10'}`} />
                            </button>
                        </div>
                    </BentoCard>

                    <BentoCard title={getTranslation(config, 'performance.title')} icon={Zap} description={getTranslation(config, 'performance.desc')} className="md:col-span-1 lg:col-span-3">
                        <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer group hover:bg-white/[0.05]" onClick={() => setConfig({ ...config, performanceMode: !config.performanceMode })}>
                            <div className="space-y-1">
                                <span className="text-sm font-semibold text-white/80 group-hover:text-white block">{getTranslation(config, 'performance.strict')}</span>
                                <span className="text-[10px] text-white/30 uppercase tracking-wider block font-bold leading-tight">{getTranslation(config, 'performance.strict_desc')}</span>
                            </div>
                            <div className={`w-11 h-6 rounded-full relative transition-all duration-500 ${config.performanceMode ? 'bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ${config.performanceMode ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
                            </div>
                        </div>
                        <div
                            className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl cursor-pointer group hover:bg-white/[0.05]"
                            onClick={() => setConfig({ ...config, deskIslandClockWhileIdle: !(config.deskIslandClockWhileIdle === true) })}
                        >
                            <div className="space-y-1 pr-4">
                                <span className="text-sm font-semibold text-white/80 group-hover:text-white block">{getTranslation(config, 'performance.idle_island')}</span>
                                <span className="text-[10px] text-white/30 uppercase tracking-wider block font-bold leading-tight">{getTranslation(config, 'performance.idle_island_desc')}</span>
                            </div>
                            <div className={`w-11 h-6 shrink-0 rounded-full relative transition-all duration-500 ${config.deskIslandClockWhileIdle === true ? 'bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-500 ${config.deskIslandClockWhileIdle === true ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
                            </div>
                        </div>
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
    getIcon,
    config
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
                <img src="folder.svg" className="w-full h-full object-fill filter brightness-[0.7] group-hover:brightness-[1] group-hover:scale-[1.01] transition-[transform,filter] duration-500" alt="" />
            </div>

            <div className="absolute top-[10%] right-[10%] z-20">
                <div className={`
                    flex items-center gap-2 px-2.5 py-1 rounded-lg 
                    backdrop-blur-3xl border transition-all duration-500
                    ${workspace.enabled
                        ? 'bg-white/[0.05] border-white/10'
                        : 'bg-white/[0.01] border-white/5 opacity-30'
                    }
                `}>
                    <div className="relative flex items-center justify-center">
                        <div className={`w-1 h-1 rounded-full ${workspace.enabled ? 'bg-white shadow-[0_0_8px_white]' : 'bg-white/10'}`} />
                    </div>
                    <span className={`text-[9px] font-medium tabular-nums tracking-[0.15em] ${workspace.enabled ? 'text-white/80' : 'text-white/10'}`}>
                        {workspace.hotkey}
                    </span>
                </div>
            </div>

            {/* App Matrix (2x2 Grid) */}
            <div className="relative z-10 flex-1 flex items-center justify-center mt-5 mb-4 w-full px-6">
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
                                    <SmartIcon
                                        src={app.customIconUrl}
                                        className="w-full h-full object-contain"
                                        size={36}
                                        referenceScale={0.75}
                                    />
                                ) : (
                                    <SmallIcon size={24} className="text-white/30 group-hover:text-white/60 transition-colors" />
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
            <div className="relative z-20 mb-3 w-full px-4">
                <div className="flex flex-col items-center gap-0.5">
                    <h4 className="text-[10px] font-bold text-white tracking-[0.25em] uppercase transition-all duration-500 group-hover:tracking-[0.3em] line-clamp-1 truncate text-center w-full">
                        {workspace.name}
                    </h4>
                    <div className="h-[1px] w-4 bg-white/10 group-hover:w-8 group-hover:bg-white/30 transition-all duration-700" />
                    <span className="text-[8px] text-white/20 font-bold uppercase tracking-[0.2em] mt-1 group-hover:text-white/40 transition-colors duration-500">
                        {`${workspace.apps.length} ${getTranslation(config, 'workspaces.shortcuts') || 'Atalhos'}`}
                    </span>
                </div>
            </div>

            {dragOverWorkspace === index && (
                <div className="absolute inset-x-[-2%] inset-y-0 border-2 border-white/40 rounded-[2.5rem] z-40 pointer-events-none animate-pulse" />
            )}
        </div>
    </motion.div>
));

const WorkspaceAppItem = React.memo(({
    app, i, isFolder, getIcon, dragAppRef, setDragOverApp, isDragOver,
    selectedWorkspaceIndex, workspaceFolderPath, reorderAppsInWorkspace,
    setEditingApp, removeAppFromWorkspace, setWorkspaceFolderPath, config
}: any) => {
    const Icon = getIcon(app.iconName);
    return (
        <motion.div
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
            className={`group relative p-3.5 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border hover:bg-white/[0.08] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition-all duration-300 flex items-center gap-3.5 cursor-grab active:cursor-grabbing ${isDragOver
                ? 'border-white/40 shadow-[0_0_0_2px_rgba(255,255,255,0.1)] scale-[1.01]'
                : 'border-white/[0.05] hover:border-white/[0.15]'
                }`}
        >
            <div className="shrink-0 opacity-0 group-hover:opacity-30 transition-opacity duration-200 text-white -ml-1 mr-0.5 cursor-grab">
                <GripVertical size={14} strokeWidth={1.5} />
            </div>
            <div className="w-12 h-12 rounded-xl bg-black/60 flex items-center justify-center text-white/40 overflow-hidden border border-white/[0.05] group-hover:border-white/20 group-hover:text-white transition-all duration-500 shadow-inner shrink-0 p-2">
                {app.iconSource === 'native' && app.customIconUrl ? (
                    <SmartIcon
                        src={app.customIconUrl}
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                        size={48}
                        referenceScale={0.75}
                    />
                ) : (
                    <Icon size={32} strokeWidth={1.2} className={isFolder ? 'text-white/60' : ''} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate text-sm tracking-tight">{app.label}</div>
                <div className="text-[9px] text-white/20 truncate font-semibold uppercase tracking-widest">{getTranslation(config, `workspaces.${app.type}`) || app.type}</div>
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
        <div className="h-full w-full flex flex-col overflow-hidden relative">
            <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar pt-20`}>
                <div className="max-w-4xl mx-auto flex flex-col px-6 md:px-10 lg:px-12">
                    <div className={`flex items-center gap-6 ${selectedWorkspaceIndex !== null ? 'mb-6' : 'mb-12'} group/header`}>
                        {selectedWorkspaceIndex !== null && (
                            <motion.button
                                onClick={() => setSelectedWorkspaceIndex(null)}
                                className="h-10 px-4 flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/40 hover:text-white rounded-xl transition-all duration-300 active:scale-95 group/back"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                whileHover={{ x: -2 }}
                                title={getTranslation(config, 'workspaces.back_to_workspaces') || 'Back to Workspaces'}
                            >
                                <ChevronLeft size={18} className="transition-transform group-hover/back:-translate-x-0.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{getTranslation(config, 'workspaces.back_to_workspaces') || 'Espaços'}</span>
                            </motion.button>
                        )}

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex-1"
                        >
                            <h3 className="text-xl font-medium text-white/90 mb-1 tracking-tight">
                                {selectedWorkspaceIndex === null ? getTranslation(config, 'workspaces.title') || 'Meus Espaços' : null}
                            </h3>
                            {selectedWorkspaceIndex === null && (
                                <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                                    {getTranslation(config, 'workspaces.desc') || 'Crie e gerencie diferentes ambientes de trabalho com atalhos personalizados.'}
                                </p>
                            )}
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

                                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 max-w-3xl">
                                    <div className="text-[10px] font-bold text-white/35 uppercase tracking-widest mb-3">
                                        {getTranslation(config, 'workspaces.switch_mode') || 'Workspace menu'}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setConfig({ ...config, workspaceSwitchMode: 'hotkeys' })}
                                            className={`flex-1 text-left rounded-xl border px-4 py-3 transition-all ${
                                                (config.workspaceSwitchMode ?? 'hotkeys') === 'hotkeys'
                                                    ? 'border-white/25 bg-white/[0.06] text-white'
                                                    : 'border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/70'
                                            }`}
                                        >
                                            <div className="text-[12px] font-semibold">
                                                {getTranslation(config, 'workspaces.switch_mode_hotkeys') || '1–9'}
                                            </div>
                                            <p className="text-[10px] text-white/35 mt-1 leading-snug">
                                                {getTranslation(config, 'workspaces.switch_mode_hotkeys_hint') || ''}
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfig({ ...config, workspaceSwitchMode: 'picker' })}
                                            className={`flex-1 text-left rounded-xl border px-4 py-3 transition-all ${
                                                config.workspaceSwitchMode === 'picker'
                                                    ? 'border-white/25 bg-white/[0.06] text-white'
                                                    : 'border-white/5 bg-transparent text-white/40 hover:border-white/10 hover:text-white/70'
                                            }`}
                                        >
                                            <div className="text-[12px] font-semibold">
                                                {getTranslation(config, 'workspaces.switch_mode_picker') || 'Picker'}
                                            </div>
                                            <p className="text-[10px] text-white/35 mt-1 leading-snug">
                                                {getTranslation(config, 'workspaces.switch_mode_picker_hint') || ''}
                                            </p>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[200px] pb-12">
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
                                            config={config}
                                        />
                                    ))}

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
                                    <div className="flex items-center gap-6 mb-6 bg-white/[0.015] p-4 rounded-xl border border-white/5 backdrop-blur-3xl">
                                        <div className="flex-1">
                                            {workspaceFolderPath.length === 0 && (
                                                <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.3em] block mb-3 ml-1">{getTranslation(config, 'workspaces.id') || 'Identificação do Espaço'}</label>
                                            )}
                                            <input
                                                type="text"
                                                value={config.workspaces[selectedWorkspaceIndex].name}
                                                onChange={e => {
                                                    const nw = [...config.workspaces];
                                                    nw[selectedWorkspaceIndex] = { ...nw[selectedWorkspaceIndex], name: e.target.value };
                                                    setConfig({ ...config, workspaces: nw });
                                                }}
                                                className={`w-full bg-transparent ${workspaceFolderPath.length > 0 ? 'text-lg' : 'text-2xl'} font-medium text-white/90 border-none outline-none placeholder-white/10 focus:placeholder-transparent transition-all tracking-tight`}
                                                placeholder="Neural Network..."
                                            />
                                        </div>
                                        {workspaceFolderPath.length === 0 && (
                                            <>
                                                <div className="h-10 w-px bg-white/5 mx-2" />
                                                <div className="flex items-center gap-2.5">
                                                    <button
                                                        onClick={() => {
                                                            const nw = [...config.workspaces];
                                                            nw[selectedWorkspaceIndex] = {
                                                                ...nw[selectedWorkspaceIndex],
                                                                enabled: !nw[selectedWorkspaceIndex].enabled
                                                            };
                                                            setConfig({ ...config, workspaces: nw });
                                                        }}
                                                        className={`h-10 px-5 rounded-xl text-[9px] font-semibold uppercase tracking-[0.2em] transition-all border duration-500 ${config.workspaces[selectedWorkspaceIndex].enabled ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-white/[0.02] text-white/30 border-white/5 hover:bg-white/10 hover:text-white'}`}
                                                    >
                                                        {config.workspaces[selectedWorkspaceIndex].enabled ? getTranslation(config, 'status.online') || 'Online' : getTranslation(config, 'status.offline') || 'Offline'}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (selectedWorkspaceIndex !== null) deleteWorkspace(selectedWorkspaceIndex);
                                                        }}
                                                        className="h-10 w-10 flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-500 rounded-xl border border-red-500/10 hover:border-red-500/20 transition-all duration-300 shrink-0"
                                                        title={getTranslation(config, 'workspaces.confirm_delete') || 'Remove workspace'}
                                                    >
                                                        <Trash2 size={18} strokeWidth={1.5} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* App Grid - Refined 2026 */}
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-black/40 rounded-xl border border-white/5 p-5 pb-4 mb-4 shadow-inner" style={{ maxHeight: 'clamp(260px, 55vh, 640px)' }}>
                                    <div className="flex items-center gap-4 mb-5">
                                        {workspaceFolderPath.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    const newPath = [...workspaceFolderPath];
                                                    newPath.pop();
                                                    setWorkspaceFolderPath(newPath);
                                                }}
                                                className="h-11 px-5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-xl border border-white/5 hover:border-white/20 transition-all duration-300 flex items-center gap-2.5 shrink-0 group/folderback"
                                            >
                                                <CornerUpLeft size={16} className="transition-transform group-hover/folderback:-translate-y-0.5 group-hover/folderback:-translate-x-0.5" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.15em]">{getTranslation(config, 'menu.back') || 'Back'}</span>
                                            </button>
                                        )}
                                        <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] px-1">
                                            {workspaceFolderPath.length === 0 ? getTranslation(config, 'workspaces.root_cluster') || 'Root Cluster' : null}
                                        </div>
                                    </div>

                                    {getCurrentLevel(config.workspaces[selectedWorkspaceIndex!].apps, workspaceFolderPath).length === 0 ? (
                                        <div className="h-4/5 flex flex-col items-center justify-center text-white/10 animate-pulse">
                                            <Box size={64} strokeWidth={0.5} className="mb-6" />
                                            <p className="text-xl font-bold tracking-tight text-white/20">{getTranslation(config, 'workspaces.no_shortcuts') || 'Sem Atalhos'}</p>
                                            <p className="text-xs uppercase tracking-[0.2em] opacity-30">{getTranslation(config, 'workspaces.add_modules_hint') || 'Adicione módulos abaixo'}</p>
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
                                                    isDragOver={dragOverApp === i}
                                                    selectedWorkspaceIndex={selectedWorkspaceIndex}
                                                    workspaceFolderPath={workspaceFolderPath}
                                                    reorderAppsInWorkspace={reorderAppsInWorkspace}
                                                    setEditingApp={setEditingApp}
                                                    removeAppFromWorkspace={removeAppFromWorkspace}
                                                    setWorkspaceFolderPath={setWorkspaceFolderPath}
                                                    config={config}
                                                />
                                            ))}
                                                    </div>
                                                )}
                                </div>

                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Unified Global Fixed Action Bar - always visible at bottom */}
            <div className="py-4 flex justify-center flex-shrink-0 border-t border-white/[0.04] bg-[#0A0A0A]/80 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] backdrop-blur-3xl rounded-full border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-[50] ring-1 ring-white/5">
                    {selectedWorkspaceIndex === null ? (
                        <button
                            onClick={createWorkspace}
                            className="h-12 pl-4 pr-7 bg-white/[0.9] hover:bg-white text-black rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-3 shadow-2xl hover:scale-[1.02] active:scale-[0.98] duration-300 group"
                            title={getTranslation(config, 'workspaces.deploy_new_app_module') || 'Deploy new Workspace Matrix'}
                        >
                            <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                                <Plus size={20} strokeWidth={3} />
                            </div>
                            <span>{getTranslation(config, 'workspaces.new_workspace') || 'Novo Espaço'}</span>
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => handleAddApp('app')}
                                className="h-11 pl-4 pr-6 bg-white/[0.9] hover:bg-white text-black rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 shadow-lg hover:scale-[1.02] active:scale-[0.98] duration-300"
                                title={getTranslation(config, 'workspaces.deploy_new_app_module')}
                            >
                                <div className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                                    <Plus size={18} strokeWidth={3} />
                                </div>
                                <span>{getTranslation(config, 'workspaces.add_shortcut')}</span>
                            </button>
                            <button
                                onClick={() => handleAddApp('folder')}
                                className="h-11 pl-4 pr-6 bg-white/[0.05] hover:bg-white/[0.1] text-white/90 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2.5 border border-white/5 hover:border-white/10 duration-300"
                                title={getTranslation(config, 'workspaces.create_new_directory')}
                            >
                                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                                    <FolderPlus size={18} strokeWidth={2} />
                                </div>
                                <span>{getTranslation(config, 'workspaces.create_group')}</span>
                            </button>
                        </>
                    )}
                </div>
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
    onLogout: () => void;
    isPage?: boolean;
}

const ShortcutRecorderField: React.FC<{
    value: string;
    onRecord: (shortcut: string) => void;
    label: string;
    config: UIConfig;
}> = ({ value, onRecord, label, config }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [pendingShortcut, setPendingShortcut] = useState<string | null>(null);
    const inputRef = useRef<HTMLDivElement>(null);

    const startRecording = () => {
        setPendingShortcut(null);
        setIsRecording(true);
        if (window.electron?.startShortcutRecording) {
            window.electron.startShortcutRecording();
        }
        if (window.electron?.pauseGlobalShortcut) {
            window.electron.pauseGlobalShortcut();
        }
        inputRef.current?.focus();
    };

    const stopRecording = (shouldCleanup = true) => {
        setIsRecording(false);
        if (shouldCleanup) {
            if (window.electron?.stopShortcutRecording) {
                window.electron.stopShortcutRecording();
            }
            if (window.electron?.resumeGlobalShortcut) {
                window.electron.resumeGlobalShortcut();
            }
        }
    };

    const handleConfirm = () => {
        if (pendingShortcut) {
            onRecord(pendingShortcut);
            setPendingShortcut(null);
        }
        stopRecording();
    };

    const handleReset = () => {
        setPendingShortcut(null);
        startRecording();
    };

    useEffect(() => {
        if (isRecording && window.electron?.onShortcutRecorded) {
            const cleanup = window.electron.onShortcutRecorded((shortcut) => {
                setPendingShortcut(shortcut);
                setIsRecording(false);
            });
            return cleanup;
        }
    }, [isRecording]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // We still prevent default to avoid some browser behaviors,
        // but the actual recording is handled by the global listener.
        if (isRecording) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') {
                stopRecording();
            }
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1">{label}</label>
            <div className="flex gap-3">
                <div
                    ref={inputRef}
                    tabIndex={0}
                    onFocus={startRecording}
                    onBlur={() => !pendingShortcut && stopRecording()}
                    onKeyDown={handleKeyDown}
                    className={`flex-1 min-h-[64px] rounded-xl border flex items-center justify-center font-mono text-sm tracking-widest transition-all duration-300 outline-none cursor-pointer group relative overflow-hidden ${isRecording
                        ? 'bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                        : pendingShortcut
                            ? 'bg-white/5 border-white/30'
                            : 'bg-black/40 border-white/10 hover:border-white/20 focus:border-white/40'
                        }`}
                >
                    <AnimatePresence mode="wait">
                        {pendingShortcut ? (
                            <motion.div
                                key="pending"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center gap-2 py-2"
                            >
                                <span className="text-white font-bold text-lg tracking-[0.2em]">{pendingShortcut}</span>
                                <div className="flex gap-4">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                                        className="text-[10px] font-black text-green-500 hover:text-green-400 uppercase tracking-widest px-3 py-1.5 bg-green-500/10 rounded-lg border border-green-500/20 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Check size={12} strokeWidth={3} />
                                        {getTranslation(config, 'action.save') || 'CONFIRMAR'}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleReset(); }}
                                        className="text-[10px] font-black text-white/40 hover:text-white/60 uppercase tracking-widest px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <RotateCcw size={12} strokeWidth={3} />
                                        {getTranslation(config, 'reset.button_label') || 'REPETIR'}
                                    </button>
                                </div>
                            </motion.div>
                        ) : isRecording ? (
                            <motion.div
                                key="recording"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.1 }}
                                className="flex items-center gap-2 text-red-500 font-bold"
                            >
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                {getTranslation(config, 'interface.recording') || 'PRESS KEYS...'}
                            </motion.div>
                        ) : (
                            <motion.span
                                key="value"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-white/60 group-hover:text-white transition-colors"
                            >
                                {value || 'NONE'}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>
                <button
                    onClick={() => inputRef.current?.focus()}
                    className={`px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 border ${isRecording
                        ? 'bg-red-500 border-red-500 text-white animate-pulse'
                        : 'bg-white text-black border-white hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]'
                        }`}
                >
                    {isRecording ? 'REC' : (getTranslation(config, 'interface.record') || 'RECORD')}
                </button>
            </div>
        </div>
    );
};

type SettingsTab = 'apps' | 'zenith_apps' | 'workspaces' | 'interface' | 'visuals' | 'widgets' | 'gamemode' | 'user' | 'dashboard';

const InterfaceTab = React.memo((props: {
    config: UIConfig,
    setConfig: (c: any) => void,
    handleCenterTypeChange: (type: any) => void,
    handleCenterTargetChange: (target: string, type: string) => void,
    setAppSelectorMode: (mode: any) => void,
    setShowAppSelector: (show: boolean) => void
}) => {
    const { config, setConfig, handleCenterTypeChange, handleCenterTargetChange, setAppSelectorMode, setShowAppSelector } = props;
    return (
        <motion.div
            className="pt-20 overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'settings.interface_title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'settings.interface_desc')}
                    </p>
                </motion.div>

                <div className="space-y-5">
                    {/* GLOBAL SHORTCUT - Refined 2026 */}
                    <motion.div
                        className="space-y-4 bg-white/[0.04] border border-white/[0.08] p-5 rounded-xl hover:bg-white/[0.06] transition-colors duration-500"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                    >
                        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-6">
                            <ShortcutRecorderField
                                label={getTranslation(config, 'interface.global_shortcut') || 'Global Shortcut'}
                                value={config.globalShortcut || 'Alt+Space'}
                                config={config}
                                onRecord={(shortcut) => setConfig(prev => ({ ...prev, globalShortcut: shortcut }))}
                            />
                        </div>
                    </motion.div>

                    {/* SYSTEM STARTUP - Refined 2026 */}
                    <motion.div
                        className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] flex items-center justify-between hover:bg-white/[0.07] transition-all duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.25 }}
                    >
                        <div className="relative z-10">
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-0.5">{getTranslation(config, 'interface.system_integration')}</label>
                            <h4 className="text-[13px] font-medium text-white">{getTranslation(config, 'interface.autostart')}</h4>
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

                    {/* MOUSE TRIGGER - New 2026 */}
                    <motion.div
                        className="p-5 rounded-xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] flex items-center justify-between hover:bg-white/[0.07] transition-all duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.28 }}
                    >
                        <div className="relative z-10">
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-0.5">{getTranslation(config, 'interface.somatic_input')}</label>
                            <h4 className="text-[13px] font-medium text-white">{getTranslation(config, 'interface.mouse_trigger')}</h4>
                        </div>
                        <motion.button
                            onClick={() => {
                                const newValue = !config.enableMouseTrigger;
                                setConfig({ ...config, enableMouseTrigger: newValue });
                                if (window.electron && window.electron.setSettings) {
                                    window.electron.setSettings({ ...config, enableMouseTrigger: newValue });
                                }
                            }}
                            className={`relative w-16 h-10 rounded-2xl transition-all duration-500 p-1.5 shadow-lg ${config.enableMouseTrigger ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <motion.div
                                className={`w-7 h-7 rounded-[0.8rem] shadow-xl ${config.enableMouseTrigger ? 'bg-black' : 'bg-white/20'}`}
                                animate={{ x: config.enableMouseTrigger ? 26 : 0 }}
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
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-4">{getTranslation(config, 'interface.center_button_func')}</label>
                            <h4 className="text-sm font-medium text-white tracking-tight">{getTranslation(config, 'interface.neural_center')}</h4>
                        </div>

                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
                            {(['app', 'widget', 'command', 'none', 'cancel'] as const).map(mode => (
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
                                            <div className="flex-1 text-sm text-white/40 italic pl-1">{getTranslation(config, 'status.no_app_selected')}</div>
                                        )}
                                        <button
                                            onClick={() => {
                                                setAppSelectorMode('center');
                                                setShowAppSelector(true);
                                            }}
                                            className="px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:scale-105 transition-transform shadow-lg"
                                        >
                                            {getTranslation(config, 'action.select_app')}
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
                                        <option value="" disabled className="bg-[#111] text-white/50">{getTranslation(config, 'interface.select_module')}</option>
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
                                    <div className="space-y-6">
                                        <ShortcutRecorderField
                                            label={getTranslation(config, 'interface.shortcut_center') || 'Neural Shortcut'}
                                            value={config.centerButton.target.startsWith('shortcut:') ? config.centerButton.target.replace('shortcut:', '') : 'NONE'}
                                            config={config}
                                            onRecord={(shortcut) => setConfig(prev => ({
                                                ...prev,
                                                centerButton: {
                                                    ...prev.centerButton,
                                                    target: `shortcut:${shortcut}`,
                                                    label: shortcut
                                                }
                                            }))}
                                        />
                                        <div>
                                            <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] ml-1 block mb-2">{getTranslation(config, 'interface.button_label')}</label>
                                            <input
                                                type="text"
                                                value={config.centerButton.label}
                                                onChange={(e) => setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, label: e.target.value } }))}
                                                placeholder={getTranslation(config, 'interface.button_label_placeholder')}
                                                maxLength={10}
                                                className="w-full h-12 bg-white/5 border border-white/10 rounded-xl px-5 text-sm text-white focus:border-white/30 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
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
                                <label className="text-sm font-normal text-white">{getTranslation(config, 'interface.center_screen')}</label>
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

                    {/* LANGUAGE SELECTION - Professional Dropdown Redesign 2026 */}
                    <motion.div
                        className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-6 hover:bg-white/[0.03] transition-all duration-500 overflow-hidden relative group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-white/[0.04] transition-colors duration-700" />

                        <div className="flex items-center gap-4 mb-8 relative z-10">
                            <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                <Globe size={22} strokeWidth={1.5} />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-white/20 uppercase tracking-[0.25em] block mb-0.5">{getTranslation(config, 'interface.language_selection')}</label>
                                <h4 className="text-sm font-semibold text-white/90 tracking-tight">{getTranslation(config, 'interface.language_desc')}</h4>
                            </div>
                        </div>

                        <div className="relative z-10">
                            <div className="relative">
                                <select
                                    value={config.language || 'pt'}
                                    onChange={(e) => setConfig({ ...config, language: e.target.value as any })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white focus:border-white/30 outline-none hover:bg-black/60 transition-all cursor-pointer appearance-none pr-12 font-medium"
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.code} value={lang.code} className="bg-[#111] text-white py-2">
                                            {lang.nativeName} ({lang.name})
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                                    <ChevronDown size={18} />
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                {LANGUAGES.map((lang) => (
                                    <button
                                        key={lang.code}
                                        onClick={() => setConfig({ ...config, language: lang.code })}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${config.language === lang.code
                                            ? 'bg-white text-black border-white shadow-lg scale-105'
                                            : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10 hover:text-white/60'
                                            }`}
                                    >
                                        {lang.code}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    <div className="h-24" />
                </div>
            </div>
        </motion.div>
    );
});

const HUDTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'settings.hud_title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'settings.hud_desc')}
                    </p>
                </motion.div>

                <div className="space-y-4">
                    {/* CLOCK & DATE - Refined 2026 */}
                    <motion.div
                        className="bg-white/[0.015] border border-white/5 rounded-xl p-5 hover:bg-white/[0.03] transition-colors duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/10 transition-all duration-500">
                                <Clock size={24} strokeWidth={1} />
                            </div>
                            <div>
                                <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.2em] block ml-0.5 mb-0.5">{getTranslation(config, 'hud.temporal_module')}</label>
                                <h4 className="text-sm font-medium text-white/90 tracking-tight">{getTranslation(config, 'hud.time_flow')}</h4>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/[0.02]">
                                <div className="text-[13px] font-medium text-white/80">{getTranslation(config, 'hud.chronometer')}</div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showClock: !config.showClock })}
                                    className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 shadow-lg ${config.showClock ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-5 h-5 rounded-lg shadow-lg ${config.showClock ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showClock ? 24 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/[0.02]">
                                <div className="text-[13px] font-medium text-white/80">{getTranslation(config, 'hud.calendar')}</div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showDate: !config.showDate })}
                                    className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 shadow-lg ${config.showDate ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-5 h-5 rounded-lg shadow-lg ${config.showDate ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showDate ? 24 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        className="bg-white/[0.01] border border-white/5 rounded-xl p-6 hover:bg-white/[0.02] transition-colors duration-500 group"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center text-white/40 group-hover:text-white/60 transition-all duration-500">
                                <Monitor size={26} strokeWidth={1} />
                            </div>
                            <div>
                                <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.2em] block ml-0.5 mb-1">{getTranslation(config, 'hud.vital_metrics')}</label>
                                <h4 className="text-sm font-medium text-white/90 tracking-tight">{getTranslation(config, 'hud.system_awareness')}</h4>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/[0.02]">
                                <div className="text-[13px] font-medium text-white/80">{getTranslation(config, 'hud.energy_status')}</div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showBattery: !config.showBattery })}
                                    className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 shadow-lg ${config.showBattery ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-5 h-5 rounded-lg shadow-lg ${config.showBattery ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showBattery ? 24 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                                </motion.button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/[0.02]">
                                <div className="text-[13px] font-medium text-white/80">{getTranslation(config, 'hud.ambient_intel')}</div>
                                <motion.button
                                    onClick={() => setConfig({ ...config, showWeather: !config.showWeather })}
                                    className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 shadow-lg ${config.showWeather ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <motion.div className={`w-5 h-5 rounded-lg shadow-lg ${config.showWeather ? 'bg-black' : 'bg-white/20'}`} animate={{ x: config.showWeather ? 24 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />
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
                                        <label className="text-[9px] font-medium text-white/20 uppercase tracking-[0.1em] ml-1">{getTranslation(config, 'hud.location_id')}</label>
                                        <input
                                            type="text"
                                            value={config.weatherLocation || ''}
                                            onChange={(e) => setConfig({ ...config, weatherLocation: e.target.value })}
                                            placeholder={getTranslation(config, 'hud.location_placeholder')}
                                            className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-3 text-sm text-white/80 focus:border-white/20 outline-none hover:bg-black/60 transition-all font-mono"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    <motion.div
                        className="bg-white/[0.015] border border-white/5 rounded-xl p-6"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.3em] block ml-1 mb-6">{getTranslation(config, 'hud.spatial_quadrant')}</label>
                        <div className="grid grid-cols-2 gap-3">
                            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                                <button
                                    key={pos}
                                    onClick={() => setConfig({ ...config, clockPosition: pos as any })}
                                    className={`py-4 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all duration-500 ${config.clockPosition === pos
                                        ? 'bg-white text-black border-white shadow-xl translate-y-[-1px]'
                                        : 'bg-black/40 border-white/5 text-white/30 hover:border-white/10 hover:text-white/60'}`}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${config.clockPosition === pos ? 'bg-black scale-125' : 'bg-white/10'}`} />
                                    <span className="font-medium text-[9px] uppercase tracking-[0.2em]">
                                        {getTranslation(config, `hud.quadrant_${pos.replace('-', '_')}`)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
});

/** Process token for game-mode blocking (substring match vs tasklist on Windows). */
function exeTokenForGameModeBlock(rawPath: string): string | null {
    const path = rawPath.trim();
    if (!path || /^https?:\/\//i.test(path)) return null;
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const base = parts[parts.length - 1] || path;
    const b = base.trim().toLowerCase();
    if (!b) return null;
    if (b.endsWith('.exe') || b.endsWith('.msc')) return b;
    if (b.includes('.')) return b;
    return `${b}.exe`;
}

const GameModeTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    const [gameBlockPickerOpen, setGameBlockPickerOpen] = useState(false);

    const blockedTokens = useMemo(
        () =>
            (config.gameMode?.blockedApps || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        [config.gameMode?.blockedApps],
    );

    const setBlockedAppsList = (tokens: string[]) => {
        setConfig({
            ...config,
            gameMode: { ...config.gameMode, blockedApps: tokens.join(', ') },
        });
    };

    const addBlockedToken = (token: string) => {
        const t = token.toLowerCase();
        if (!t) return;
        if (blockedTokens.some((x) => x.toLowerCase() === t)) return;
        setBlockedAppsList([...blockedTokens, t]);
    };

    const removeBlockedToken = (token: string) => {
        setBlockedAppsList(blockedTokens.filter((x) => x !== token));
    };

    const onBlockedAppSelected = (app: { name: string; path: string; type?: 'app' | 'url' | 'folder' }) => {
        setGameBlockPickerOpen(false);
        if (app.type === 'url' || app.type === 'folder') return;
        const token = exeTokenForGameModeBlock(app.path);
        if (!token) return;
        addBlockedToken(token);
    };

    return (
        <motion.div
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'settings.gamemode_title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'settings.gamemode_desc')}
                    </p>
                </motion.div>

                <div className="space-y-10">
                    <motion.div
                        className={`p-6 rounded-xl border flex items-center justify-between relative overflow-hidden group transition-all duration-700 ${config.gameMode?.enabled
                            ? 'bg-white/[0.03] border-white/10'
                            : 'bg-white/[0.01] border-white/5'
                            }`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        <div className="relative z-10">
                            <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.3em] block ml-0.5 mb-1.5">{getTranslation(config, 'gamemode.operational_logic')}</label>
                            <h4 className="text-base font-medium text-white/90 tracking-tight">{getTranslation(config, 'gamemode.stealth_mode')}</h4>
                        </div>

                        <button
                            onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, enabled: !config.gameMode?.enabled } })}
                            className={`relative w-14 h-8 rounded-xl transition-all duration-500 p-1.5 ${config.gameMode?.enabled ? 'bg-white' : 'bg-white/5 border border-white/10'}`}
                        >
                            <motion.div
                                className={`w-5 h-5 rounded-lg shadow-xl ${config.gameMode?.enabled ? 'bg-black' : 'bg-white/20'}`}
                                animate={{ x: config.gameMode?.enabled ? 24 : 0 }}
                                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            />
                        </button>
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
                                        <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.3em] block ml-0.5 mb-5">{getTranslation(config, 'gamemode.isolation_strategy')}</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'all' } })}
                                                className={`py-6 rounded-xl border flex flex-col items-center justify-center gap-4 transition-all duration-500 ${config.gameMode?.mode === 'all'
                                                    ? 'bg-white text-black border-white shadow-xl translate-y-[-1px]'
                                                    : 'bg-black/40 border-white/5 text-white/30 hover:border-white/10 hover:text-white/60'}`}
                                            >
                                                <Ban size={22} strokeWidth={1} />
                                                <div className="text-center">
                                                    <div className="font-medium text-xs uppercase tracking-[0.1em]">{getTranslation(config, 'gamemode.always_absolute')}</div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'list' } })}
                                                className={`py-6 rounded-xl border flex flex-col items-center justify-center gap-4 transition-all duration-500 ${config.gameMode?.mode === 'list'
                                                    ? 'bg-white text-black border-white shadow-xl translate-y-[-1px]'
                                                    : 'bg-black/40 border-white/5 text-white/30 hover:border-white/10 hover:text-white/60'}`}
                                            >
                                                <Hash size={22} strokeWidth={1} />
                                                <div className="text-center">
                                                    <div className="font-medium text-xs uppercase tracking-[0.1em]">{getTranslation(config, 'gamemode.targeted_list')}</div>
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
                                                <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.15em] ml-1">{getTranslation(config, 'gamemode.blocking_rules')}</label>
                                                <button
                                                    onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, blockFullscreen: !config.gameMode?.blockFullscreen } })}
                                                    className={`text-[10px] font-semibold uppercase tracking-widest px-4 py-2 rounded-lg transition-all border ${config.gameMode?.blockFullscreen ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-white/20'}`}
                                                >
                                                    {getTranslation(config, 'gamemode.detect_fullscreen')}: {config.gameMode?.blockFullscreen ? getTranslation(config, 'gamemode.on') : getTranslation(config, 'gamemode.off')}
                                                </button>
                                            </div>

                                            {!config.gameMode?.blockFullscreen && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="mt-6 pt-6 border-t border-white/5 space-y-3"
                                                >
                                                    <label className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.2em] block ml-1">{getTranslation(config, 'gamemode.process_list')}</label>
                                                    <p className="text-[11px] text-white/30 leading-relaxed ml-1 mb-3">
                                                        {getTranslation(config, 'gamemode.block_list_hint')}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 min-h-[2.25rem] items-start">
                                                        {blockedTokens.length === 0 ? (
                                                            <span className="text-xs text-white/25 py-1">{getTranslation(config, 'gamemode.no_blocked_apps')}</span>
                                                        ) : (
                                                            blockedTokens.map((token) => (
                                                                <span
                                                                    key={token}
                                                                    className="inline-flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-lg bg-black/50 border border-white/10 text-[11px] font-mono text-white/85"
                                                                >
                                                                    {token}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeBlockedToken(token)}
                                                                        className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                                                        aria-label={getTranslation(config, 'action.remove') || 'Remove'}
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </span>
                                                            ))
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setGameBlockPickerOpen(true)}
                                                        className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/10 text-[12px] font-semibold text-white/90 transition-colors"
                                                    >
                                                        <Plus size={16} strokeWidth={2.5} />
                                                        {getTranslation(config, 'gamemode.add_blocked_app')}
                                                    </button>
                                                    <AppSelector
                                                        isOpen={gameBlockPickerOpen}
                                                        onClose={() => setGameBlockPickerOpen(false)}
                                                        onAppSelect={onBlockedAppSelected}
                                                        appsOnly
                                                        title={getTranslation(config, 'gamemode.pick_app_title')}
                                                        subtitle={getTranslation(config, 'gamemode.pick_app_subtitle')}
                                                    />
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

const UserTab = React.memo(({
    user,
    config,
    handleExport,
    handleImport,
    isExporting,
    isImporting,
    status,
    onLogout
}: {
    user: UserProfile | null,
    config: UIConfig,
    handleExport: () => void,
    handleImport: () => void,
    isExporting: boolean,
    isImporting: boolean,
    status: { type: 'success' | 'error', message: string } | null,
    onLogout: () => void
}) => {
    return (
        <motion.div
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-3xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-10 text-center sm:text-left"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'user.profile_title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'user.profile_desc')}
                    </p>
                </motion.div>

                <div className="space-y-6">
                    {/* 1. Identity & Subscription */}
                    <motion.div
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden shadow-xl relative"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        {/* Glow effect */}
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/[0.015] rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />

                        {/* Top: Identity */}
                        <div className="p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6 relative z-10">
                            <div className="relative group">
                                <div className="w-20 h-20 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden shadow-xl transition-all duration-300 group-hover:border-white/30">
                                    {user?.avatarUrl ? (
                                        <img src={user.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
                                    ) : (
                                        <div className="text-3xl font-semibold text-white/20 uppercase tracking-widest">{user?.name?.substring(0, 2) || 'ZN'}</div>
                                    )}
                                </div>
                                <button className="absolute bottom-0 right-0 w-7 h-7 bg-[#222] border border-white/10 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:text-black hover:scale-105 active:scale-95 transition-all">
                                    <Edit3 size={12} strokeWidth={2.5} />
                                </button>
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h4 className="text-2xl font-bold text-white tracking-tight leading-none mb-2">{user?.name || 'Zenith User'}</h4>
                                <p className="text-[13px] text-white/40 font-medium tracking-wide">{user?.email || 'unlinked_identity@zenith.os'}</p>
                            </div>
                            <div className="sm:ml-auto self-center">
                                {user?.isAdmin && (
                                    <div className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-bold tracking-[0.2em] uppercase">
                                        {getTranslation(config, 'user.admin_badge')}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom: Subscription */}
                        <div className="px-6 md:px-8 py-5 border-t border-white/[0.04] bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                            <div className="text-center sm:text-left">
                                <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1.5">
                                    Plano Atual
                                </div>
                                <div className="flex items-center justify-center sm:justify-start gap-2">
                                    <span className="text-[15px] font-semibold text-white/90">
                                        {user?.isPremium ? getTranslation(config, 'user.zenith_pro') : getTranslation(config, 'user.free_plan')}
                                    </span>
                                    {user?.isPremium && <Zap size={14} className="text-yellow-400" />}
                                </div>
                            </div>
                            <button className="px-5 py-2.5 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-white/90 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                {user?.isPremium ? 'Gerenciar Assinatura' : 'Fazer Upgrade'}
                            </button>
                        </div>
                    </motion.div>

                    {/* 2. Preferences / Settings Grp */}
                    <motion.div
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden shadow-lg"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <div className="px-6 py-4 border-b border-white/[0.04] bg-white/[0.01]">
                            <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Sistemas Ativos</h4>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
                                        <Zap size={16} className="text-white/40" />
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-semibold text-white/90">{getTranslation(config, 'user.high_priority')}</div>
                                        <div className="text-[11px] text-white/40 font-medium tracking-wide mt-0.5">{getTranslation(config, 'user.performance')}</div>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-green-400/80 uppercase tracking-widest">Online</span>
                            </div>
                            <div className="flex items-center justify-between px-6 py-5 hover:bg-white/[0.01] transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
                                        <Globe size={16} className="text-white/40" />
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-semibold text-white/90">{getTranslation(config, 'user.local_kernel')}</div>
                                        <div className="text-[11px] text-white/40 font-medium tracking-wide mt-0.5">{getTranslation(config, 'user.server')}</div>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-green-400/80 uppercase tracking-widest">Online</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* 3. Security & Backup */}
                    <motion.div
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden shadow-lg"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 }}
                    >
                         <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-5 border-b border-white/[0.04] bg-white/[0.01] gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
                                    <Lock size={16} className="text-white/40" />
                                </div>
                                <div>
                                    <div className="text-[13px] font-semibold text-white/90">{getTranslation(config, 'user.access_security')}</div>
                                    <div className="text-[11px] text-white/40 font-medium tracking-wide mt-0.5">{getTranslation(config, 'user.authentication')}</div>
                                </div>
                            </div>
                            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                                {getTranslation(config, 'user.manage_credentials')}
                            </button>
                        </div>
                        <div className="px-6 py-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center">
                                        <Download size={16} className="text-white/40" />
                                    </div>
                                    <div>
                                        <div className="text-[13px] font-semibold text-white/90">{getTranslation(config, 'user.backup_title')}</div>
                                        <div className="text-[11px] text-white/40 font-medium tracking-wide mt-0.5">{getTranslation(config, 'user.security_data')}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2.5">
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className="px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                                    >
                                        {isExporting ? '...' : getTranslation(config, 'user.export_btn')}
                                    </button>
                                    <button
                                        onClick={handleImport}
                                        disabled={isImporting}
                                        className="px-4 py-2.5 bg-white/[0.04] border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
                                    >
                                        {isImporting ? '...' : getTranslation(config, 'user.import_btn')}
                                    </button>
                                </div>
                            </div>
                            {status && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className={`mt-4 pt-3 border-t border-white/[0.02] text-[11px] font-medium text-center ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}
                                >
                                    {status.message}
                                </motion.div>
                            )}
                        </div>
                    </motion.div>

                    {/* 4. Account Actions */}
                    <motion.div
                        className="bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden mt-8 shadow-lg"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="flex items-center justify-between px-6 py-5 hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={onLogout}>
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center group-hover:bg-white/5 transition-colors">
                                    <LogOut size={16} className="text-white/40 group-hover:text-white/80 transition-colors" />
                                </div>
                                <div className="text-[13px] font-semibold text-white/90 group-hover:text-white transition-colors">
                                    {getTranslation(config, 'user.sign_out') || 'Sign Out'}
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-white/20 group-hover:text-white/50 transition-colors" />
                        </div>
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
    setActiveTab,
    isCompact
}: {
    tab: SettingsTab,
    label: string,
    icon: any,
    isSidebarExpanded: boolean,
    activeTab: SettingsTab,
    setActiveTab: (tab: SettingsTab) => void,
    isCompact?: boolean
}) => {
    const isActive = activeTab === tab;

    if (isCompact) {
        return (
            <button
                onClick={() => setActiveTab(tab)}
                className={`
                    w-full flex items-center justify-center py-3 rounded-xl
                    transition-all duration-300 relative group
                    ${isActive ? 'text-white' : 'text-white/40 hover:text-white/60'}
                `}
            >
                {isActive && (
                    <motion.div
                        layoutId="active-indicator-compact"
                        className="absolute inset-x-2 inset-y-1 bg-white/[0.08] border border-white/10 rounded-xl shadow-[inset_0_0_12px_rgba(255,255,255,0.02)]"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                )}
                <div className="relative z-10 flex items-center justify-center">
                    <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
            </button>
        );
    }

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

type SearchResult = {
    id: string;
    type: 'setting' | 'workspace' | 'app';
    label: string;
    description?: string;
    tab: SettingsTab;
    icon: any;
    workspaceIndex?: number;
    appIndex?: number;
    path?: number[];
};

const SEARCHABLE_SETTINGS: Omit<SearchResult, 'id'>[] = [
    { type: 'setting', label: 'interface.global_shortcut', description: 'interface.activation_matrix', tab: 'interface', icon: Keyboard },
    { type: 'setting', label: 'interface.autostart', description: 'interface.system_integration', tab: 'interface', icon: Zap },
    { type: 'setting', label: 'interface.mouse_trigger', description: 'interface.somatic_input', tab: 'interface', icon: MousePointer2 },
    { type: 'setting', label: 'interface.center_button_func', description: 'interface.neural_center', tab: 'interface', icon: Box },
    { type: 'setting', label: 'interface.center_screen', description: 'interface.neural_center', tab: 'interface', icon: Layout },
    { type: 'setting', label: 'visuals.glass_effect', description: 'visuals.transparency', tab: 'visuals', icon: Palette },
    { type: 'setting', label: 'visuals.transparency', description: 'visuals.blur_radius', tab: 'visuals', icon: ImageIcon },
    { type: 'setting', label: 'visuals.visual_rhythm', description: 'visuals.spacing', tab: 'visuals', icon: Layout },
    { type: 'setting', label: 'hud.temporal_module', description: 'hud.time_flow', tab: 'widgets', icon: Clock },
    { type: 'setting', label: 'gamemode.operational_logic', description: 'gamemode.blocking_rules', tab: 'gamemode', icon: Gamepad2 },
    { type: 'setting', label: 'user.profile_title', description: 'user.profile_desc', tab: 'user', icon: User },
];

const SearchResultsView = React.memo(({
    results,
    onResultClick,
    config
}: {
    results: SearchResult[],
    onResultClick: (result: SearchResult) => void,
    config: UIConfig
}) => {
    return (
        <motion.div
            className="pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12 pb-20">
                <div className="flex items-center justify-between mb-12">
                    <div>
                        <h3 className="text-2xl font-semibold text-white mb-2 tracking-tight">{getTranslation(config, 'search.index') || 'Search Index'}</h3>
                        <p className="text-xs text-white/30 font-medium uppercase tracking-[0.2em]">{getTranslation(config, 'search.match_results') || 'Neural Match Results'}</p>
                    </div>
                    <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/40 font-bold uppercase tracking-widest">
                        {results.length} {getTranslation(config, 'status.matches_found') || 'Matches found'}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.map((result, idx) => {
                        const Icon = result.icon;
                        return (
                            <motion.button
                                key={result.id}
                                onClick={() => onResultClick(result)}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="group p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/20 transition-all duration-300 flex items-center gap-4 text-left relative overflow-hidden active:scale-[0.98]"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-white/30 group-hover:text-white group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative z-10 shrink-0">
                                    <Icon size={32} strokeWidth={1.5} />
                                </div>

                                <div className="flex-1 min-w-0 relative z-10">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">
                                            {getTranslation(config, `workspaces.${result.type}`) || result.type}
                                        </span>
                                        <span className="text-[10px] text-white/10">•</span>
                                        <span className="text-[9px] font-bold text-white/30 uppercase tracking-tight truncate">
                                            {getTranslation(config, `tabs.${result.tab}`) || result.tab.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="text-base font-medium text-white group-hover:translate-x-1 transition-transform duration-300">
                                        {result.type === 'setting' ? (getTranslation(config, result.label) || result.label) : result.label}
                                    </div>
                                    {result.description && (
                                        <div className="text-[11px] text-white/20 truncate mt-0.5 group-hover:text-white/40 transition-colors">
                                            {result.type === 'setting' ? (getTranslation(config, result.description) || result.description) : result.description}
                                        </div>
                                    )}
                                </div>

                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white/0 group-hover:text-white/20 transition-all relative z-10 group-hover:translate-x-1">
                                    <ChevronRight size={18} />
                                </div>
                            </motion.button>
                        );
                    })}
                </div>

                {results.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-32 text-center"
                    >
                        <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center text-white/5 mb-6">
                            <Search size={40} strokeWidth={1} />
                        </div>
                        <h4 className="text-lg font-medium text-white/40 mb-2">{getTranslation(config, 'status.no_matches') || 'No matches found in the matrix'}</h4>
                        <p className="text-xs text-white/20 uppercase tracking-[0.2em]">{getTranslation(config, 'status.try_broadening') || 'Try broadening your temporal search parameters'}</p>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
});

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, apps, setApps, config, setConfig, onReset, onOpenDashboard, user, onLogout, isPage = false
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
    // --- CONFIRMATION DIALOG STATE ---
    type ConfirmAction = 'reset' | 'delete_workspace' | 'delete_app' | 'warning';
    const [confirmDialog, setConfirmDialog] = useState<{
        type: ConfirmAction;
        title: string;
        description: string;
        confirmLabel: string;
        cancelLabel: string;
        onConfirm: () => void;
        variant?: 'danger' | 'warning' | 'info';
    } | null>(null);

    const [showAppSelector, setShowAppSelector] = useState(false);
    const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState<number | null>(null);
    const [workspaceFolderPath, setWorkspaceFolderPath] = useState<number[]>([]);
    const [appSelectorMode, setAppSelectorMode] = useState<'edit' | 'center' | 'add'>('edit');
    const [showAppSelectionModal, setShowAppSelectionModal] = useState(false);
    const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<{ workspaceIndex: number, path: number[] } | null>(null);
    const [isSidebarPinned, setIsSidebarPinned] = useState(true);
    const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
    const isSidebarExpanded = (isSidebarPinned || isHoveringSidebar);
    const [isCompact, setIsCompact] = useState(window.innerWidth < 768); // Breakpoint for main settings modal

    // --- BACKUP & RESTORE STATE ---
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleExport = async () => {
        if (!window.electron?.exportConfig) return;
        setIsExporting(true);
        setStatus(null);
        try {
            const result = await window.electron.exportConfig();
            if (result.success) {
                setStatus({ type: 'success', message: getTranslation(config, 'user.backup_success') || 'Backup exported successfully' });
            } else if (result.error) {
                setStatus({ type: 'error', message: result.error });
            }
        } catch (e: any) {
            setStatus({ type: 'error', message: e.message || 'Export failed' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async () => {
        if (!window.electron?.importConfig) return;
        setIsImporting(true);
        setStatus(null);
        try {
            const result = await window.electron.importConfig();
            if (result.success) {
                setStatus({ type: 'success', message: getTranslation(config, 'user.import_success') || 'Backup imported successfully. Zenith will relaunch...' });
            } else if (result.error) {
                setStatus({ type: 'error', message: result.error });
            }
        } catch (e: any) {
            setStatus({ type: 'error', message: e.message || 'Import failed' });
        } finally {
            setIsImporting(false);
        }
    };

    useEffect(() => {
        const handleResize = () => {
            setIsCompact(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- SHORTCUT RECORDING LOGIC ---
    const [recordingTarget, setRecordingTarget] = useState<'global' | 'center' | null>(null);
    const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

    useEffect(() => {
        if (!recordingTarget) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // Ignore standalone modifiers
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

            const modifiers: string[] = [];
            if (e.ctrlKey) modifiers.push('Ctrl');
            if (e.altKey) modifiers.push('Alt');
            if (e.shiftKey) modifiers.push('Shift');
            if (e.metaKey) modifiers.push('Win');

            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key.length === 1) key = key.toUpperCase();

            const shortcut = [...modifiers, key].join('+');

            if (recordingTarget === 'global') {
                setConfig(prev => ({ ...prev, globalShortcut: shortcut }));
            } else if (recordingTarget === 'center') {
                setConfig(prev => ({
                    ...prev,
                    centerButton: {
                        ...prev.centerButton,
                        target: `shortcut:${shortcut}`,
                        label: shortcut
                    }
                }));
            }
            setRecordingTarget(null);
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [recordingTarget, setConfig]);

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
    const currentFolderName = folderPath.length > 0 ? getCurrentLevel(apps, folderPath.slice(0, -1))[folderPath[folderPath.length - 1]]?.label : (getTranslation(config, 'workspaces.main_menu') || 'Main Menu');

    const filteredIcons = useMemo(() => {
        const term = iconSearchTerm.toLowerCase();
        if (!term) return Object.keys(ICON_MAP).slice(0, 100);
        return Object.keys(ICON_MAP).filter(iconName => iconName.toLowerCase().includes(term)).slice(0, 100);
    }, [iconSearchTerm]);

    const getBestLucideIcon = (name: string, path: string): string => {
        const text = (name + ' ' + path).toLowerCase();
        
        // Browsers
        if (text.includes('chrome') || text.includes('browser') || text.includes('edge') || text.includes('firefox') || text.includes('opera') || text.includes('safari') || text.includes('internet explorer')) return 'Globe';
        
        // Media/Music
        if (text.includes('spotify') || text.includes('music') || text.includes('player') || text.includes('itunes') || text.includes('deezer') || text.includes('tidal')) return 'Music';
        if (text.includes('video') || text.includes('movie') || text.includes('netflix') || text.includes('youtube') || text.includes('vlc') || text.includes('tv') || text.includes('play')) return 'Tv';
        
        // Chat/Communication
        if (text.includes('discord') || text.includes('chat') || text.includes('messenger') || text.includes('whatsapp') || text.includes('telegram') || text.includes('slack') || text.includes('teams') || text.includes('zoom')) return 'MessageSquare';
        if (text.includes('mail') || text.includes('outlook') || text.includes('gmail') || text.includes('postbox')) return 'Mail';

        // Dev/IDE
        if (text.includes('code') || text.includes('visual studio') || text.includes('cursor') || text.includes('intellij') || text.includes('pycharm') || text.includes('sublime') || text.includes('atom') || text.includes('git')) return 'Code2';
        
        // Games
        if (text.includes('steam') || text.includes('game') || text.includes('play') || text.includes('epic') || text.includes('battle.net') || text.includes('origin') || text.includes('ubisoft') || text.includes('riot')) return 'Gamepad2';
        
        // System/Files
        if (text.includes('explorer') || text.includes('folder') || text.includes('arquivos') || (path.includes(':') && !path.includes('.'))) return 'FolderOpen';
        if (text.includes('terminal') || text.includes('cmd') || text.includes('powershell') || text.includes('bash') || text.includes('zsh')) return 'Terminal';
        if (text.includes('setting') || text.includes('config') || text.includes('prefer')) return 'Settings2';
        
        // Productivity
        if (text.includes('calc') || text.includes('matemática')) return 'Calculator';
        if (text.includes('note') || text.includes('text') || text.includes('word') || text.includes('office') || text.includes('pdf') || text.includes('writer') || text.includes('document')) return 'FileText';
        if (text.includes('download')) return 'Download';
        if (text.includes('picture') || text.includes('image')) return 'ImageIcon';
        if (text.includes('camera') || text.includes('photo')) return 'Camera';
        if (text.includes('paint') || text.includes('design') || text.includes('figma') || text.includes('photoshop') || text.includes('illustrator') || text.includes('gimp')) return 'Palette';

        return 'Box'; // Default
    };

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();
        const results: SearchResult[] = [];

        // 1. Search Settings
        SEARCHABLE_SETTINGS.forEach((s, idx) => {
            if (s.label.toLowerCase().includes(term) || s.description?.toLowerCase().includes(term)) {
                results.push({ ...s, id: `setting-${idx}` } as SearchResult);
            }
        });

        // 2. Search Workspaces
        config.workspaces.forEach((ws, wsIdx) => {
            if (ws.name.toLowerCase().includes(term)) {
                results.push({
                    id: `ws-${ws.id}`,
                    type: 'workspace',
                    label: ws.name,
                    description: `Primary Workspace • Hotkey ${ws.hotkey}`,
                    tab: 'workspaces',
                    icon: LayoutGrid,
                    workspaceIndex: wsIdx
                });
            }

            // 3. Search Apps within Workspaces
            const searchInApps = (items: AppItem[], path: number[]) => {
                items.forEach((app, appIdx) => {
                    if (app.label.toLowerCase().includes(term) || app.command.toLowerCase().includes(term)) {
                        results.push({
                            id: `app-${app.id}`,
                            type: 'app',
                            label: app.label,
                            description: `${getTranslation(config, 'workspaces.location') || 'Location'}: ${ws.name}${path.length > 0 ? ` • ${getTranslation(config, 'workspaces.in_folder') || 'In Folder'}` : ''}`,
                            tab: 'workspaces',
                            icon: app.iconSource === 'lucide' ? getIcon(app.iconName) : Box,
                            workspaceIndex: wsIdx,
                            appIndex: appIdx,
                            path: path
                        });
                    }
                    if (app.children) {
                        searchInApps(app.children, [...path, appIdx]);
                    }
                });
            };
            searchInApps(ws.apps, []);
        });

        return results;
    }, [searchTerm, config.workspaces]);

    const handleResultClick = (result: SearchResult) => {
        setActiveTab(result.tab);
        if (result.type === 'workspace' || result.type === 'app') {
            setSelectedWorkspaceIndex(result.workspaceIndex ?? null);
            if (result.path) {
                setWorkspaceFolderPath(result.path);
            } else {
                setWorkspaceFolderPath([]);
            }
        }
        setSearchTerm(''); // Clear search on navigate
    };

    const handlePickCommand = async () => {
        if (!window.electron?.selectFile) return;
        try {
            const filePath = await window.electron.selectFile();
            if (filePath && editingApp) {
                const bestIcon = getBestLucideIcon(filePath.split(/[\\/]/).pop() || 'App', filePath);
                const nativeIconData = await extractIconFromPath(filePath);

                handleAppUpdates({
                    command: filePath,
                    iconName: bestIcon,
                    iconSource: 'native', // Always prefer native
                    ...(nativeIconData || {})
                });
            }
        } catch (e) {
            console.error("Pick Command Error:", e);
        }
    };

    const handlePickFolder = async () => {
        if (!window.electron?.selectFolder) return;
        try {
            const folderPath = await window.electron.selectFolder();
            if (folderPath && editingApp) {
                const bestIcon = getBestLucideIcon(folderPath.split(/[\\/]/).pop() || 'Folder', folderPath);
                const nativeIconData = await extractIconFromPath(folderPath);

                handleAppUpdates({
                    command: folderPath,
                    iconName: bestIcon,
                    iconSource: 'native', // Always prefer native
                    ...(nativeIconData || {})
                });
            }
        } catch (e) {
            console.error("Pick Folder Error:", e);
        }
    };

    const handlePickIcon = async () => {
        if (!window.electron?.selectImage) return;
        try {
            const iconPath = await window.electron.selectImage();
            if (iconPath && editingApp) {
                if (window.electron.removeManagedCustomIcon && editingApp.app.customIconUrl) {
                    await window.electron.removeManagedCustomIcon(editingApp.app.customIconUrl);
                }
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

    const handleAppSelect = async (appData: { name: string; path: string; type?: 'app' | 'url' | 'folder' }) => {
        if (!appData.path || appData.path.trim() === '') {
            setConfirmDialog({
                type: 'warning',
                title: 'Caminho não encontrado',
                description: `Não foi possível localizar o executável para "${appData.name}". Verifique se o app está instalado corretamente.`,
                confirmLabel: 'Entendido',
                cancelLabel: '',
                onConfirm: () => setConfirmDialog(null),
                variant: 'warning'
            });
            return;
        }

        // Handle URL type
        if (appData.type === 'url') {
            const urlIcon =
                websiteIconFieldsFromUrl(appData.path) ??
                ({ iconName: 'Globe' as const, iconSource: 'lucide' as const, customIconUrl: undefined });
            if (appSelectorMode === 'center') {
                setConfig(prev => ({
                    ...prev,
                    centerButton: { ...prev.centerButton, target: appData.path, label: appData.name.toUpperCase().substring(0, 8), iconName: 'Globe' }
                }));
                setShowAppSelector(false);
                return;
            }
            // 'add' mode: create a new item and insert into workspace/app list
            if (appSelectorMode === 'add') {
                const newItem: AppItem = {
                    id: generateId(), type: 'app', label: appData.name,
                    command: appData.path,
                    commandType: 'url', description: 'Web Link',
                    ...urlIcon,
                };
                if (pendingWorkspaceAction) {
                    const { workspaceIndex, path } = pendingWorkspaceAction;
                    setConfig(prev => {
                        const ws = [...prev.workspaces];
                        ws[workspaceIndex] = { ...ws[workspaceIndex], apps: updateAppTree(ws[workspaceIndex].apps, path, (list) => [...list, newItem]) };
                        return { ...prev, workspaces: ws };
                    });
                    setPendingWorkspaceAction(null);
                } else {
                    setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newItem]));
                }
                setShowAppSelector(false);
                return;
            }
            if (!editingApp) return;
            if (editingApp.app.customIconUrl?.startsWith('file:') && window.electron?.removeManagedCustomIcon) {
                void window.electron.removeManagedCustomIcon(editingApp.app.customIconUrl);
            }
            handleAppUpdates({
                command: appData.path,
                label: appData.name,
                commandType: 'url',
                ...urlIcon,
            });
            return;
        }

        // Handle Folder type
        if (appData.type === 'folder') {
            if (appSelectorMode === 'center') {
                setConfig(prev => ({
                    ...prev,
                    centerButton: { ...prev.centerButton, target: appData.path, label: appData.name.toUpperCase().substring(0, 8), iconName: 'Folder' }
                }));
                setShowAppSelector(false);
                return;
            }
            // 'add' mode
            if (appSelectorMode === 'add') {
                const newItem: AppItem = {
                    id: generateId(), type: 'app', label: appData.name,
                    iconName: 'Folder', iconSource: 'lucide', command: appData.path,
                    commandType: 'folder', description: 'Folder Shortcut'
                };
                if (pendingWorkspaceAction) {
                    const { workspaceIndex, path } = pendingWorkspaceAction;
                    setConfig(prev => {
                        const ws = [...prev.workspaces];
                        ws[workspaceIndex] = { ...ws[workspaceIndex], apps: updateAppTree(ws[workspaceIndex].apps, path, (list) => [...list, newItem]) };
                        return { ...prev, workspaces: ws };
                    });
                    setPendingWorkspaceAction(null);
                } else {
                    setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newItem]));
                }
                setShowAppSelector(false);
                return;
            }
            if (!editingApp) return;
            handleAppUpdates({ command: appData.path, label: appData.name, commandType: 'folder', iconName: 'Folder', iconSource: 'lucide' });
            return;
        }

        // Handle App type (default)
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
        // 'add' mode: create and insert a new app item
        if (appSelectorMode === 'add') {
            const nativeIconData = await extractIconFromPath(appData.path);
            const newItem: AppItem = {
                id: generateId(), type: 'app', label: appData.name,
                iconName: bestIcon, iconSource: 'native', command: appData.path,
                commandType: 'app', description: 'Application',
                ...(nativeIconData || {})
            };
            if (pendingWorkspaceAction) {
                const { workspaceIndex, path } = pendingWorkspaceAction;
                setConfig(prev => {
                    const ws = [...prev.workspaces];
                    ws[workspaceIndex] = { ...ws[workspaceIndex], apps: updateAppTree(ws[workspaceIndex].apps, path, (list) => [...list, newItem]) };
                    return { ...prev, workspaces: ws };
                });
                setPendingWorkspaceAction(null);
            } else {
                setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newItem]));
            }
            setShowAppSelector(false);
            return;
        }

        if (!editingApp) return;
        const nativeIconData2 = await extractIconFromPath(appData.path);
        handleAppUpdates({
            command: appData.path,
            label: appData.name,
            commandType: 'app',
            iconName: bestIcon,
            iconSource: 'native',
            ...(nativeIconData2 || {})
        });
    };


    const handleAddApp = (type: 'app' | 'folder') => {
        if (type === 'folder') {
            const newFolder: AppItem = {
                id: generateId(), type: 'folder', label: getTranslation(config, 'action.new_folder') || 'New Folder',
                iconName: 'Folder', iconSource: 'lucide', command: '',
                commandType: 'app', description: getTranslation(config, 'workspaces.folder_group') || 'Folder Group',
                children: []
            };
            if (selectedWorkspaceIndex !== null) {
                addAppToWorkspace(selectedWorkspaceIndex, 'folder', workspaceFolderPath);
            } else {
                setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newFolder]));
            }
        } else {
            // Open the new AppSelector directly — it has built-in tabs for App / URL / Folder
            if (selectedWorkspaceIndex !== null) {
                setPendingWorkspaceAction({ workspaceIndex: selectedWorkspaceIndex, path: workspaceFolderPath });
            }
            setAppSelectorMode('add');
            setShowAppSelector(true);
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

    const handleCenterTypeChange = (type: 'app' | 'widget' | 'command' | 'none' | 'cancel') => {
        const defaults = {
            app: { target: '', label: 'APP', iconName: 'Box' },
            widget: { target: '', label: 'WIDGET', iconName: 'AppWindow' },
            command: { target: '', label: 'TERMINAL', iconName: 'Terminal' },
            none: { target: '', label: '', iconName: 'Circle' },
            cancel: { target: '', label: 'FECHAR', iconName: 'X' }
        };
        setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, type, ...defaults[type as keyof typeof defaults] } }));
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
        if (config.workspaces.length <= 1) {
            setConfirmDialog({
                type: 'warning',
                title: getTranslation(config, 'status.error') || 'Atenção',
                description: 'Não é possível excluir o último workspace. Mantenha pelo menos um grupo de trabalho ativo.',
                confirmLabel: 'Entendido',
                cancelLabel: '',
                onConfirm: () => setConfirmDialog(null),
                variant: 'info'
            });
            return;
        }

        setConfirmDialog({
            type: 'delete_workspace',
            title: 'Excluir Workspace?',
            description: `Você está prestes a remover o workspace "${config.workspaces[index].name}". Todos os apps dentro dele serão removidos do menu.`,
            confirmLabel: 'Excluir permanentemente',
            cancelLabel: 'Cancelar',
            variant: 'danger',
            onConfirm: () => {
                const newWorkspaces = config.workspaces.filter((_, i) => i !== index);
                const renumbered = newWorkspaces.map((ws, i) => ({ ...ws, hotkey: i + 1, id: `workspace-${i + 1}` }));
                setConfig(prev => ({ ...prev, workspaces: renumbered, activeWorkspaceIndex: Math.min(prev.activeWorkspaceIndex, renumbered.length - 1) }));
                if (selectedWorkspaceIndex === index) { setSelectedWorkspaceIndex(null); }
                else if (selectedWorkspaceIndex !== null && selectedWorkspaceIndex > index) { setSelectedWorkspaceIndex(selectedWorkspaceIndex - 1); }
                setConfirmDialog(null);
            }
        });
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

    const addAppToWorkspace = (workspaceIndex: number, type: 'app' | 'folder', path: number[], commandType: 'app' | 'url' | 'folder' = 'app') => {
        const newApp: AppItem = {
            id: generateId(),
            type: type,
            label: type === 'folder' ? (getTranslation(config, 'action.new_folder') || 'New Folder') : (commandType === 'url' ? (getTranslation(config, 'appSelection.new_url') || 'New URL') : (commandType === 'folder' ? (getTranslation(config, 'appSelection.folder') || 'Folder') : (getTranslation(config, 'action.new_app') || 'New App'))),
            iconName: type === 'folder' ? 'Folder' : (commandType === 'url' ? 'Globe' : (commandType === 'folder' ? 'Folder' : 'Layout')),
            iconSource: 'lucide',
            command: '',
            commandType: commandType,
            description: type === 'folder' ? (getTranslation(config, 'workspaces.folder_group') || 'Folder Group') : (commandType === 'url' ? (getTranslation(config, 'appSelection.web_url_desc') || 'Web Link') : (commandType === 'folder' ? (getTranslation(config, 'appSelection.folder_desc') || 'Folder Shortcut') : (getTranslation(config, 'workspaces.app') || 'Application'))),
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
        if (field === 'customIconUrl' && value === undefined && window.electron?.removeManagedCustomIcon && editingApp.app.customIconUrl) {
            void window.electron.removeManagedCustomIcon(editingApp.app.customIconUrl);
        }
        let updatedApp = { ...editingApp.app, [field]: value };

        // Auto-fetch high-quality favicon for URLs (same helper as adding a URL from the app picker)
        if (field === 'command' && editingApp.app.commandType === 'url' && value.trim()) {
            if (editingApp.app.customIconUrl?.startsWith('file:') && window.electron?.removeManagedCustomIcon) {
                void window.electron.removeManagedCustomIcon(editingApp.app.customIconUrl);
            }
            const iconFields = websiteIconFieldsFromUrl(value.trim());
            updatedApp = {
                ...updatedApp,
                ...(iconFields ?? { iconName: 'Globe', iconSource: 'lucide', customIconUrl: undefined }),
            };
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

            {/* UNIFIED CONFIRMATION MODAL (Professional Minimalism 2026) */}
            <AnimatePresence>
                {confirmDialog && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 sm:p-0">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => confirmDialog.cancelLabel && setConfirmDialog(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-3xl"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 8 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 400, mass: 1 }}
                            className="relative w-full max-w-sm overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div
                                className="rounded-2xl p-7 flex flex-col gap-6 relative overflow-hidden"
                                style={{
                                    background: 'rgba(10, 10, 10, 0.98)',
                                    backdropFilter: 'blur(30px)',
                                    WebkitBackdropFilter: 'blur(30px)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.02) inset',
                                }}
                            >
                                {/* Header Section */}
                                <div className="flex flex-col items-center gap-5 text-center relative z-10">
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                        className={`w-14 h-14 rounded-2xl flex items-center justify-center relative border shadow-[0_0_30px_rgba(0,0,0,0.5)] ${
                                            confirmDialog.variant === 'danger' ? 'bg-red-500/10 border-red-500/20' : 
                                            confirmDialog.variant === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20' : 
                                            'bg-white/5 border-white/10'
                                        }`}
                                    >
                                        <div className="absolute inset-0 bg-white/[0.02] rounded-2xl" />
                                        {confirmDialog.variant === 'danger' ? (
                                            <Trash2 size={24} strokeWidth={1.5} className="text-red-400 relative z-10" />
                                        ) : confirmDialog.variant === 'warning' ? (
                                            <AlertTriangle size={24} strokeWidth={1.5} className="text-yellow-400 relative z-10" />
                                        ) : (
                                            <Box size={24} strokeWidth={1.5} className="text-white/80 relative z-10" />
                                        )}
                                    </motion.div>
                                    
                                    <div className="space-y-2.5">
                                        <h3 className="text-[19px] font-semibold text-white/90 tracking-tight leading-tight px-2">
                                            {confirmDialog.title}
                                        </h3>
                                        <p className="text-[12px] text-white/40 leading-relaxed max-w-[280px] mx-auto font-normal">
                                            {confirmDialog.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions Section */}
                                <div className="flex flex-col gap-3 relative z-10 pt-2">
                                    <motion.button
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={confirmDialog.onConfirm}
                                        className={`w-full py-3.5 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all duration-300 border ${
                                            confirmDialog.variant === 'danger' 
                                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]' 
                                            : confirmDialog.variant === 'warning' 
                                            ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white border-yellow-500/20' 
                                            : 'bg-white/10 text-white hover:bg-white hover:text-black border-white/20'
                                        }`}
                                    >
                                        {confirmDialog.confirmLabel}
                                    </motion.button>
                                    
                                    {confirmDialog.cancelLabel && (
                                        <motion.button
                                            whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)' }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setConfirmDialog(null)}
                                            className="w-full py-3 text-[11px] font-bold text-white/30 tracking-widest transition-all duration-300 uppercase rounded-xl border border-transparent"
                                        >
                                            {confirmDialog.cancelLabel}
                                        </motion.button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
                            className="relative w-full max-w-sm bg-white/[0.015] border border-white/10 rounded-xl p-7 shadow-2xl backdrop-blur-3xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Decorative Glow */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />

                            <div className="text-center mb-7 relative z-10">
                                <h3 className="text-lg font-semibold text-white mb-2">{getTranslation(config, 'appSelection.title')}</h3>
                                <p className="text-[10px] text-white/30 font-medium uppercase tracking-widest">{getTranslation(config, 'appSelection.description')}</p>
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
                                        <div className="font-semibold text-white text-sm">{getTranslation(config, 'appSelection.local_app')}</div>
                                        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">{getTranslation(config, 'appSelection.local_app_desc')}</p>
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
                                        <div className="font-semibold text-white text-sm">{getTranslation(config, 'appSelection.web_url')}</div>
                                        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">{getTranslation(config, 'appSelection.web_url_desc')}</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => {
                                        if (pendingWorkspaceAction) {
                                            addAppToWorkspace(pendingWorkspaceAction.workspaceIndex, 'app', pendingWorkspaceAction.path, 'folder');
                                        }
                                        setShowAppSelectionModal(false);
                                        setPendingWorkspaceAction(null);
                                    }}
                                    className="group flex flex-col items-center gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                                >
                                    <div className="w-11 h-11 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-white/20 transition-all duration-500">
                                        <Folder size={22} strokeWidth={1.5} />
                                    </div>
                                    <div className="text-center">
                                        <div className="font-semibold text-white text-sm">{getTranslation(config, 'appSelection.folder') || 'Pasta'}</div>
                                        <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">{getTranslation(config, 'appSelection.folder_desc') || 'Abrir Diretório'}</p>
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
                                {getTranslation(config, 'action.cancel')}
                            </button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <div id="settings-container" className={`absolute inset-0 z-[100] ${!isPage ? 'flex items-center justify-center' : ''}`}>
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
                    className={`relative z-[101] bg-black/95 backdrop-blur-3xl overflow-hidden flex flex-row ${!isPage ? 'mx-auto rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_50px_120px_-30px_rgba(0,0,0,0.95)] border border-white/5' : 'w-full h-full border-none'}`}
                    style={!isPage ? { width: isCompact ? '96%' : '90%', maxWidth: 1200, marginTop: isCompact ? 32 : 32, height: isCompact ? 'calc(100% - 64px)' : 'calc(100% - 64px)' } : { width: '100%', height: '100%', paddingTop: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    initial={!isPage ? { opacity: 0, scale: 0.96, y: 40, filter: 'blur(10px)' } : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0, filter: 'blur(0px)' }}
                    exit={!isPage ? { opacity: 0, scale: 0.98, y: 20, filter: 'blur(10px)' } : { opacity: 0, x: -20 }}
                    transition={!isPage ? { type: "spring", damping: 30, stiffness: 240, mass: 1 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                    {/* Close Button — floating top-right */}
                    <Tooltip label={isPage ? "Back to dashboard" : "Close settings"} position="left">
                        <motion.button
                            onClick={onClose}
                            className={`absolute ${isPage ? 'top-4' : 'top-3'} right-3 z-[200] w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/30 hover:text-white hover:bg-white/[0.10] hover:border-white/20 transition-all duration-200 group`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                        >
                            {isPage ? <ArrowLeft size={16} strokeWidth={2.5} /> : <X size={14} strokeWidth={2} />}
                        </motion.button>
                    </Tooltip>

                    {/* Sidebar */}
                    <motion.div
                        className={`bg-white/[0.01] border-r p-4 pt-[52px] flex-col border-white/[0.06] shrink-0 flex gap-1.5 relative`}
                        animate={{ width: isCompact ? 80 : (isSidebarExpanded ? 240 : 80) }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        onMouseEnter={() => setIsHoveringSidebar(true)}
                        onMouseLeave={() => setIsHoveringSidebar(false)}
                    >
                        {!isCompact && (
                            <motion.div
                                className="mb-6 flex items-center justify-between px-1"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <AnimatePresence mode="wait">
                                    {isSidebarExpanded ? (
                                        <Tooltip label={getTranslation(config, 'menu.back_to_home') || "Back to Home"} position="right">
                                            <motion.div
                                                key="expanded"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                className="flex items-center gap-3 cursor-pointer group/logo"
                                                onClick={onOpenDashboard}
                                                whileHover={{ x: 2 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <div className="w-8 h-8 bg-white text-black rounded-xl flex items-center justify-center shadow-lg group-hover/logo:shadow-white/10 transition-shadow">
                                                    <ZenithLogo size={18} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <h2 className="text-[12px] font-bold text-white tracking-[0.1em] uppercase group-hover/logo:text-white transition-colors">Zenith</h2>
                                                    <span className="text-[8px] text-white/30 font-black tracking-widest uppercase group-hover/logo:text-white/50 transition-colors">Kernel Settings</span>
                                                </div>
                                            </motion.div>
                                        </Tooltip>
                                    ) : (
                                        <Tooltip label={getTranslation(config, 'menu.back_to_home') || "Back to Home"} position="right">
                                            <motion.div
                                                key="collapsed"
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all"
                                                onClick={onOpenDashboard}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                <ZenithLogo size={20} />
                                            </motion.div>
                                        </Tooltip>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}

                        {!isCompact && (
                            <AnimatePresence>
                                {isSidebarExpanded && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        className="px-1 mb-4"
                                    >
                                        <div className="relative group">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-white/40 transition-colors" size={14} />
                                            <input
                                                type="text"
                                                placeholder={getTranslation(config, 'sidebar.find_prefs')}
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-[11px] text-white/90 placeholder:text-white/10 outline-none focus:bg-white/[0.04] focus:border-white/10 transition-all font-medium"
                                            />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        )}

                        {/* Navigation Groups */}
                        <div className="flex flex-col gap-0.5">
                            {/* Dashboard Button — Always at the top for easy navigation */}
                            <NavButton 
                                tab="dashboard" 
                                label={getTranslation(config, 'sidebar.dashboard')} 
                                icon={LayoutDashboard} 
                                isSidebarExpanded={isCompact ? false : isSidebarExpanded} 
                                activeTab={activeTab} 
                                setActiveTab={() => onOpenDashboard()} 
                                isCompact={isCompact} 
                            />
                            
                            <div className="my-2 border-t border-white/[0.05]" />

                            {!isCompact && <SectionHeader label={getTranslation(config, 'sidebar.core')} isExpanded={isSidebarExpanded} />}

                            <NavButton tab="workspaces" label={getTranslation(config, 'sidebar.workspaces')} icon={LayoutGrid} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />
                            <NavButton tab="zenith_apps" label={getTranslation(config, 'sidebar.zenith_widgets')} icon={AppWindow} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />

                            {!isCompact && <SectionHeader label={getTranslation(config, 'sidebar.personalization')} isExpanded={isSidebarExpanded} />}
                            <NavButton tab="interface" label={getTranslation(config, 'sidebar.interface')} icon={Settings2} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />
                            <NavButton tab="visuals" label={getTranslation(config, 'sidebar.visuals')} icon={Palette} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />

                            {!isCompact && <SectionHeader label={getTranslation(config, 'sidebar.system')} isExpanded={isSidebarExpanded} />}
                            <NavButton tab="widgets" label={getTranslation(config, 'sidebar.hud')} icon={Clock} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />
                            <NavButton tab="gamemode" label={getTranslation(config, 'sidebar.gamemode')} icon={Gamepad2} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />
                            <NavButton tab="user" label={getTranslation(config, 'sidebar.profile')} icon={User} isSidebarExpanded={isCompact ? false : isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} isCompact={isCompact} />
                        </div>

                        {!isCompact && (
                            <div className="mt-auto pt-6 border-t border-white/[0.08] space-y-2.5">
                                <button
                                    onClick={() => setConfirmDialog({
                                        type: 'reset',
                                        title: 'Resetar Configurações?',
                                        description: 'Esta ação apagará todos os seus workspaces, apps personalizados e ajustes de interface. Isso não pode ser desfeito.',
                                        confirmLabel: 'Resetar Tudo',
                                        cancelLabel: 'Cancelar',
                                        variant: 'danger',
                                        onConfirm: () => {
                                            onReset();
                                            localStorage.clear();
                                            if (window.electron?.resetConfig) {
                                                window.electron.resetConfig();
                                            } else {
                                                window.location.reload();
                                            }
                                        }
                                    })}
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
                                                {getTranslation(config, 'interface.resync')}
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
                                                <span className="relative z-10 text-red-400">{getTranslation(config, 'reset.button_label') || 'Reset'}</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </button>
                            </div>
                        )}
                    </motion.div>

                    {/* Content */}
                    <div className="flex-1 bg-[#0D0D0D] overflow-hidden flex flex-col relative">
                        <AnimatePresence mode="wait">
                            {searchTerm.trim() ? (
                                <SearchResultsView
                                    key="search"
                                    results={searchResults}
                                    onResultClick={handleResultClick}
                                    config={config}
                                />
                            ) : (
                                <>
                                    {activeTab === 'zenith_apps' && <WidgetsTab key="widgets" config={config} setConfig={setConfig} />}
                                    {activeTab === 'visuals' && <VisualsTab key="visuals" config={config} setConfig={setConfig} />}
                                    {activeTab === 'workspaces' && (
                                        <WorkspacesTab
                                            key="workspaces"
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
                                            key="interface"
                                            config={config}
                                            setConfig={setConfig}
                                            handleCenterTypeChange={handleCenterTypeChange}
                                            handleCenterTargetChange={handleCenterTargetChange}
                                            setAppSelectorMode={setAppSelectorMode}
                                            setShowAppSelector={setShowAppSelector}
                                        />
                                    )}
                                    {activeTab === 'widgets' && <HUDTab key="hud" config={config} setConfig={setConfig} />}
                                    {activeTab === 'gamemode' && <GameModeTab key="gamemode" config={config} setConfig={setConfig} />}
                                    {activeTab === 'user' && (
                                        <UserTab
                                            user={user}
                                            config={config}
                                            handleExport={handleExport}
                                            handleImport={handleImport}
                                            isExporting={isExporting}
                                            isImporting={isImporting}
                                            status={status}
                                            onLogout={onLogout}
                                        />
                                    )}
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                <AppEditorModal
                    editingApp={editingApp}
                    setEditingApp={setEditingApp}
                    handleAppChange={handleAppChange}
                    handlePickCommand={handlePickCommand}
                    handlePickFolder={handlePickFolder}
                    setShowAppSelector={setShowAppSelector}
                    handlePickIcon={handlePickIcon}
                    config={config}
                />


                <style>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
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