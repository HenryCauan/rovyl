import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Note, UIConfig, NoteWorkspace } from '../types';
import type { Dispatch, SetStateAction } from 'react';
import {
    Plus, X, Trash2, Search, CheckSquare, AlignLeft,
    MoreVertical, Check, Palette, Feather, Layers,
    Maximize2, Droplets, LayoutGrid, Sparkles, Rows, CircleDot,
    Bold, Italic, Underline, List, ListOrdered, Strikethrough,
} from 'lucide-react';
import { getTranslation } from '../translations';
import { getIcon } from '../iconMap';

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

/** Safe canvas insets: left clears the filmstrip (left-4 + w-11) + margin so notes never sit under it. */
const NOTES_PAD = { top: 188, right: 16, bottom: 128 } as const;
/** Minimum x for note top-left — keeps stickies in the main canvas, away from the history rail. */
const CANVAS_LEFT = 108;

function getCanvasBounds() {
    const left = CANVAS_LEFT;
    const top = NOTES_PAD.top;
    const right = NOTES_PAD.right;
    const bottom = NOTES_PAD.bottom;
    const width = window.innerWidth - left - right;
    const height = window.innerHeight - top - bottom;
    return { left, top, right, bottom, width, height };
}

/** Filmstrip hit area (fixed left-4, w-11, top-[11rem], bottom-36) — extra push if a note still intersects. */
const FILMSTRIP = { left: 16, right: 92, top: 11 * 16, get bottom() { return window.innerHeight - 9 * 16; } };

function clampNotePosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
    const { left: L, top: T, width: cw, height: ch } = getCanvasBounds();
    let nx = Math.max(L, Math.min(x, L + cw - w));
    let ny = Math.max(T, Math.min(y, T + ch - h));

    const fsT = FILMSTRIP.top;
    const fsB = FILMSTRIP.bottom;
    const ix1 = Math.max(nx, FILMSTRIP.left);
    const ix2 = Math.min(nx + w, FILMSTRIP.right);
    const iy1 = Math.max(ny, fsT);
    const iy2 = Math.min(ny + h, fsB);
    if (ix1 < ix2 && iy1 < iy2) {
        nx = FILMSTRIP.right;
        nx = Math.max(L, Math.min(nx, L + cw - w));
    }
    return { x: nx, y: ny };
}

function normalizeHex7(s: string): string | null {
    const t = s.trim();
    const m = t.match(/^#([0-9A-Fa-f]{6})$/);
    return m ? `#${m[1].toLowerCase()}` : null;
}

function stripHtml(html: string): string {
    if (!html) return '';
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.textContent || d.innerText || '';
}

const PRESET_COLORS = [
    { key: 'default',   display: 'rgba(255,255,255,0.03)' },
    { key: '#1a1f2c', display: 'rgba(26,31,44, 0.4)' },
    { key: '#231e14', display: 'rgba(35,30,20, 0.4)' },
    { key: '#1b241c', display: 'rgba(27,36,28, 0.4)' },
    { key: '#241a22', display: 'rgba(36,26,34, 0.4)' },
    { key: '#182029', display: 'rgba(24,32,41, 0.4)' },
];

const getBgColor = (key?: string) => {
    const preset = PRESET_COLORS.find(c => c.key === key);
    if (preset) return preset.display;
    if (key && key.startsWith('#')) return `${key}66`;
    return PRESET_COLORS[0].display;
};

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

function previewTextSnippet(note: Note): string {
    const raw = note.contentHtml ? stripHtml(note.contentHtml) : (note.content || '');
    return raw.replace(/\s+/g, ' ').trim();
}

function defaultNoteSize(note: Note): { w: number; h: number } {
    if (note.type === 'todo') {
        const n = Math.max(1, (note.todos ?? []).length);
        return { w: Math.min(380, 240 + Math.min(n, 8) * 8), h: 72 + n * 26 };
    }
    return { w: 340, h: 320 };
}

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
}

