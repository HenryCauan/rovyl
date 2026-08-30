/**
 * Public marketing / help site (opened in the default browser from the desktop app).
 */
export const ZENITH_LAUNCHER_SITE_URL = "https://rovyl-red.vercel.app";

/**
 * Web sign-in (Google). Desktop opens with `?client=desktop` and bridges id_token to localhost:3892.
 * Requires SPA fallback on the host (see `zenith-radial-launcher/vercel.json`, `public/_redirects`) so `/auth` is not 404.
 */
export const ZENITH_LAUNCHER_AUTH_URL = `${ZENITH_LAUNCHER_SITE_URL}/auth`;

/**
 * Same flow using a hash route — works on static hosts that only serve `index.html` at `/` (no `/auth` file).
 * Use only if the site uses `HashRouter` and registers `/auth`.
 */
export const ZENITH_LAUNCHER_AUTH_HASH_URL = `${ZENITH_LAUNCHER_SITE_URL}/#/auth?client=desktop`;

export const ZENITH_LAUNCHER_HELP_URL = `${ZENITH_LAUNCHER_SITE_URL}/help`;

export const ZENITH_LAUNCHER_DOCS_URL = `${ZENITH_LAUNCHER_SITE_URL}/docs`;

/** Public pricing page (same tiers as the app; checkout TBD). */
export const ZENITH_LAUNCHER_PRICING_URL = `${ZENITH_LAUNCHER_SITE_URL}/pricing`;
