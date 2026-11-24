import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleInteractionMode, configForInteractionMode } from "../src/runtime/interaction-mode.js";
import { decidePermission } from "../src/policy-engine.js";
import type { CLIConfig } from "../src/types.js";

const base: CLIConfig = { model: "fake", apiKey: "", baseUrl: "", maxTokens: 100, temperature: 0 };
test("Tab cycles Normal, Plan, YOLO; reverse cycling and leaving launch-time YOLO restore approvals", () => {
  assert.equal(cycleInteractionMode("ask"), "plan");
  assert.equal(cycleInteractionMode("plan"), "bypassPermissions");
  assert.equal(cycleInteractionMode("bypassPermissions"), "ask");
  assert.equal(cycleInteractionMode("ask", true), "bypassPermissions");
  for (const mode of ["ask", "plan", "bypassPermissions"] as const) {
    const changed = configForInteractionMode({ ...base, yolo: true, dangerouslySkipPermissions: true }, mode);
    assert.equal(changed.yolo, mode === "bypassPermissions");
    assert.equal(changed.dangerouslySkipPermissions, mode === "bypassPermissions");
    assert.equal(decidePermission("write", "file.txt", mode).decision, mode === "plan" ? "deny" : mode === "ask" ? "ask" : "allow");
  }
});
test("mode shortcuts cannot override managed modes, bypass restrictions or explicit tool denies", () => {
  assert.equal(cycleInteractionMode("plan", false, true), "ask");
  assert.equal(cycleInteractionMode("ask", true, true), "plan");
  assert.equal(cycleInteractionMode("strict", false, false, "strict"), "strict");
  assert.throws(() => configForInteractionMode({ ...base, disableBypassPermissions: true }, "bypassPermissions"));
  assert.throws(() => configForInteractionMode({ ...base, runtimeSettings: { managedPermissionMode: "strict" } }, "ask"));
  assert.equal(decidePermission("write", "secret", "bypassPermissions", undefined, ["Write"]).decision, "deny");
});
