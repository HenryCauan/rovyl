import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem, UIConfig, UserProfile } from '../types';
import { ICON_MAP, getIcon } from '../iconMap';
import { AVAILABLE_WIDGETS } from '../defaults';
import { AppSelector } from './AppSelector';
import { SmartIcon } from './SmartIcon';
import {
    X, Save, RotateCcw, Monitor, LayoutGrid, Palette,
    Plus, Trash2, Clock, Keyboard, AlertTriangle, RotateCw, AlarmClock,
    Gamepad2, AppWindow, Settings2, Folder, ChevronRight, CornerUpLeft,
    Image as ImageIcon, Upload, Search, FileType,
    Lock, LayoutDashboard, Box, Command, Ban, ChevronDown, Play, CheckCircle2,
    HelpCircle, User, MessageSquare, CreditCard, Globe, Eye, Zap, MousePointer2, Check,
    Hash, Download, ExternalLink, Moon, Sun, ArrowRight, ArrowLeft, TimerReset,
    FolderPlus, FileText, Edit3, Image, Calendar, Battery, CloudRain,
    Layout, Compass, Laptop, Smartphone, Bell, GripVertical, ChevronLeft
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';
import { IconPicker } from './IconPicker';
import { getTranslation, LANGUAGES } from '../translations';

const AppEditorModal = React.memo(({
    editingApp,
    setEditingApp,
    handleAppChange,
    handlePickCommand,
    setShowAppSelector,
    handlePickIcon,
    config
}: {
    editingApp: { app: AppItem, index: number, workspaceIndex?: number, path: number[] } | null,
    setEditingApp: (v: any) => void,
    handleAppChange: (f: keyof AppItem, v: any) => void,
    handlePickCommand: () => void,
    setShowAppSelector: (v: boolean) => void,
    handlePickIcon: () => void,
    config: UIConfig
}) => {
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
                        className="w-full max-w-3xl bg-[#080808]/90 border border-white/10 rounded-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] relative overflow-hidden flex flex-col max-h-[90%]"
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

                        {/* Conteúdo em Duas Colunas */}
                        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
                            {/* Coluna Esquerda: Configuração */}
                            <div className="flex-1 p-8 space-y-7 overflow-y-auto custom-scrollbar border-r border-white/5 bg-white/[0.01] min-h-0">
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
                                                        <button
                                                            onClick={handlePickCommand}
                                                            className="px-5 h-[52px] bg-white text-black font-bold text-xs rounded-xl hover:bg-gray-200 transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center gap-2 group"
                                                            title={getTranslation(config, 'editingApp.explore_title')}
                                                        >
                                                            <Folder size={16} strokeWidth={2.5} />
                                                            <span>{getTranslation(config, 'action.explore')}</span>
                                                        </button>
                                                        <button
                                                            onClick={() => setShowAppSelector(true)}
                                                            className="px-4 h-[52px] bg-white/[0.03] border border-white/10 flex items-center justify-center gap-2 text-white/40 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all duration-300 active:scale-90"
                                                            title={getTranslation(config, 'editingApp.installed_apps_title')}
                                                        >
                                                            <LayoutGrid size={18} strokeWidth={1.5} />
                                                            <span className="font-bold text-[10px] uppercase tracking-wider">{getTranslation(config, 'editingApp.installed_apps_label')}</span>
                                                        </button>
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
                            </div>

                            {/* Coluna Direita: Pré-visualização */}
                            <div className="w-full lg:w-[300px] bg-black/40 p-8 flex flex-col items-center justify-between gap-6 relative min-h-0 border-l border-white/5">
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

                                {editingApp.app.iconSource === 'native' ? (
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
                                ) : (
                                    <div className="w-full flex-1 max-h-[180px] rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
                                        <div className="h-full overflow-y-auto custom-scrollbar-mini">
                                            <IconPicker
                                                selectedIcon={editingApp.app.iconName}
                                                onSelect={(name) => handleAppChange('iconName', name)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

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
                </div>
            )}
        </AnimatePresence>
    );
});



const WidgetsTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
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
                        const isDeployed = config.workspaces.some(ws => ws.apps.some(a => a.command === widget.command));

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
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
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

                    <BentoCard title={getTranslation(config, 'visuals.icon_density')} icon={Box} description={getTranslation(config, 'visuals.icon_scale') || 'Escala dos Atalhos'} className="lg:col-span-1">
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

                    <BentoCard title={getTranslation(config, 'visuals.transparency')} icon={Zap} description={getTranslation(config, 'visuals.glass_effect') || 'Efeito de Vidro'} className="lg:col-span-1">
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

                    <BentoCard title={getTranslation(config, 'visuals.spacing')} icon={GripVertical} description={getTranslation(config, 'visuals.visual_rhythm') || 'Ritmo Visual'} className="lg:col-span-1">
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

                    <BentoCard title={getTranslation(config, 'visuals.activation_limit')} icon={Zap} description={getTranslation(config, 'visuals.sensitivity') || 'Sensibilidade'} className="lg:col-span-1">
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

                    <BentoCard title={getTranslation(config, 'visuals.labels') || 'Legendas'} icon={FileType} description={getTranslation(config, 'visuals.text_labels') || 'Rótulos de Texto'} className="lg:col-span-1">
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
                        {workspace.apps.length} {getTranslation(config, 'workspaces.shortcuts') || 'Atalhos'}
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
    app, i, isFolder, getIcon, dragAppRef, setDragOverApp, dragOverApp,
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
            <div className={`flex-1 overflow-y-auto custom-scrollbar ${selectedWorkspaceIndex !== null ? 'pt-12 md:pt-16 lg:pt-20' : 'pt-10 md:pt-16 lg:pt-20'}`}>
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
                                                            if (confirm(getTranslation(config, 'workspaces.confirm_delete') || 'Decommission this workspace permanently?')) deleteWorkspace(selectedWorkspaceIndex);
                                                        }}
                                                        className="h-10 w-10 flex items-center justify-center bg-red-500/5 hover:bg-red-500/10 text-red-500/60 hover:text-red-500 rounded-xl border border-red-500/10 hover:border-red-500/20 transition-all duration-300 shrink-0"
                                                    >
                                                        <Trash2 size={18} strokeWidth={1.5} />
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* App Grid - Refined 2026 */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/40 rounded-xl border border-white/5 p-5 pb-12 mb-4 shadow-inner min-h-[420px]">
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
                                                    dragOverApp={dragOverApp}
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

            {/* Unified Global Fixed Action Bar - Premium 2026 */}
            <div className="pb-16 pt-4 flex justify-center flex-shrink-0 bg-transparent">
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
            className="pt-10 md:pt-16 lg:pt-20 overflow-y-auto custom-scrollbar"
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
                        <label className="text-[8px] font-medium text-white/20 uppercase tracking-[0.25em] block ml-0.5 mb-0.5">{getTranslation(config, 'interface.activation_matrix')}</label>
                        <h4 className="text-[13px] font-medium text-white">{getTranslation(config, 'interface.global_shortcut')}</h4>
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
                                {getTranslation(config, 'interface.resync')}
                            </button>
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
                                    <div>
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block ml-1">{getTranslation(config, 'interface.command_path')}</label>
                                        <input
                                            type="text"
                                            value={config.centerButton.target}
                                            onChange={(e) => setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: e.target.value, label: prev.centerButton.label === 'CMD' || prev.centerButton.label === '' ? (e.target.value.split(/[\\/]/).pop()?.substring(0, 8).toUpperCase() || 'CMD') : prev.centerButton.label } }))}
                                            placeholder={getTranslation(config, 'interface.command_path_placeholder')}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 block ml-1">{getTranslation(config, 'interface.button_label')}</label>
                                        <input
                                            type="text"
                                            value={config.centerButton.label}
                                            onChange={(e) => setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, label: e.target.value } }))}
                                            placeholder={getTranslation(config, 'interface.button_label_placeholder')}
                                            maxLength={10}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none"
                                        />
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
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
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