const NotePreviewCard: React.FC<NotePreviewCardProps> = ({
    note, onUpdate, onDelete, onBringToFront, onExpand, isEditingElsewhere, expandHint, translate, dragConstraintsRef,
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const menuBtnRef = useRef<HTMLButtonElement>(null);
    const dragControls = useDragControls();
    const [showMenu, setShowMenu] = useState(false);
    const [showColors, setShowColors] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 252 });

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

    const handleDragEnd = (_e: unknown, info: { offset: { x: number; y: number } }) => {
        const el = cardRef.current;
        const fallback = defaultNoteSize(note);
        const w = el?.offsetWidth ?? fallback.w;
        const h = el?.offsetHeight ?? fallback.h;
        let nx = (note.position?.x ?? 0) + info.offset.x;
        let ny = (note.position?.y ?? 0) + info.offset.y;
        const p = clampNotePosition(nx, ny, w, h);
        onUpdate({ position: p });
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

    return (
        <motion.div
            data-note-card
            ref={cardRef}
            drag={!isEditingElsewhere}
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={dragConstraintsRef}
            dragSnapToOrigin={false}
            onDragStart={onBringToFront}
            onDragEnd={handleDragEnd}
            onMouseUp={handleMouseUp}
            className={`group absolute flex flex-col rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.45)] border border-white/[0.09] overflow-visible ${todoIntrinsic ? 'w-fit max-w-[min(92vw,400px)]' : ''}`}
            style={{
                background: getBgColor(note.color),
                resize: todoIntrinsic ? 'none' : 'both',
                minWidth: isTodo ? 200 : 260,
                minHeight: isTodo ? 64 : 180,
                width: todoIntrinsic ? 'max-content' : (note.dimensions?.width ?? 340),
                height: todoIntrinsic ? 'auto' : (note.dimensions?.height ?? 320),
                maxWidth: todoIntrinsic ? 'min(92vw, 400px)' : 'min(92vw, 520px)',
                x: note.position?.x ?? 0,
                y: note.position?.y ?? 0,
            }}
            initial={false}
            animate={{ opacity: isEditingElsewhere ? 0.22 : 1 }}
            whileHover={isEditingElsewhere ? undefined : { boxShadow: '0 20px 56px rgba(0,0,0,0.55)' }}
            whileDrag={{ zIndex: 80, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
            transition={{ opacity: { duration: 0.2 } }}
        >
            <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden backdrop-blur-3xl">
                {/* Drag handle + chrome */}
                <div
                    className="flex items-center justify-between px-4 pt-3.5 pb-2 cursor-grab active:cursor-grabbing shrink-0 relative z-20"
                    onPointerDown={(e) => { dragControls.start(e); onBringToFront(); }}
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-none">
                        {IconComponent ? <IconComponent size={15} strokeWidth={2} className="text-white/45 shrink-0" /> : <AlignLeft size={15} className="text-white/35 shrink-0" />}
                        <span className="text-[14px] font-medium text-white/88 truncate pr-2">
                            {note.title?.trim() || 'Sem título'}
                        </span>
                    </div>
                    <div className="flex items-center gap-0.5 pointer-events-auto">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onExpand(); }}
                            className="p-1.5 rounded-lg text-white/35 hover:text-white/80 hover:bg-white/10 transition-colors"
                            title="Abrir"
                        >
                            <Maximize2 size={14} strokeWidth={2} />
                        </button>
                        <button
                            ref={menuBtnRef}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-white/45"
                        >
                            <MoreVertical size={15} strokeWidth={2} />
                        </button>
                    </div>
                </div>

                {menuPortal}

                <button
                    type="button"
                    className="relative flex-1 min-h-0 text-left px-4 pt-0 pb-9 flex flex-col overflow-x-hidden min-h-0 group/prev focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-b-2xl"
                    onClick={(e) => { e.stopPropagation(); onExpand(); }}
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
                </button>
            </div>
        </motion.div>
    );
};

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
            className="fixed z-[620] bg-[#161618]/98 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-2xl py-1.5 flex flex-col overflow-hidden"
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
            className="fixed inset-0 z-[600] flex items-center justify-center p-4 md:p-10 pointer-events-auto"
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
    const [organizeMenu, setOrganizeMenu] = useState<{ x: number; y: number } | null>(null);
    const dragBoundsRef = useRef<HTMLDivElement>(null);
    const t = (key: string) => getTranslation(config, key);

    const boardNotes = useMemo(
        () => notes.filter(n => (n.workspaceId || DEFAULT_WS_ID) === activeNoteWorkspaceId),
        [notes, activeNoteWorkspaceId],
    );

    const filteredNotes = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return boardNotes.filter(n => {
            const plain = (n.contentHtml ? stripHtml(n.contentHtml) : (n.content ?? '')).toLowerCase();
            return n.title.toLowerCase().includes(q) ||
                plain.includes(q) ||
                (n.todos ?? []).some(x => x.text.toLowerCase().includes(q));
        });
    }, [boardNotes, searchQuery]);

    const focusedNote = focusedNoteId ? notes.find(n => n.id === focusedNoteId) : null;

    const backdropAlpha = Math.min(1, Math.max(0, config.notesWidgetBackdropOpacity ?? 0.85));

    const handleCreate = () => {
        const id = crypto.randomUUID();
        const w0 = 340;
        const h0 = 320;
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        let x = left + cw / 2 - w0 / 2 + (Math.random() * 48 - 24);
        let y = top + ch / 2 - h0 / 2 + (Math.random() * 48 - 24);
        const pos = clampNotePosition(x, y, w0, h0);
        const newNote: Note = {
            id,
            title: '',
            content: '',
            date: new Date().toISOString(),
            type: 'text',
            workspaceId: activeNoteWorkspaceId,
            dimensions: { width: 340, height: 320 },
            position: pos,
        };
        setNotes(prev => [newNote, ...prev]);
        setSearchQuery('');
        setFocusedNoteId(id);
    };

    const handleUpdate = (id: string, updates: Partial<Note>) =>
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

    const handleDelete = (id: string) =>
        setNotes(prev => prev.filter(n => n.id !== id));

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

    useEffect(() => {
        if (!isOpen) setFocusedNoteId(null);
    }, [isOpen]);

    useEffect(() => {
        if (!organizeMenu) return;
        let removeDown: (() => void) | undefined;
        const timer = window.setTimeout(() => {
            const onDown = (e: MouseEvent) => {
                const menu = document.getElementById('notes-organize-popover');
                if (menu?.contains(e.target as Node)) return;
                setOrganizeMenu(null);
            };
            document.addEventListener('mousedown', onDown);
            removeDown = () => document.removeEventListener('mousedown', onDown);
        }, 0);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOrganizeMenu(null);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            clearTimeout(timer);
            removeDown?.();
            window.removeEventListener('keydown', onKey);
        };
    }, [organizeMenu]);

    const applyPositionsToBoard = useCallback((updates: Map<string, { x: number; y: number }>) => {
        setNotes(prev => prev.map(n => {
            const p = updates.get(n.id);
            return p ? { ...n, position: p } : n;
        }));
    }, [setNotes]);

    const openBoardContextMenu = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-note-card]')) return;
        e.preventDefault();
        setOrganizeMenu({ x: e.clientX, y: e.clientY });
    }, []);

    const noteSizeForLayout = (note: Note) => {
        if (note.type === 'todo' && note.dimensions == null) return defaultNoteSize(note);
        return {
            w: note.dimensions?.width ?? (note.type === 'todo' ? 280 : 340),
            h: note.dimensions?.height ?? (note.type === 'todo' ? 240 : 320),
        };
    };

    const organizeCascade = useCallback(() => {
        const list = [...filteredNotes];
        if (list.length === 0) {
            setOrganizeMenu(null);
            return;
        }
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        const step = 26;
        const sizes = list.map(noteSizeForLayout);
        const maxW = Math.max(...sizes.map(s => s.w));
        const maxH = Math.max(...sizes.map(s => s.h));
        const blockW = (list.length - 1) * step + maxW;
        const blockH = (list.length - 1) * step + maxH;
        const originX = left + Math.max(0, (cw - blockW) / 2);
        const originY = top + Math.max(0, (ch - blockH) / 2);
        const map = new Map<string, { x: number; y: number }>();
        list.forEach((note, i) => {
            const { w, h } = sizes[i];
            const x = originX + i * step;
            const y = originY + i * step;
            map.set(note.id, clampNotePosition(x, y, w, h));
        });
        applyPositionsToBoard(map);
        setOrganizeMenu(null);
    }, [filteredNotes, applyPositionsToBoard]);

    const organizeGrid = useCallback(() => {
        const list = [...filteredNotes];
        if (list.length === 0) {
            setOrganizeMenu(null);
            return;
        }
        const n = list.length;
        const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        const gap = 20;
        const slotW = 360;
        const slotH = 340;
        const rows = Math.ceil(n / cols);
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        const totalW = cols * slotW + (cols - 1) * gap;
        const totalH = rows * slotH + (rows - 1) * gap;
        const startX = left + Math.max(0, (cw - totalW) / 2);
        const startY = top + Math.max(0, (ch - totalH) / 2);
        const map = new Map<string, { x: number; y: number }>();
        list.forEach((note, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const { w, h } = noteSizeForLayout(note);
            const x = startX + col * (slotW + gap);
            const y = startY + row * (slotH + gap);
            map.set(note.id, clampNotePosition(x, y, w, h));
        });
        applyPositionsToBoard(map);
        setOrganizeMenu(null);
    }, [filteredNotes, applyPositionsToBoard]);

    const organizeColumn = useCallback(() => {
        const list = [...filteredNotes];
        if (list.length === 0) {
            setOrganizeMenu(null);
            return;
        }
        const gap = 16;
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        const sizes = list.map(noteSizeForLayout);
        const totalH = sizes.reduce((acc, s) => acc + s.h + gap, 0) - gap;
        let y = top + Math.max(0, (ch - totalH) / 2);
        const map = new Map<string, { x: number; y: number }>();
        list.forEach((note, i) => {
            const { w, h } = sizes[i];
            const x = left + (cw - w) / 2;
            const p = clampNotePosition(x, y, w, h);
            map.set(note.id, p);
            y = p.y + h + gap;
        });
        applyPositionsToBoard(map);
        setOrganizeMenu(null);
    }, [filteredNotes, applyPositionsToBoard]);

    const organizeFan = useCallback(() => {
        const list = [...filteredNotes];
        if (list.length === 0) {
            setOrganizeMenu(null);
            return;
        }
        const { left, top, width: cw, height: ch } = getCanvasBounds();
        const cx = left + cw / 2;
        const cy = top + ch / 2;
        const radius = Math.min(Math.min(cw, ch) / 2.8, 48 + list.length * 14);
        const map = new Map<string, { x: number; y: number }>();
        list.forEach((note, i) => {
            const { w, h } = noteSizeForLayout(note);
            const angle = (-Math.PI / 2) + (i / Math.max(list.length, 1)) * (Math.PI * 1.15);
            const x = cx + Math.cos(angle) * radius - w / 2;
            const y = cy + Math.sin(angle) * radius - h / 2;
            map.set(note.id, clampNotePosition(x, y, w, h));
        });
        applyPositionsToBoard(map);
        setOrganizeMenu(null);
    }, [filteredNotes, applyPositionsToBoard]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden text-white/90">

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 backdrop-blur-[40px]"
                style={{ backgroundColor: `rgba(6, 6, 8, ${backdropAlpha})` }}
                onClick={onClose}
                onContextMenu={e => {
                    e.preventDefault();
                    setOrganizeMenu({ x: e.clientX, y: e.clientY });
                }}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-[70] flex flex-col w-full h-full pointer-events-none"
            >
                <div className="absolute top-0 left-0 right-0 p-6 pt-7 flex flex-col gap-4 pointer-events-none z-[72]">
                    <div className="flex items-start justify-between gap-4 pointer-events-auto">
                        <div className="flex items-center gap-3 min-w-0">
                            <Feather size={20} className="text-white/40 shrink-0" strokeWidth={1.5} />
                            <h2 className="text-white text-2xl font-light tracking-wide drop-shadow-lg truncate">
                                {t('notes.title') || 'Notes'}
                            </h2>
                            {filteredNotes.length > 0 && (
                                <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-white/40 font-medium tracking-widest shrink-0">
                                    {filteredNotes.length}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <div className="relative group">
                                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white/60 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="bg-[#121212]/50 backdrop-blur-xl border border-white/[0.08] text-white placeholder:text-white/20 text-[14px] py-2.5 pl-10 pr-5 rounded-full outline-none transition-all focus:bg-[#1a1a1a]/80 focus:border-white/[0.15] w-44 focus:w-56 font-light shadow-xl"
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer" title={t('notes.backdrop_opacity')}>
                                <Droplets size={14} className="text-white/35 shrink-0" strokeWidth={1.5} />
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(backdropAlpha * 100)}
                                    onChange={e =>
                                        setConfig(prev => ({
                                            ...prev,
                                            notesWidgetBackdropOpacity: Number(e.target.value) / 100,
                                        }))
                                    }
                                    className="w-[72px] h-1 rounded-full appearance-none bg-white/10 accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/80"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] flex items-center justify-center transition-all shadow-xl"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto overflow-x-auto pb-1 scrollbar-none max-w-full">
                        <Layers size={14} className="text-white/25 shrink-0" />
                        {noteWorkspaces.map(ws => (
                            <div key={ws.id} className="flex items-center gap-0.5 shrink-0 group/wtab">
                                <button
                                    type="button"
                                    onClick={() => setActiveNoteWorkspaceId(ws.id)}
                                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium tracking-wide border transition-all ${
                                        activeNoteWorkspaceId === ws.id
                                            ? 'bg-white/12 border-white/25 text-white'
                                            : 'bg-white/[0.03] border-white/[0.07] text-white/45 hover:text-white/75'
                                    }`}
                                >
                                    {ws.name}
                                </button>
                                {ws.id !== DEFAULT_WS_ID && (
                                    <button
                                        type="button"
                                        title={t('notes.workspace_remove')}
                                        onClick={() => deleteWorkspace(ws)}
                                        className="opacity-0 group-hover/wtab:opacity-100 p-1 rounded-md text-white/25 hover:text-red-400/90 hover:bg-red-500/10 transition-all"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {newWsOpen ? (
                            <div className="flex items-center gap-1 shrink-0">
                                <input
                                    autoFocus
                                    value={newWsName}
                                    onChange={e => setNewWsName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') createWorkspace(); if (e.key === 'Escape') { setNewWsOpen(false); setNewWsName(''); } }}
                                    placeholder={t('notes.workspace_name')}
                                    className="w-36 bg-black/40 border border-white/15 rounded-full px-3 py-1.5 text-[12px] outline-none focus:border-white/30"
                                />
                                <button type="button" onClick={createWorkspace} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] px-2">OK</button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setNewWsOpen(true)}
                                className="shrink-0 w-8 h-8 rounded-full border border-dashed border-white/20 text-white/40 hover:text-white/70 hover:border-white/35 flex items-center justify-center text-lg leading-none transition-colors"
                                title={t('notes.workspace_add')}
                            >
                                +
                            </button>
                        )}
                    </div>
                </div>

                {filteredNotes.length === 0 ? (
                    <div
                        className="flex flex-col items-center justify-center flex-1 opacity-20 pointer-events-auto min-h-[40vh]"
                        onContextMenu={openBoardContextMenu}
                    >
                        <Feather size={48} className="text-white/20 mb-6" strokeWidth={1} />
                        <span className="text-[13px] font-medium tracking-[0.3em] text-white/40 uppercase">
                            {searchQuery ? (t('notes.no_results') || 'Nada encontrado') : (t('notes.blank_canvas') || 'Tela vazia')}
                        </span>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col relative" onContextMenu={openBoardContextMenu}>
                        <div
                            className="pointer-events-auto fixed left-4 top-[11rem] bottom-36 z-[74] w-11 flex flex-col gap-1.5 py-2 px-1 rounded-2xl bg-black/25 border border-white/[0.06] backdrop-blur-xl overflow-y-auto notes-filmstrip shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}
                        >
                            {filteredNotes.map((n, i) => {
                                const snippet = n.contentHtml ? stripHtml(n.contentHtml) : (n.content ?? '');
                                const label = (n.title?.trim() || snippet.trim().slice(0, 1) || `${i + 1}`).slice(0, 2).toUpperCase();
                                return (
                                    <button
                                        key={n.id}
                                        type="button"
                                        title={n.title || t('notes.untitled')}
                                        onClick={() => { centerNoteInView(n.id); setFocusedNoteId(n.id); }}
                                        className="w-8 h-8 mx-auto rounded-xl text-[10px] font-semibold tracking-tight text-white/55 hover:text-white bg-white/[0.06] hover:bg-white/15 border border-white/[0.08] transition-all flex items-center justify-center shrink-0"
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex-1 w-full h-full relative overflow-hidden pointer-events-none z-0">
                            <div
                                ref={dragBoundsRef}
                                className="absolute z-[66] pointer-events-none"
                                style={{
                                    left: CANVAS_LEFT,
                                    top: NOTES_PAD.top,
                                    right: NOTES_PAD.right,
                                    bottom: NOTES_PAD.bottom,
                                }}
                                aria-hidden
                            />
                            <div className="absolute inset-0 pointer-events-auto">
                                <AnimatePresence>
                                    {filteredNotes.map(note => (
                                        <NotePreviewCard
                                            key={note.id}
                                            note={note}
                                            onUpdate={updates => handleUpdate(note.id, updates)}
                                            onDelete={() => handleDelete(note.id)}
                                            onBringToFront={() => handleBringToFront(note.id)}
                                            onExpand={() => setFocusedNoteId(note.id)}
                                            isEditingElsewhere={focusedNoteId === note.id}
                                            expandHint={t('notes.expand_hint') || 'Abrir editor'}
                                            translate={t}
                                            dragConstraintsRef={dragBoundsRef}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                )}
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

            {organizeMenu && createPortal(
                <motion.div
                    id="notes-organize-popover"
                    role="menu"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="fixed z-[200] w-[min(92vw,300px)] rounded-[1.15rem] overflow-hidden border border-white/[0.1] bg-gradient-to-b from-[#12121a]/98 to-[#0a0a0c]/98 backdrop-blur-2xl shadow-[0_28px_90px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)]"
                    style={{
                        left: Math.max(12, Math.min(organizeMenu.x, window.innerWidth - 312)),
                        top: Math.max(12, Math.min(organizeMenu.y, window.innerHeight - 360)),
                    }}
                >
                    <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-violet-500/[0.12] via-fuchsia-500/[0.06] to-transparent">
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-violet-300/90" strokeWidth={1.5} />
                            <div>
                                <p className="text-[10px] font-semibold tracking-[0.28em] text-white/45 uppercase">
                                    {t('notes.organize_label')}
                                </p>
                                <p className="text-[13px] text-white/90 font-light mt-0.5">
                                    {t('notes.organize_subtitle')}
                                </p>
                            </div>
                        </div>
                    </div>
                    {filteredNotes.length === 0 ? (
                        <p className="px-4 py-4 text-[12px] text-white/40 leading-relaxed">
                            {t('notes.organize_empty')}
                        </p>
                    ) : (
                        <div className="p-2 flex flex-col gap-0.5">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={organizeCascade}
                                className="flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors group/row"
                            >
                                <span className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 group-hover/row:text-white">
                                    <Layers size={15} strokeWidth={1.8} />
                                </span>
                                <span>
                                    <span className="block text-[13px] text-white/90">{t('notes.organize_cascade')}</span>
                                    <span className="block text-[11px] text-white/35 mt-0.5">{t('notes.organize_cascade_desc')}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={organizeGrid}
                                className="flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors group/row"
                            >
                                <span className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 group-hover/row:text-white">
                                    <LayoutGrid size={15} strokeWidth={1.8} />
                                </span>
                                <span>
                                    <span className="block text-[13px] text-white/90">{t('notes.organize_grid')}</span>
                                    <span className="block text-[11px] text-white/35 mt-0.5">{t('notes.organize_grid_desc')}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={organizeColumn}
                                className="flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors group/row"
                            >
                                <span className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 group-hover/row:text-white">
                                    <Rows size={15} strokeWidth={1.8} />
                                </span>
                                <span>
                                    <span className="block text-[13px] text-white/90">{t('notes.organize_column')}</span>
                                    <span className="block text-[11px] text-white/35 mt-0.5">{t('notes.organize_column_desc')}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={organizeFan}
                                className="flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.07] transition-colors group/row"
                            >
                                <span className="mt-0.5 p-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/60 group-hover/row:text-white">
                                    <CircleDot size={15} strokeWidth={1.8} />
                                </span>
                                <span>
                                    <span className="block text-[13px] text-white/90">{t('notes.organize_fan')}</span>
                                    <span className="block text-[11px] text-white/35 mt-0.5">{t('notes.organize_fan_desc')}</span>
                                </span>
                            </button>
                        </div>
                    )}
                </motion.div>,
                document.body
            )}

            <div className="absolute bottom-10 left-0 right-0 flex justify-center z-[80] pointer-events-none">
                <motion.button
                    type="button"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 220, damping: 22 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCreate}
                    className="pointer-events-auto flex items-center gap-3 px-8 py-3.5 rounded-full text-white font-medium text-[14px] tracking-wide shadow-[0_12px_40px_rgba(0,0,0,0.6)] hover:shadow-[0_16px_48px_rgba(255,255,255,0.15)] transition-all group bg-white/10 backdrop-blur-2xl border border-white/20"
                >
                    <Plus size={18} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-300" />
                    {t('notes.new_sticky') || 'Novo'}
                </motion.button>
            </div>

            <style>{`
                .notes-widget-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
                .notes-widget-scroll::-webkit-scrollbar { width: 6px; }
                .notes-widget-scroll::-webkit-scrollbar-thumb {
                  background: linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));
                  border-radius: 999px;
                }
                .notes-filmstrip::-webkit-scrollbar { width: 4px; }
                .notes-filmstrip::-webkit-scrollbar-thumb {
                  background: rgba(255,255,255,0.12);
                  border-radius: 999px;
                }
                .scrollbar-none::-webkit-scrollbar { display: none; }
                .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};
