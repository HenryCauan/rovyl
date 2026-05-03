"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  splitWin32SpawnExeAndArgs,
  canonicalizeWin32LaunchCommand,
} = require("./win32-launch.js");

describe("win32-launch", () => {
  it("splits Program Files style path + args using real file on disk", () => {
    if (process.platform !== "win32") return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zenith-launch-"));
    const exe = path.join(dir, "sub dir", "fakeapp.exe");
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, "");
    try {
      const line = `${exe} --foo bar`;
      const { exe: e, args } = splitWin32SpawnExeAndArgs(line);
      assert.strictEqual(e, exe);
      assert.deepStrictEqual(args, ["--foo", "bar"]);
      const canon = canonicalizeWin32LaunchCommand(line);
      assert(canon.startsWith('"'), "canonicalized exe should be quoted");
      assert(canon.includes("--foo"));
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  it("leaves internal: and https URLs unchanged", () => {
    assert.strictEqual(
      canonicalizeWin32LaunchCommand("internal:notes"),
      "internal:notes",
    );
    assert.strictEqual(
      canonicalizeWin32LaunchCommand("https://example.com/a b"),
      "https://example.com/a b",
    );
  });
});
