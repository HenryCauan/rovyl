import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Pin, Clock, Archive, LayoutGrid, Rows, Sparkles,
  Plus, X, ChevronDown, Pencil, Trash2,
} from 'lucide-react';
import type { Note, NoteWorkspace } from '../../types';
import {
  WIDGET_GLASS_CAPSULE,
  WIDGET_GLASS_CAPSULE_BG,
  WIDGET_GLASS_CAPSULE_SHINE,
  WIDGET_GLASS_SEG_TRACK,
  widgetGlassIconBtn,
  widgetGlassViewSeg,
} from '../widgetGlassStyles';

export type NotesFilter = 'all' | 'pinned' | 'recent' | 'archived';
export type NotesViewMode = 'canvas' | 'list' | 'grid';

interface NotesTopBarProps {
  t: (key: string) => string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  noteCount: number;
  onClose: () => void;
  workspaces: NoteWorkspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  workspaceCounts: Record<string, number>;
  newWsOpen: boolean;
  newWsName: string;
  onNewWsNameChange: (n: string) => void;
  onNewWsOpen: () => void;
  onNewWsClose: () => void;
  onCreateWorkspace: () => void;
  defaultWorkspaceId: string;
  quickNotes: Note[];
  focusedNoteId: string | null;
  onQuickNoteSelect: (id: string) => void;
  showQuickNotes: boolean;
}

interface NotesBottomDockProps {
  t: (key: string) => string;
  filter: NotesFilter;
  onFilterChange: (f: NotesFilter) => void;
  viewMode: NotesViewMode;
  onViewModeChange: (v: NotesViewMode) => void;
  onCreateNote: () => void;
}

const FILTERS: { id: NotesFilter; icon: typeof Sparkles; labelKey: string }[] = [
  { id: 'all', icon: Sparkles, labelKey: 'notes.filter_all' },
  { id: 'pinned', icon: Pin, labelKey: 'notes.filter_pinned' },
  { id: 'recent', icon: Clock, labelKey: 'notes.filter_recent' },
  { id: 'archived', icon: Archive, labelKey: 'notes.filter_archived' },
];

const VIEWS: { id: NotesViewMode; icon: typeof LayoutGrid; labelKey: string }[] = [
  { id: 'canvas', icon: LayoutGrid, labelKey: 'notes.view_canvas' },
  { id: 'list', icon: Rows, labelKey: 'notes.view_list' },
  { id: 'grid', icon: LayoutGrid, labelKey: 'notes.view_grid' },
];

const macIconBtn = widgetGlassIconBtn;
const macViewSeg = widgetGlassViewSeg;

