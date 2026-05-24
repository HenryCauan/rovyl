import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Layers, LayoutGrid, Rows, CircleDot, Sparkles,
  Pin, PinOff, Maximize2, Trash2, Pencil, FolderPlus, Archive, ArchiveRestore,
} from 'lucide-react';
import type { NotesContextMenuState } from './useNotesContextMenu';

export interface NotesContextMenuActions {
  organizeCascade: () => void;
  organizeGrid: () => void;
  organizeColumn: () => void;
  organizeFan: () => void;
  createNote: () => void;
  renameWorkspace?: () => void;
  deleteWorkspace?: () => void;
  openNote?: () => void;
  pinNote?: () => void;
  unpinNote?: () => void;
  archiveNote?: () => void;
  restoreNote?: () => void;
  deleteNote?: () => void;
}

interface NotesContextMenuProps {
  menu: NotesContextMenuState;
  menuRootId: string;
  t: (key: string) => string;
  noteCount: number;
  isPinned?: boolean;
  isArchived?: boolean;
  canDeleteWorkspace?: boolean;
  actions: NotesContextMenuActions;
}

function MenuItem({
  icon,
  label,
  desc,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  desc?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
        danger ? 'hover:bg-red-500/12 text-red-300/95' : 'hover:bg-white/[0.07] text-white/90'
      }`}
    >
      <span className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {desc && <span className="block text-[11px] text-white/35 mt-0.5">{desc}</span>}
      </span>
    </button>
  );
}

export const NotesContextMenu: React.FC<NotesContextMenuProps> = ({
  menu,
  menuRootId,
  t,
  noteCount,
  isPinned,
  isArchived,
  canDeleteWorkspace,
  actions,
}) => {
  const clampedLeft = Math.max(12, Math.min(menu.x, window.innerWidth - 312));
  const clampedTop = Math.max(12, Math.min(menu.y, window.innerHeight - 420));

  return createPortal(
    <motion.div
      id={menuRootId}
      role="menu"
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-[950] w-[min(92vw,300px)] rounded-[1.15rem] overflow-hidden border border-white/[0.1] bg-gradient-to-b from-[#14141c]/98 to-[#0a0a0e]/98 backdrop-blur-2xl shadow-[0_28px_90px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ left: clampedLeft, top: clampedTop }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.kind === 'board' && (
        <>
          <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-violet-500/[0.12] via-fuchsia-500/[0.06] to-transparent">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-300/90" strokeWidth={1.5} />
              <div>
                <p className="text-[10px] font-semibold tracking-[0.28em] text-white/45 uppercase">
                  {t('notes.organize_label')}
                </p>
                <p className="text-[13px] text-white/90 font-light mt-0.5">{t('notes.organize_subtitle')}</p>
              </div>
            </div>
          </div>
          {noteCount === 0 ? (
            <p className="px-4 py-4 text-[12px] text-white/40">{t('notes.organize_empty')}</p>
          ) : (
            <div className="p-2 flex flex-col gap-0.5">
              <MenuItem icon={<Layers size={15} />} label={t('notes.organize_cascade')} desc={t('notes.organize_cascade_desc')} onClick={actions.organizeCascade} />
              <MenuItem icon={<LayoutGrid size={15} />} label={t('notes.organize_grid')} desc={t('notes.organize_grid_desc')} onClick={actions.organizeGrid} />
              <MenuItem icon={<Rows size={15} />} label={t('notes.organize_column')} desc={t('notes.organize_column_desc')} onClick={actions.organizeColumn} />
              <MenuItem icon={<CircleDot size={15} />} label={t('notes.organize_fan')} desc={t('notes.organize_fan_desc')} onClick={actions.organizeFan} />
            </div>
          )}
          <div className="p-2 pt-0 border-t border-white/[0.06]">
            <MenuItem icon={<FolderPlus size={15} />} label={t('notes.new_sticky')} onClick={actions.createNote} />
          </div>
        </>
      )}

      {menu.kind === 'workspace' && (
        <>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-white/45 uppercase">{t('notes.workspace_menu')}</p>
          </div>
          <div className="p-2 flex flex-col gap-0.5">
            <MenuItem icon={<Pencil size={15} />} label={t('notes.workspace_rename')} onClick={() => actions.renameWorkspace?.()} />
            <MenuItem icon={<FolderPlus size={15} />} label={t('notes.new_sticky')} onClick={actions.createNote} />
            {canDeleteWorkspace && (
              <MenuItem icon={<Trash2 size={15} />} label={t('notes.workspace_remove')} onClick={() => actions.deleteWorkspace?.()} danger />
            )}
          </div>
        </>
      )}

      {menu.kind === 'note' && (
        <>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-white/45 uppercase">{t('notes.note_menu')}</p>
          </div>
          <div className="p-2 flex flex-col gap-0.5">
            <MenuItem icon={<Maximize2 size={15} />} label={t('notes.open_editor')} onClick={() => actions.openNote?.()} />
            {isPinned ? (
              <MenuItem icon={<PinOff size={15} />} label={t('notes.unpin')} onClick={() => actions.unpinNote?.()} />
            ) : (
              <MenuItem icon={<Pin size={15} />} label={t('notes.pin')} onClick={() => actions.pinNote?.()} />
            )}
            {isArchived ? (
              <MenuItem icon={<ArchiveRestore size={15} />} label={t('notes.restore')} onClick={() => actions.restoreNote?.()} />
            ) : (
              <MenuItem icon={<Archive size={15} />} label={t('notes.archive')} onClick={() => actions.archiveNote?.()} />
            )}
            <MenuItem icon={<Trash2 size={15} />} label={t('notes.delete')} onClick={() => actions.deleteNote?.()} danger />
          </div>
        </>
      )}
    </motion.div>,
    document.body,
  );
};
