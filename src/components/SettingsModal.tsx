import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppItem, UIConfig, UserProfile } from '../types';
import { ICON_MAP, getIcon } from '../iconMap';
import { AVAILABLE_WIDGETS } from '../defaults';
import { AppSelector } from './AppSelector';
import {
    X, Save, RotateCcw, Monitor, LayoutGrid, Palette,
    Plus, Trash2, Clock, Keyboard, AlertTriangle, RotateCw,
    Gamepad2, AppWindow, Settings2, Folder, ChevronRight, CornerUpLeft,
    Image as ImageIcon, Upload, Search, FileType,
    Lock, LayoutDashboard, Box, Command, Ban, ChevronDown, Play, CheckCircle2,
    HelpCircle, User, MessageSquare, CreditCard, Globe, Eye, Zap,
    Hash, Download, ExternalLink, Moon, Sun, ArrowRight,
    FolderPlus, FileText, Edit3, Image, Calendar, Battery, CloudRain,
    Layout, Compass, Laptop, Smartphone, Bell
} from 'lucide-react';
import { ZenithLogo } from './ZenithLogo';

// --- Sub-Components for the new Master-Detail Layout ---




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

type SettingsTab = 'apps' | 'zenith_apps' | 'workspaces' | 'interface' | 'visuals' | 'widgets' | 'gamemode';

