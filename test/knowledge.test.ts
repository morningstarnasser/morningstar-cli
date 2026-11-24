import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareKnowledge } from "../src/knowledge.js";
import { runAgent } from "../src/agent-runner.js";
import type { CLIConfig } from "../src/types.js";
const config: CLIConfig = { apiKey: "fake", model: "fake", baseUrl: "http://localhost", maxTokens: 100, temperature: 0, autoKnowledge: true };
const response = JSON.stringify([{ file: "qmd://obsidian/workflows/example.md", title: "Project decision", snippet: "PUBLIC FACT" }, { file: "qmd://obsidian/credentials/key.md", snippet: "SECRET" }]);

test("automatic recall injects attributed, bounded public context and lazy skill guidance", async () => {
  const messages = await prepareKnowledge({ cwd: "/tmp", query: "morningstar project", allowed: () => true, exec: async () => response });
  const content = messages.map((m) => m.content).join("\n");
  assert(content.includes("PUBLIC FACT")); assert(content.includes("qmd://obsidian/workflows/example.md"));
  assert(!content.includes("SECRET")); assert(content.includes("skill load")); assert(content.length < 7000);
});

test("missing QMD does not stop a task or leak stderr", async () => {
  const context = await prepareKnowledge({ cwd: "/tmp", query: "project", allowed: (tool) => tool === "vault", exec: async () => { throw new Error("SECRET STDERR"); } });
  assert(context[0].content.includes("nicht verfügbar")); assert(!context[0].content.includes("SECRET"));
});

for (const boundary of ["deny", "ask", "allowlist", "tools-disabled", "pre-hook", "post-hook"]) test(`shared runner recall respects ${boundary}`, async () => {
  let executed = 0; let seen = "";
  const constrained = { ...config,
    ...(boundary === "deny" ? { disallowedTools: ["vault", "skill"] } : {}),
    ...(boundary === "ask" ? { askTools: ["vault", "skill"] } : {}),
    ...(boundary === "allowlist" ? { toolAllowlist: ["read"] } : {}),
    ...(boundary === "pre-hook" ? { runtimeSettings: { trustedHooks: { PreToolUse: [{ command: "exit 2" }] } } } : {}),
    ...(boundary === "post-hook" ? { runtimeSettings: { trustedHooks: { PostToolUse: [{ command: "exit 2" }] } } } : {}),
  };
  await runAgent([{ role: "user", content: "morningstar project" }], constrained, "/tmp", {
    enableTools: boundary !== "tools-disabled",
    knowledgeFn: (options) => prepareKnowledge({ ...options, exec: async () => { executed++; return response; } }),
    streamFn: async function* (messages) { seen = messages.map((m) => m.content).join("\n"); yield { type: "content", text: "done" }; },
  });
  assert.equal(executed, boundary === "post-hook" ? 1 : 0); assert(!seen.includes("PUBLIC FACT")); assert(!seen.includes("SECRET"));
});

test("normal runner sends Superbrain context to its model", async () => {
  let seen = "";
  const result = await runAgent([{ role: "user", content: "project decision" }], config, "/tmp", {
    knowledgeFn: (options) => prepareKnowledge({ ...options, exec: async () => response }),
    streamFn: async function* (messages) { seen = messages.map((m) => m.content).join("\n"); yield { type: "content", text: "done" }; },
  });
  assert(seen.includes("PUBLIC FACT")); assert.equal(result.finalText, "done");
});
