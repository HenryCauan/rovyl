import * as icons from 'lucide-react';
import { LucideIcon } from 'lucide-react';

// Filter out non-component exports if any (defensive coding)
// We cast to any to allow dynamic access by string name
export const ICON_MAP = icons as unknown as Record<string, LucideIcon>;

export const getIcon = (name: string) => {
  // Return the icon if found, otherwise fallback to Circle or Settings
  return ICON_MAP[name] || ICON_MAP.Circle;
};