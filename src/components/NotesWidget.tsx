import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { Note, UIConfig, NoteWorkspace } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import {
    Plus, X, Trash2, CheckSquare, AlignLeft,
    MoreVertical, Check, Palette, Feather, Pin,
    Maximize2,
    Bold, Italic, Underline, List, ListOrdered, Strikethrough,
} from 'lucide-react';
import { getTranslation } from '../translations';
import { getIcon } from '../iconMap';
import { NotesTopBar, NotesBottomDock, type NotesFilter, type NotesViewMode } from './notes/NotesChrome';
import { NotesContextMenu } from './notes/NotesContextMenu';
import { useNotesContextMenu } from './notes/useNotesContextMenu';
import { NotesListView, NotesGridView } from './notes/NotesBoardViews';
import { WidgetBackdropOpacitySlider } from './WidgetBackdropOpacitySlider';
import {
    PRESET_COLORS, getBgColor, stripHtml, previewTextSnippet,
    defaultNoteSize, noteSortKey, noteCreatedAt,
} from './notes/notesUtils';

interface NotesWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    notes: Note[];
    setNotes: (notes: Note[] | ((prev: Note[]) => Note[])) => void;
    config: UIConfig;
    setConfig: Dispatch<SetStateAction<UIConfig>>;
    noteWorkspaces: NoteWorkspace[];
    setNoteWorkspaces: (w: NoteWorkspace[] | ((prev: NoteWorkspace[]) => NoteWorkspace[])) => void;
    activeNoteWorkspaceId: string;
    setActiveNoteWorkspaceId: (id: string) => void;
}

const DEFAULT_WS_ID = 'default';
/** Floating chrome: toolbar + optional document tabs (pt-5, max-w-5xl) */
const TOP_CHROME_BASE = 68;
/** Document tabs strip (canvas) */
const QUICK_STRIP_H = 36;
/** Floating bottom dock */
const BOTTOM_DOCK_H = 80;

const NOTES_PAD = { top: 12, right: 16, bottom: 12, left: 16 } as const;
const CANVAS_LEFT = 16;

/** Updated each render from NotesWidget for canvas layout math */
const notesLayoutMetrics = { topChromeH: TOP_CHROME_BASE };

function getCanvasBounds() {
    const mainW = window.innerWidth;
    const mainH = window.innerHeight - notesLayoutMetrics.topChromeH;
    const top = NOTES_PAD.top;
    const bottom = BOTTOM_DOCK_H + NOTES_PAD.bottom;
    const width = mainW - CANVAS_LEFT - NOTES_PAD.right;
    const height = mainH - top - bottom;
    return { left: CANVAS_LEFT, top, right: NOTES_PAD.right, bottom, width, height, mainWidth: mainW, mainHeight: mainH };
}

function getMainAreaBounds() {
    const { left, top, width, height, mainWidth: mainW } = getCanvasBounds();
    return {
        mainW,
        mainH: height,
        centerX: mainW / 2,
        centerY: top + height / 2,
        minX: left,
        maxX: mainW - NOTES_PAD.right,
        minY: top,
        maxY: top + height,
    };
}

interface LayoutPlacement {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Translate a layout block so its centroid sits on the main pane center. */
function centerLayoutPlacements(placements: LayoutPlacement[]): LayoutPlacement[] {
    if (placements.length === 0) return placements;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of placements) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + p.w);
        maxY = Math.max(maxY, p.y + p.h);
    }

    const blockCx = (minX + maxX) / 2;
    const blockCy = (minY + maxY) / 2;
    const { centerX, centerY, minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY } = getMainAreaBounds();

    let dx = centerX - blockCx;
    let dy = centerY - blockCy;

    if (minX + dx < bMinX) dx += bMinX - (minX + dx);
    if (maxX + dx > bMaxX) dx -= (maxX + dx) - bMaxX;
    if (minY + dy < bMinY) dy += bMinY - (minY + dy);
    if (maxY + dy > bMaxY) dy -= (maxY + dy) - bMaxY;

    return placements.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function clampNotePosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
    const { left: L, top: T, width: cw, height: ch } = getCanvasBounds();
    const nx = Math.max(L, Math.min(x, L + cw - w));
    const ny = Math.max(T, Math.min(y, T + ch - h));
    return { x: nx, y: ny };
}