interface NotesWorkspaceProfileProps {
  t: (key: string) => string;
  workspaces: NoteWorkspace[];
  activeWorkspaceId: string;
  workspaceCounts: Record<string, number>;
  onSelectWorkspace: (id: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  newWsOpen: boolean;
  newWsName: string;
  onNewWsNameChange: (n: string) => void;
  onNewWsOpen: () => void;
  onNewWsClose: () => void;
  onCreateWorkspace: () => void;
  defaultWorkspaceId: string;
}

function NotesWorkspaceProfile({
  t,
  workspaces,
  activeWorkspaceId,
  workspaceCounts,
  onSelectWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  newWsOpen,
  newWsName,
  onNewWsNameChange,
  onNewWsOpen,
  onNewWsClose,
  onCreateWorkspace,
  defaultWorkspaceId,
}: NotesWorkspaceProfileProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  const initial = (active?.name?.trim()?.[0] ?? '?').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setEditing(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commitRename = () => {
    const name = draft.trim();
    if (name && active) onRenameWorkspace(active.id, name);
    setEditing(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-[min(100%,200px)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full max-w-[200px] items-center gap-1.5 rounded-full bg-white/[0.06] pl-1 pr-2 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.1]"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t('notes.workspace_menu')}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold text-white/85">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium tracking-[-0.02em] text-white/88">
          {active?.name ?? t('notes.workspace_untitled')}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`shrink-0 text-white/35 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-[90] w-[min(268px,calc(100vw-2.5rem))] overflow-hidden rounded-xl border border-white/[0.1] bg-[#141416]/98 py-1 shadow-[0_16px_48px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/28">
              {t('notes.title')}
            </p>
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={commitRename}
                className="w-full h-7 rounded-lg bg-white/[0.06] px-2.5 text-[12px] text-white/90 outline-none ring-1 ring-white/[0.12] focus:ring-white/25"
              />
            ) : (
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/90">
                  {active?.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(active?.name ?? '');
                    setEditing(true);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/75"
                  title={t('notes.workspace_rename')}
                >
                  <Pencil size={13} strokeWidth={1.75} />
                </button>
                {active && active.id !== defaultWorkspaceId && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWorkspace(active.id);
                      setOpen(false);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                    title={t('notes.workspace_remove')}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="max-h-[220px] overflow-y-auto notes-widget-scroll py-1">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSelectWorkspace(ws.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                    isActive ? 'bg-white/[0.08] text-white/92' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/78'
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[9px] font-semibold text-white/70">
                    {(ws.name.trim()[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-white/28">
                    {workspaceCounts[ws.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            {newWsOpen ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newWsName}
                  onChange={(e) => onNewWsNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCreateWorkspace();
                    if (e.key === 'Escape') onNewWsClose();
                  }}
                  placeholder={t('notes.workspace_name')}
                  className="min-w-0 flex-1 h-7 rounded-lg bg-white/[0.06] px-2.5 text-[11px] outline-none ring-1 ring-white/[0.08] focus:ring-white/20"
                />
                <button
                  type="button"
                  onClick={onCreateWorkspace}
                  className="shrink-0 rounded-lg bg-white/[0.12] px-2.5 h-7 text-[11px] font-medium text-white/85 hover:bg-white/[0.18]"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onNewWsOpen}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/75"
              >
                <Plus size={13} strokeWidth={2.5} />
                {t('notes.workspace_add')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const NotesTopBar = React.memo(function NotesTopBar({
  t,
  searchQuery,
  onSearchChange,
  noteCount,
  onClose,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  workspaceCounts,
  newWsOpen,
  newWsName,
  onNewWsNameChange,
  onNewWsOpen,
  onNewWsClose,
  onCreateWorkspace,
  defaultWorkspaceId,
  quickNotes,
  focusedNoteId,
  onQuickNoteSelect,
  showQuickNotes,
}: NotesTopBarProps) {
  return (
    <header className="pointer-events-auto shrink-0 z-[72] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Segoe_UI',sans-serif]">
      <div className="w-full max-w-5xl mx-auto pt-5 px-10 sm:px-14">
        {/* Floating toolbar — chromeless, só elementos */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <NotesWorkspaceProfile
              t={t}
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              workspaceCounts={workspaceCounts}
              onSelectWorkspace={onSelectWorkspace}
              onRenameWorkspace={onRenameWorkspace}
              onDeleteWorkspace={onDeleteWorkspace}
              newWsOpen={newWsOpen}
              newWsName={newWsName}
              onNewWsNameChange={onNewWsNameChange}
              onNewWsOpen={onNewWsOpen}
              onNewWsClose={onNewWsClose}
              onCreateWorkspace={onCreateWorkspace}
              defaultWorkspaceId={defaultWorkspaceId}
            />
            {noteCount > 0 && (
              <span className="text-[10px] font-medium text-white/35 tabular-nums px-1.5 py-px rounded-md bg-white/[0.08] ring-1 ring-white/10">
                {noteCount}
              </span>
            )}
          </div>

          <div className="flex-1 flex justify-center min-w-0">
            <div className="relative w-full max-w-[280px]">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/45 pointer-events-none"
                strokeWidth={2}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('notes.search_placeholder')}
                className="w-full h-8 pl-8 pr-3 rounded-full text-[12px] text-white/95 placeholder:text-white/40 outline-none bg-[rgba(18,18,22,0.72)] backdrop-blur-xl ring-1 ring-white/[0.18] shadow-[0_2px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] focus:ring-white/30 focus:bg-[rgba(22,22,28,0.85)] transition-all"
              />
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('notes.close')}
              className="flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-white/[0.14] hover:bg-white/[0.22] ring-1 ring-white/25 text-white text-[12px] font-medium shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all"
            >
              <X size={14} strokeWidth={2.5} />
              <span>{t('notes.close')}</span>
            </button>
          </div>
        </div>

        {/* Abas de documento — estilo macOS Safari / Xcode */}
        {showQuickNotes && quickNotes.length > 0 && (
          <div className="flex justify-center mt-2.5 overflow-x-auto notes-widget-scroll scrollbar-none">
            <div className="inline-flex items-end gap-px px-1">
              {quickNotes.map((note) => {
                const active = focusedNoteId === note.id;
                const label = note.title?.trim() || t('notes.untitled');
                return (
                  <button
                    key={note.id}
                    type="button"
                    title={label}
                    onClick={() => onQuickNoteSelect(note.id)}
                    className={`group relative shrink-0 max-w-[132px] min-w-[56px] px-3 pt-2 pb-1.5 rounded-t-[9px] text-[11px] tracking-[-0.02em] truncate transition-colors ${
                      active
                        ? 'text-white/92 bg-white/[0.07] backdrop-blur-md z-[1]'
                        : 'text-white/34 hover:text-white/55 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="flex items-center gap-1 min-w-0">
                      {note.pinned && (
                        <Pin
                          size={9}
                          className={`shrink-0 ${active ? 'text-[#0a84ff]/90' : 'text-white/25 group-hover:text-white/40'}`}
                          strokeWidth={2.5}
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </span>
                    {active && (
                      <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#0a84ff]" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
});

export const NotesBottomDock = React.memo(function NotesBottomDock({
  t,
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onCreateNote,
}: NotesBottomDockProps) {
  return (
    <div className="pointer-events-none fixed bottom-0 left-1/2 z-[80] w-max max-w-[min(calc(100%-5rem),42rem)] -translate-x-1/2 pb-5 pt-2 px-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className={`pointer-events-auto ${WIDGET_GLASS_CAPSULE} px-2 py-1.5`}
      >
        <div className={WIDGET_GLASS_CAPSULE_BG} aria-hidden />
        <div className={WIDGET_GLASS_CAPSULE_SHINE} aria-hidden />

        <div className="relative flex items-center gap-3">
          <div className="flex items-center gap-1 pl-0.5">
            {FILTERS.map(({ id, icon: Icon, labelKey }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={t(labelKey)}
                  onClick={() => onFilterChange(id)}
                  className={macIconBtn(active)}
                >
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.75} />
                  {active && (
                    <motion.span
                      layoutId="notes-filter-dot"
                      className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-[#0a84ff]"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="w-px h-6 bg-white/[0.1] shrink-0" />

          <div className={`flex-1 flex items-center gap-1 p-1 min-w-0 ${WIDGET_GLASS_SEG_TRACK}`}>
            {VIEWS.map(({ id, icon: Icon, labelKey }) => {
              const active = viewMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={t(labelKey)}
                  onClick={() => onViewModeChange(id)}
                  className={macViewSeg(active)}
                >
                  <Icon size={13} strokeWidth={active ? 2.2 : 1.75} />
                  <span className="hidden sm:inline truncate">{t(labelKey)}</span>
                </button>
              );
            })}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={onCreateNote}
            className="shrink-0 w-9 h-9 rounded-full border border-white/20 bg-white/[0.14] hover:bg-white/[0.22] text-white flex items-center justify-center transition-colors"
            title={t('notes.new_sticky')}
          >
            <Plus size={17} strokeWidth={2.5} />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
});
