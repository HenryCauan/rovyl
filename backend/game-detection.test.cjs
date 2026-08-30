"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { detectGameExecutable } = require("./game-detection.cjs");

test("recognizes store game folders and ignores their launchers", () => {
  assert.equal(detectGameExecutable({ exePath: "D:\\SteamLibrary\\steamapps\\common\\Example\\Game.exe" }), true);
  assert.equal(detectGameExecutable({ exePath: "C:\\Program Files (x86)\\Steam\\steam.exe" }), false);
});

test("recognizes engine marker files beside an otherwise ordinary executable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rovyl-game-detection-"));
  try {
    const exe = path.join(root, "Example.exe");
    fs.writeFileSync(exe, "");
    fs.writeFileSync(path.join(root, "UnityPlayer.dll"), "");
    assert.equal(detectGameExecutable({ exePath: exe }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not classify a normal executable without game evidence", () => {
  assert.equal(detectGameExecutable({ exePath: "C:\\Tools\\Editor\\Editor.exe" }), false);
});
