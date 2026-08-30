"use strict";

/**
 * Top-level keys of the full persistence blob (v2). Everything else in a flat legacy file is treated as UIConfig.
 * `notes` / `alarms` / `noteWorkspaces` / `activeNoteWorkspaceId` são de widgets removidos: continuam listados
 * para que um ficheiro antigo e plano não os despeje dentro do UIConfig — mas já não são devolvidos ao renderer.
 */
const PERSISTENCE_TOP_KEYS = new Set([
  "user",
  "apps",
  "notes",
  "alarms",
  "noteWorkspaces",
  "activeNoteWorkspaceId",
]);

/**
 * Normalize disk JSON so the renderer always receives the v2 shape:
 * { user, apps?, config }
 *
 * Returns null if the payload is empty or missing workspace data (caller may try .bak or block saves).
 */
function normalizeFullPersistenceBlob(raw) {
  if (!raw || typeof raw !== "object") return null;

  /** Legacy / flat: UIConfig fields at root (including `workspaces`) without nested `config`. */
  const topWsFlat = raw.workspaces;
  if (Array.isArray(topWsFlat) && topWsFlat.length > 0 && !raw.config) {
    const config = {};
    for (const [k, v] of Object.entries(raw)) {
      if (PERSISTENCE_TOP_KEYS.has(k)) continue;
      config[k] = v;
    }
    if (!Array.isArray(config.workspaces) || config.workspaces.length === 0) {
      return null;
    }
    return {
      user: raw.user ?? null,
      apps: Array.isArray(raw.apps) ? raw.apps : undefined,
      config,
    };
  }

  /** Nested `config`: accept valid workspaces or repair from legacy root `apps` when workspaces are empty/missing. */
  if (raw.config && typeof raw.config === "object") {
    let config = { ...raw.config };
    let workspaces = Array.isArray(config.workspaces) ? [...config.workspaces] : [];

    /** Some builds wrote `workspaces` at root while `config` omitted the array — merge so load never returns null. */
    if (
      workspaces.length === 0 &&
      Array.isArray(raw.workspaces) &&
      raw.workspaces.length > 0
    ) {
      workspaces = [...raw.workspaces];
      config = { ...config, workspaces };
    }

    const needsRepair =
      workspaces.length === 0 &&
      Array.isArray(raw.apps) &&
      raw.apps.length > 0 &&
      !(Array.isArray(raw.workspaces) && raw.workspaces.length > 0);
    if (needsRepair) {
      workspaces = [
        {
          id: "workspace-1",
          name: "Main",
          hotkey: 1,
          enabled: true,
          apps: raw.apps,
          color: "#3B82F6",
        },
      ];
      config = {
        ...config,
        workspaces,
        activeWorkspaceIndex:
          typeof config.activeWorkspaceIndex === "number" && config.activeWorkspaceIndex >= 0
            ? config.activeWorkspaceIndex
            : 0,
      };
    }

    if (Array.isArray(workspaces) && workspaces.length > 0) {
      return {
        user: raw.user ?? null,
        apps: Array.isArray(raw.apps) ? raw.apps : undefined,
        config: { ...config, workspaces },
      };
    }
  }

  return null;
}

module.exports = { normalizeFullPersistenceBlob };
