import type { Note } from '../../types';

export const PRESET_COLORS = [
  { key: 'default', display: 'rgba(255,255,255,0.03)' },
  { key: '#1a1f2c', display: 'rgba(26,31,44, 0.4)' },
  { key: '#231e14', display: 'rgba(35,30,20, 0.4)' },
  { key: '#1b241c', display: 'rgba(27,36,28, 0.4)' },
  { key: '#241a22', display: 'rgba(36,26,34, 0.4)' },
  { key: '#182029', display: 'rgba(24,32,41, 0.4)' },
];

export const getBgColor = (key?: string) => {
  const preset = PRESET_COLORS.find((c) => c.key === key);
  if (preset) return preset.display;
  if (key && key.startsWith('#')) return `${key}66`;
  return PRESET_COLORS[0].display;
};

export function stripHtml(html: string): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || d.innerText || '';
}

export function previewTextSnippet(note: Note): string {
  const raw = note.contentHtml ? stripHtml(note.contentHtml) : (note.content || '');
  return raw.replace(/\s+/g, ' ').trim();
}

export function noteSortKey(note: Note): number {
  const ts = note.updatedAt || note.date;
  return new Date(ts).getTime() || 0;
}

export function noteCreatedAt(note: Note): number {
  return new Date(note.date).getTime() || 0;
}

export function defaultNoteSize(note: Note): { w: number; h: number } {
  if (note.type === 'todo') {
    const n = Math.max(1, (note.todos ?? []).length);
    return { w: Math.min(380, 240 + Math.min(n, 8) * 8), h: 72 + n * 26 };
  }
  return { w: 340, h: 320 };
}
