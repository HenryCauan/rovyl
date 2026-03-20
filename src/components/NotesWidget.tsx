import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Note, UIConfig } from '../types';
import { Plus, X, Trash2, Save, Calendar, PenLine, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const [isEditing, setIsEditing] = useState(false);

    const t = (key: string) => getTranslation(config, key);

    const activeNote = notes.find(n => n.id === activeNoteId);

    const handleCreate = () => {
        const newNote: Note = {
            id: crypto.randomUUID(),
            title: '',
            content: '',
            date: new Date().toISOString(),
        };
        setNotes([newNote, ...notes]);
        setActiveNoteId(newNote.id);
        setIsEditing(true);
    };

    const handleUpdate = (id: string, updates: Partial<Note>) => {
        setNotes(notes.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    const handleDelete = (id: string) => {
        const updated = notes.filter(n => n.id !== id);
        setNotes(updated);
        if (activeNoteId === id) {
            setActiveNoteId(updated.length > 0 ? updated[0].id : null);
        }
    };

    const filteredNotes = notes.filter(n => 
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                className="relative bg-[#080808] border border-white/10 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,1)] w-[1120px] h-[720px] flex overflow-hidden z-[70]"
                onClick={e => e.stopPropagation()}
            >
                {/* Sidebar: Explorer (300px) */}
                <div className="w-[300px] bg-black/20 border-r border-white/5 flex flex-col">
                    <div className="p-8 pb-4">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-white text-[10px] font-black tracking-[0.3em] uppercase opacity-40">{t('notes.explorer')}</h2>
                            <button 
                                onClick={handleCreate}
                                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <Plus size={16} />
                            </button>
                        </div>

                        <div className="relative group mb-6">
                            <input
                                type="text"
                                placeholder={t('notes.archives') + "..."}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-white/[0.03] text-white placeholder:text-white/10 text-[10px] py-3.5 pl-4 pr-10 rounded-xl border border-white/5 focus:border-white/20 outline-none transition-all"
                            />
                            <PenLine size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/10" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar px-6 space-y-1">
                        {filteredNotes.map(note => (
                            <div
                                key={note.id}
                                onClick={() => setActiveNoteId(note.id)}
                                className={`
                                    group p-4 rounded-2xl cursor-pointer transition-all border border-transparent
                                    ${activeNoteId === note.id ? 'bg-white/10 border-white/5 shadow-xl' : 'hover:bg-white/[0.02]'}
                                `}
                            >
                                <div className="flex flex-col gap-1.5 min-w-0">
                                    <h3 className={`text-xs font-bold truncate ${activeNoteId === note.id ? 'text-white' : 'text-white/40'}`}>
                                        {note.title || t('notes.untitled')}
                                    </h3>
                                    <p className="text-[10px] text-white/20 line-clamp-1 leading-relaxed">
                                        {note.content || t('notes.manuscript') + "..."}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1 opacity-40">
                                        <Calendar size={10} className="text-white/40" />
                                        <span className="text-[8px] font-black uppercase tracking-wider text-white/50">
                                            {new Date(note.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-8 border-t border-white/5">
                        <div className="text-[10px] font-black text-white/10 uppercase tracking-[0.4em]">ZENITH EDITIONS</div>
                    </div>
                </div>

                {/* Main: Editorial Editor */}
                <div className="flex-1 flex flex-col bg-transparent relative">
                    <header className="h-24 border-b border-white/5 flex items-center justify-between px-12 shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-white/[0.03] border border-white/10">
                                <PenLine size={14} className="text-white/20" />
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{t('notes.editor_mode')}</span>
                            </div>
                            {activeNote && (
                                <span className="text-[9px] font-black text-white/10 uppercase tracking-[0.2em]">
                                    {activeNote.content.split(' ').length} WORDS
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => activeNote && handleDelete(activeNote.id)}
                                className="p-3 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent hover:border-red-400/20"
                            >
                                <Trash2 size={18} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-3 rounded-xl bg-white/5 text-white/20 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </header>

                    <main className="flex-1 overflow-y-auto custom-scrollbar">
                        {activeNote ? (
                            <div className="max-w-[720px] mx-auto py-24 px-12 space-y-12">
                                <input
                                    type="text"
                                    placeholder={t('notes.note_title')}
                                    value={activeNote.title}
                                    onChange={e => handleUpdate(activeNote.id, { title: e.target.value })}
                                    className="w-full bg-transparent text-5xl font-bold text-white placeholder:text-white/5 outline-none tracking-tight leading-tight"
                                />
                                <textarea
                                    placeholder={t('notes.type_thoughts')}
                                    value={activeNote.content}
                                    onChange={e => handleUpdate(activeNote.id, { content: e.target.value })}
                                    className="w-full min-h-[400px] bg-transparent text-lg text-white/70 placeholder:text-white/5 outline-none resize-none font-light leading-relaxed custom-scrollbar pb-32"
                                />
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center gap-8 opacity-10">
                                <PenLine size={80} strokeWidth={1} />
                                <div className="text-[12px] font-black uppercase tracking-[1em]">{t('notes.no_notes')}</div>
                            </div>
                        )}
                    </main>

                    {/* Gradient shadows for bottom of editor */}
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#080808] to-transparent pointer-events-none" />
                </div>
            </motion.div>
        </div>
    );
};
