import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, Monitor, Folder, Package, ChevronRight, Terminal } from 'lucide-react';

interface WindowsApp {
    Name: string;
    Path: string;
    IconPath: string;
    DisplayName: string;
}

interface AppSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onAppSelect: (app: { name: string; path: string }) => void;
}

const AppIcon: React.FC<{ path: string; isSelected: boolean }> = ({ path, isSelected }) => {
    const [iconUrl, setIconUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Relaxed check: allow everything except obviously empty strings
        if (!path || path.length < 2) return;

        let isMounted = true;
        const fetchIcon = async () => {
            setLoading(true);
            try {
                if (window.electron && window.electron.getFileIcon) {
                    const url = await window.electron.getFileIcon(path);
                    if (isMounted) setIconUrl(url);
                }
            } catch (e) {
                console.error('Failed to fetch icon for', path, e);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchIcon();
        return () => { isMounted = false; };
    }, [path]);

    return (
        <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden
            ${isSelected ? 'bg-black/10' : 'bg-black/40'}
        `}>
            {iconUrl ? (
                <img src={iconUrl} className="w-full h-full object-contain p-1.5" alt="" />
            ) : path.includes('!') ? (
                <Package size={20} className={isSelected ? 'text-black/40' : 'text-blue-400/40'} />
            ) : (!path.includes('\\') && !path.includes('/')) ? (
                <Terminal size={20} className={isSelected ? 'text-black/40' : 'text-emerald-400/40'} />
            ) : (
                <Monitor size={20} className={isSelected ? 'text-black/40' : 'text-white/20'} />
            )}
        </div>
    );
};

export const AppSelector: React.FC<AppSelectorProps> = ({ isOpen, onClose, onAppSelect }) => {
    const [apps, setApps] = useState<WindowsApp[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAppIndex, setSelectedAppIndex] = useState<number | null>(null);

    // Load installed apps when modal opens
    useEffect(() => {
        if (isOpen) {
            loadApps();
        }
    }, [isOpen]);

    const loadApps = async () => {
        setLoading(true);
        try {
            if (window.electron && window.electron.getInstalledApps) {
                const installedApps = await window.electron.getInstalledApps();
                setApps(installedApps || []);
            }
        } catch (error) {
            console.error('Failed to load apps:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter apps based on search - Optimized for large lists
    const filteredApps = useMemo(() => {
        const term = searchTerm.toLowerCase();
        if (!term) return apps.slice(0, 150); // Limit initial view for performance

        return apps.filter(app =>
            app.Name.toLowerCase().includes(term) ||
            app.DisplayName.toLowerCase().includes(term)
        ).slice(0, 150);
    }, [apps, searchTerm]);

    const handleAppSelect = (app: WindowsApp, index: number) => {
        setSelectedAppIndex(index);
        onAppSelect({
            name: app.DisplayName,
            path: app.Path
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] grid place-items-center overflow-hidden">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative z-[201] w-[90%] max-w-2xl h-[80vh] bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#141414] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                            <Monitor size={16} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-medium text-white">Select Application</h2>
                            <p className="text-xs text-white/40">Choose from {apps.length} installed applications</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} className="text-white/60" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-4 border-b border-white/5 bg-[#121212] shrink-0">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                            type="text"
                            placeholder="Search applications..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-[#1A1A1A] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Apps List */}
                <div className="flex-1 overflow-hidden min-h-0">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <Loader2 size={32} className="text-white/40 animate-spin mx-auto mb-3" />
                                <p className="text-white/40 text-sm">Scanning installed applications...</p>
                            </div>
                        </div>
                    ) : filteredApps.length === 0 ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <Package size={48} className="text-white/20 mx-auto mb-3" />
                                <p className="text-white/40 text-sm">
                                    {searchTerm ? 'No applications found' : 'No applications available'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {filteredApps.map((app, index) => (
                                <motion.button
                                    key={`${app.Path}-${index}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: Math.min(index * 0.01, 0.5) }}
                                    onClick={() => handleAppSelect(app, index)}
                                    className={`
                                        w-full p-3 rounded-lg flex items-center gap-3 transition-all duration-200 text-left group
                                        ${selectedAppIndex === index
                                            ? 'bg-white text-black'
                                            : 'bg-white/5 text-white hover:bg-white/10'
                                        }
                                    `}
                                >
                                    <AppIcon path={app.Path} isSelected={selectedAppIndex === index} />

                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{app.DisplayName}</div>
                                        <div className={`
                                            text-[10px] font-mono truncate opacity-60
                                            ${selectedAppIndex === index ? 'opacity-70' : 'opacity-30'}
                                        `}>
                                            {app.Path}
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className={`
                                        flex-shrink-0 transition-all
                                        ${selectedAppIndex === index ? 'opacity-70 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-30 group-hover:translate-x-0'}
                                    `} />
                                </motion.button>
                            ))}
                            {/* Loading state for more apps could go here if paginated */}
                            <div className="h-10 shrink-0" />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="h-12 border-t border-white/5 flex items-center justify-between px-6 bg-[#141414] shrink-0">
                    <div className="text-xs text-white/40">
                        Showing {filteredApps.length} of {apps.length} applications
                    </div>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </motion.div>
        </div>
    );
};