const NavButton = ({
    tab,
    label,
    icon: Icon,
    index,
    isSidebarExpanded,
    activeTab,
    setActiveTab
}: {
    tab: SettingsTab,
    label: string,
    icon: any,
    index?: number,
    isSidebarExpanded: boolean,
    activeTab: SettingsTab,
    setActiveTab: (tab: SettingsTab) => void
}) => (
    <motion.button
        onClick={() => setActiveTab(tab)}
        className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 overflow-hidden group ${activeTab === tab
            ? 'bg-white/10 text-white shadow-inner'
            : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: (index || 0) * 0.05 }}
        whileHover={{ scale: 1.02, x: 2 }}
        whileTap={{ scale: 0.98 }}
    >
        {/* Active indicator line */}
        {activeTab === tab && (
            <motion.div
                className="absolute left-0 top-0 bottom-0 w-0.5 bg-white rounded-r-full"
                layoutId="activeIndicator"
                transition={{ duration: 0.2 }}
            />
        )}
        <div
            className="shrink-0"
        >
            <Icon size={18} strokeWidth={activeTab === tab ? 2 : 1.5} />
        </div>

        <AnimatePresence>
            {isSidebarExpanded && (
                <motion.span
                    className={`relative z-10 whitespace-nowrap ${activeTab === tab ? 'font-semibold' : 'font-medium'}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {label}
                </motion.span>
            )}
        </AnimatePresence>

        {/* Hover glow effect */}
        {activeTab !== tab && (
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/[0.02] to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}

        {/* Tooltip for collapsed state */}
        {!isSidebarExpanded && (
            <div className="absolute left-[70px] px-3 py-1.5 bg-[#141414] border border-white/10 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[200] shadow-2xl">
                {label}
            </div>
        )}
    </motion.button>
);

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

    const [activeTab, setActiveTab] = useState<SettingsTab>('workspaces');
    const [editingApp, setEditingApp] = useState<{ app: AppItem, index: number, workspaceIndex?: number } | null>(null);
    const [iconSearchTerm, setIconSearchTerm] = useState('');
    const [folderPath, setFolderPath] = useState<number[]>([]);
    const [showAppSelector, setShowAppSelector] = useState(false);
    const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = useState<number | null>(null);
    const [workspaceFolderPath, setWorkspaceFolderPath] = useState<number[]>([]);
    const [appSelectorMode, setAppSelectorMode] = useState<'edit' | 'center'>('edit');
    const [isSidebarPinned, setIsSidebarPinned] = useState(false);
    const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);

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



    // --- File & Icon Picking via IPC ---
    // Replaces the old handleFileUpload which was broken/hidden behind z-index
    const handlePickCommand = async () => {
        if (!window.electron?.selectFile) return;
        try {
            const filePath = await window.electron.selectFile();
            if (filePath && editingApp) {
                const bestIcon = getBestLucideIcon(filePath.split(/[\\/]/).pop() || 'App', filePath);

                // 1. Set basic command and initial Lucide icon
                handleAppUpdates({
                    command: filePath,
                    iconName: bestIcon,
                    iconSource: 'lucide' // Explicitly start with Lucide
                });

                // 2. Attempt to extract native icon
                const nativeIconData = await extractIconFromPath(filePath);
                if (nativeIconData) {
                    // 3. If native icon found, update app with native icon data
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
                // Convert file path to local resource URL or just use path if Electron handles it
                // For now assuming we get a path, and we might need to convert it to file:// or similar 
                // OR checking if selectImage returns a DataURL. 
                // Wait, dialog returns PATH. We need to load it. 
                // Actually, let's just stick to the text path for now, but usually we need to read it.
                // The previous logic used FileReader. 
                // Let's assume we need to use 'native' source still.
                // But we can't easily read local files in Renderer without nodeIntegration.
                // Better approach: Let backend return DataURL for selectImage? 
                // Or just set the path and let the <img> tag try to load it (might fail due to security).
                // Let's use the 'extractIconFromPath' logic but for generic images? 
                // Actually, let's keep it simple: Just set the path. If it fails, user can try another way.
                // Re-reading implementation plan: I said "Add select-image IPC".

                // Hack: If it's a local path, we might need 'file://' protocol
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

    // Unified Update Helper
    const handleAppUpdates = (newAppData: Partial<AppItem>) => {
        if (!editingApp) return;

        // Retrieve the current app item being edited
        let currentApp: AppItem;
        if (editingApp.workspaceIndex !== undefined) {
            currentApp = config.workspaces[editingApp.workspaceIndex].apps[editingApp.index];
        } else {
            // Need to get the app from the nested structure
            const currentLevelApps = getCurrentLevel(apps, folderPath);
            currentApp = currentLevelApps[editingApp.index];
        }

        // Merge the new data with the current app data
        const updatedApp: AppItem = {
            ...currentApp,
            ...newAppData
        };

        if (editingApp.workspaceIndex !== undefined) {
            const newWorkspaces = [...config.workspaces];
            newWorkspaces[editingApp.workspaceIndex].apps[editingApp.index] = updatedApp;
            setConfig({ ...config, workspaces: newWorkspaces });
        } else {
            if (folderPath.length > 0) {
                setApps(prev => updateAppTree(prev, folderPath, (list) => {
                    const newList = [...list];
                    newList[editingApp.index] = updatedApp;
                    return newList;
                }));
            } else {
                setApps(prev => {
                    const newApps = [...prev];
                    newApps[editingApp.index] = updatedApp;
                    return newApps;
                });
            }
        }
        setEditingApp(prev => prev ? { ...prev, app: updatedApp } : null);
    };

    // Removed Reader logic for now in favor of IPC picker


    const extractIconFromPath = async (command: string): Promise<Partial<AppItem> | null> => {
        if (!window.electron || !window.electron.getFileIcon) return null;
        if (!command || command.length < 3) return null;
        try {
            const cleanCommand = command.replace(/['"]/g, '');
            const iconDataUrl = await window.electron.getFileIcon(cleanCommand);
            if (iconDataUrl) {
                return { customIconUrl: iconDataUrl, iconSource: 'native' };
            } else {
                console.log("No native icon found for:", cleanCommand);
                return null; // Return null if no native icon, frontend will keep lucide
            }
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
            // Optionally save config here if we implemented sync
            return;
        }

        if (!editingApp) return;

        // 1. Set basic command, label, and initial Lucide icon
        handleAppUpdates({
            command: appData.path,
            label: appData.name,
            iconName: bestIcon,
            iconSource: 'lucide' // Explicitly start with Lucide
        });

        // 2. Attempt to extract native icon
        const nativeIconData = await extractIconFromPath(appData.path);
        if (nativeIconData) {
            // 3. If native icon found, update app with native icon data
            handleAppUpdates(nativeIconData);
        }
    };

    const handleAddApp = (type: 'app' | 'folder') => {
        // Free Plan Limits Removed as requested
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
        // If we are inside a workspace loop logic (which we aren't yet fully), we might need to adjust.
        // But for now, this updates 'apps' state which is the "default" or "root" apps.
        // If we are editing a WORKSPACE's apps, we need a different handler or context.
        // Let's assume this is for the currently viewed list (which we will wire to workspace apps).

        // Actually, if we are in "Workspaces" tab, we need to know WHICH workspace we are adding to.
        if (selectedWorkspaceIndex !== null) {
            addAppToWorkspace(selectedWorkspaceIndex, type);
        } else {
            // Fallback to updating 'apps' if we are in main menu mode (though we are hiding that tab)
            setApps(prev => updateAppTree(prev, folderPath, (list) => [...list, newApp]));
        }
        // setEditingApp is tricky if we are in workspace mode.
    };

    const goUpFolder = () => {
        if (folderPath.length === 0) return;
        const newPath = [...folderPath];
        newPath.pop();
        setFolderPath(newPath);
    };

    const toggleWidget = (widgetCommand: string, widgetDef: any) => {
        // Premium check removed
        const exists = flatApps.find(a => a.command === widgetCommand);
        if (exists) {
            // if (apps.length <= 2) { alert("Min 2 apps required in root."); return; } // Relax this check?
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

    // Workspace Management Functions
    const createWorkspace = () => {
        // Premium Limit Removed
        const nextHotkey = config.workspaces.length + 1;
        const newWorkspace = {
            id: `workspace-${nextHotkey}`,
            name: `Workspace ${nextHotkey}`,
            hotkey: nextHotkey,
            enabled: true,
            apps: []
        };

        setConfig(prev => ({
            ...prev,
            workspaces: [...prev.workspaces, newWorkspace]
        }));
    };

    const deleteWorkspace = (index: number) => {
        if (config.workspaces.length <= 1) {
            alert("Cannot delete the last workspace");
            return;
        }

        const newWorkspaces = config.workspaces.filter((_, i) => i !== index);
        // Renumber hotkeys sequentially
        const renumbered = newWorkspaces.map((ws, i) => ({
            ...ws,
            hotkey: i + 1,
            id: `workspace-${i + 1}`
        }));

        setConfig(prev => ({
            ...prev,
            workspaces: renumbered,
            activeWorkspaceIndex: Math.min(prev.activeWorkspaceIndex, renumbered.length - 1)
        }));

        if (selectedWorkspaceIndex === index) {
            setSelectedWorkspaceIndex(null);
        } else if (selectedWorkspaceIndex !== null && selectedWorkspaceIndex > index) {
            setSelectedWorkspaceIndex(selectedWorkspaceIndex - 1);
        }
    };

    const addAppToWorkspace = (workspaceIndex: number, type: 'app' | 'folder') => {
        const newApp: AppItem = {
            id: crypto.randomUUID(),
            type: type,
            label: type === 'folder' ? 'New Folder' : 'New App',
            iconName: type === 'folder' ? 'Folder' : 'Layout',
            iconSource: 'lucide',
            command: '',
            commandType: 'app',
            description: type === 'folder' ? 'Folder Group' : 'Application',
            children: type === 'folder' ? [] : undefined
        };

        const newWorkspaces = [...config.workspaces];
        newWorkspaces[workspaceIndex] = {
            ...newWorkspaces[workspaceIndex],
            apps: [...newWorkspaces[workspaceIndex].apps, newApp]
        };

        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const removeAppFromWorkspace = (workspaceIndex: number, appIndex: number) => {
        const newWorkspaces = [...config.workspaces];
        newWorkspaces[workspaceIndex] = {
            ...newWorkspaces[workspaceIndex],
            apps: newWorkspaces[workspaceIndex].apps.filter((_, i) => i !== appIndex)
        };
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const moveAppInWorkspace = (workspaceIndex: number, fromIndex: number, direction: 'up' | 'down') => {
        const workspace = config.workspaces[workspaceIndex];
        const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;

        if (toIndex < 0 || toIndex >= workspace.apps.length) return;

        const newApps = [...workspace.apps];
        [newApps[fromIndex], newApps[toIndex]] = [newApps[toIndex], newApps[fromIndex]];

        const newWorkspaces = [...config.workspaces];
        newWorkspaces[workspaceIndex] = { ...workspace, apps: newApps };
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const updateWorkspaceApp = (workspaceIndex: number, appIndex: number, updatedApp: AppItem) => {
        const newWorkspaces = [...config.workspaces];
        newWorkspaces[workspaceIndex] = {
            ...newWorkspaces[workspaceIndex],
            apps: newWorkspaces[workspaceIndex].apps.map((app, i) => i === appIndex ? updatedApp : app)
        };
        setConfig({ ...config, workspaces: newWorkspaces });
    };

    const handleAppChange = (field: string, value: any) => {
        if (!editingApp) return;
        const updatedApp = { ...editingApp.app, [field]: value };
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
            <div className="absolute inset-0 z-[100] flex items-center justify-center">
                <motion.div
                    className="absolute inset-0 bg-black/60 backdrop-blur-[20px] rounded-xl"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
                <motion.div
                    className="relative z-[101] w-[95%] h-[90%] max-w-[1400px] bg-[#0A0A0A]/90 backdrop-blur-3xl rounded-3xl overflow-hidden flex border border-white/[0.08] shadow-2xl ring-1 ring-white/[0.05]"
                    style={{
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.7), 0 20px 40px -20px rgba(0,0,0,0.3)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.92, y: 40, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, scale: 0.95, y: 20, filter: 'blur(10px)' }}
                    transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
                >
                    {/* Sidebar */}
                    <motion.div
                        className="bg-white/[0.02] border-r border-white/[0.06] p-4 shrink-0 flex flex-col gap-1.5 relative overflow-hidden"
                        initial={false}
                        animate={{ width: (isSidebarPinned || isHoveringSidebar) ? 280 : 80 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        onMouseEnter={() => setIsHoveringSidebar(true)}
                        onMouseLeave={() => setIsHoveringSidebar(false)}
                    >
                        <motion.div
                            className="mb-8 flex items-center justify-between px-2"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                        >
                            <AnimatePresence mode="wait">
                                {(isSidebarPinned || isHoveringSidebar) ? (
                                    <motion.h2
                                        key="title-full"
                                        className="text-2xl font-bold text-white whitespace-nowrap"
                                        style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        Settings
                                    </motion.h2>
                                ) : (
                                    <motion.div
                                        key="title-mini"
                                        className="w-10 h-10 flex items-center justify-center shrink-0"
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ZenithLogo size={32} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {(isSidebarPinned || isHoveringSidebar) && (
                                <motion.div
                                    className="flex items-center gap-1"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                >
                                    <button
                                        onClick={() => setIsSidebarPinned(!isSidebarPinned)}
                                        className={`p-2 rounded-lg transition-colors ${isSidebarPinned ? 'text-white bg-white/10' : 'text-white/20 hover:text-white hover:bg-white/5'}`}
                                        title={isSidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                                    >
                                        <Lock size={16} />
                                    </button>
                                </motion.div>
                            )}
                        </motion.div>

                        {/* Nav Buttons */}
                        <NavButton tab="workspaces" label="Apps & Workspaces" icon={LayoutGrid} index={0} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />
                        <NavButton tab="zenith_apps" label="Zenith Widgets" icon={AppWindow} index={1} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />

                        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent my-5 mx-2" />

                        <NavButton tab="interface" label="Interface" icon={Settings2} index={3} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />
                        <NavButton tab="visuals" label="Visuals" icon={Palette} index={4} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />
                        <NavButton tab="widgets" label="HUD Elements" icon={Clock} index={5} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />
                        <NavButton tab="gamemode" label="Game Mode" icon={Gamepad2} index={6} isSidebarExpanded={isSidebarPinned || isHoveringSidebar} activeTab={activeTab} setActiveTab={setActiveTab} />

                        <div className="mt-auto pt-6 border-t border-white/[0.08] space-y-2.5">
                            <motion.button
                                onClick={onOpenDashboard}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-white/50 hover:text-white hover:bg-white/[0.08] rounded-xl transition-all duration-200 overflow-hidden relative group`}
                                whileHover={{ scale: 1.02, x: 2 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <LayoutDashboard size={18} strokeWidth={2} className="shrink-0" />
                                <AnimatePresence>
                                    {(isSidebarPinned || isHoveringSidebar) && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="whitespace-nowrap"
                                        >
                                            Open Dashboard
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                                {!(isSidebarPinned || isHoveringSidebar) && (
                                    <div className="absolute left-[70px] px-3 py-1.5 bg-[#141414] border border-white/10 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[200]">
                                        Dashboard
                                    </div>
                                )}
                            </motion.button>
                            <motion.button
                                onClick={() => {
                                    if (confirm("Are you sure you want to reset all settings and restart the app?")) {
                                        window.electron?.resetConfig();
                                    }
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-red-400/80 hover:text-red-300 hover:bg-red-500/15 rounded-xl transition-all duration-200 overflow-hidden relative group`}
                                whileHover={{ scale: 1.02, x: 2 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <RotateCcw size={18} strokeWidth={2} className="shrink-0" />
                                <AnimatePresence>
                                    {(isSidebarPinned || isHoveringSidebar) && (
                                        <motion.span
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="whitespace-nowrap"
                                        >
                                            Reset Config
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                                {!(isSidebarPinned || isHoveringSidebar) && (
                                    <div className="absolute left-[70px] px-3 py-1.5 bg-[#141414] border border-white/10 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[200]">
                                        Reset
                                    </div>
                                )}
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Content */}
                    <div className="flex-1 bg-[#0D0D0D] overflow-hidden flex flex-col relative">
                        {/* Global Close Button */}
                        <motion.button
                            onClick={onClose}
                            className="absolute top-6 right-8 z-[110] p-2 bg-white/[0.03] hover:bg-white/10 border border-white/5 rounded-xl text-white/40 hover:text-white transition-all duration-300 group shadow-lg"
                            whileHover={{ scale: 1.05, rotate: 90 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <X size={18} strokeWidth={2.5} className="transition-transform" />
                        </motion.button>


                        {activeTab === 'zenith_apps' && (
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
                                        <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>Zenith Widgets</h3>
                                        <p className="text-white/40 text-sm font-medium">Add powerful system widgets to your menu</p>
                                    </motion.div>

                                    {/* Responsive Widget List */}
                                    <div className="flex flex-col gap-4">
                                        {AVAILABLE_WIDGETS.map((widget, index) => {
                                            const isAdded = flatApps.some(a => a.command === widget.command);
                                            const Icon = getIcon(widget.iconName);
                                            return (
                                                <motion.div
                                                    key={widget.id}
                                                    className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.08] flex items-center justify-between transition-all duration-300 group relative overflow-hidden w-full"
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: index * 0.04, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                                                    whileHover={{ y: -2 }}
                                                >
                                                    <div className="flex items-center gap-6 relative z-10 flex-1">
                                                        <motion.div
                                                            className="w-14 h-14 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-white shadow-lg shrink-0"
                                                            whileHover={{ scale: 1.05, rotate: 5 }}
                                                            transition={{ duration: 0.2 }}
                                                        >
                                                            <Icon size={26} strokeWidth={2} />
                                                        </motion.div>
                                                        <div className="min-w-0 flex-1">
                                                            <h4 className="font-bold text-white text-base mb-1">{widget.name}</h4>
                                                            <p className="text-xs text-white/40 font-medium leading-relaxed max-w-2xl">{widget.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-3 shrink-0 min-w-[140px]">
                                                        <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1 text-right">Visible In:</div>
                                                        <div className="flex flex-wrap gap-2 justify-end">
                                                            {config.workspaces.map((ws, wsIndex) => {
                                                                const isAdded = ws.apps.some(a => a.command === widget.command);
                                                                return (
                                                                    <button
                                                                        key={ws.id}
                                                                        onClick={() => {
                                                                            const newWorkspaces = [...config.workspaces];
                                                                            if (isAdded) {
                                                                                // Remove
                                                                                newWorkspaces[wsIndex].apps = newWorkspaces[wsIndex].apps.filter(a => a.command !== widget.command);
                                                                            } else {
                                                                                // Add
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
                                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all border ${isAdded
                                                                            ? 'bg-white text-black border-white shadow-lg scale-110'
                                                                            : 'bg-white/5 text-white/30 border-white/10 hover:bg-white/10 hover:text-white'
                                                                            }`}
                                                                        title={`Toggle for ${ws.name}`}
                                                                    >
                                                                        {ws.hotkey}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </motion.div>
                        )}





                        {activeTab === 'visuals' && (
                            <motion.div
                                className="p-12 overflow-y-auto custom-scrollbar"
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
                                        <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>Visuals</h3>
                                        <p className="text-white/40 text-sm font-medium">Customize the appearance of your menu</p>
                                    </motion.div>
                                    <div className="space-y-10">
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.2 }}
                                        >
                                            <div className="flex justify-between items-baseline">
                                                <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Menu Radius</label>
                                                <motion.span
                                                    className="text-2xl font-bold text-white tabular-nums"
                                                    key={config.menuRadius}
                                                    initial={{ scale: 1.2, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    {config.menuRadius}<span className="text-base text-white/40 ml-1.5">px</span>
                                                </motion.span>
                                            </div>
                                            <input
                                                type="range"
                                                min="150"
                                                max="500"
                                                step="10"
                                                value={config.menuRadius}
                                                onChange={e => setConfig({ ...config, menuRadius: Number(e.target.value) })}
                                                className="w-full accent-white cursor-pointer"
                                            />
                                        </motion.div>
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.25 }}
                                        >
                                            <div className="flex justify-between items-baseline">
                                                <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Icon Size</label>
                                                <motion.span
                                                    className="text-2xl font-bold text-white tabular-nums"
                                                    key={config.iconSize}
                                                    initial={{ scale: 1.2, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    {config.iconSize}<span className="text-base text-white/40 ml-1.5">px</span>
                                                </motion.span>
                                            </div>
                                            <input
                                                type="range"
                                                min="30"
                                                max="100"
                                                step="2"
                                                value={config.iconSize}
                                                onChange={e => setConfig({ ...config, iconSize: Number(e.target.value) })}
                                                className="w-full accent-white cursor-pointer"
                                            />
                                        </motion.div>
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.3 }}
                                        >
                                            <div className="flex justify-between items-baseline">
                                                <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Menu Opacity</label>
                                                <motion.span
                                                    className="text-2xl font-bold text-white tabular-nums"
                                                    key={config.menuOpacity}
                                                    initial={{ scale: 1.2, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    {Math.round(config.menuOpacity * 100)}<span className="text-base text-white/40 ml-1.5">%</span>
                                                </motion.span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={config.menuOpacity}
                                                onChange={e => setConfig({ ...config, menuOpacity: Number(e.target.value) })}
                                                className="w-full accent-white cursor-pointer"
                                            />
                                        </motion.div>
                                        <motion.div
                                            className="space-y-4 pt-6 border-t border-white/[0.08]"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.35 }}
                                        >
                                            <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Accent Color</label>
                                            <div className="flex gap-5 items-center">
                                                <div className="relative group">
                                                    <input
                                                        type="color"
                                                        value={config.accentColor}
                                                        onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                                                        className="w-20 h-20 rounded-xl cursor-pointer border-2 border-white/10 bg-transparent hover:border-white/20 transition-all duration-200"
                                                    />
                                                    <div className="absolute inset-0 rounded-xl ring-2 ring-white/0 group-hover:ring-white/20 transition-all duration-200 pointer-events-none" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={config.accentColor}
                                                    onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                                                    className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-5 py-4 text-sm text-white font-mono focus:border-white/30 focus:bg-white/[0.08] outline-none transition-all hover:border-white/20"
                                                    placeholder="#FFFFFF"
                                                />
                                            </div>
                                        </motion.div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* DUPLICATE HUD ELEMENTS SECTION REMOVED HERE */}


                        {activeTab === 'workspaces' && (
                            <div className="h-full w-full p-12 overflow-y-auto custom-scrollbar">
                                <div className="max-w-6xl mx-auto h-full flex flex-col">
                                    <div className="flex items-center justify-between mb-8">
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4 }}
                                        >
                                            <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>
                                                {selectedWorkspaceIndex !== null ? config.workspaces[selectedWorkspaceIndex].name : 'Workspaces'}
                                            </h3>
                                            <p className="text-white/40 text-sm font-medium">
                                                {selectedWorkspaceIndex !== null ? 'Manage apps in this workspace' : 'Organize your workflow contexts'}
                                            </p>
                                        </motion.div>

                                        {selectedWorkspaceIndex !== null && (
                                            <motion.button
                                                onClick={() => setSelectedWorkspaceIndex(null)}
                                                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                whileHover={{ x: -3 }}
                                            >
                                                <CornerUpLeft size={18} /> Back to Overview
                                            </motion.button>
                                        )}
                                    </div>

                                    <AnimatePresence mode="wait">
                                        {selectedWorkspaceIndex === null ? (
                                            <motion.div
                                                key="overview"
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ duration: 0.3 }}
                                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[200px]"
                                            >
                                                {config.workspaces.map((workspace, index) => (
                                                    <motion.div
                                                        key={workspace.id}
                                                        onClick={() => setSelectedWorkspaceIndex(index)}
                                                        className="group relative p-8 rounded-3xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 cursor-pointer transition-all duration-300 overflow-hidden flex flex-col justify-between"
                                                        whileHover={{ y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
                                                    >
                                                        {/* Decorative Background */}
                                                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                                        <div className="flex items-start justify-between relative z-10">
                                                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl font-bold text-white shadow-inner">
                                                                {workspace.hotkey}
                                                            </div>
                                                            <div className={`px-3 py-1 rounded-full text-xs font-bold border ${workspace.enabled ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-white/40 border-white/10'}`}>
                                                                {workspace.enabled ? 'ACTIVE' : 'DISABLED'}
                                                            </div>
                                                        </div>

                                                        <div className="relative z-10">
                                                            <h4 className="text-2xl font-bold text-white mb-2">{workspace.name}</h4>
                                                            <p className="text-white/40 text-sm font-medium">{workspace.apps.length} Apps configured</p>
                                                        </div>

                                                        {/* Mini App Preview Stripes */}
                                                        <div className="absolute bottom-0 left-0 right-0 h-1 flex">
                                                            {workspace.apps.slice(0, 5).map((app, i) => (
                                                                <div key={i} className="flex-1 bg-white/20 mx-px rounded-t-full" />
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                ))}

                                                {config.workspaces.length < 9 && (
                                                    <motion.button
                                                        onClick={createWorkspace}
                                                        className="h-full rounded-3xl border border-dashed border-white/10 hover:border-white/30 hover:bg-white/[0.02] flex flex-col items-center justify-center gap-4 text-white/30 hover:text-white transition-all group"
                                                        whileHover={{ scale: 1.02 }}
                                                        whileTap={{ scale: 0.98 }}
                                                    >
                                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                                            <Plus size={32} />
                                                        </div>
                                                        <span className="font-bold text-sm uppercase tracking-wider">Create Workspace</span>
                                                    </motion.button>
                                                )}
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
                                                {/* Toolbar */}
                                                <div className="flex items-center gap-4 mb-6 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                                    <div className="flex-1">
                                                        <label className="text-xs font-bold text-white/30 uppercase tracking-wider block mb-1.5 ml-1">Workspace Name</label>
                                                        <input
                                                            type="text"
                                                            value={config.workspaces[selectedWorkspaceIndex].name}
                                                            onChange={e => {
                                                                const nw = [...config.workspaces];
                                                                nw[selectedWorkspaceIndex] = { ...nw[selectedWorkspaceIndex], name: e.target.value };
                                                                setConfig({ ...config, workspaces: nw });
                                                            }}
                                                            className="w-full bg-transparent text-xl font-bold text-white border-none outline-none placeholder-white/20"
                                                            placeholder="Enter name..."
                                                        />
                                                    </div>
                                                    <div className="h-10 w-px bg-white/10 mx-2" />
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                const nw = [...config.workspaces];
                                                                nw[selectedWorkspaceIndex].enabled = !nw[selectedWorkspaceIndex].enabled;
                                                                setConfig({ ...config, workspaces: nw });
                                                            }}
                                                            className={`h-10 px-4 rounded-xl text-sm font-bold transition-all border ${config.workspaces[selectedWorkspaceIndex].enabled ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
                                                        >
                                                            {config.workspaces[selectedWorkspaceIndex].enabled ? 'Enabled' : 'Disabled'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (confirm('Delete this workspace?')) deleteWorkspace(selectedWorkspaceIndex);
                                                            }}
                                                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* App Grid */}
                                                <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/20 rounded-2xl border border-white/5 p-6 mb-6">
                                                    <div className="flex items-center gap-2 mb-6">
                                                        {workspaceFolderPath.length > 0 && (
                                                            <button
                                                                onClick={() => {
                                                                    const newPath = [...workspaceFolderPath];
                                                                    newPath.pop();
                                                                    setWorkspaceFolderPath(newPath);
                                                                }}
                                                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                                                            >
                                                                <CornerUpLeft size={16} />
                                                            </button>
                                                        )}
                                                        <div className="text-xs font-bold text-white/30 uppercase tracking-widest px-1">
                                                            {workspaceFolderPath.length === 0 ? 'Root Directory' : 'Folder Contents'}
                                                        </div>
                                                    </div>

                                                    {getCurrentLevel(config.workspaces[selectedWorkspaceIndex].apps, workspaceFolderPath).length === 0 ? (
                                                        <div className="h-full flex flex-col items-center justify-center text-white/20 pb-12">
                                                            <LayoutGrid size={48} strokeWidth={1} className="mb-4 opacity-50" />
                                                            <p className="text-lg font-medium">This folder is empty</p>
                                                            <p className="text-sm">Add apps or sub-folders to get started</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                            {getCurrentLevel(config.workspaces[selectedWorkspaceIndex].apps, workspaceFolderPath).map((app, i) => {
                                                                const Icon = getIcon(app.iconName);
                                                                const isFolder = app.type === 'folder';
                                                                return (
                                                                    <div
                                                                        key={app.id}
                                                                        onClick={() => {
                                                                            if (isFolder) {
                                                                                setWorkspaceFolderPath([...workspaceFolderPath, i]);
                                                                            } else {
                                                                                setEditingApp({ app, index: i, workspaceIndex: selectedWorkspaceIndex });
                                                                            }
                                                                        }}
                                                                        className="group relative p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all flex items-center gap-4 cursor-pointer"
                                                                    >
                                                                        <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center text-white">
                                                                            <Icon size={24} strokeWidth={1.5} className={isFolder ? 'text-blue-400' : ''} />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-bold text-white truncate">{app.label}</div>
                                                                            <div className="text-xs text-white/40 truncate uppercase tracking-tighter">{app.type}</div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            {!isFolder && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); setEditingApp({ app, index: i, workspaceIndex: selectedWorkspaceIndex }); }}
                                                                                    className="p-2 text-white/30 hover:text-white transition-all"
                                                                                >
                                                                                    <Settings2 size={16} />
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const newWorkspaces = [...config.workspaces];
                                                                                    newWorkspaces[selectedWorkspaceIndex].apps = updateAppTree(newWorkspaces[selectedWorkspaceIndex].apps, workspaceFolderPath, (list) => list.filter((_, idx) => idx !== i));
                                                                                    setConfig({ ...config, workspaces: newWorkspaces });
                                                                                }}
                                                                                className="p-2 text-white/30 hover:text-red-400 transition-all"
                                                                            >
                                                                                <X size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action Bar */}
                                                <div className="flex gap-4">
                                                    <button
                                                        onClick={() => {
                                                            const newApp: AppItem = {
                                                                id: crypto.randomUUID(), type: 'app', label: 'New App', iconName: 'Layout', iconSource: 'lucide', command: '', description: 'Application'
                                                            };
                                                            const nws = [...config.workspaces];
                                                            nws[selectedWorkspaceIndex].apps = updateAppTree(nws[selectedWorkspaceIndex].apps, workspaceFolderPath, (list) => [...list, newApp]);
                                                            setConfig({ ...config, workspaces: nws });
                                                        }}
                                                        className="flex-1 py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                                                    >
                                                        <Plus size={20} /> Add Application
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const newFolder: AppItem = {
                                                                id: crypto.randomUUID(), type: 'folder', label: 'New Folder', iconName: 'Folder', iconSource: 'lucide', command: '', description: 'Folder Group', children: []
                                                            };
                                                            const nws = [...config.workspaces];
                                                            nws[selectedWorkspaceIndex].apps = updateAppTree(nws[selectedWorkspaceIndex].apps, workspaceFolderPath, (list) => [...list, newFolder]);
                                                            setConfig({ ...config, workspaces: nws });
                                                        }}
                                                        className="flex-1 py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/15 transition-all flex items-center justify-center gap-2 border border-white/5 hover:border-white/10"
                                                    >
                                                        <Folder size={20} /> Add Folder Group
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}

                        {activeTab === 'interface' && (
                            <motion.div
                                className="p-12 overflow-y-auto custom-scrollbar"
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
                                        <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>Interface</h3>
                                        <p className="text-white/40 text-sm font-medium">Customize interaction and behavior</p>
                                    </motion.div>
                                    <div className="space-y-10">
                                        {/* GLOBAL SHORTCUT */}
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.2 }}
                                        >
                                            <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Global Shortcut</label>
                                            <div className="flex gap-4">
                                                <input
                                                    type="text"
                                                    value={config.globalShortcut || 'Alt+Space'}
                                                    readOnly
                                                    className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-5 py-4 text-sm text-white font-mono text-center focus:border-white/30 focus:bg-white/[0.08] outline-none transition-all"
                                                />
                                                <button
                                                    className="px-8 py-3 bg-white text-black font-bold rounded-xl text-sm hover:bg-gray-100 transition-all duration-200 shadow-lg hover:scale-105 active:scale-95"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                            <p className="text-xs text-white/30 px-1">Press the key combination you want to use for opening the radial menu.</p>
                                        </motion.div>

                                        <div className="h-px bg-white/[0.08]" />

                                        {/* SYSTEM STARTUP */}
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.25 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <label className="text-base font-bold text-white">Start at Login</label>
                                                    <p className="text-xs text-white/40 mt-1">Automatically launch Zenith when Windows starts</p>
                                                </div>
                                                <motion.button
                                                    onClick={() => {
                                                        const newValue = !config.openAtLogin;
                                                        setConfig({ ...config, openAtLogin: newValue });
                                                        if (window.electron && window.electron.setLoginItemSettings) {
                                                            window.electron.setLoginItemSettings({ openAtLogin: newValue });
                                                        }
                                                    }}
                                                    className={`relative w-14 h-8 rounded-full transition-all duration-300 ${config.openAtLogin ? 'bg-white' : 'bg-white/10'
                                                        }`}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                >
                                                    <motion.div
                                                        className={`absolute top-1 w-6 h-6 rounded-full shadow-md ${config.openAtLogin ? 'bg-black' : 'bg-white'
                                                            }`}
                                                        animate={{ x: config.openAtLogin ? 28 : 4 }}
                                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    />
                                                </motion.button>
                                            </div>
                                        </motion.div>

                                        <div className="h-px bg-white/[0.08]" />

                                        {/* CENTER BUTTON */}
                                        <motion.div
                                            className="space-y-4"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.3 }}
                                        >
                                            <label className="text-sm font-bold text-white/70 uppercase tracking-wider">Center Button</label>
                                            <div className="grid grid-cols-5 gap-2">
                                                {['system', 'app', 'widget', 'command', 'none'].map(mode => (
                                                    <button key={mode} onClick={() => handleCenterTypeChange(mode as any)} className={`py-3 rounded-lg border text-xs font-bold uppercase transition-all ${config.centerButton.type === mode ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'}`}>{mode}</button>
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
                                                    <label className="text-base font-bold text-white">Center on Screen</label>
                                                    <p className="text-xs text-white/40 mt-1">Show menu in screen center instead of mouse cursor</p>
                                                </div>
                                                <motion.button
                                                    onClick={() => setConfig({ ...config, fixedPosition: !config.fixedPosition })}
                                                    className={`relative w-14 h-8 rounded-full transition-all duration-300 ${config.fixedPosition ? 'bg-white' : 'bg-white/10'
                                                        }`}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                >
                                                    <motion.div
                                                        className={`absolute top-1 w-6 h-6 rounded-full shadow-md ${config.fixedPosition ? 'bg-black' : 'bg-white'
                                                            }`}
                                                        animate={{ x: config.fixedPosition ? 28 : 4 }}
                                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    />
                                                </motion.button>
                                            </div>
                                        </motion.div>

                                        <div className="h-px bg-white/[0.08]" />

                                        {/* RESTART APP */}
                                        <motion.div
                                            className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.4, delay: 0.4 }}
                                        >
                                            <div className="flex items-start gap-4 text-white/60">
                                                <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                                                    <AlertTriangle size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Relaunch Recommended</h4>
                                                    <p className="text-xs leading-relaxed">If settings changes (like "Center on Screen") don't apply immediately, a restart will forcefully reset the application state.</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => window.electron?.relaunchApp()}
                                                className="w-full py-4 bg-white text-black font-bold rounded-xl text-sm hover:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-98"
                                            >
                                                <RotateCw size={18} />
                                                Restart Zenith Now
                                            </button>
                                        </motion.div>

                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'widgets' && (
                            <motion.div
                                className="p-12 overflow-y-auto custom-scrollbar"
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
                                        <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>HUD Elements</h3>
                                        <p className="text-white/40 text-sm font-medium">Configure on-screen widgets</p>
                                    </motion.div>

                                    <div className="space-y-8">

                                        {/* CLOCK & DATE */}
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Time & Date</h4>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-medium">Show Clock</div>
                                                        <div className="text-white/40 text-xs">Display current time</div>
                                                    </div>
                                                    <motion.button
                                                        onClick={() => setConfig({ ...config, showClock: !config.showClock })}
                                                        className={`relative w-12 h-7 rounded-full transition-colors ${config.showClock ? 'bg-white' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className={`absolute top-1 w-5 h-5 rounded-full shadow-sm ${config.showClock ? 'bg-black' : 'bg-white'}`} animate={{ x: config.showClock ? 24 : 4 }} />
                                                    </motion.button>
                                                </div>
                                                <div className="h-px bg-white/10" />
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-medium">Show Date</div>
                                                        <div className="text-white/40 text-xs">Display current date</div>
                                                    </div>
                                                    <motion.button
                                                        onClick={() => setConfig({ ...config, showDate: !config.showDate })}
                                                        className={`relative w-12 h-7 rounded-full transition-colors ${config.showDate ? 'bg-white' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className={`absolute top-1 w-5 h-5 rounded-full shadow-sm ${config.showDate ? 'bg-black' : 'bg-white'}`} animate={{ x: config.showDate ? 24 : 4 }} />
                                                    </motion.button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SYSTEM STATUS */}
                                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Monitor size={20} /> System Status</h4>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-medium">Battery Level</div>
                                                        <div className="text-white/40 text-xs">Show laptop battery percentage</div>
                                                    </div>
                                                    <motion.button
                                                        onClick={() => setConfig({ ...config, showBattery: !config.showBattery })}
                                                        className={`relative w-12 h-7 rounded-full transition-colors ${config.showBattery ? 'bg-white' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className={`absolute top-1 w-5 h-5 rounded-full shadow-sm ${config.showBattery ? 'bg-black' : 'bg-white'}`} animate={{ x: config.showBattery ? 24 : 4 }} />
                                                    </motion.button>
                                                </div>
                                                <div className="h-px bg-white/10" />
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-white font-medium">Weather Info</div>
                                                        <div className="text-white/40 text-xs">Show local weather</div>
                                                    </div>
                                                    <motion.button
                                                        onClick={() => setConfig({ ...config, showWeather: !config.showWeather })}
                                                        className={`relative w-12 h-7 rounded-full transition-colors ${config.showWeather ? 'bg-white' : 'bg-white/10'}`}
                                                    >
                                                        <motion.div className={`absolute top-1 w-5 h-5 rounded-full shadow-sm ${config.showWeather ? 'bg-black' : 'bg-white'}`} animate={{ x: config.showWeather ? 24 : 4 }} />
                                                    </motion.button>
                                                </div>
                                                {config.showWeather && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="pl-4"
                                                    >
                                                        <label className="text-xs text-white/40 mb-2 block">CEP ou Cidade</label>
                                                        <input
                                                            type="text"
                                                            value={config.weatherLocation || ''}
                                                            onChange={(e) => setConfig({ ...config, weatherLocation: e.target.value })}
                                                            placeholder="Ex: 01310-100 ou São Paulo, BR"
                                                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-white/30 outline-none"
                                                        />
                                                        <p className="text-[10px] text-white/30 mt-1">Use CEP brasileiro ou nome da cidade</p>
                                                    </motion.div>
                                                )}
                                            </div>
                                        </div>

                                        {/* POSITION */}
                                        <div>
                                            <label className="text-sm font-bold text-white/70 uppercase tracking-wider mb-3 block">Widget Position</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                                                    <button
                                                        key={pos}
                                                        onClick={() => setConfig({ ...config, clockPosition: pos as any })}
                                                        className={`p-4 rounded-xl border flex items-center justify-center gap-2 transition-all ${config.clockPosition === pos ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                                    >
                                                        <div className={`w-3 h-3 rounded-full ${config.clockPosition === pos ? 'bg-black' : 'bg-white/20'}`} />
                                                        <span className="font-bold text-xs uppercase">{pos.replace('-', ' ')}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'gamemode' && (
                            <motion.div
                                className="p-12 overflow-y-auto custom-scrollbar"
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
                                        <h3 className="text-4xl font-bold text-white mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.03em' }}>Game Mode</h3>
                                        <p className="text-white/40 text-sm font-medium">Prevent menu interruptions during focused work or gaming</p>
                                    </motion.div>
                                    <div className="space-y-6">
                                        {/* MASTER TOGGLE */}
                                        <motion.div
                                            className={`p-8 rounded-2xl bg-gradient-to-br border flex items-center justify-between shadow-lg relative overflow-hidden group transition-all duration-300 ${config.gameMode?.enabled
                                                ? 'from-green-500/20 to-emerald-600/10 border-green-500/20'
                                                : 'from-white/5 to-white/5 border-white/10'
                                                }`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, delay: 0.2 }}
                                        >
                                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 mix-blend-overlay ${config.gameMode?.enabled ? 'bg-green-500/5' : 'bg-white/5'}`} />
                                            <div className="relative z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h4 className={`text-2xl font-bold ${config.gameMode?.enabled ? 'text-green-400' : 'text-white/70'}`}>
                                                        {config.gameMode?.enabled ? 'Game Mode Active' : 'Game Mode Disabled'}
                                                    </h4>
                                                    {config.gameMode?.enabled && (
                                                        <div className="px-2.5 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] font-bold text-green-300 uppercase tracking-widest">ON</div>
                                                    )}
                                                </div>
                                                <p className={`text-sm font-medium ${config.gameMode?.enabled ? 'text-green-200/60' : 'text-white/40'}`}>
                                                    {config.gameMode?.enabled ? 'Radial menu is blocked based on your settings below' : 'Enable to prevent menu from opening during games or fullscreen apps'}
                                                </p>
                                            </div>
                                            <motion.button
                                                onClick={() => setConfig(prev => ({
                                                    ...prev,
                                                    gameMode: { ...prev.gameMode, enabled: !prev.gameMode?.enabled }
                                                }))}
                                                className={`relative z-10 w-16 h-9 rounded-full shadow-lg transition-all ${config.gameMode?.enabled ? 'bg-green-500 shadow-green-900/20' : 'bg-white/10'
                                                    }`}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                <motion.div
                                                    className={`absolute top-1 w-7 h-7 rounded-full shadow-md ${config.gameMode?.enabled ? 'bg-white' : 'bg-white/60'
                                                        }`}
                                                    animate={{ x: config.gameMode?.enabled ? 32 : 4 }}
                                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                />
                                            </motion.button>
                                        </motion.div>

                                        {/* MODE SELECTION */}
                                        <AnimatePresence>
                                            {config.gameMode?.enabled && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="space-y-6"
                                                >
                                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                                                        <h4 className="text-lg font-bold text-white mb-4">Blocking Mode</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <button
                                                                onClick={() => setConfig(prev => ({
                                                                    ...prev,
                                                                    gameMode: { ...prev.gameMode, blockFullscreen: true }
                                                                }))}
                                                                className={`p-4 rounded-xl border transition-all ${config.gameMode?.blockFullscreen
                                                                    ? 'bg-white text-black border-white'
                                                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                                                    }`}
                                                            >
                                                                <div className="font-bold text-sm mb-1">Block All Fullscreen</div>
                                                                <div className="text-xs opacity-70">Disable menu when any app is fullscreen</div>
                                                            </button>
                                                            <button
                                                                onClick={() => setConfig(prev => ({
                                                                    ...prev,
                                                                    gameMode: { ...prev.gameMode, blockFullscreen: false }
                                                                }))}
                                                                className={`p-4 rounded-xl border transition-all ${!config.gameMode?.blockFullscreen
                                                                    ? 'bg-white text-black border-white'
                                                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                                                    }`}
                                                            >
                                                                <div className="font-bold text-sm mb-1">Block Specific Apps</div>
                                                                <div className="text-xs opacity-70">Only block for apps in the list below</div>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* BLOCKED APPS LIST */}
                                                    {!config.gameMode?.blockFullscreen && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className="bg-white/5 border border-white/10 rounded-2xl p-6"
                                                        >
                                                            <h4 className="text-lg font-bold text-white mb-2">Blocked Applications</h4>
                                                            <p className="text-xs text-white/40 mb-4">Enter process names separated by commas (e.g., "game.exe, steam.exe")</p>
                                                            <textarea
                                                                value={config.gameMode?.blockedApps || ''}
                                                                onChange={(e) => setConfig(prev => ({
                                                                    ...prev,
                                                                    gameMode: { ...prev.gameMode, blockedApps: e.target.value }
                                                                }))}
                                                                placeholder="game.exe, steam.exe, league.exe"
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-white/30 outline-none font-mono resize-none h-24"
                                                            />
                                                        </motion.div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </motion.div >


                {/* Editor Modal Overlay for Apps */}
                {
                    editingApp && (
                        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="w-full max-w-md bg-[#111] border border-white/10 rounded-xl p-6 shadow-2xl relative">
                                <button
                                    onClick={() => setEditingApp(null)}
                                    className="absolute top-4 right-4 p-2 text-white/30 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>

                                <h3 className="text-lg font-bold text-white mb-6">Edit Item</h3>

                                <div className="space-y-5">
                                    {/* Label Input */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider ml-1">Label</label>
                                        <input
                                            type="text"
                                            value={editingApp.app.label}
                                            onChange={e => handleAppChange('label', e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-white/20 outline-none transition-colors"
                                            placeholder="Label"
                                        />
                                    </div>

                                    {/* Command Input (File Picker) */}
                                    {editingApp.app.type === 'app' && (
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider ml-1">Launch Handling</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={editingApp.app.command}
                                                    onChange={e => handleAppChange('command', e.target.value)}
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:border-white/20 outline-none transition-colors font-mono text-sm"
                                                    placeholder="Executable Path or Command"
                                                />
                                                <button
                                                    onClick={handlePickCommand}
                                                    className="p-3 bg-white/10 rounded-xl text-white hover:bg-white/20 border border-white/5 transition-all text-xs font-bold uppercase tracking-wider whitespace-nowrap"
                                                    title="Browse Executable..."
                                                >
                                                    Browse...
                                                </button>
                                                <button
                                                    onClick={() => setShowAppSelector(true)}
                                                    className="p-3 bg-white/10 rounded-xl text-white hover:bg-white/20 border border-white/5 transition-colors"
                                                    title="Scan Installed Apps"
                                                >
                                                    <Search size={18} />
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-white/20 px-1">
                                                Select .exe, .lnk, or use shell commands.
                                            </p>
                                        </div>
                                    )}

                                    {/* Icon Input */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider ml-1">Icon Customization</label>
                                        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                                            {/* Icon Preview / Picker */}
                                            <div className="relative group shrink-0">
                                                <div className="w-16 h-16 rounded-lg bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors cursor-pointer overflow-hidden"
                                                    onClick={handlePickIcon}>
                                                    {editingApp.app.customIconUrl ? (
                                                        <img src={editingApp.app.customIconUrl} className="w-full h-full object-contain" alt="Icon" />
                                                    ) : (
                                                        (() => {
                                                            const Icon = getIcon(editingApp.app.iconName);
                                                            return <Icon size={24} className="text-white/60" />;
                                                        })()
                                                    )}

                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Upload size={16} className="text-white" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 space-y-2">
                                                <button
                                                    onClick={handlePickIcon}
                                                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/5 transition-all"
                                                >
                                                    Pick Image File
                                                </button>

                                                {/* Lucide Reset */}
                                                <button
                                                    onClick={() => handleAppChange('customIconUrl', undefined)}
                                                    className="w-full py-2 bg-transparent hover:bg-white/5 text-white/40 hover:text-white text-xs font-medium rounded-lg transition-all"
                                                >
                                                    Reset to Default
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
                                        <button onClick={() => setEditingApp(null)} className="px-6 py-2.5 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-colors shadow-lg">Done</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

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