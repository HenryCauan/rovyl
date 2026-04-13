import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Loader2, Monitor, Folder, Package, Terminal,
    Globe, Link, ChevronRight, FolderOpen, ArrowRight, Check
} from 'lucide-react';

interface WindowsApp {
    Name: string;
    Path: string;
    IconPath: string;
    DisplayName: string;
}

interface AppSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onAppSelect: (app: { name: string; path: string; type?: 'app' | 'url' | 'folder' }) => void;
    /** Only the installed-apps list (no URL / folder tabs) — e.g. game mode block list */
    appsOnly?: boolean;
    title?: string;
    subtitle?: string;
}

type Tab = 'apps' | 'url' | 'folder';

// ─── App Icon with lazy native icon fetch ─────────────────────────────────────
const AppIcon: React.FC<{ path: string; size?: number }> = ({ path, size = 40 }) => {
    const [iconUrl, setIconUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!path || path.length < 2) return;
        let isMounted = true;
        const fetch = async () => {
            try {
                if (window.electron?.getFileIcon) {
                    const url = await window.electron.getFileIcon(path);
                    if (isMounted && url) setIconUrl(url);
                }
            } catch { /* silent */ }
        };
        fetch();
        return () => { isMounted = false; };
    }, [path]);

    const isAUMID = path.includes('!');
    const isSimple = !path.includes('\\') && !path.includes('/') && !isAUMID;

    return (
        <div
            className="rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-white/[0.04] border border-white/[0.06]"
            style={{ width: size, height: size }}
        >
            {iconUrl ? (
                <img src={iconUrl} className="w-full h-full object-contain p-1.5" alt="" />
            ) : isAUMID ? (
                <Package size={size * 0.5} className="text-blue-400/40" />
            ) : isSimple ? (
                <Terminal size={size * 0.5} className="text-emerald-400/40" />
            ) : (
                <Monitor size={size * 0.5} className="text-white/20" />
            )}
        </div>
    );
};

