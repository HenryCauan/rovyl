import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Note } from '../types';
import { Plus, X, Trash2, Save, Calendar, PenLine, ChevronLeft, ChevronRight } from 'lucide-react';

interface NotesWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  setNotes: (notes: Note[]) => void;
}

export const NotesWidget: React.FC<NotesWidgetProps> = ({ isOpen, onClose, notes, setNotes }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // Save logic (Simulating Cloud Save)
  const handleSave = () => {
    if (!newTitle.trim() && !newContent.trim()) return;

    const newNote: Note = {
      id: crypto.randomUUID(),
      title: newTitle || 'Untitled Note',
      content: newContent,
      date: new Date().toISOString(),
    };

    // Add to top of stack
    setNotes([newNote, ...notes]);
    
    // Reset
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotes(notes.filter(n => n.id !== id));
  };

  // Cycle logic for swiping
  const cycleNext = () => {
    if (notes.length < 2) return;
    const newNotes = [...notes];
    const top = newNotes.shift();
    if (top) newNotes.push(top);
    setNotes(newNotes);
  };

  const cyclePrev = () => {
    if (notes.length < 2) return;
    const newNotes = [...notes];
    const bottom = newNotes.pop();
    if (bottom) newNotes.unshift(bottom);
    setNotes(newNotes);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Global Close Button */}
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all z-[70] group"
      >
        <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* Main Container */}
      <div className="relative w-[900px] h-[550px] flex pointer-events-none">
        
        {/* Left Side: The "Deck" of Notes */}
        <div className="w-1/2 relative flex flex-col items-center justify-center pointer-events-auto">
            <div className="relative w-72 h-96 perspective-1000">
                <AnimatePresence mode="popLayout">
                    {notes.length === 0 && !isAdding && (
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-white/20 border-2 border-dashed border-white/10 rounded-xl"
                        >
                            <PenLine size={32} className="mb-2 opacity-50" />
                            <span className="text-sm font-medium">No notes yet</span>
                        </motion.div>
                    )}

                    {notes.map((note, index) => {
                        // Only render top 4 cards for performance
                        if (index > 3) return null;
                        
                        // Is this the top card?
                        const isTop = index === 0;

                        return (
                            <motion.div
                                key={note.id}
                                layoutId={note.id}
                                drag={isTop && !isAdding ? "x" : false}
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.1}
                                onDragEnd={(e, { offset, velocity }) => {
                                    const swipeThreshold = 50;
                                    if (offset.x < -swipeThreshold) {
                                        cycleNext(); // Swipe Left -> Next (Send top to bottom)
                                    } else if (offset.x > swipeThreshold) {
                                        cyclePrev(); // Swipe Right -> Prev (Bring bottom to top)
                                    }
                                }}
                                initial={{ opacity: 0, y: -50, scale: 0.9, rotate: 0 }}
                                animate={{ 
                                    opacity: 1 - (index * 0.1), 
                                    y: index * -15, // Stack visually upwards slightly for depth
                                    scale: 1 - (index * 0.05),
                                    rotate: index % 2 === 0 ? index * 2 : index * -2, // Subtle rotation
                                    zIndex: 50 - index 
                                }}
                                whileHover={isTop ? { scale: 1.02, rotate: 0 } : {}}
                                whileDrag={{ cursor: 'grabbing', scale: 1.05 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                className={`
                                    absolute bottom-0 left-0 w-full h-full 
                                    bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col 
                                    ${isTop ? 'cursor-grab active:cursor-grabbing hover:border-white/30 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : ''}
                                `}
                            >
                                {/* Drag Indicator (Top) */}
                                {isTop && (
                                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/20 rounded-full" />
                                )}

                                {/* Note Header */}
                                <div className="p-5 pt-6 border-b border-white/5 bg-[#1A1A1A] flex justify-between items-start select-none">
                                    <div className="flex-1 mr-2">
                                        <h3 className="text-white font-semibold text-xl leading-tight line-clamp-1">{note.title}</h3>
                                        <div className="flex items-center gap-2 text-[10px] text-white/40 mt-1.5 uppercase tracking-wide font-medium">
                                            <Calendar size={10} />
                                            {new Date(note.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' })}
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleDelete(note.id, e)}
                                        className="text-white/20 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-lg transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                {/* Note Body */}
                                <div className="p-5 flex-1 overflow-hidden relative">
                                    <p className="text-sm text-white/70 whitespace-pre-wrap font-light leading-relaxed select-text">
                                        {note.content}
                                    </p>
                                    
                                </div>
                                {/* Stack Gradient Fade for long text */}
                                <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-[#141414] to-transparent pointer-events-none" />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Navigation Controls */}
            {!isAdding && notes.length > 1 && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-6 mt-12"
                >
                    <button onClick={cyclePrev} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all hover:scale-110 active:scale-95">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-xs font-mono text-white/30 tracking-widest">{notes.length} NOTES</span>
                    <button onClick={cycleNext} className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all hover:scale-110 active:scale-95">
                        <ChevronRight size={20} />
                    </button>
                </motion.div>
            )}
        </div>

        {/* Right Side: Actions & Editor */}
        <div className="w-1/2 flex flex-col justify-center pl-12 pointer-events-auto border-l border-white/5">
            <AnimatePresence mode="wait">
                {isAdding ? (
                    <motion.div
                        key="editor"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="bg-[#0f0f0f] border border-white/10 p-8 rounded-2xl shadow-2xl w-full"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-medium text-white flex items-center gap-2">
                                <PenLine size={18} /> New Note
                            </h2>
                            <button onClick={() => setIsAdding(false)} className="text-white/40 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Title</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Enter title..."
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full bg-transparent text-2xl font-medium text-white placeholder:text-white/10 outline-none border-b border-white/10 pb-2 focus:border-white/40 transition-colors"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Content</label>
                                <textarea
                                    placeholder="Type your thoughts here..."
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                    className="w-full h-48 bg-white/5 rounded-lg p-4 text-sm text-white/80 placeholder:text-white/10 outline-none resize-none font-light leading-relaxed custom-scrollbar focus:bg-white/10 transition-colors border border-transparent focus:border-white/10"
                                />
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button 
                                onClick={() => setIsAdding(false)}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="bg-white text-black px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-lg shadow-white/10"
                            >
                                <Save size={16} /> Save Note
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="actions"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex flex-col items-start gap-6"
                    >
                        <div>
                            <h1 className="text-5xl font-light text-white mb-3 tracking-tight">My Notes</h1>
                            <p className="text-white/40 text-sm max-w-[280px] leading-relaxed">
                                Organize your thoughts, tasks, and ideas in a focused environment. Drag cards to navigate.
                            </p>
                        </div>
                        
                        <button
                            onClick={() => setIsAdding(true)}
                            className="group flex items-center gap-5 bg-white/5 hover:bg-white/10 border border-white/10 px-8 py-5 rounded-2xl transition-all hover:scale-105 active:scale-95 w-full max-w-sm"
                        >
                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-black shadow-lg shadow-white/20">
                                <Plus size={24} />
                            </div>
                            <div className="text-left flex-1">
                                <div className="text-base font-semibold text-white">Create New Note</div>
                                <div className="text-xs text-white/40 mt-0.5">Add to your stack</div>
                            </div>
                        </button>

                        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                            <div className="bg-[#141414] p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center">
                                <span className="text-2xl font-bold text-white mb-1">{notes.length}</span>
                                <span className="text-[10px] uppercase text-white/30 tracking-wider">Total Notes</span>
                            </div>
                             <div className="bg-[#141414] p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center">
                                <span className="text-xl font-bold text-white mb-1">
                                    {notes.length > 0 ? new Date(notes[0].date).toLocaleDateString(undefined, {weekday: 'short'}) : '-'}
                                </span>
                                <span className="text-[10px] uppercase text-white/30 tracking-wider">Latest</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

      </div>
    </div>
  );
};