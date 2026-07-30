import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSttCommand } from "../src/telegram/transcribe.js";

test("prefers MORNINGSTAR_STT_CMD when set", () => {
  assert.equal(resolveSttCommand({ MORNINGSTAR_STT_CMD: "whisper --model base" } as NodeJS.ProcessEnv, () => false), "whisper --model base");
});

test("falls back to the NVIDIA omni script if present", () => {
  const cmd = resolveSttCommand({} as NodeJS.ProcessEnv, () => true);
  assert.ok(cmd && cmd.includes("analyze.py") && cmd.includes("--audio"));
});

test("returns null when nothing is available", () => {
  assert.equal(resolveSttCommand({} as NodeJS.ProcessEnv, () => false), null);
});
