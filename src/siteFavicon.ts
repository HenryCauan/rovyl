import type { AppItem } from "./types";

/** Command string is a http(s) URL (saved web shortcuts). */
export function isLikelyWebUrl(command: string | undefined): boolean {
  return /^https?:\/\//i.test(String(command ?? "").trim());
}

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

  if (!domain) return null;
  // localhost / single-label hosts (no TLD) — still try Google favicon API + unavatar
  if (!domain.includes(".") && domain.toLowerCase() !== "localhost") return null;

  const fallbackUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const faviconUrl = `https://unavatar.io/${domain}?fallback=${encodeURIComponent(fallbackUrl)}`;

  return {
    customIconUrl: faviconUrl,
    iconSource: "native",
    iconName: "Globe",
  };
}

/**
 * Preferência: IPC no Electron devolve data URL (compatível com <img>).
 * Fallback: URL remota (unavatar) para ambientes sem bridge.
 */
export async function resolveWebsiteIconFields(
  urlString: string,
): Promise<Pick<AppItem, "customIconUrl" | "iconSource" | "iconName"> | null> {
  const trimmed = urlString.trim();
  if (!trimmed) return null;

  try {
    const fetchFn =
      typeof window !== "undefined" &&
      window.electron?.getWebsiteFaviconDataUrl;
    if (fetchFn) {
      const dataUrl = await fetchFn(trimmed);
      if (dataUrl && typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
        return {
          customIconUrl: dataUrl,
          iconSource: "native",
          iconName: "Globe",
        };
      }
    }
  } catch {
    /* ignore */
  }

  return websiteIconFieldsFromUrl(trimmed);
}