const GameModeTab = React.memo(({ config, setConfig }: { config: UIConfig, setConfig: (c: any) => void }) => {
    return (
        <motion.div
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
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
                                                    <textarea
                                                        value={config.gameMode?.blockedApps || ''}
                                                        onChange={(e) => setConfig(prev => ({ ...prev, gameMode: { ...prev.gameMode, blockedApps: e.target.value } }))}
                                                        placeholder={getTranslation(config, 'gamemode.process_list_placeholder')}
                                                        className="w-full bg-black/60 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-white/30 outline-none font-mono resize-none h-32 shadow-inner hover:bg-black/80 transition-all placeholder-white/5"
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

const UserTab = React.memo(({ user, config }: { user: UserProfile | null, config: UIConfig }) => {
    return (
        <motion.div
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
        >
            <div className="max-w-4xl mx-auto px-6 md:px-10 lg:px-12">
                <motion.div
                    className="mb-12 text-center sm:text-left"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <h3 className="text-xl font-semibold text-white mb-1 tracking-tight">{getTranslation(config, 'user.profile_title')}</h3>
                    <p className="text-[11px] text-white/30 font-medium tracking-wide leading-relaxed mt-1 max-w-2xl">
                        {getTranslation(config, 'user.profile_desc')}
                    </p>
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
                                        {user?.isPremium ? getTranslation(config, 'user.zenith_pro') : getTranslation(config, 'user.free_plan')}
                                    </div>
                                </div>
                                <p className="text-white/40 font-normal mb-6">{user?.email || 'unlinked_identity@zenith.os'}</p>

                                <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                                    <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
                                        <Zap size={16} className="text-yellow-400" />
                                        <div className="text-left">
                                            <div className="text-[10px] font-semibold text-white/20 uppercase tracking-widest leading-none mb-1">{getTranslation(config, 'user.performance')}</div>
                                            <div className="text-sm font-medium text-white">{getTranslation(config, 'user.high_priority')}</div>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2.5 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
                                        <Globe size={16} className="text-blue-400" />
                                        <div className="text-left">
                                            <div className="text-[10px] font-semibold text-white/20 uppercase tracking-widest leading-none mb-1">{getTranslation(config, 'user.server')}</div>
                                            <div className="text-sm font-medium text-white">{getTranslation(config, 'user.local_kernel')}</div>
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
                                    <label className="text-[10px] font-semibold text-white/20 uppercase tracking-widest block mb-0.5">{getTranslation(config, 'user.authentication')}</label>
                                    <h4 className="font-semibold text-white">{getTranslation(config, 'user.access_security')}</h4>
                                </div>
                            </div>
                            <button className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-semibold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all">{getTranslation(config, 'user.manage_credentials')}</button>
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
                                    <label className="text-[9px] font-semibold text-white/20 uppercase tracking-widest block mb-0.5">{getTranslation(config, 'user.time_display')}</label>
                                    <h4 className="font-semibold text-white text-base">{getTranslation(config, 'user.system_clock')}</h4>
                                </div>
                            </div>
                            <button className="w-full py-3.5 bg-white/5 border border-white/10 rounded-xl text-[11px] font-semibold uppercase tracking-widest text-white/60 hover:text-white hover:bg-white/10 transition-all">{getTranslation(config, 'user.sync_cloud')}</button>
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
                                <h4 className="text-sm font-semibold text-white tracking-tight mb-1">{getTranslation(config, 'user.critical_operations')}</h4>
                                <p className="text-[11px] leading-relaxed text-white/30 font-normal">{getTranslation(config, 'user.critical_operations_desc')}</p>
                            </div>
                        </div>
                        <button className="w-full py-3 bg-red-500/10 text-red-500 font-semibold text-xs uppercase tracking-[0.2em] rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all duration-300">
                            {getTranslation(config, 'user.terminate_session')}
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
            className="pt-10 md:pt-16 lg:pt-20 pb-24 h-full overflow-y-auto custom-scrollbar"
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
    const [showResetConfirm, setShowResetConfirm] = useState(false);

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

        const nativeIconData = await extractIconFromPath(appData.path);
        handleAppUpdates({
            command: appData.path,
            label: appData.name,
            iconName: bestIcon,
            iconSource: 'native', // Always prefer native
            ...(nativeIconData || {})
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
            // It's an app, show selection modal if in workspace, or just add if in main apps?
            // User requested this specifically for workspace section
            if (selectedWorkspaceIndex !== null) {
                setPendingWorkspaceAction({ workspaceIndex: selectedWorkspaceIndex, path: workspaceFolderPath });
                setShowAppSelectionModal(true);
            } else {
                const newApp: AppItem = {
                    id: generateId(), type: 'app', label: getTranslation(config, 'action.new_app') || 'New App',
                    iconName: 'Layout', iconSource: 'lucide', command: '',
                    commandType: 'app', description: getTranslation(config, 'workspaces.app') || 'Application'
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
            label: type === 'folder' ? (getTranslation(config, 'action.new_folder') || 'New Folder') : (commandType === 'url' ? (getTranslation(config, 'appSelection.new_url') || 'New URL') : (getTranslation(config, 'action.new_app') || 'New App')),
            iconName: type === 'folder' ? 'Folder' : (commandType === 'url' ? 'Globe' : 'Layout'),
            iconSource: 'lucide',
            command: '',
            commandType: commandType,
            description: type === 'folder' ? (getTranslation(config, 'workspaces.folder_group') || 'Folder Group') : (commandType === 'url' ? (getTranslation(config, 'appSelection.web_url_desc') || 'Web Link') : (getTranslation(config, 'workspaces.app') || 'Application')),
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

            {/* Reset Confirmation Modal */}
            <AnimatePresence>
                {showResetConfirm && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowResetConfirm(false)}
                            className="absolute inset-0 bg-black/70 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: 10 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 340, mass: 0.8 }}
                            className="relative w-full max-w-sm overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Glass card */}
                            <div
                                className="rounded-2xl p-7 flex flex-col gap-6"
                                style={{
                                    background: 'rgba(10, 10, 12, 0.82)',
                                    backdropFilter: 'blur(32px)',
                                    WebkitBackdropFilter: 'blur(32px)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
                                }}
                            >
                                {/* Icon + header */}
                                <div className="flex flex-col items-center gap-4 text-center">
                                    <div
                                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                                        style={{
                                            background: 'rgba(239,68,68,0.1)',
                                            border: '1px solid rgba(239,68,68,0.2)',
                                        }}
                                    >
                                        <RotateCcw size={26} strokeWidth={1.5} className="text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-[15px] font-semibold text-white tracking-tight mb-1.5" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                                            {getTranslation(config, 'reset.title')}
                                        </h3>
                                        <p className="text-[12px] text-white/40 leading-relaxed">
                                            {getTranslation(config, 'reset.description')}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2.5">
                                    <button
                                        onClick={() => {
                                            setShowResetConfirm(false);
                                            localStorage.clear();
                                            if (window.electron?.resetConfig) {
                                                window.electron.resetConfig();
                                            } else {
                                                window.location.reload();
                                            }
                                        }}
                                        className="w-full py-3 rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                                        style={{
                                            background: 'rgba(239,68,68,0.18)',
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            color: '#f87171',
                                        }}
                                    >
                                        {getTranslation(config, 'reset.confirm')}
                                    </button>
                                    <button
                                        onClick={() => setShowResetConfirm(false)}
                                        className="w-full py-3 rounded-xl text-[13px] font-medium text-white/40 hover:text-white/70 tracking-wide transition-all duration-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]"
                                    >
                                        {getTranslation(config, 'reset.cancel')}
                                    </button>
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
                    className={`relative z-[101] bg-white/[0.015] backdrop-blur-3xl overflow-hidden flex ${!isPage ? 'mx-auto rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_40px_100px_-20px_rgba(0,0,0,0.8)] border border-white/5' : 'w-full h-full border-none'}`}
                    style={!isPage ? { width: '90%', maxWidth: 1200, marginTop: 32, height: 'calc(100% - 64px)' } : { width: '100%', height: '100%', paddingTop: 0 }}
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
                        className="bg-white/[0.01] border-r border-white/[0.06] p-4 pt-[52px] shrink-0 flex flex-col gap-1.5 relative overflow-hidden"
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

                        {/* Navigation Groups */}
                        <div className="flex flex-col gap-0.5">
                            <SectionHeader label={getTranslation(config, 'sidebar.core')} isExpanded={isSidebarExpanded} />
                            <NavButton tab="workspaces" label={getTranslation(config, 'sidebar.workspaces')} icon={LayoutGrid} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="zenith_apps" label={getTranslation(config, 'sidebar.zenith_widgets')} icon={AppWindow} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />

                            <SectionHeader label={getTranslation(config, 'sidebar.personalization')} isExpanded={isSidebarExpanded} />
                            <NavButton tab="interface" label={getTranslation(config, 'sidebar.interface')} icon={Settings2} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="visuals" label={getTranslation(config, 'sidebar.visuals')} icon={Palette} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />

                            <SectionHeader label={getTranslation(config, 'sidebar.system')} isExpanded={isSidebarExpanded} />
                            <NavButton tab="widgets" label={getTranslation(config, 'sidebar.hud')} icon={Clock} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="gamemode" label={getTranslation(config, 'sidebar.gamemode')} icon={Gamepad2} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <NavButton tab="user" label={getTranslation(config, 'sidebar.profile')} icon={User} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={setActiveTab} />
                        </div>

                        <div className="mt-auto pt-6 border-t border-white/[0.08] space-y-2.5">
                            <NavButton tab="dashboard" label={getTranslation(config, 'sidebar.dashboard')} icon={LayoutDashboard} isSidebarExpanded={isSidebarExpanded} activeTab={activeTab} setActiveTab={() => onOpenDashboard()} />

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
                                            {getTranslation(config, 'sidebar.config_folder')}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </button>

                            <button
                                onClick={() => setShowResetConfirm(true)}
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
                                    {activeTab === 'user' && <UserTab key="user" user={user} config={config} />}
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
                    setShowAppSelector={setShowAppSelector}
                    handlePickIcon={handlePickIcon}
                    config={config}
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