/**
 * Smoke test for backend/persistence-normalize.cjs (no Electron).
 * Run: node scripts/persistence-normalize-smoke.mjs
 */
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { normalizeFullPersistenceBlob } = require("../backend/persistence-normalize.cjs");

const nested = {
  user: null,
  apps: [{ id: "a" }],
  config: {
    workspaces: [{ id: "w1", name: "Main", apps: [] }],
    globalShortcut: "Alt+X",
  },
};
const outNested = normalizeFullPersistenceBlob(nested);
assert.equal(outNested.config.globalShortcut, "Alt+X");
assert.equal(outNested.config.workspaces.length, 1);

const flat = {
  workspaces: [
    { id: "w1", name: "Main", hotkey: 1, enabled: true, apps: [], color: "#000" },
  ],
  globalShortcut: "Alt+Y",
  language: "pt",
};
const outFlat = normalizeFullPersistenceBlob(flat);
assert.ok(outFlat.config);
assert.equal(outFlat.config.globalShortcut, "Alt+Y");
assert.equal(outFlat.config.workspaces.length, 1);

assert.equal(normalizeFullPersistenceBlob({}), null);
assert.equal(normalizeFullPersistenceBlob({ config: { workspaces: [] } }), null);

const splitRootWorkspaces = {
  user: null,
  config: { globalShortcut: "Alt+Q", accentColor: "#fff" },
  workspaces: [
    {
      id: "w1",
      name: "Main",
      hotkey: 1,
      enabled: true,
      apps: [{ id: "a1", label: "App", type: "app", command: "x", commandType: "app" }],
      color: "#000",
    },
  ],
};
const outSplit = normalizeFullPersistenceBlob(splitRootWorkspaces);
assert.ok(outSplit);
assert.equal(outSplit.config.workspaces.length, 1);
assert.equal(outSplit.config.workspaces[0].apps.length, 1);

const mirrorRepair = normalizeFullPersistenceBlob({
  user: null,
  apps: [{ id: "only-top", label: "Top", type: "app", command: "calc.exe", commandType: "app" }],
  config: { workspaces: [], globalShortcut: "Alt+1" },
  workspaces: [
    {
      id: "workspace-1",
      name: "Main",
      hotkey: 1,
      enabled: true,
      apps: [{ id: "w1", label: "W", type: "app", command: "x", commandType: "app" }],
      color: "#000",
    },
    {
      id: "workspace-2",
      name: "Extra",
      hotkey: 2,
      enabled: true,
      apps: [],
      color: "#111",
    },
  ],
});
assert.ok(mirrorRepair);
assert.equal(mirrorRepair.config.workspaces.length, 2);
assert.equal(mirrorRepair.config.workspaces[0].apps.length, 1);

const repaired = normalizeFullPersistenceBlob({
  user: null,
  apps: [{ id: "x", label: "X" }],
  config: { workspaces: [], globalShortcut: "Alt+Z" },
});
assert.ok(repaired);
assert.equal(repaired.config.workspaces.length, 1);
assert.equal(repaired.config.workspaces[0].apps.length, 1);

console.log("persistence-normalize-smoke: OK");
