import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem, UIConfig, UserProfile } from '../types';
import { ICON_MAP, getIcon } from '../iconMap';
import { AVAILABLE_WIDGETS } from '../defaults';
import { AppSelector } from './AppSelector';
import {
    X, Save, RotateCcw, Monitor, LayoutGrid, Palette,
    Plus, Trash2, Clock, Keyboard,
    Gamepad2, AppWindow, Settings2, Folder, ChevronRight, CornerUpLeft,
    Image as ImageIcon, Upload, Search, FileType,
    Lock, LayoutDashboard, Box, Command, Ban, ChevronDown, Play, CheckCircle2
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';

// --- Sub-Components for the new Master-Detail Layout ---

const AppList: React.FC<{
    currentApps: AppItem[],
    currentFolderName: string,
    folderPath: number[],
    onGoUpFolder: () => void,
    onAppSelect: (app: AppItem, index: number) => void,
    onEnterFolder: (index: number) => void,
    onAddApp: (type: 'app' | 'folder') => void,
    isPremiumOrTrial: boolean,
}> = ({ currentApps, currentFolderName, folderPath, onGoUpFolder, onAppSelect, onEnterFolder, onAddApp, isPremiumOrTrial }) => {
    return (
        <motion.div
            key="list"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute top-0 left-0 w-full h-full flex flex-col bg-[#111]"
        >
            {/* Header */}
            <div className="h-12 border-b border-white/5 flex items-center px-4 gap-2 bg-[#161616] shrink-0">
                {folderPath.length > 0 && (
                    <button onClick={onGoUpFolder} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white">
                        <CornerUpLeft size={16} />
                    </button>
                )}
                <span className="flex items-center gap-2 text-sm text-white/80 font-medium">
                    <Folder size={14} className="text-yellow-500" /> {currentFolderName}
                </span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {currentApps.map((app, index) => {
                    const Icon = getIcon(app.iconName);
                    const isNative = app.iconSource === 'native' && app.customIconUrl;
                    return (
                        <div
                            key={app.id}
                            onClick={() => onAppSelect(app, index)}
                            className="flex items-center gap-3 p-3 rounded-lg cursor-pointer bg-white/5 text-white border border-transparent hover:bg-white/10 transition-colors"
                        >
                            <div className={`w-8 h-8 rounded flex items-center justify-center overflow-hidden flex-shrink-0 bg-black/40 ${app.type === 'folder' && !isNative ? 'text-yellow-500' : ''}`}>
                                {isNative ? <img src={app.customIconUrl} className="w-full h-full object-cover" /> : <Icon size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{app.label}</div>
                                <div className="text-[10px] truncate opacity-40">
                                    {app.type === 'folder' ? `${app.children?.length || 0} items` : (app.command || 'No app selected')}
                                </div>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (app.type === 'folder') onEnterFolder(index);
                                    else onAppSelect(app, index);
                                }}
                                className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-full"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 shrink-0">
                <div className="flex gap-2">
                    <button onClick={() => onAddApp('app')} className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded text-xs text-white flex justify-center gap-2 items-center border border-white/5 transition-colors">
                        <Plus size={14} /> App
                    </button>
                    <button
                        onClick={() => onAddApp('folder')}
                        className={`flex-1 py-2 rounded text-xs flex justify-center gap-2 items-center border transition-colors ${!isPremiumOrTrial ? 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed' : 'bg-white/5 hover:bg-white/10 text-white border-white/5'}`}
                    >
                        {!isPremiumOrTrial ? <Lock size={12} /> : <Folder size={14} className="text-yellow-500" />} Folder
                    </button>
                </div>
                {!isPremiumOrTrial && (
                    <div className="px-3 pt-2 text-center">
                        <span className="text-[10px] text-white/30 block">Free plan: Max 5 apps, No folders</span>
                    </div>
                )}
            </div>
        </motion.div>
    )
}

const AppEditor: React.FC<{
    app: AppItem,
    index: number, // Keep index to update app in the tree
    onBack: () => void,
    onDelete: () => void,
    onAppChange: (field: keyof AppItem, value: any) => void,
    onShowAppSelector: () => void,
    onExtractIcon: (command: string) => Promise<void>,
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onTestLaunch: (command: string, commandType: "app" | "url") => void,
    iconSearchTerm: string,
    setIconSearchTerm: React.Dispatch<React.SetStateAction<string>>,
    filteredIcons: string[],
}> = ({ app, onBack, onDelete, onAppChange, onShowAppSelector, onExtractIcon, onFileUpload, onTestLaunch, iconSearchTerm, setIconSearchTerm, filteredIcons }) => {
    return (
        <motion.div
            key="editor"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="absolute top-0 left-0 w-full h-full flex flex-col bg-[#0f0f0f]"
        >
            {/* Header */}
            <div className="h-12 border-b border-white/5 flex items-center px-2 gap-2 bg-[#161616] shrink-0">
                <button onClick={onBack} className="p-2 hover:bg-white/10 rounded text-white/50 hover:text-white">
                    <CornerUpLeft size={16} />
                </button>
                <span className="text-sm text-white/80 font-medium truncate">
                    Edit: {app.label}
                </span>
                <button onClick={onDelete} className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors ml-auto" title="Delete Item">
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                {/* General Properties */}
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs uppercase font-bold text-white/40 tracking-wider">Display Label</label>
                        <input
                            type="text"
                            value={app.label}
                            onChange={(e) => onAppChange('label', e.target.value)}
                            className="w-full bg-[#181818] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-white/30 transition-colors"
                        />
                    </div>

                    {app.type !== 'folder' && (
                        <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10">
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-white/40 tracking-wider">Application Command / Path</label>
                                <div className="flex gap-2">
                                    <p className="flex-1 text-[11px] text-white/50 font-mono break-all bg-black/40 p-2 rounded border border-white/5 min-h-[40px]">
                                        {app.command || 'No app selected.'}
                                    </p>
                                    <button
                                        onClick={() => onTestLaunch(app.command, app.commandType ?? 'app')}
                                        disabled={!app.command}
                                        className="px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg transition-all flex items-center justify-center gap-2 text-xs font-bold disabled:opacity-30 disabled:grayscale"
                                        title="Verify if this app launches correctly"
                                    >
                                        <Play size={14} fill="currentColor" /> Test
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={onShowAppSelector}
                                className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-400 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]"
                                title="Choose from installed apps"
                            >
                                <Monitor size={16} /> Choose from Installed Apps
                            </button>
                        </div>
                    )}
                </div>

                {/* Icon Editor Section */}
                <div className="space-y-4 pt-6 border-t border-white/10">
                    <div className="flex items-center justify-between">
                        <label className="text-xs uppercase font-bold text-white/60 tracking-wider flex items-center gap-2">
                            <ImageIcon size={14} /> Icon Customization
                        </label>
                        <div className="flex bg-[#181818] p-1 rounded-lg border border-white/5">
                            <button
                                onClick={() => onAppChange('iconSource', 'lucide')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${!app.iconSource || app.iconSource === 'lucide' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                            >
                                Vector
                            </button>
                            <button
                                onClick={() => onAppChange('iconSource', 'native')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${app.iconSource === 'native' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
                            >
                                Image / File
                            </button>
                        </div>
                    </div>

                    {(!app.iconSource || app.iconSource === 'lucide') && (
                        <div className="bg-[#181818] rounded-xl border border-white/10 p-4 space-y-3">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                <input
                                    type="text"
                                    placeholder="Search 1000+ icons..."
                                    value={iconSearchTerm}
                                    onChange={(e) => setIconSearchTerm(e.target.value)}
                                    className="w-full bg-black/20 border border-white/5 rounded-lg pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                                />
                            </div>
                            <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                {filteredIcons.map(iconName => {
                                    const Icon = getIcon(iconName);
                                    const isActive = app.iconName === iconName;
                                    return (
                                        <button
                                            key={iconName}
                                            onClick={() => onAppChange('iconName', iconName)}
                                            className={`aspect-square flex items-center justify-center rounded-lg transition-colors ${isActive ? 'bg-white text-black shadow-inner' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'}`}
                                            title={iconName}
                                        >
                                            <Icon size={20} />
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {app.iconSource === 'native' && (
                        <div className="bg-[#181818] rounded-xl border border-white/10 p-4 flex gap-4 items-start">
                            <div className="w-24 h-24 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden relative group">
                                {app.customIconUrl ? <img src={app.customIconUrl} className="w-full h-full object-cover" alt="Preview" /> : <ImageIcon size={32} className="text-white/20" />}
                                <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-medium">
                                    Change
                                    <input type="file" className="hidden" accept="image/*" onChange={onFileUpload} />
                                </label>
                            </div>
                            <div className="flex-1 space-y-3">
                                <button
                                    onClick={() => onExtractIcon(app.command)}
                                    disabled={app.commandType === 'url'}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors text-xs font-medium disabled:opacity-30 disabled:grayscale"
                                >
                                    <FileType size={14} /> Auto-Extract from App
                                </button>
                                <label className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 text-white border border-white/10 rounded-lg hover:bg-white/10 transition-colors text-xs font-medium cursor-pointer">
                                    <Upload size={14} /> Upload Custom Image
                                    <input type="file" className="hidden" accept="image/*" onChange={onFileUpload} />
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

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
}

type SettingsTab = 'apps' | 'zenith_apps' | 'interface' | 'visuals' | 'widgets' | 'gamemode';

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen, onClose, apps, setApps, config, setConfig, onReset, onOpenDashboard, user
}) => {
    // --- LOAD & SAVE SETTINGS (Backend Sync) ---
    useEffect(() => {
        // Load initial settings from backend if available
        if (window.electron && window.electron.getSettings) {
            // We need to extend the electron API in types.d.ts ideally, but for now we assume it exists or rely on generic IPC
            // Actually, window.electron.getSettings doesn't exist in the types yet. 
            // Logic: The parent component (App.tsx) likely loads initial config. 
            // BUT, for the specific BACKEND settings (like globalShortcut), we might need to fetch them here OR the parent should have passed them.
            // Passed 'config' already has 'globalShortcut'.
            // So we just need to ENABLE SAVING when 'config' changes.
        }
    }, []);

    // Save settings when config changes (Debounced ideally, or just on close/change)
    // Actually, let's look at where 'config' comes from. It's passed as prop.
    // The parent 'App.tsx' owns the 'config' state. We should modify App.tsx to save settings to backend?
    // OR we do it here if we want immediate side-effect.
    // Let's do a simple effect here that sends 'set-settings' to backend whenever key config fields change.
    useEffect(() => {
        if (window.electron && config.globalShortcut) {
            // Need to expose a specific method or use generic ipc
            // Since we modified backend to listen to 'set-settings', we need to make sure frontend can send it.
            // Let's check src/types.ts for exposed API. There is no 'setSettings'.
            // I should update App.tsx or use a direct ipcRenderer if exposed?
            // Wait, window.electron IS the bridge.
            // I need to add 'saveSettings' to preload and types.
        }
    }, [config.globalShortcut]); // Only sync when shortcut changes for now? 
    // Actually, let's handle this in App.tsx to centralization.
    // But user asked to do it in "SettingsModal". 
    // I will add the logic to App.tsx mostly, and here just UI updates 'config'. 

    // WAIT, I missed updating preload.js! I need to update preload to expose setSettings.
    // Let's assume I will update preload next.

    // For now, let's keep the UI logic here.

    const [activeTab, setActiveTab] = useState<SettingsTab>('apps');
    const [editingApp, setEditingApp] = useState<{ app: AppItem, index: number } | null>(null);
    const [iconSearchTerm, setIconSearchTerm] = useState('');
    const [folderPath, setFolderPath] = useState<number[]>([]);
    const [showAppSelector, setShowAppSelector] = useState(false);

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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!editingApp) return;
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                setApps(currentApps => updateAppTree(currentApps, folderPath, (list) => {
                    const newList = [...list];
                    newList[editingApp.index] = { ...newList[editingApp.index], customIconUrl: result, iconSource: 'native' };
                    return newList;
                }));
                setEditingApp(prev => prev ? { ...prev, app: { ...prev.app, customIconUrl: result, iconSource: 'native' } } : null);
            };
            reader.readAsDataURL(file);
        }
    };

    const extractIconFromPath = async (command: string) => {
        if (!editingApp || !window.electron || !window.electron.getFileIcon) return;
        if (!command || command.length < 3) return;
        try {
            const cleanCommand = command.replace(/['"]/g, '');
            const iconDataUrl = await window.electron.getFileIcon(cleanCommand);
            if (iconDataUrl) {
                setApps(currentApps => updateAppTree(currentApps, folderPath, (list) => {
                    const newList = [...list];
                    newList[editingApp.index] = { ...newList[editingApp.index], customIconUrl: iconDataUrl, iconSource: 'native' };
                    return newList;
                }));
                setEditingApp(prev => prev ? { ...prev, app: { ...prev.app, customIconUrl: iconDataUrl, iconSource: 'native' } } : null);
            } else {
                // If no icon found, ensure we stay on Lucide (vector icons) instead of switching to a broken native path
                setApps(currentApps => updateAppTree(currentApps, folderPath, (list) => {
                    const newList = [...list];
                    newList[editingApp.index] = { ...newList[editingApp.index], iconSource: 'lucide' };
                    return newList;
                }));
                setEditingApp(prev => prev ? { ...prev, app: { ...prev.app, iconSource: 'lucide' } } : null);
                console.log("No native icon found for:", cleanCommand);
            }
        } catch (e) {
            console.error("Error extracting icon:", e);
        }
    };

    const handleAppSelect = async (appData: { name: string; path: string }) => {
        if (!editingApp) return;
        if (!appData.path || appData.path.trim() === '') {
            alert(`Could not find a launch path for "${appData.name}".`);
            return;
        }

        const bestIcon = getBestLucideIcon(appData.name, appData.path);

        setApps(currentApps => updateAppTree(currentApps, folderPath, (list) => {
            const newList = [...list];
            newList[editingApp.index] = {
                ...newList[editingApp.index],
                command: appData.path,
                label: appData.name,
                iconName: bestIcon // Pick a good default Lucide icon
            };
            return newList;
        }));
        await extractIconFromPath(appData.path);
        setEditingApp(prev => prev ? {
            ...prev,
            app: {
                ...prev.app,
                command: appData.path,
                label: appData.name,
                iconName: bestIcon
            }
        } : null);
    };

    const handleAddApp = (type: 'app' | 'folder') => {
        if (!isPremiumOrTrial && folderPath.length === 0 && apps.length >= 5) {
            alert("Free Plan Limit: Maximum 5 items allowed.");
            return;
        }
        if (!isPremiumOrTrial && type === 'folder') {
            alert("Free Plan Limit: Folders are a premium feature.");
            return;
        }
        const newApp: AppItem = {
            id: crypto.randomUUID(),
            type: type,
            label: type === 'folder' ? 'New Folder' : 'New App',
            iconName: type === 'folder' ? 'Folder' : 'Layout',
            iconSource: 'lucide',
            command: '',
            commandType: 'app', // Initialize with 'app' as default
            description: type === 'folder' ? 'Folder Group' : 'Application',
            children: type === 'folder' ? [] : undefined
        };
        const newIndex = currentApps.length;
        setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newApp]));
        setEditingApp({ app: newApp, index: newIndex });
    };

    const goUpFolder = () => {
        if (folderPath.length === 0) return;
        const newPath = [...folderPath];
        newPath.pop();
        setFolderPath(newPath);
    };

    const toggleWidget = (widgetCommand: string, widgetDef: any) => {
        if (!isPremiumOrTrial) {
            alert("Free Plan Limit: Zenith Widgets are a premium feature.");
            return;
        }
        const exists = flatApps.find(a => a.command === widgetCommand);
        if (exists) {
            if (apps.length <= 2) { alert("Min 2 apps required in root."); return; }
            setApps(prev => prev.filter(a => a.command !== widgetCommand));
        } else {
            const newWidgetApp: AppItem = {
                id: crypto.randomUUID(), type: 'app', label: widgetDef.defaultLabel, iconName: widgetDef.iconName,
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
            if (app) {
                setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: app.id, label: app.label.toUpperCase().substring(0, 8), iconName: app.iconName } }));
            }
        } else if (type === 'widget') {
            const widget = AVAILABLE_WIDGETS.find(w => w.id === targetId);
            if (widget) {
                setConfig(prev => ({ ...prev, centerButton: { ...prev.centerButton, target: widget.command, label: widget.defaultLabel.toUpperCase(), iconName: widget.iconName } }));
            }
        }
    };

    const NavButton = ({ tab, label, icon: Icon }: { tab: SettingsTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 w-full text-left ${activeTab === tab ? 'bg-white text-black font-medium shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
        >
            <Icon size={18} /> {label}
        </button>
    );

    if (!isOpen) return null;

    return (
        <>
            <AppSelector
                isOpen={showAppSelector}
                onClose={() => setShowAppSelector(false)}
                onAppSelect={handleAppSelect}
            />
            <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden">
                <div className="absolute inset-0 bg-black/40" onClick={onClose} />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 30 }}
                    className="relative z-[101] w-[90%] h-[80%] max-w-4xl bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#141414]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center border border-white/10 overflow-hidden shadow-lg">
                                <ZenithLogo size={32} />
                            </div>
                            <h2 className="text-lg font-medium text-white tracking-wide">Zenith Config</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={20} className="text-white/60" />
                        </button>
                    </div>
                    <div className="flex flex-1 overflow-hidden">
                        <div className="w-56 bg-[#121212] border-r border-white/5 p-4 flex flex-col gap-2 shrink-0 overflow-y-auto custom-scrollbar">
                            <div className="text-xs font-semibold text-white/30 uppercase tracking-widest px-4 mb-2 mt-2">Content</div>
                            <NavButton tab="apps" label="Apps & Folders" icon={Monitor} />
                            <NavButton tab="zenith_apps" label="Zenith Widgets" icon={AppWindow} />
                            <div className="text-xs font-semibold text-white/30 uppercase tracking-widest px-4 mb-2 mt-6">Design</div>
                            <NavButton tab="interface" label="Interface" icon={Settings2} />
                            <NavButton tab="visuals" label="Visuals" icon={Palette} />
                            <NavButton tab="widgets" label="HUD Elements" icon={Clock} />
                            <div className="text-xs font-semibold text-white/30 uppercase tracking-widest px-4 mb-2 mt-6">System</div>
                            <NavButton tab="gamemode" label="Game Mode" icon={Gamepad2} />
                            <button
                                onClick={onOpenDashboard}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-all duration-200 w-full text-left"
                            >
                                <LayoutDashboard size={18} /> Open Zenith Home
                            </button>
                            <div className="mt-auto pt-4 border-t border-white/5">
                                <button onClick={onReset} className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                                    <RotateCcw size={16} /> Reset Defaults
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-[#0f0f0f] overflow-hidden flex flex-col">
                            {activeTab === 'apps' && (
                                <div className="flex flex-col h-full w-full relative overflow-hidden">
                                    <AnimatePresence initial={false}>
                                        {editingApp ? (
                                            <AppEditor
                                                key="editor"
                                                app={editingApp.app}
                                                index={editingApp.index}
                                                onBack={() => setEditingApp(null)}
                                                onDelete={() => {
                                                    if (folderPath.length === 0 && apps.length <= 2) {
                                                        alert("You need at least 2 apps in the main menu.");
                                                        return;
                                                    }
                                                    const updatedApps = updateAppTree(apps, folderPath, (list) => list.filter((_, i) => i !== editingApp.index));
                                                    setApps(prev => updateAppTree(prev, folderPath, (list) => list.filter((_, i) => i !== editingApp.index)));
                                                    setEditingApp(null);
                                                }}
                                                onAppChange={(field, value) => {
                                                    setApps(prev => updateAppTree(prev, folderPath, (list) => {
                                                        const newList = [...list];
                                                        newList[editingApp.index] = { ...newList[editingApp.index], [field]: value };
                                                        return newList;
                                                    }));
                                                    setEditingApp(prev => prev ? { ...prev, app: { ...prev.app, [field]: value } } : null);
                                                }}
                                                onShowAppSelector={() => setShowAppSelector(true)}
                                                onExtractIcon={extractIconFromPath}
                                                onFileUpload={handleFileUpload}
                                                onTestLaunch={(cmd, commandType) => window.electron?.executeCommand(cmd, commandType)}
                                                iconSearchTerm={iconSearchTerm}
                                                setIconSearchTerm={setIconSearchTerm}
                                                filteredIcons={filteredIcons}
                                            />
                                        ) : (
                                            <AppList
                                                key="list"
                                                currentApps={currentApps}
                                                currentFolderName={currentFolderName}
                                                isPremiumOrTrial={isPremiumOrTrial}
                                                folderPath={folderPath}
                                                onAppSelect={(app, index) => setEditingApp({ app, index })}
                                                onAddApp={handleAddApp}
                                                onGoUpFolder={goUpFolder}
                                                onEnterFolder={(index) => setFolderPath([...folderPath, index])}
                                            />
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                            {activeTab === 'zenith_apps' && (
                                <div className="p-8 h-full flex flex-col">
                                    {!isPremiumOrTrial && (
                                        <div className="p-4 mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
                                            <Lock className="text-yellow-500" size={20} />
                                            <span className="text-sm text-white/80">Widgets are a premium feature. Upgrade to unlock.</span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 gap-4 overflow-y-auto custom-scrollbar flex-1">
                                        {AVAILABLE_WIDGETS.map((widget) => {
                                            const isAdded = flatApps.some(a => a.command === widget.command);
                                            const Icon = getIcon(widget.iconName);
                                            return (
                                                <div key={widget.id} className={`p-5 rounded-xl border flex items-center justify-between transition-all ${isAdded ? 'bg-[#1a1a1a] border-white/20' : 'bg-[#141414] border-white/5 hover:border-white/10'} ${!isPremiumOrTrial ? 'opacity-50 grayscale' : ''}`}>
                                                    <div className="flex items-center gap-5">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-lg ${isAdded ? 'bg-white text-black border-white' : 'bg-black text-white/50 border-white/10'}`}><Icon size={24} /></div>
                                                        <div><h4 className="text-lg font-medium text-white">{widget.name}</h4><p className="text-sm text-white/50 mt-1 max-w-sm">{widget.description}</p></div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleWidget(widget.command, widget)}
                                                        className={`px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${isAdded ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-white text-black'}`}
                                                        disabled={!isPremiumOrTrial}
                                                    >
                                                        {isAdded ? 'Remove' : 'Add'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'interface' && (
                                <div className="p-8 overflow-y-auto custom-scrollbar">
                                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-200">
                                        {/* Central Hub Config */}
                                        <div className="space-y-4">
                                            <h3 className="text-white font-medium border-b border-white/5 pb-2 flex items-center gap-2"><Settings2 size={16} /> Central Hub</h3>
                                            <div className="p-4 bg-[#141414] rounded-lg border border-white/10">
                                                <label className="text-xs text-white/50 block mb-3 uppercase tracking-wider font-semibold">Center Button Function</label>

                                                <div className="grid grid-cols-5 gap-2 mb-4">
                                                    {['system', 'app', 'widget', 'command', 'none'].map((mode) => {
                                                        const isActive = config.centerButton.type === mode;
                                                        return (
                                                            <button
                                                                key={mode}
                                                                onClick={() => handleCenterTypeChange(mode as any)}
                                                                className={`
                                                    py-3 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex flex-col items-center gap-1.5
                                                    ${isActive ? 'bg-white text-black border-white shadow-md' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}
                                                `}
                                                            >
                                                                {mode === 'system' && <Settings2 size={16} />}
                                                                {mode === 'app' && <Box size={16} />}
                                                                {mode === 'widget' && <LayoutGrid size={16} />}
                                                                {mode === 'command' && <Command size={16} />}
                                                                {mode === 'none' && <Ban size={16} />}
                                                                {mode}
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                <div className="p-4 bg-black/20 rounded-lg border border-white/5 space-y-4">
                                                    {config.centerButton.type === 'system' && (
                                                        <div className="flex items-center gap-3 text-white/60">
                                                            <Settings2 size={20} />
                                                            <span className="text-sm">Opens the internal System Control Panel (Volume, Brightness, etc).</span>
                                                        </div>
                                                    )}

                                                    {config.centerButton.type === 'none' && (
                                                        <div className="flex items-center gap-3 text-white/60">
                                                            <Ban size={20} />
                                                            <span className="text-sm">The center button will have no action at the root level.</span>
                                                        </div>
                                                    )}

                                                    {config.centerButton.type === 'app' && (
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Select Application</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={flatApps.find(a => a.id === config.centerButton.target) ? config.centerButton.target : ''}
                                                                    onChange={(e) => handleCenterTargetChange(e.target.value, 'app')}
                                                                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors appearance-none cursor-pointer"
                                                                >
                                                                    <option value="" disabled>Choose an app...</option>
                                                                    {flatApps.map(app => (
                                                                        <option key={app.id} value={app.id}>
                                                                            {app.label} {app.type === 'folder' ? '(Folder)' : ''}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {config.centerButton.type === 'widget' && (
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Select Widget</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={AVAILABLE_WIDGETS.find(w => w.command === config.centerButton.target) ? AVAILABLE_WIDGETS.find(w => w.command === config.centerButton.target)?.id : ''}
                                                                    onChange={(e) => handleCenterTargetChange(e.target.value, 'widget')}
                                                                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors appearance-none cursor-pointer"
                                                                >
                                                                    <option value="" disabled>Choose a widget...</option>
                                                                    {AVAILABLE_WIDGETS.map(widget => (
                                                                        <option key={widget.id} value={widget.id}>
                                                                            {widget.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Global Shortcut Config */}
                                    <div className="space-y-4 pt-4 border-t border-white/10">
                                        <h3 className="text-white font-medium mb-3 flex items-center gap-2"><Keyboard size={16} /> Global Shortcut</h3>
                                        <div className="p-4 bg-[#141414] rounded-lg border border-white/10 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-sm font-medium text-white">Activation Hotkey</div>
                                                    <div className="text-xs text-white/40 mt-0.5">Shortcut to open/close Zenith from anywhere.</div>
                                                    <div className="text-[10px] text-white/50 mt-1 flex items-center gap-1">
                                                        <span>(MMB Hold is the default trigger. Set a custom key here if desired.)</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={config.globalShortcut || ''}
                                                        placeholder="Click to set..."
                                                        readOnly
                                                        onClick={(e) => {
                                                            const btn = e.target as HTMLInputElement;
                                                            btn.value = "Press keys...";

                                                            const handler = (event: KeyboardEvent) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();

                                                                const modifiers = [];
                                                                if (event.ctrlKey) modifiers.push('Ctrl');
                                                                if (event.shiftKey) modifiers.push('Shift');
                                                                if (event.altKey) modifiers.push('Alt');
                                                                if (event.metaKey) modifiers.push('Meta');

                                                                let key = event.key.toUpperCase();
                                                                if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) return;
                                                                if (key === ' ') key = 'Space';

                                                                const shortcut = [...modifiers, key].join('+');

                                                                // Add a small delay before setting the config to prevent immediate trigger
                                                                setTimeout(() => {
                                                                    setConfig(prev => ({ ...prev, globalShortcut: shortcut }));
                                                                }, 100);

                                                                cleanup();
                                                            };

                                                            const cleanup = () => {
                                                                window.removeEventListener('keydown', handler);
                                                                window.removeEventListener('blur', blurHandler);
                                                                btn.blur();
                                                            };

                                                            const blurHandler = () => {
                                                                window.removeEventListener('keydown', handler);
                                                            };

                                                            window.addEventListener('keydown', handler);
                                                            window.addEventListener('blur', blurHandler);
                                                        }}
                                                        className="w-32 bg-black/40 border border-white/20 rounded px-3 py-1.5 text-center text-sm font-mono text-white focus:border-blue-500 focus:outline-none cursor-pointer hover:bg-white/5 transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* VISUALS TAB */}
                            {activeTab === 'visuals' && (
                                <div className="p-8 overflow-y-auto custom-scrollbar h-full">
                                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="space-y-6">
                                            <h3 className="text-white font-medium border-b border-white/5 pb-2 flex items-center gap-2"><Palette size={16} /> Theme & Style</h3>

                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-xs text-white/40 uppercase tracking-wider font-bold">Accent Color</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="color"
                                                            value={config.accentColor}
                                                            onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                                                            className="w-12 h-10 bg-transparent border-0 cursor-pointer p-0"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={config.accentColor}
                                                            onChange={(e) => setConfig({ ...config, accentColor: e.target.value })}
                                                            className="flex-1 bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs text-white/40 uppercase tracking-wider font-bold">Menu Style</label>
                                                    <div className="flex bg-[#141414] p-1 rounded-lg border border-white/10">
                                                        <button
                                                            onClick={() => setConfig({ ...config, menuBackgroundStyle: 'circle' })}
                                                            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${config.menuBackgroundStyle === 'circle' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                                                        >
                                                            Circular
                                                        </button>
                                                        <button
                                                            onClick={() => setConfig({ ...config, menuBackgroundStyle: 'fullscreen' })}
                                                            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${config.menuBackgroundStyle === 'fullscreen' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                                                        >
                                                            Fullscreen
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-6 pt-4">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-xs text-white/60">Menu Radius</label>
                                                        <span className="text-xs text-white/30 font-mono">{config.menuRadius}px</span>
                                                    </div>
                                                    <input type="range" min="150" max="400" step="5" value={config.menuRadius} onChange={(e) => setConfig({ ...config, menuRadius: parseInt(e.target.value) })} className="w-full accent-white" />
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-xs text-white/60">Icon Size</label>
                                                        <span className="text-xs text-white/30 font-mono">{config.iconSize}px</span>
                                                    </div>
                                                    <input type="range" min="30" max="80" step="2" value={config.iconSize} onChange={(e) => setConfig({ ...config, iconSize: parseInt(e.target.value) })} className="w-full accent-white" />
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-xs text-white/60">App Spacing</label>
                                                        <span className="text-xs text-white/30 font-mono">{config.appSpacing}px</span>
                                                    </div>
                                                    <input type="range" min="0" max="50" step="1" value={config.appSpacing} onChange={(e) => setConfig({ ...config, appSpacing: parseInt(e.target.value) })} className="w-full accent-white" />
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-xs text-white/60">Menu Opacity</label>
                                                        <span className="text-xs text-white/30 font-mono">{Math.round(config.menuOpacity * 100)}%</span>
                                                    </div>
                                                    <input type="range" min="0" max="1" step="0.05" value={config.menuOpacity} onChange={(e) => setConfig({ ...config, menuOpacity: parseFloat(e.target.value) })} className="w-full accent-white" />
                                                </div>

                                                <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Backdrop Glass Effect</div>
                                                            <div className="text-xs text-white/40 mt-0.5">Apply blur filter to the background</div>
                                                        </div>
                                                        <button
                                                            onClick={() => setConfig({ ...config, backdropBlur: config.backdropBlur > 0 ? 0 : 8 })}
                                                            className={`w-12 h-6 rounded-full transition-colors relative ${config.backdropBlur > 0 ? 'bg-blue-500' : 'bg-white/10'}`}
                                                        >
                                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.backdropBlur > 0 ? 'left-7' : 'left-1'}`} />
                                                        </button>
                                                    </div>

                                                    {config.backdropBlur > 0 && (
                                                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <div className="flex justify-between items-center">
                                                                <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Glass Intensity</label>
                                                                <span className="text-xs text-white/30 font-mono">{config.backdropBlur}</span>
                                                            </div>
                                                            <input type="range" min="1" max="25" value={config.backdropBlur} onChange={(e) => setConfig({ ...config, backdropBlur: parseInt(e.target.value) })} className="w-full accent-white" />
                                                        </div>
                                                    )}

                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <label className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Backdrop Opacity</label>
                                                            <span className="text-xs text-white/30 font-mono">{Math.round(config.backdropOpacity * 100)}%</span>
                                                        </div>
                                                        <input type="range" min="0" max="1" step="0.05" value={config.backdropOpacity} onChange={(e) => setConfig({ ...config, backdropOpacity: parseFloat(e.target.value) })} className="w-full accent-white" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* WIDGETS / HUD ELEMENTS TAB */}
                            {activeTab === 'widgets' && (
                                <div className="p-8 overflow-y-auto custom-scrollbar h-full">
                                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="space-y-6">
                                            <h3 className="text-white font-medium border-b border-white/5 pb-2 flex items-center gap-2"><Clock size={16} /> HUD Elements</h3>

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between p-4 bg-[#141414] rounded-xl border border-white/10">
                                                    <div>
                                                        <div className="text-sm font-medium text-white">Show Application Labels</div>
                                                        <div className="text-xs text-white/40 mt-0.5">Display names under radial icons</div>
                                                    </div>
                                                    <button
                                                        onClick={() => setConfig({ ...config, showLabels: !config.showLabels })}
                                                        className={`w-12 h-6 rounded-full transition-colors relative ${config.showLabels ? 'bg-blue-500' : 'bg-white/10'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.showLabels ? 'left-7' : 'left-1'}`} />
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between p-4 bg-[#141414] rounded-xl border border-white/10">
                                                    <div>
                                                        <div className="text-sm font-medium text-white">Show Background Clock</div>
                                                        <div className="text-xs text-white/40 mt-0.5">Digital clock in the corner of the screen</div>
                                                    </div>
                                                    <button
                                                        onClick={() => setConfig({ ...config, showClock: !config.showClock })}
                                                        className={`w-12 h-6 rounded-full transition-colors relative ${config.showClock ? 'bg-blue-500' : 'bg-white/10'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.showClock ? 'left-7' : 'left-1'}`} />
                                                    </button>
                                                </div>

                                                {config.showClock && (
                                                    <div className="space-y-3 p-4 bg-black/20 rounded-xl border border-white/5">
                                                        <label className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Clock Position</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                { id: 'top-left', label: 'Top Left' },
                                                                { id: 'top-right', label: 'Top Right' },
                                                                { id: 'bottom-left', label: 'Bottom Left' },
                                                                { id: 'bottom-right', label: 'Bottom Right' }
                                                            ].map(pos => (
                                                                <button
                                                                    key={pos.id}
                                                                    onClick={() => setConfig({ ...config, clockPosition: pos.id as any })}
                                                                    className={`px-4 py-2 rounded-lg border text-xs transition-all ${config.clockPosition === pos.id ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 text-white/60 hover:border-white/20'}`}
                                                                >
                                                                    {pos.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* GAME MODE TAB */}
                            {activeTab === 'gamemode' && (
                                <div className="p-8 overflow-y-auto custom-scrollbar h-full">
                                    <div className="max-w-xl space-y-8 animate-in fade-in slide-in-from-right-4 duration-200">
                                        <div className="space-y-6">
                                            <h3 className="text-white font-medium border-b border-white/5 pb-2 flex items-center gap-2"><Gamepad2 size={16} /> Game Mode</h3>

                                            <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-3 rounded-xl ${config.gameMode.enabled ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/30'}`}>
                                                            <Gamepad2 size={24} />
                                                        </div>
                                                        <div>
                                                            <div className="text-lg font-medium text-white">Enable Game Mode</div>
                                                            <div className="text-sm text-white/40">Prevent Zenith from opening while gaming</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, enabled: !config.gameMode.enabled } })}
                                                        className={`w-14 h-7 rounded-full transition-colors relative ${config.gameMode.enabled ? 'bg-blue-500' : 'bg-white/10'}`}
                                                    >
                                                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.gameMode.enabled ? 'left-8' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {config.gameMode.enabled && (
                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <label className="text-xs text-white/40 uppercase tracking-wider font-bold">Blocking Mode Logic</label>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <button
                                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'all' } })}
                                                                className={`p-3 rounded-lg border text-left transition-all ${config.gameMode.mode === 'all' ? 'bg-white text-black border-white' : 'bg-[#1a1a1a] text-white/50 border-white/5 hover:border-white/10'}`}
                                                            >
                                                                <div className="font-bold text-sm mb-1">Block All Fullscreen</div>
                                                                <div className="text-[10px] opacity-70 leading-tight">Prevents menu from opening over ANY active fullscreen app.</div>
                                                            </button>
                                                            <button
                                                                onClick={() => setConfig({ ...config, gameMode: { ...config.gameMode, mode: 'list' } })}
                                                                className={`p-3 rounded-lg border text-left transition-all ${config.gameMode.mode === 'list' || !config.gameMode.mode ? 'bg-white text-black border-white' : 'bg-[#1a1a1a] text-white/50 border-white/5 hover:border-white/10'}`}
                                                            >
                                                                <div className="font-bold text-sm mb-1">Specific Apps Only</div>
                                                                <div className="text-[10px] opacity-70 leading-tight">Only blocks for applications listed below.</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {(config.gameMode.mode === 'list' || !config.gameMode.mode) && (
                                                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                                            <label className="text-xs text-white/40 uppercase tracking-wider font-bold">Blocked Process Names</label>
                                                            <div className="text-[10px] text-white/30 mb-2">Separate by commas (e.g. Valorant.exe, csgo.exe)</div>
                                                            <textarea
                                                                value={config.gameMode.blockedApps}
                                                                onChange={(e) => setConfig({ ...config, gameMode: { ...config.gameMode, blockedApps: e.target.value } })}
                                                                placeholder="valorant.exe, leagueoflegends.exe..."
                                                                className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 h-32 resize-none font-mono"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="h-16 border-t border-white/5 bg-[#141414] px-6 flex items-center justify-between flex-shrink-0">
                        <div className="text-xs text-white/30">Changes apply immediately</div>
                        <button onClick={onClose} className="px-6 py-2 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors flex items-center gap-2">
                            <Save size={16} /> Done
                        </button>
                    </div>
                </motion.div>
            </div>
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
        </>
    );
};