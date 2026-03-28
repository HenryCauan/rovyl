import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Note, UIConfig } from '../types';
import { Plus, X, Trash2, PenLine, Search } from 'lucide-react';
import { getTranslation } from '../translations';

interface NotesWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    notes: Note[];
    setNotes: (notes: Note[]) => void;
    config: UIConfig;
}

export const NotesWidget: React.FC<NotesWidgetProps> = ({ isOpen, onClose, notes, setNotes, config }) => {
    const [activeNoteId, setActiveNoteId] = useState<string | null>(notes.length > 0 ? notes[0].id : null);
    const [searchQuery, setSearchQuery] = useState('');

    const t = (key: string) => getTranslation(config, key);
    const accent = config.accentColor || '#ffffff';

    const activeNote = notes.find(n => n.id === activeNoteId);

    const handleCreate = () => {
        const newNote: Note = { id: crypto.randomUUID(), title: '', content: '', date: new Date().toISOString() };
        setNotes([newNote, ...notes]);
        setActiveNoteId(newNote.id);
    };

    const handleUpdate = (id: string, updates: Partial<Note>) =>
        setNotes(notes.map(n => n.id === id ? { ...n, ...updates } : n));

    const handleDelete = (id: string) => {
        const updated = notes.filter(n => n.id !== id);
        setNotes(updated);
        setActiveNoteId(updated.length > 0 ? updated[0].id : null);
    };

    const filteredNotes = notes.filter(n =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const wordCount = activeNote ? activeNote.content.split(/\s+/).filter(Boolean).length : 0;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
            {/* Subtle overlay — not a full takeover */}
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
                className="relative w-[820px] h-[520px] flex overflow-hidden z-[70]"
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
                {/* Sidebar — no divider, contrast only */}
                <div className="w-[210px] flex flex-col" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <div className="px-4 pt-5 pb-3">
                        {/* Search */}
                        <div className="relative mb-3">
                            <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-white/[0.04] text-white/60 placeholder:text-white/20 text-xs py-2 pl-8 pr-3 rounded-lg outline-none transition-all duration-200 focus:bg-white/[0.07]"
                            />
                        </div>
                    </div>

                    {/* Note list */}
                    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-px custom-scrollbar">
                        {filteredNotes.length === 0 && (
                            <div className="flex items-center justify-center py-10 opacity-20">
                                <span className="text-[10px] font-medium uppercase tracking-widest">Empty</span>
                            </div>
                        )}
                        {filteredNotes.map(note => {
                            const isActive = activeNoteId === note.id;
                            return (
                                <div
                                    key={note.id}
                                    onClick={() => setActiveNoteId(note.id)}
                                    className="group relative px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150"
                                    style={{
                                        background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    }}
                                >
                                    <p className={`text-xs font-medium truncate transition-colors duration-150 ${isActive ? 'text-white' : 'text-white/45 group-hover:text-white/70'}`}>
                                        {note.title || t('notes.untitled')}
                                    </p>
                                    <p className="text-[10px] text-white/20 truncate mt-0.5 leading-relaxed">
                                        {note.content.slice(0, 60) || 'Empty note'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer actions */}
                    <div className="px-3 py-3 flex items-center justify-between">
                        <span className="text-[9px] text-white/15 font-medium">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                        <button
                            onClick={handleCreate}
                            title="New Note"
                            className="w-6 h-6 rounded-md flex items-center justify-center text-white/25 hover:text-white transition-colors duration-150"
                        >
                            <Plus size={14} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {/* Editor — no border, contrast handles separation */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Editor top bar */}
                    <div className="flex items-center justify-end gap-2 px-5 py-3">
                        {activeNote && (
                            <>
                                <span className="text-[9px] text-white/15 font-medium mr-auto">{wordCount}w</span>
                                <button
                                    onClick={() => handleDelete(activeNote.id)}
                                    title="Delete"
                                    className="w-6 h-6 flex items-center justify-center rounded text-white/15 hover:text-red-400/70 transition-colors duration-150"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            title="Close"
                            className="w-6 h-6 flex items-center justify-center rounded text-white/20 hover:text-white/60 transition-colors duration-150"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {activeNote ? (
                        <div className="flex-1 flex flex-col px-8 pb-6 overflow-hidden">
                            <input
                                type="text"
                                placeholder="Title"
                                value={activeNote.title}
                                onChange={e => handleUpdate(activeNote.id, { title: e.target.value })}
                                className="w-full bg-transparent text-[22px] font-semibold text-white placeholder:text-white/10 outline-none tracking-tight leading-tight mb-4"
                                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                            />
                            <textarea
                                placeholder={t('notes.type_thoughts')}
                                value={activeNote.content}
                                onChange={e => handleUpdate(activeNote.id, { content: e.target.value })}
                                className="flex-1 w-full bg-transparent text-[13px] text-white/55 placeholder:text-white/10 outline-none resize-none font-normal leading-7 custom-scrollbar"
                            />
                            <p className="text-[9px] text-white/12 mt-3">
                                {new Date(activeNote.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-10">
                            <PenLine size={36} strokeWidth={1} />
                            <span className="text-[10px] font-medium uppercase tracking-widest">No note selected</span>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