function normalizeHex7(s: string): string | null {
    const t = s.trim();
    const m = t.match(/^#([0-9A-Fa-f]{6})$/);
    return m ? `#${m[1].toLowerCase()}` : null;
}

const NoteColorPickerSection: React.FC<{
    current?: string;
    onSelect: (color: string) => void;
    compact?: boolean;
    customLabel: string;
    hexPlaceholder: string;
}> = ({ current, onSelect, compact, customLabel, hexPlaceholder }) => {
    const [hexDraft, setHexDraft] = useState(
        () => (current?.startsWith('#') && current.length >= 7 ? current.slice(0, 7) : '#334155'),
    );
    useEffect(() => {
        if (current?.startsWith('#') && /^#[0-9A-Fa-f]{6}$/.test(current)) setHexDraft(current.slice(0, 7));
    }, [current]);

    const pickerValue =
        current?.startsWith('#') && /^#[0-9A-Fa-f]{6}$/.test(current) ? current.slice(0, 7) : '#334155';

    return (
        <div className={`flex flex-col gap-2 ${compact ? '' : ''}`}>
            <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => onSelect(c.key)}
                        className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full border border-white/15 hover:scale-110 flex items-center justify-center shrink-0`}
                        style={{ background: c.display }}
                    >
                        {current === c.key && <Check size={12} className="text-white" />}
                    </button>
                ))}
            </div>
            <div className={`flex items-center gap-2 pt-2 border-t border-white/[0.06] ${compact ? 'flex-col items-stretch' : ''}`}>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider whitespace-nowrap">{customLabel}</span>
                    <input
                        type="color"
                        value={pickerValue}
                        onChange={e => onSelect(e.target.value)}
                        className="h-8 w-10 rounded-lg cursor-pointer border border-white/15 bg-transparent shrink-0 [color-scheme:dark]"
                    />
                </label>
                <input
                    type="text"
                    value={hexDraft}
                    onChange={e => setHexDraft(e.target.value)}
                    onBlur={() => {
                        const n = normalizeHex7(hexDraft);
                        if (n) onSelect(n);
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            const n = normalizeHex7(hexDraft);
                            if (n) onSelect(n);
                        }
                    }}
                    placeholder={hexPlaceholder}
                    className="flex-1 min-w-0 bg-white/[0.06] border border-white/[0.1] rounded-lg px-2 py-1.5 text-[12px] font-mono text-white/80 placeholder:text-white/25"
                    maxLength={7}
                    spellCheck={false}
                />
            </div>
        </div>
    );
};

interface NotePreviewCardProps {
    note: Note;
    onUpdate: (updates: Partial<Note>) => void;
    onDelete: () => void;
    onBringToFront: () => void;
    onExpand: () => void;
    /** True while this note is open in the fullscreen editor (canvas card fades back). */
    isEditingElsewhere: boolean;
    expandHint: string;
    translate: (key: string) => string;
    dragConstraintsRef: React.RefObject<HTMLDivElement | null>;
    onContextMenu: (e: React.MouseEvent) => void;
    stackIndex: number;
}

const NotePreviewCard = React.memo(function NotePreviewCard({
    note, onUpdate, onDelete, onBringToFront, onExpand, isEditingElsewhere, expandHint, translate, dragConstraintsRef, onContextMenu, stackIndex,
}: NotePreviewCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const menuBtnRef = useRef<HTMLButtonElement>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showColors, setShowColors] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 252 });
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    const dragMovedRef = useRef(false);

    const posX = note.position?.x ?? 0;
    const posY = note.position?.y ?? 0;
    const x = useMotionValue(posX);
    const y = useMotionValue(posY);

    useEffect(() => {
        if (isDraggingRef.current) return;
        animate(x, posX, { type: 'spring', stiffness: 340, damping: 36, mass: 0.85 });
        animate(y, posY, { type: 'spring', stiffness: 340, damping: 36, mass: 0.85 });
    }, [posX, posY, x, y]);

    useEffect(() => {
        if (!showMenu || !menuBtnRef.current) return;
        const rect = menuBtnRef.current.getBoundingClientRect();
        setMenuPos({
            top: rect.bottom + 8,
            left: Math.min(rect.right - 252, window.innerWidth - 268),
            width: 252,
        });
    }, [showMenu]);

    useEffect(() => {
        if (!showMenu) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (menuBtnRef.current?.contains(t)) return;
            if (document.getElementById(`note-menu-prev-${note.id}`)?.contains(t)) return;
            setShowMenu(false);
            setShowColors(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showMenu, note.id]);

    const handleMouseUp = () => {
        if (!cardRef.current || (note.type === 'todo' && note.dimensions == null)) return;
        const width = cardRef.current.offsetWidth;
        const height = cardRef.current.offsetHeight;
        if (height !== note.dimensions?.height || width !== note.dimensions?.width) {
            onUpdate({ dimensions: { ...note.dimensions, width, height } });
        }
    };

    const handleDragEnd = () => {
        isDraggingRef.current = false;
        setIsDragging(false);
        const el = cardRef.current;
        const fallback = defaultNoteSize(note);
        const w = el?.offsetWidth ?? fallback.w;
        const h = el?.offsetHeight ?? fallback.h;
        const p = clampNotePosition(x.get(), y.get(), w, h);
        x.set(p.x);
        y.set(p.y);
        onUpdate({ position: p });
        onBringToFront();
        window.setTimeout(() => {
            dragMovedRef.current = false;
        }, 0);
    };

    const handleDragStart = () => {
        isDraggingRef.current = true;
        dragMovedRef.current = false;
        setIsDragging(true);
    };

    const IconComponent = note.icon ? getIcon(note.icon) : null;
    const isTodo = note.type === 'todo';
    const textSnippet = previewTextSnippet(note);

    const menuPortal = showMenu && createPortal(
        <motion.div
            id={`note-menu-prev-${note.id}`}
            role="menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="fixed z-[500] bg-[#141416]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.75)] py-1.5 flex flex-col overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width, maxWidth: 'min(92vw, 280px)' }}
        >
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-left text-[13px] text-white/85 hover:bg-white/[0.08]" onClick={() => onUpdate(isTodo ? { type: 'text' } : { type: 'todo', dimensions: undefined })}>
                {isTodo ? <AlignLeft size={14} /> : <CheckSquare size={14} />}
                {isTodo ? 'Texto' : 'Lista'}
            </button>
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-left text-[13px] text-white/85 hover:bg-white/[0.08]" onClick={() => setShowColors(!showColors)}>
                <Palette size={14} /> Cor
            </button>
            {showColors && (
                <div className="px-3 pb-3 pt-1 border-t border-white/[0.06]">
                    <NoteColorPickerSection
                        compact
                        current={note.color}
                        onSelect={c => onUpdate({ color: c })}
                        customLabel={translate('notes.color_custom')}
                        hexPlaceholder={translate('notes.color_hex_ph')}
                    />
                </div>
            )}
            <div className="h-px bg-white/[0.08] my-0.5 mx-2" />
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-left text-[13px] text-red-400/95 hover:bg-red-500/15" onClick={() => { setShowMenu(false); onDelete(); }}>
                <Trash2 size={14} /> Excluir
            </button>
        </motion.div>,
        document.body
    );

    const todoIntrinsic = isTodo && note.dimensions == null;

    const isNoteActionTarget = (target: EventTarget | null) =>
        target instanceof Element && !!target.closest('[data-note-action]');

    const handleCardClick = (e: React.MouseEvent) => {
        if (isNoteActionTarget(e.target)) return;
        if (!dragMovedRef.current) onBringToFront();
    };

    const zIndex = isDragging ? 9999 : stackIndex;

    return (
        <motion.div
            data-note-card
            ref={cardRef}
            drag={!isEditingElsewhere}
            dragListener={!isEditingElsewhere}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={dragConstraintsRef}
            dragSnapToOrigin={false}
            dragTransition={{ power: 0, timeConstant: 0 }}
            layout={false}
            onClick={handleCardClick}
            onDragStart={handleDragStart}
            onDrag={() => { dragMovedRef.current = true; }}
            onDragEnd={handleDragEnd}
            onMouseUp={handleMouseUp}
            onContextMenu={(e) => {
                if (isNoteActionTarget(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e);
            }}
            className={`group absolute flex flex-col rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.45)] border border-white/[0.09] overflow-visible cursor-grab active:cursor-grabbing touch-none ${todoIntrinsic ? 'w-fit max-w-[min(92vw,400px)]' : ''} ${isDragging ? 'will-change-transform' : ''}`}
            style={{
                x,
                y,
                background: getBgColor(note.color),
                resize: todoIntrinsic ? 'none' : 'both',
                minWidth: isTodo ? 200 : 260,
                minHeight: isTodo ? 64 : 180,
                width: todoIntrinsic ? 'max-content' : (note.dimensions?.width ?? 340),
                height: todoIntrinsic ? 'auto' : (note.dimensions?.height ?? 320),
                maxWidth: todoIntrinsic ? 'min(92vw, 400px)' : 'min(92vw, 520px)',
                zIndex,
            }}
            animate={{
                opacity: isEditingElsewhere ? 0.22 : 1,
            }}
            initial={false}
            whileHover={isEditingElsewhere || isDragging ? undefined : { boxShadow: '0 20px 56px rgba(0,0,0,0.55)' }}
            whileDrag={{
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                scale: 1.012,
                cursor: 'grabbing',
            }}
            transition={{
                opacity: { duration: 0.2 },
                scale: { type: 'spring', stiffness: 520, damping: 38 },
            }}
        >
            <div className={`flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden ${isDragging ? '' : 'backdrop-blur-3xl'}`}>
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0 relative z-20">
                    <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-none">
                        {note.pinned && <Pin size={13} className="text-amber-300/85 shrink-0" strokeWidth={2} />}
                        {IconComponent ? <IconComponent size={15} strokeWidth={2} className="text-white/45 shrink-0" /> : <AlignLeft size={15} className="text-white/35 shrink-0" />}
                        <span className="text-[14px] font-medium text-white/88 truncate pr-2">
                            {note.title?.trim() || 'Sem título'}
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            data-note-action
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onExpand(); }}
                            className="p-1.5 rounded-lg text-white/35 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                            title="Abrir"
                        >
                            <Maximize2 size={14} strokeWidth={2} />
                        </button>
                        <button
                            ref={menuBtnRef}
                            type="button"
                            data-note-action
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/45 cursor-pointer"
                        >
                            <MoreVertical size={15} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {menuPortal}

                <div
                    role="button"
                    tabIndex={0}
                    className="relative flex-1 min-h-0 text-left px-4 pt-0 pb-9 flex flex-col overflow-x-hidden min-h-0 group/prev focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-b-2xl select-none"
                    onDoubleClick={(e) => { e.stopPropagation(); onExpand(); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onExpand();
                        }
                    }}
                >
                    {isTodo ? (
                        <div className="w-full max-h-[7rem] overflow-hidden text-[12px] leading-snug pr-0.5 space-y-1.5 text-left">
                            {(note.todos ?? []).length === 0 ? (
                                <span className="text-white/35">Lista vazia — clique para editar</span>
                            ) : (
                                (note.todos ?? []).map(todo => (
                                    <div key={todo.id} className="flex gap-2 break-words text-white/55">
                                        <span className="shrink-0 text-white/35">{todo.done ? '✓' : '○'}</span>
                                        <span className={todo.done ? 'line-through text-white/35' : ''}>{todo.text || '…'}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="w-full max-h-[9.5rem] overflow-hidden text-[13px] leading-relaxed text-white/55 break-words text-left line-clamp-[10]">
                            {textSnippet || translate('notes.preview_placeholder')}
                        </div>
                    )}
                    <span
                        className="pointer-events-none absolute bottom-2.5 left-4 right-4 pt-1 border-t border-white/[0.06] text-[10px] tracking-[0.2em] uppercase text-white/25 group-hover/prev:text-white/40 transition-colors text-left"
                    >
                        {expandHint}
                    </span>
                </div>
            </div>
        </motion.div>
    );
});

// ─── Rich text (contentEditable) + floating format bar ───────────────────────
interface RichNoteBodyProps {
    note: Note;
    onUpdate: (updates: Partial<Note>) => void;
    translate: (key: string) => string;
}

const RichNoteBody: React.FC<RichNoteBodyProps> = ({ note, onUpdate, translate }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
    const lastNoteId = useRef<string | null>(null);

    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        if (lastNoteId.current !== note.id) {
            lastNoteId.current = note.id;
            if (note.contentHtml) el.innerHTML = note.contentHtml;
            else el.textContent = note.content ?? '';
        }
    }, [note.id]);

    const sync = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        onUpdate({ contentHtml: el.innerHTML, content: el.innerText ?? '' });
    }, [onUpdate]);

    const updateToolbar = useCallback(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            setToolbarPos(null);
            return;
        }
        const range = sel.getRangeAt(0);
        if (!editorRef.current?.contains(range.commonAncestorContainer)) {
            setToolbarPos(null);
            return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            setToolbarPos(null);
            return;
        }
        const tw = 268;
        let left = rect.left + rect.width / 2 - tw / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - tw - 12));
        const top = Math.max(12, rect.top - 46);
        setToolbarPos({ top, left });
    }, []);

    useEffect(() => {
        const onScroll = () => setToolbarPos(null);
        window.addEventListener('scroll', onScroll, true);
        return () => window.removeEventListener('scroll', onScroll, true);
    }, []);

    const fmt = (cmd: string) => {
        editorRef.current?.focus();
        document.execCommand(cmd, false);
        sync();
        requestAnimationFrame(updateToolbar);
    };

    const fmtList = (ordered: boolean) => {
        editorRef.current?.focus();
        document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false);
        sync();
        requestAnimationFrame(updateToolbar);
    };

    const btn = 'p-2 rounded-lg text-white/55 hover:text-white hover:bg-white/10 transition-colors';
    const toolbarPortal = toolbarPos && createPortal(
        <div
            role="toolbar"
            aria-label={translate('notes.format_bar')}
            className="fixed z-[650] flex items-center gap-0.5 px-2 py-1.5 rounded-xl bg-[#141416]/98 backdrop-blur-2xl border border-white/[0.12] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
            style={{ top: toolbarPos.top, left: toolbarPos.left }}
            onMouseDown={e => e.preventDefault()}
        >
            <button type="button" className={btn} onClick={() => fmt('bold')} title={translate('notes.fmt_bold')}>
                <Bold size={15} strokeWidth={2.2} />
            </button>
            <button type="button" className={btn} onClick={() => fmt('italic')} title={translate('notes.fmt_italic')}>
                <Italic size={15} strokeWidth={2.2} />
            </button>
            <button type="button" className={btn} onClick={() => fmt('underline')} title={translate('notes.fmt_underline')}>
                <Underline size={15} strokeWidth={2.2} />
            </button>
            <button type="button" className={btn} onClick={() => fmt('strikeThrough')} title={translate('notes.fmt_strike')}>
                <Strikethrough size={15} strokeWidth={2.2} />
            </button>
            <span className="w-px h-4 bg-white/15 mx-0.5" />
            <button type="button" className={btn} onClick={() => fmtList(false)} title={translate('notes.fmt_bullet')}>
                <List size={15} strokeWidth={2.2} />
            </button>
            <button type="button" className={btn} onClick={() => fmtList(true)} title={translate('notes.fmt_numbered')}>
                <ListOrdered size={15} strokeWidth={2.2} />
            </button>
        </div>,
        document.body
    );

    return (
        <>
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="w-full min-h-[50vh] bg-transparent border-none outline-none text-[16px] md:text-[17px] leading-[1.75] text-white/75 font-light break-words selection:bg-white/20 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
                data-placeholder={translate('notes.type_thoughts')}
                onInput={sync}
                onMouseUp={() => requestAnimationFrame(updateToolbar)}
                onKeyUp={() => requestAnimationFrame(updateToolbar)}
            />
            {toolbarPortal}
            <style>{`
                [contenteditable][data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: rgba(255,255,255,0.2);
                    pointer-events: none;
                }
            `}</style>
        </>
    );
};

// ─── Full-screen focused editor ──────────────────────────────────────────────
interface NoteFocusPanelProps {
    note: Note;
    onUpdate: (updates: Partial<Note>) => void;
    onClose: () => void;
    onDelete: () => void;
    hint: string;
    translate: (key: string) => string;
}

const NoteFocusPanel: React.FC<NoteFocusPanelProps> = ({ note, onUpdate, onClose, onDelete, hint, translate }) => {
    const menuBtnRef = useRef<HTMLButtonElement>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showColors, setShowColors] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 220 });
    const isTodo = note.type === 'todo';

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        if (!showMenu || !menuBtnRef.current) return;
        const rect = menuBtnRef.current.getBoundingClientRect();
        setMenuPos({ top: rect.bottom + 8, left: Math.min(rect.right - 220, window.innerWidth - 240), width: 220 });
    }, [showMenu]);

    useEffect(() => {
        if (!showMenu) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (menuBtnRef.current?.contains(t)) return;
            if (document.getElementById(`note-menu-focus-${note.id}`)?.contains(t)) return;
            setShowMenu(false);
            setShowColors(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [showMenu, note.id]);

    const toggleTodo = (id: string, current: boolean) => {
        onUpdate({ todos: (note.todos ?? []).map(t => t.id === id ? { ...t, done: !current } : t) });
    };
    const updateTodo = (id: string, text: string) => {
        onUpdate({ todos: (note.todos ?? []).map(t => t.id === id ? { ...t, text } : t) });
    };
    const addTodo = () => {
        onUpdate({ todos: [...(note.todos ?? []), { id: crypto.randomUUID(), text: '', done: false }] });
    };
    const deleteTodo = (id: string) => {
        onUpdate({ todos: (note.todos ?? []).filter(t => t.id !== id) });
    };

    const IconComponent = note.icon ? getIcon(note.icon) : null;

    const menuPortal = showMenu && createPortal(
        <motion.div
            id={`note-menu-focus-${note.id}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed z-[900] bg-[#161618]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-2xl py-1.5 flex flex-col overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-white/85 hover:bg-white/[0.08] text-left" onClick={() => onUpdate(isTodo ? { type: 'text' } : { type: 'todo', dimensions: undefined })}>
                {isTodo ? <AlignLeft size={14} /> : <CheckSquare size={14} />}
                {isTodo ? 'Modo texto' : 'Modo lista'}
            </button>
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-white/85 hover:bg-white/[0.08] text-left" onClick={() => setShowColors(!showColors)}>
                <Palette size={14} /> Cor de fundo
            </button>
            {showColors && (
                <div className="px-3 pb-3 border-t border-white/[0.06] pt-2">
                    <NoteColorPickerSection
                        current={note.color}
                        onSelect={c => onUpdate({ color: c })}
                        customLabel={translate('notes.color_custom')}
                        hexPlaceholder={translate('notes.color_hex_ph')}
                    />
                </div>
            )}
            <div className="h-px bg-white/10 mx-2" />
            <button type="button" className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 text-left" onClick={() => { onDelete(); onClose(); }}>
                <Trash2 size={14} /> Excluir nota
            </button>
        </motion.div>,
        document.body
    );

    return (
        <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[850] flex items-center justify-center p-4 md:p-10 pointer-events-auto"
        >
            <motion.button
                type="button"
                aria-label="Fechar"
                className="absolute inset-0 bg-[#050506]/75 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
            />
            <motion.div
                className="relative z-10 w-full max-w-3xl max-h-[min(92vh,880px)] flex flex-col rounded-[1.75rem] overflow-hidden shadow-[0_32px_120px_rgba(0,0,0,0.75)] border border-white/[0.1]"
                style={{ background: getBgColor(note.color) }}
                initial={{ opacity: 0, y: 28, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-4 px-8 pt-8 pb-4 border-b border-white/[0.06] shrink-0 bg-black/10">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="mt-1 text-white/35">
                            {IconComponent ? <IconComponent size={22} strokeWidth={1.5} /> : <Feather size={22} strokeWidth={1.5} />}
                        </div>
                        <input
                            type="text"
                            value={note.title}
                            onChange={e => onUpdate({ title: e.target.value })}
                            placeholder="Título"
                            className="w-full bg-transparent border-none outline-none text-2xl md:text-[1.65rem] font-light text-white/95 placeholder:text-white/25 tracking-tight"
                        />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            ref={menuBtnRef}
                            type="button"
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-2.5 rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <MoreVertical size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2.5 rounded-xl text-white/45 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </header>
                {menuPortal}

                <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 notes-widget-scroll">
                    {isTodo ? (
                        <div className="flex flex-col gap-3 max-w-2xl">
                            {(note.todos ?? []).map(todo => (
                                <div key={todo.id} className="flex items-start gap-3 group/todo min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => toggleTodo(todo.id, todo.done)}
                                        className="mt-1.5 w-5 h-5 rounded-md border border-white/25 flex items-center justify-center shrink-0 transition-colors"
                                        style={{ background: todo.done ? 'rgba(255,255,255,0.12)' : 'transparent' }}
                                    >
                                        {todo.done && <Check size={12} className="text-white" />}
                                    </button>
                                    <textarea
                                        value={todo.text}
                                        onChange={e => updateTodo(todo.id, e.target.value)}
                                        placeholder="Tarefa…"
                                        rows={1}
                                        className={`bg-transparent border-none outline-none w-full min-w-0 flex-1 resize-none text-[15px] leading-relaxed break-words whitespace-pre-wrap ${todo.done ? 'text-white/35 line-through' : 'text-white/80'}`}
                                        style={{ minHeight: '1.5rem' } as CSSProperties}
                                        onInput={(e) => {
                                            const ta = e.target as HTMLTextAreaElement;
                                            ta.style.height = 'auto';
                                            ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`;
                                        }}
                                    />
                                    <button type="button" onClick={() => deleteTodo(todo.id)} className="opacity-0 group-hover/todo:opacity-100 text-white/25 hover:text-red-400 p-1 shrink-0">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            <button type="button" onClick={addTodo} className="flex items-center gap-2 text-[14px] text-white/35 hover:text-white/70 py-2 w-fit mt-2">
                                <Plus size={16} /> Novo item
                            </button>
                        </div>
                    ) : (
                        <RichNoteBody note={note} onUpdate={onUpdate} translate={translate} />
                    )}
                </div>

                <footer className="px-8 py-4 border-t border-white/[0.05] bg-black/15 shrink-0">
                    <p className="text-[11px] text-white/30 tracking-wide">
                        {hint}
                        {!isTodo && (
                            <span className="block mt-1 text-white/22">
                                {translate('notes.format_hint')}
                            </span>
                        )}
                    </p>
                </footer>
            </motion.div>
        </motion.div>
    );
};

export const NotesWidget: React.FC<NotesWidgetProps> = ({
    isOpen,
    onClose,
    notes,
    setNotes,
    config,
    setConfig,
    noteWorkspaces,
    setNoteWorkspaces,
    activeNoteWorkspaceId,
    setActiveNoteWorkspaceId,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [newWsOpen, setNewWsOpen] = useState(false);
    const [newWsName, setNewWsName] = useState('');
    const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
    const [filter, setFilter] = useState<NotesFilter>('all');
    const [viewMode, setViewMode] = useState<NotesViewMode>('canvas');
    const dragBoundsRef = useRef<HTMLDivElement>(null);
    const { menu, openMenu, closeMenu, menuRootId } = useNotesContextMenu(isOpen);
    const t = (key: string) => getTranslation(config, key);

    const boardNotes = useMemo(
        () => notes.filter(n => (n.workspaceId || DEFAULT_WS_ID) === activeNoteWorkspaceId),
        [notes, activeNoteWorkspaceId],
    );

    const filteredNotes = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        let list = boardNotes;

        if (filter === 'pinned') list = list.filter(n => n.pinned && !n.archived);
        else if (filter === 'archived') list = list.filter(n => n.archived);
        else if (filter === 'recent') {
            const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            list = list.filter(n => !n.archived && noteSortKey(n) >= weekAgo);
        } else {
            list = list.filter(n => !n.archived);
        }

        const matchesSearch = (n: Note) => {
            if (!q) return true;
            const plain = (n.contentHtml ? stripHtml(n.contentHtml) : (n.content ?? '')).toLowerCase();
            return n.title.toLowerCase().includes(q) ||
                plain.includes(q) ||
                (n.todos ?? []).some(x => x.text.toLowerCase().includes(q));
        };

        return list
            .filter(matchesSearch)
            .sort((a, b) => {
                if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
                return noteSortKey(b) - noteSortKey(a);
            });
    }, [boardNotes, searchQuery, filter]);

    /** Canvas stack order follows global notes array (bringToFront), not sort order used in list/grid. */
    const filteredNoteIds = useMemo(() => new Set(filteredNotes.map(n => n.id)), [filteredNotes]);
    const canvasNotes = useMemo(
        () => notes.filter(n => filteredNoteIds.has(n.id)),
        [notes, filteredNoteIds],
    );

    /** Abas de acesso rápido: ordem cronológica de criação (mais antiga → mais recente). */
    const quickAccessNotes = useMemo(() =>
        [...filteredNotes].sort((a, b) => noteCreatedAt(a) - noteCreatedAt(b)),
    [filteredNotes]);

    const workspaceCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const ws of noteWorkspaces) counts[ws.id] = 0;
        for (const n of notes) {
            if (n.archived) continue;
            const wid = n.workspaceId || DEFAULT_WS_ID;
            counts[wid] = (counts[wid] ?? 0) + 1;
        }
        return counts;
    }, [notes, noteWorkspaces]);

    const focusedNote = focusedNoteId ? notes.find(n => n.id === focusedNoteId) : null;
    const contextMenuNote = menu?.kind === 'note' && menu.noteId
        ? notes.find(n => n.id === menu.noteId)
        : null;

    const backdropAlpha = Math.min(1, Math.max(0, config.notesWidgetBackdropOpacity ?? 0.85));

    const openNote = useCallback((id: string) => {
        setFocusedNoteId(prev => (prev === id ? prev : id));
    }, []);

    const handleCreate = (workspaceId?: string) => {
        const id = crypto.randomUUID();
        const w0 = 340;
        const h0 = 320;
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        let x = left + cw / 2 - w0 / 2 + (Math.random() * 48 - 24);
        let y = top + ch / 2 - h0 / 2 + (Math.random() * 48 - 24);
        const pos = clampNotePosition(x, y, w0, h0);
        const now = new Date().toISOString();
        const ws = workspaceId ?? activeNoteWorkspaceId;
        const newNote: Note = {
            id,
            title: '',
            content: '',
            date: now,
            updatedAt: now,
            type: 'text',
            workspaceId: ws,
            dimensions: { width: 340, height: 320 },
            position: pos,
        };
        setNotes(prev => [newNote, ...prev]);
        setSearchQuery('');
        if (ws !== activeNoteWorkspaceId) setActiveNoteWorkspaceId(ws);
        setFocusedNoteId(id);
    };

    const handleUpdate = (id: string, updates: Partial<Note>) =>
        setNotes(prev => prev.map(n => n.id === id
            ? { ...n, ...updates, updatedAt: new Date().toISOString() }
            : n));

    const handleDelete = (id: string) => {
        setNotes(prev => prev.filter(n => n.id !== id));
        setFocusedNoteId(prev => (prev === id ? null : prev));
    };

    const handleBringToFront = (id: string) => {
        setNotes(prev => {
            const sourceIdx = prev.findIndex(n => n.id === id);
            if (sourceIdx === -1) return prev;
            const next = [...prev];
            const [moved] = next.splice(sourceIdx, 1);
            next.push(moved);
            return next;
        });
    };

    const centerNoteInView = useCallback((id: string) => {
        const note = boardNotes.find(n => n.id === id);
        if (!note) return;
        const { w, h } = (() => {
            if (note.type === 'todo' && note.dimensions == null) {
                const d = defaultNoteSize(note);
                return { w: d.w, h: d.h };
            }
            const w0 = note.dimensions?.width ?? 340;
            const h0 = note.dimensions?.height ?? 320;
            return { w: w0, h: h0 };
        })();
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        const x = left + cw / 2 - w / 2;
        const y = top + ch / 2 - h / 2;
        handleUpdate(id, { position: clampNotePosition(x, y, w, h) });
        handleBringToFront(id);
    }, [boardNotes]);

    const createWorkspace = () => {
        const name = newWsName.trim() || t('notes.workspace_untitled');
        const id = crypto.randomUUID();
        setNoteWorkspaces(prev => [...prev, { id, name }]);
        setActiveNoteWorkspaceId(id);
        setNewWsName('');
        setNewWsOpen(false);
    };

    const deleteWorkspace = (ws: NoteWorkspace) => {
        if (ws.id === DEFAULT_WS_ID) return;
        setNotes(prev =>
            prev.map(n =>
                (n.workspaceId || DEFAULT_WS_ID) === ws.id ? { ...n, workspaceId: DEFAULT_WS_ID } : n
            )
        );
        setNoteWorkspaces(prev => prev.filter(w => w.id !== ws.id));
        if (activeNoteWorkspaceId === ws.id) {
            setActiveNoteWorkspaceId(DEFAULT_WS_ID);
        }
    };

    const renameWorkspace = useCallback((wsId: string, name?: string) => {
        const ws = noteWorkspaces.find(w => w.id === wsId);
        const next = name?.trim() ?? window.prompt(t('notes.workspace_rename'), ws?.name ?? '');
        if (next?.trim()) {
            setNoteWorkspaces(prev => prev.map(w => w.id === wsId ? { ...w, name: next.trim() } : w));
        }
    }, [noteWorkspaces, setNoteWorkspaces, t]);

    useEffect(() => {
        if (!isOpen) setFocusedNoteId(null);
    }, [isOpen]);

    const applyBoardLayout = useCallback((
        updates: Map<string, { x: number; y: number }>,
        orderedIds: string[],
        dimensionUpdates?: Map<string, { width: number; height: number }>,
    ) => {
        const idSet = new Set(orderedIds);
        setNotes(prev => {
            const now = new Date().toISOString();
            const withPositions = prev.map(n => {
                const p = updates.get(n.id);
                const d = dimensionUpdates?.get(n.id);
                if (!p && !d) return n;
                return {
                    ...n,
                    ...(p ? { position: p } : {}),
                    ...(d ? { dimensions: d } : {}),
                    updatedAt: now,
                };
            });
            const organized = orderedIds
                .map(id => withPositions.find(n => n.id === id))
                .filter((n): n is Note => !!n);
            const rest = withPositions.filter(n => !idSet.has(n.id));
            return [...rest, ...organized];
        });
    }, [setNotes]);

    const openBoardContextMenu = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-note-card]')) return;
        e.preventDefault();
        e.stopPropagation();
        openMenu({ kind: 'board', x: e.clientX, y: e.clientY });
    }, [openMenu]);

    const openNoteContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        e.stopPropagation();
        openMenu({ kind: 'note', x: e.clientX, y: e.clientY, noteId });
    }, [openMenu]);

    const noteSizeForLayout = (note: Note) => {
        if (note.type === 'todo' && note.dimensions == null) return defaultNoteSize(note);
        return {
            w: note.dimensions?.width ?? (note.type === 'todo' ? 280 : 340),
            h: note.dimensions?.height ?? (note.type === 'todo' ? 240 : 320),
        };
    };

    const layoutNotes = useCallback((list: Note[], place: (note: Note, i: number, size: { w: number; h: number }) => { x: number; y: number }) => {
        const rawPlacements: LayoutPlacement[] = list.map((note, i) => {
            const size = noteSizeForLayout(note);
            const raw = place(note, i, size);
            return { id: note.id, x: raw.x, y: raw.y, w: size.w, h: size.h };
        });
        const centered = centerLayoutPlacements(rawPlacements);
        const map = new Map<string, { x: number; y: number }>();
        const orderedIds: string[] = [];
        for (const p of centered) {
            map.set(p.id, clampNotePosition(p.x, p.y, p.w, p.h));
            orderedIds.push(p.id);
        }
        applyBoardLayout(map, orderedIds);
        closeMenu();
    }, [applyBoardLayout, closeMenu]);

    const organizeCascade = useCallback(() => {
        const list = [...canvasNotes];
        if (list.length === 0) { closeMenu(); return; }
        const { width: cw, height: ch } = getCanvasBounds();
        const sizes = list.map(noteSizeForLayout);
        const maxW = Math.max(...sizes.map(s => s.w));
        const maxH = Math.max(...sizes.map(s => s.h));
        const step = Math.max(12, Math.min(26, Math.floor(
            Math.min(Math.max(cw - maxW, 0), Math.max(ch - maxH, 0)) / Math.max(list.length - 1, 1),
        )));
        layoutNotes(list, (_note, i) => ({
            x: i * step,
            y: i * step,
        }));
    }, [canvasNotes, layoutNotes, closeMenu]);

    const organizeGrid = useCallback(() => {
        const list = [...canvasNotes];
        if (list.length === 0) { closeMenu(); return; }
        const n = list.length;
        const { width: cw, height: ch } = getCanvasBounds();
        const gap = 18;
        let cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        let rows = Math.ceil(n / cols);

        const clampCell = (w: number, h: number) => ({
            w: Math.min(400, Math.max(280, w)),
            h: Math.min(360, Math.max(240, h)),
        });

        let cell = clampCell(
            Math.floor((cw - gap * (cols - 1)) / cols),
            Math.floor((ch - gap * (rows - 1)) / rows),
        );

        while (cols > 1 && (cell.w < 280 || cell.h < 240)) {
            cols -= 1;
            rows = Math.ceil(n / cols);
            cell = clampCell(
                Math.floor((cw - gap * (cols - 1)) / cols),
                Math.floor((ch - gap * (rows - 1)) / rows),
            );
        }

        const rawPlacements: LayoutPlacement[] = list.map((note, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            return {
                id: note.id,
                x: col * (cell.w + gap),
                y: row * (cell.h + gap),
                w: cell.w,
                h: cell.h,
            };
        });

        const centered = centerLayoutPlacements(rawPlacements);
        const posMap = new Map<string, { x: number; y: number }>();
        const dimMap = new Map<string, { width: number; height: number }>();
        const orderedIds: string[] = [];
        for (const p of centered) {
            posMap.set(p.id, clampNotePosition(p.x, p.y, p.w, p.h));
            dimMap.set(p.id, { width: p.w, height: p.h });
            orderedIds.push(p.id);
        }
        applyBoardLayout(posMap, orderedIds, dimMap);
        closeMenu();
    }, [canvasNotes, applyBoardLayout, closeMenu]);

    const organizeColumn = useCallback(() => {
        const list = [...canvasNotes];
        if (list.length === 0) { closeMenu(); return; }
        const gap = 14;
        const { height: ch } = getCanvasBounds();
        const sizes = list.map(noteSizeForLayout);
        const maxW = Math.max(...sizes.map(s => s.w));
        const colWidth = maxW + gap;
        let colIdx = 0;
        let y = 0;
        layoutNotes(list, (_note, _i, size) => {
            if (y > 0 && y + size.h > ch) {
                colIdx += 1;
                y = 0;
            }
            const out = { x: colIdx * colWidth, y };
            y += size.h + gap;
            return out;
        });
    }, [canvasNotes, layoutNotes, closeMenu]);

    const organizeFan = useCallback(() => {
        const list = [...canvasNotes];
        if (list.length === 0) { closeMenu(); return; }
        const { width: cw, height: ch } = getCanvasBounds();
        const radius = Math.min(Math.min(cw, ch) / 2.8, 48 + list.length * 14);
        layoutNotes(list, (_note, i, size) => {
            const angle = (-Math.PI / 2) + (i / Math.max(list.length, 1)) * (Math.PI * 1.15);
            return {
                x: Math.cos(angle) * radius - size.w / 2,
                y: Math.sin(angle) * radius - size.h / 2,
            };
        });
    }, [canvasNotes, layoutNotes, closeMenu]);

    const contextMenuActions = useMemo(() => ({
        organizeCascade,
        organizeGrid,
        organizeColumn,
        organizeFan,
        createNote: () => {
            const wsId = menu?.kind === 'workspace' ? menu.workspaceId : activeNoteWorkspaceId;
            handleCreate(wsId);
            closeMenu();
        },
        renameWorkspace: () => {
            if (menu?.workspaceId) renameWorkspace(menu.workspaceId);
            closeMenu();
        },
        deleteWorkspace: () => {
            const ws = menu?.workspaceId ? noteWorkspaces.find(w => w.id === menu.workspaceId) : null;
            if (ws) deleteWorkspace(ws);
            closeMenu();
        },
        openNote: () => {
            if (menu?.noteId) openNote(menu.noteId);
            closeMenu();
        },
        pinNote: () => {
            if (menu?.noteId) handleUpdate(menu.noteId, { pinned: true });
            closeMenu();
        },
        unpinNote: () => {
            if (menu?.noteId) handleUpdate(menu.noteId, { pinned: false });
            closeMenu();
        },
        archiveNote: () => {
            if (menu?.noteId) handleUpdate(menu.noteId, { archived: true, pinned: false });
            closeMenu();
        },
        restoreNote: () => {
            if (menu?.noteId) handleUpdate(menu.noteId, { archived: false });
            closeMenu();
        },
        deleteNote: () => {
            if (menu?.noteId) handleDelete(menu.noteId);
            closeMenu();
        },
    }), [organizeCascade, organizeGrid, organizeColumn, organizeFan, menu, noteWorkspaces, closeMenu, openNote, renameWorkspace]);

    const showQuickNotes = viewMode === 'canvas' && filteredNotes.length > 0;
    notesLayoutMetrics.topChromeH = TOP_CHROME_BASE + (showQuickNotes ? QUICK_STRIP_H : 0);

    const handleQuickNoteSelect = useCallback((id: string) => {
        centerNoteInView(id);
        openNote(id);
    }, [centerNoteInView, openNote]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[85] flex flex-col overflow-hidden text-white/90 pointer-events-auto">

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 backdrop-blur-[40px]"
                style={{ backgroundColor: `rgba(6, 6, 8, ${backdropAlpha})` }}
                onClick={onClose}
            />

            <WidgetBackdropOpacitySlider
                value={backdropAlpha}
                onChange={(v) => setConfig(prev => ({ ...prev, notesWidgetBackdropOpacity: v }))}
                label={t('notes.backdrop_opacity')}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-[70] flex flex-col w-full h-full pointer-events-none"
            >
                <NotesTopBar
                    t={t}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    noteCount={filteredNotes.length}
                    onClose={onClose}
                    workspaces={noteWorkspaces}
                    activeWorkspaceId={activeNoteWorkspaceId}
                    onSelectWorkspace={setActiveNoteWorkspaceId}
                    onRenameWorkspace={renameWorkspace}
                    onDeleteWorkspace={(id) => {
                        const ws = noteWorkspaces.find(w => w.id === id);
                        if (ws) deleteWorkspace(ws);
                    }}
                    workspaceCounts={workspaceCounts}
                    newWsOpen={newWsOpen}
                    newWsName={newWsName}
                    onNewWsNameChange={setNewWsName}
                    onNewWsOpen={() => setNewWsOpen(true)}
                    onNewWsClose={() => { setNewWsOpen(false); setNewWsName(''); }}
                    onCreateWorkspace={createWorkspace}
                    defaultWorkspaceId={DEFAULT_WS_ID}
                    quickNotes={quickAccessNotes}
                    focusedNoteId={focusedNoteId}
                    onQuickNoteSelect={handleQuickNoteSelect}
                    showQuickNotes={showQuickNotes}
                />

                <main
                    className="flex-1 min-h-0 flex flex-col relative pointer-events-auto pb-[80px]"
                    onContextMenu={viewMode === 'canvas' ? openBoardContextMenu : undefined}
                >
                        {filteredNotes.length === 0 ? (
                            <div
                                className="flex flex-col items-center justify-center flex-1 opacity-25 min-h-[40vh]"
                                onContextMenu={openBoardContextMenu}
                            >
                                <Feather size={44} className="text-white/20 mb-5" strokeWidth={1} />
                                <span className="text-[12px] font-medium tracking-[0.28em] text-white/40 uppercase">
                                    {searchQuery || filter !== 'all'
                                        ? (t('notes.no_results') || 'Nada encontrado')
                                        : (t('notes.blank_canvas') || 'Tela vazia')}
                                </span>
                            </div>
                        ) : viewMode === 'list' ? (
                            <NotesListView
                                notes={filteredNotes}
                                onOpen={openNote}
                                onContextMenu={openNoteContextMenu}
                                t={t}
                            />
                        ) : viewMode === 'grid' ? (
                            <NotesGridView
                                notes={filteredNotes}
                                onOpen={openNote}
                                onContextMenu={openNoteContextMenu}
                                t={t}
                            />
                        ) : (
                            <div className="flex-1 min-h-0 relative overflow-hidden">
                                <div
                                    ref={dragBoundsRef}
                                    className="absolute inset-0 z-[66] pointer-events-none"
                                    style={{
                                        left: CANVAS_LEFT,
                                        top: NOTES_PAD.top,
                                        right: NOTES_PAD.right,
                                        bottom: NOTES_PAD.bottom,
                                    }}
                                    aria-hidden
                                />
                                <div className="absolute inset-0">
                                    {canvasNotes.map((note, index) => (
                                        <NotePreviewCard
                                            key={note.id}
                                            note={note}
                                            stackIndex={index + 1}
                                            onUpdate={updates => handleUpdate(note.id, updates)}
                                            onDelete={() => handleDelete(note.id)}
                                            onBringToFront={() => handleBringToFront(note.id)}
                                            onExpand={() => openNote(note.id)}
                                            onContextMenu={e => openNoteContextMenu(e, note.id)}
                                            isEditingElsewhere={focusedNoteId === note.id}
                                            expandHint={t('notes.expand_hint') || 'Abrir editor'}
                                            translate={t}
                                            dragConstraintsRef={dragBoundsRef}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                </main>

                <NotesBottomDock
                    t={t}
                    filter={filter}
                    onFilterChange={setFilter}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    onCreateNote={() => handleCreate()}
                />
            </motion.div>

            <AnimatePresence>
                {focusedNote && (
                    <NoteFocusPanel
                        key={focusedNote.id}
                        note={focusedNote}
                        onUpdate={u => handleUpdate(focusedNote.id, u)}
                        onClose={() => setFocusedNoteId(null)}
                        onDelete={() => handleDelete(focusedNote.id)}
                        hint={t('notes.focus_hint') || 'Esc para fechar · alterações salvas automaticamente'}
                        translate={t}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {menu && (
                    <NotesContextMenu
                        menu={menu}
                        menuRootId={menuRootId}
                        t={t}
                        noteCount={canvasNotes.length}
                        isPinned={contextMenuNote?.pinned}
                        isArchived={contextMenuNote?.archived}
                        canDeleteWorkspace={menu.workspaceId !== DEFAULT_WS_ID}
                        actions={contextMenuActions}
                    />
                )}
            </AnimatePresence>

            <style>{`
                .notes-widget-scroll {
                  direction: ltr;
                  overflow-y: auto;
                  overflow-x: hidden;
                  scrollbar-width: thin;
                  scrollbar-color: rgba(255,255,255,0.15) transparent;
                }
                .notes-widget-scroll::-webkit-scrollbar { width: 6px; height: 4px; }
                .notes-widget-scroll::-webkit-scrollbar-thumb {
                  background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));
                  border-radius: 999px;
                }
                .scrollbar-none::-webkit-scrollbar { display: none; }
                .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
