/**
 * Opens a URL in the OS default browser (Electron) instead of an in-app window.
 */
export function openExternalSiteUrl(url: string): void {
  if (typeof window !== "undefined" && window.electron?.openExternalUrl) {
    void window.electron.openExternalUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
