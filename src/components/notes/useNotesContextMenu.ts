import { useCallback, useEffect, useRef, useState } from 'react';

export type NotesContextMenuKind = 'board' | 'workspace' | 'note';

export interface NotesContextMenuState {
  kind: NotesContextMenuKind;
  x: number;
  y: number;
  workspaceId?: string;
  noteId?: string;
}

const MENU_ROOT_ID = 'notes-context-menu-root';

export function useNotesContextMenu(isOpen: boolean) {
  const [menu, setMenu] = useState<NotesContextMenuState | null>(null);
  const suppressDismissRef = useRef(false);

  const openMenu = useCallback((next: NotesContextMenuState) => {
    suppressDismissRef.current = true;
    setMenu(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressDismissRef.current = false;
      });
    });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!isOpen) setMenu(null);
  }, [isOpen]);

  useEffect(() => {
    if (!menu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (suppressDismissRef.current) return;
      const root = document.getElementById(MENU_ROOT_ID);
      if (root?.contains(e.target as Node)) return;
      setMenu(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };

    const onScroll = () => setMenu(null);

    const frame = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  return { menu, openMenu, closeMenu, menuRootId: MENU_ROOT_ID };
}
