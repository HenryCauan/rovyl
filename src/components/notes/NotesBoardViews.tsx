import React from 'react';
import { Pin, Maximize2 } from 'lucide-react';
import type { Note } from '../../types';
import { getBgColor, previewTextSnippet } from './notesUtils';

interface NotesListViewProps {
  notes: Note[];
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
  t: (key: string) => string;
}

export const NotesListView: React.FC<NotesListViewProps> = ({ notes, onOpen, onContextMenu, t }) => (
  <div className="flex flex-col gap-1 p-4 max-w-3xl mx-auto w-full notes-widget-scroll overflow-y-auto h-full">
    {notes.map((note) => {
      const snippet = previewTextSnippet(note);
      return (
        <button
          key={note.id}
          type="button"
          onClick={() => onOpen(note.id)}
          onContextMenu={(e) => onContextMenu(e, note.id)}
          className="flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all group"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {note.pinned && <Pin size={12} className="text-amber-300/80 shrink-0" />}
              <span className="text-[14px] font-medium text-white/90 truncate">
                {note.title?.trim() || t('notes.untitled')}
              </span>
            </div>
            <p className="text-[12px] text-white/45 mt-1 line-clamp-2">{snippet || t('notes.preview_placeholder')}</p>
          </div>
          <Maximize2 size={14} className="shrink-0 text-white/20 group-hover:text-white/50 mt-1" />
        </button>
      );
    })}
  </div>
);

interface NotesGridViewProps {
  notes: Note[];
  onOpen: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, noteId: string) => void;
  t: (key: string) => string;
}

export const NotesGridView: React.FC<NotesGridViewProps> = ({ notes, onOpen, onContextMenu, t }) => (
  <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 overflow-y-auto h-full notes-widget-scroll content-start">
    {notes.map((note) => {
      const snippet = previewTextSnippet(note);
      return (
        <button
          key={note.id}
          type="button"
          onClick={() => onOpen(note.id)}
          onContextMenu={(e) => onContextMenu(e, note.id)}
          className="text-left rounded-2xl border border-white/[0.09] p-4 min-h-[140px] flex flex-col gap-2 transition-all hover:scale-[1.02] hover:shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          style={{ background: getBgColor(note.color) }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {note.pinned && <Pin size={12} className="text-amber-300/80 shrink-0" />}
            <span className="text-[13px] font-medium text-white/90 truncate flex-1">
              {note.title?.trim() || t('notes.untitled')}
            </span>
          </div>
          <p className="text-[12px] text-white/50 line-clamp-4 flex-1">{snippet || t('notes.preview_placeholder')}</p>
        </button>
      );
    })}
  </div>
);
