import type { AppItem } from "./types";

/**
 * Builds favicon fields for a website URL (same strategy as URL editing in settings:
 * unavatar.io with Google s2 favicons as fallback).
 */
export function websiteIconFieldsFromUrl(
  urlString: string,
): Pick<AppItem, "customIconUrl" | "iconSource" | "iconName"> | null {
  let domain: string;
  try {
    let s = urlString.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    domain = new URL(s).hostname;
  } catch {
    return null;
  }

  if (!domain || !domain.includes(".")) return null;

  const fallbackUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const faviconUrl = `https://unavatar.io/${domain}?fallback=${encodeURIComponent(fallbackUrl)}`;

  return {
    customIconUrl: faviconUrl,
    iconSource: "native",
    iconName: "Globe",
  };
}
