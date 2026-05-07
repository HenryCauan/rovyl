import type { AppItem, UIConfig } from '../types';

export function pickWorkspaceSwitchMode(cfg: UIConfig): 'hotkeys' | 'picker' {
  return cfg.workspaceSwitchMode === 'picker' ? 'picker' : 'hotkeys';
}

export function enabledWorkspaceCount(cfg: UIConfig): number {
  return cfg.workspaces.filter((w) => w.enabled).length;
}

/** Synthetic radial items — one per enabled workspace (real workspace index in id). */
export function buildWorkspacePickerItems(cfg: UIConfig): AppItem[] {
  const items: AppItem[] = [];
  cfg.workspaces.forEach((ws, index) => {
    if (!ws.enabled) return;
    items.push({
      id: `__zenith_ws_pick__${index}`,
      type: 'app',
      label: ws.name,
      iconName: ws.pickerIconName?.trim() || 'Layers',
      iconSource: 'lucide',
      command: '',
      commandType: 'app',
      description: ws.hotkey ? `(${ws.hotkey})` : '',
    });
  });
  return items;
}

/** Root level of the radial: either current workspace apps or workspace picker. */
export function getRootRadialApps(
  cfg: UIConfig,
  currentWorkspaceApps: AppItem[],
): AppItem[] {
  if (pickWorkspaceSwitchMode(cfg) !== 'picker') return currentWorkspaceApps;
  if (enabledWorkspaceCount(cfg) <= 1) return currentWorkspaceApps;
  return buildWorkspacePickerItems(cfg);
}

/** Plain boolean guard — a type predicate on `id` would wrongly narrow the false branch to `never`. */
export function isWorkspacePickItem(app: AppItem | null | undefined): boolean {
  return !!app?.id?.startsWith('__zenith_ws_pick__');
}

export function parseWorkspacePickIndex(id: string): number {
  return parseInt(id.replace('__zenith_ws_pick__', ''), 10);
}