// ─── Tab Button ────────────────────────────────────────────────────────────────
const TabBtn: React.FC<{
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    count?: number;
}> = ({ active, onClick, icon, label, count }) => (
    <button
        onClick={onClick}
        className={`
            relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
            ${active
                ? 'bg-white text-black shadow-lg'
                : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
            }
        `}
    >
        {icon}
        <span>{label}</span>
        {count !== undefined && (
            <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${active ? 'bg-black/10 text-black/50' : 'bg-white/10 text-white/40'}`}>
                {count > 999 ? '999+' : count}
            </span>
        )}
    </button>
);

// ─── Main Component ────────────────────────────────────────────────────────────
export const AppSelector: React.FC<AppSelectorProps> = ({
    isOpen,
    onClose,
    onAppSelect,
    appsOnly = false,
    title = 'Adicionar ao Workspace',
    subtitle = 'Escolha o tipo de atalho',
}) => {
    const [tab, setTab] = useState<Tab>('apps');
    const [apps, setApps] = useState<WindowsApp[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [urlName, setUrlName] = useState('');
    const [folderPath, setFolderPath] = useState('');
    const [folderName, setFolderName] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    // Load apps on open
    useEffect(() => {
        if (!isOpen) return;
        setTab('apps');
        setSearchTerm('');
        setUrlInput('');
        setUrlName('');
        setFolderPath('');
        setFolderName('');
        loadApps();
    }, [isOpen, appsOnly]);

    // Autofocus search
    useEffect(() => {
        if (isOpen && tab === 'apps') {
            setTimeout(() => searchRef.current?.focus(), 100);
        }
    }, [isOpen, tab]);

    // Cursor fix on close
    useEffect(() => {
        if (!isOpen) document.body.style.cursor = 'default';
    }, [isOpen]);

    const loadApps = async () => {
        setLoading(true);
        try {
            if (window.electron?.getInstalledApps) {
                const list = await window.electron.getInstalledApps();
                setApps(list || []);
            }
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    };

    const filteredApps = useMemo(() => {
        const t = searchTerm.toLowerCase();
        return !t ? apps : apps.filter(a =>
            a.Name.toLowerCase().includes(t) || a.DisplayName.toLowerCase().includes(t)
        );
    }, [apps, searchTerm]);

    // Lazy pagination
    const [visibleCount, setVisibleCount] = useState(40);
    const visibleApps = useMemo(() => filteredApps.slice(0, visibleCount), [filteredApps, visibleCount]);
    useEffect(() => setVisibleCount(40), [searchTerm]);
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 250) {
            setVisibleCount(p => Math.min(p + 40, filteredApps.length));
        }
    };

    const handleAppSelect = (app: WindowsApp) => {
        onAppSelect({ name: app.DisplayName, path: app.Path, type: 'app' });
        document.body.style.cursor = 'default';
        onClose();
    };

    const handleUrlConfirm = () => {
        let url = urlInput.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        onAppSelect({ name: urlName.trim() || url, path: url, type: 'url' });
        onClose();
    };

    const handlePickFolder = async () => {
        if (!window.electron?.selectFolder) return;
        const p = await window.electron.selectFolder();
        if (p) {
            setFolderPath(p);
            if (!folderName) setFolderName(p.split(/[/\\]/).filter(Boolean).pop() || '');
        }
    };

    const handleFolderConfirm = () => {
        if (!folderPath) return;
        onAppSelect({
            name: folderName.trim() || folderPath.split(/[/\\]/).filter(Boolean).pop() || 'Pasta',
            path: folderPath,
            type: 'folder'
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] grid place-items-center overflow-hidden cursor-default">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/90 backdrop-blur-lg"
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ type: 'spring', damping: 28, stiffness: 380, mass: 0.7 }}
                className="relative z-[201] w-[92%] max-w-xl bg-[#0A0A0A] border border-white/[0.08] rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_50px_80px_-10px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col cursor-default"
                style={{ height: 'min(80vh, 620px)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
                    <div>
                        <h2 className="text-base font-semibold text-white tracking-tight">{title}</h2>
                        <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ── Tabs ── */}
                {!appsOnly ? (
                    <div className="flex gap-1.5 px-5 py-3 border-b border-white/[0.06] shrink-0 bg-[#0c0c0c]">
                        <TabBtn
                            active={tab === 'apps'}
                            onClick={() => setTab('apps')}
                            icon={<Monitor size={14} />}
                            label="Apps"
                            count={apps.length}
                        />
                        <TabBtn
                            active={tab === 'url'}
                            onClick={() => setTab('url')}
                            icon={<Globe size={14} />}
                            label="URL"
                        />
                        <TabBtn
                            active={tab === 'folder'}
                            onClick={() => setTab('folder')}
                            icon={<Folder size={14} />}
                            label="Pasta"
                        />
                    </div>
                ) : (
                    <div className="px-5 py-2.5 border-b border-white/[0.06] shrink-0 bg-[#0c0c0c]">
                        <span className="text-[11px] font-medium text-white/35 uppercase tracking-wider">Apps instalados</span>
                    </div>
                )}

                {/* ── Content ── */}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <AnimatePresence mode="wait">

                        {/* ─ Apps Tab ─ */}
                        {tab === 'apps' && (
                            <motion.div
                                key="apps"
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                transition={{ duration: 0.15 }}
                                className="flex flex-col flex-1 min-h-0 overflow-hidden"
                            >
                                {/* Search */}
                                <div className="px-3 py-3 shrink-0">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                                        <input
                                            ref={searchRef}
                                            type="text"
                                            placeholder="Pesquisar aplicativo..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            className="w-full bg-white/[0.04] border border-white/[0.07] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all duration-200"
                                        />
                                        {searchTerm && (
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors"
                                            >
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-hidden min-h-0 px-3 pb-3">
                                    {loading ? (
                                        <div className="h-full flex flex-col items-center justify-center gap-3 text-white/30">
                                            <Loader2 size={24} className="animate-spin" />
                                            <span className="text-xs">Carregando aplicativos...</span>
                                        </div>
                                    ) : visibleApps.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center gap-3">
                                            <Package size={36} className="text-white/10" />
                                            <span className="text-sm text-white/25">
                                                {searchTerm ? 'Nenhum app encontrado' : 'Nenhum app disponível'}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="h-full overflow-y-auto space-y-0.5 pr-1" onScroll={handleScroll}>
                                            {visibleApps.map((app, i) => (
                                                <motion.button
                                                    key={`${app.Path}-${i}`}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    transition={{ delay: Math.min(i * 0.005, 0.2) }}
                                                    onClick={() => handleAppSelect(app)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left group hover:bg-white/[0.06] active:bg-white/10 transition-all duration-150 cursor-pointer"
                                                >
                                                    <AppIcon path={app.Path} size={36} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium text-white/80 group-hover:text-white truncate transition-colors">{app.DisplayName}</div>
                                                        <div className="text-[10px] text-white/20 font-mono truncate mt-0.5">{app.Path}</div>
                                                    </div>
                                                    <ChevronRight size={14} className="text-white/10 group-hover:text-white/40 transition-all -translate-x-1 group-hover:translate-x-0 flex-shrink-0" />
                                                </motion.button>
                                            ))}
                                            <div className="h-2" />
                                        </div>
                                    )}
                                </div>

                                {/* Footer count */}
                                {!loading && filteredApps.length > 0 && (
                                    <div className="px-5 py-2.5 border-t border-white/[0.05] shrink-0 flex items-center justify-between bg-[#0c0c0c]">
                                        <span className="text-[11px] text-white/20 tabular-nums">
                                            {visibleApps.length} de {filteredApps.length} apps
                                        </span>
                                        {filteredApps.length > visibleCount && (
                                            <button onClick={() => setVisibleCount(p => p + 40)} className="text-[11px] text-white/40 hover:text-white transition-colors flex items-center gap-1">
                                                Carregar mais <ArrowRight size={11} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* ─ URL Tab ─ */}
                        {tab === 'url' && (
                            <motion.div
                                key="url"
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                transition={{ duration: 0.15 }}
                                className="flex flex-col flex-1 min-h-0 p-5 gap-4"
                            >
                                {/* Illustration */}
                                <div className="flex justify-center py-4">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                        <Globe size={28} className="text-blue-400/60" />
                                    </div>
                                </div>

                                {/* Fields */}
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">URL</label>
                                        <div className="relative">
                                            <Link size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                                            <input
                                                type="url"
                                                autoFocus
                                                placeholder="https://exemplo.com"
                                                value={urlInput}
                                                onChange={e => setUrlInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleUrlConfirm()}
                                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.07] transition-all duration-200 font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">Nome de exibição</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: YouTube, Company Portal..."
                                            value={urlName}
                                            onChange={e => setUrlName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleUrlConfirm()}
                                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.07] transition-all duration-200"
                                        />
                                    </div>
                                </div>

                                <div className="mt-auto pt-2">
                                    <button
                                        onClick={handleUrlConfirm}
                                        disabled={!urlInput.trim()}
                                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-white text-black hover:bg-white/90 active:scale-[0.98]"
                                    >
                                        <Check size={16} />
                                        Adicionar URL
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ─ Folder Tab ─ */}
                        {tab === 'folder' && (
                            <motion.div
                                key="folder"
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                transition={{ duration: 0.15 }}
                                className="flex flex-col flex-1 min-h-0 p-5 gap-4"
                            >
                                {/* Pick folder button */}
                                <div className="flex justify-center py-4">
                                    <button
                                        onClick={handlePickFolder}
                                        className={`
                                        w-full py-5 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all duration-200 group
                                        ${folderPath
                                                ? 'border-white/20 bg-white/[0.04]'
                                                : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'
                                            }
                                    `}
                                    >
                                        {folderPath ? (
                                            <>
                                                <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                                                    <FolderOpen size={24} className="text-amber-400/70" />
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-sm font-medium text-white/70">{folderPath.split(/[/\\]/).filter(Boolean).pop()}</div>
                                                    <div className="text-[10px] text-white/25 font-mono mt-0.5 max-w-xs truncate">{folderPath}</div>
                                                </div>
                                                <span className="text-xs text-white/30 hover:text-white/60 transition-colors">Clique para alterar</span>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/[0.07] transition-all">
                                                    <Folder size={24} className="text-white/25 group-hover:text-white/50 transition-colors" />
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-sm font-medium text-white/40 group-hover:text-white/60 transition-colors">Selecionar pasta</div>
                                                    <div className="text-xs text-white/20 mt-0.5">Clique para abrir o explorador</div>
                                                </div>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Name override */}
                                {folderPath && (
                                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                        <label className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2 block">Nome de exibição</label>
                                        <input
                                            type="text"
                                            placeholder="Nome da pasta..."
                                            value={folderName}
                                            onChange={e => setFolderName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleFolderConfirm()}
                                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.07] transition-all duration-200"
                                        />
                                    </motion.div>
                                )}

                                <div className="mt-auto pt-2">
                                    <button
                                        onClick={handleFolderConfirm}
                                        disabled={!folderPath}
                                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed bg-white text-black hover:bg-white/90 active:scale-[0.98]"
                                    >
                                        <Check size={16} />
                                        Adicionar Pasta
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};