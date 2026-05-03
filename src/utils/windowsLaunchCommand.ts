/**
 * Garante caminhos absolutos Windows com espaços gravados entre aspas (picker / colagem).
 * O processo principal ainda canonicaliza ao executar — isto evita estado inicial frágil na UI.
 */
export function normalizeWindowsExecutablePickerPath(filePath: string): string {
  const t = (filePath || '').trim();
  if (!t) return t;
  if (t.startsWith('"')) return t;
  const isWinAbs = /^[a-zA-Z]:\\/.test(t) || /^\\\\/.test(t);
  if (!isWinAbs || !t.includes(' ')) return t;
  return `"${t.replace(/"/g, '')}"`;
}
