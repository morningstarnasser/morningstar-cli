import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_OPTIONS,
  authOptionsForProvider,
  authStateBadge,
  findAuthOption,
  parseCliStatus,
  probeCliAuth,
  resolveAuthGroups,
  resolveAuthOption,
  type AuthOption,
  type CliProbeResult,
} from "../src/auth.js";
import { filterAuthGroups, vendorSummary } from "../src/components/LoginPicker.js";
import { maskSecret } from "../src/components/SecretInput.js";

const noKeys = () => "";
const option = (id: string): AuthOption => {
  const found = findAuthOption(id);
  assert.ok(found, `${id} exists`);
  return found;
};

test("claude auth status JSON is read for session, account and plan", () => {
  const result = parseCliStatus("claude", JSON.stringify({
    loggedIn: true,
    authMethod: "claude.ai",
    email: "a@b.ch",
    subscriptionType: "max",
  }));
  assert.equal(result.loggedIn, true);
  assert.equal(result.missing, false);
  assert.match(result.detail, /a@b\.ch/);
  assert.match(result.detail, /MAX/);
});

test("claude auth status reports a logged-out session", () => {
  const result = parseCliStatus("claude", JSON.stringify({ loggedIn: false }));
  assert.equal(result.loggedIn, false);
  assert.equal(result.detail, "nicht angemeldet");
});

test("codex login status is read from prose", () => {
  const ok = parseCliStatus("codex", "Logged in using ChatGPT", true);
  assert.equal(ok.loggedIn, true);
  assert.equal(ok.detail, "ChatGPT");

  const no = parseCliStatus("codex", "Not logged in", false);
  assert.equal(no.loggedIn, false);
});

test("codex writes its status to stderr, so a zero exit alone means logged in", () => {
  // Regression: reading stdout only reported an active ChatGPT session as
  // "abgemeldet", because codex leaves stdout empty.
  const probe = probeCliAuth(
    { bin: "codex", statusArgs: ["login", "status"], loginArgs: [], logoutArgs: [], loginHint: "" },
    () => ({ output: "Logged in using ChatGPT", ok: true }),
  );
  assert.equal(probe.loggedIn, true);
  assert.equal(probe.detail, "ChatGPT");

  const silent = probeCliAuth(
    { bin: "codex", statusArgs: [], loginArgs: [], logoutArgs: [], loginHint: "" },
    () => ({ output: "", ok: true }),
  );
  assert.equal(silent.loggedIn, true, "exit 0 is authoritative even without output");
});

test("a non-zero exit is reported as logged out even with noisy output", () => {
  const probe = probeCliAuth(
    { bin: "codex", statusArgs: [], loginArgs: [], logoutArgs: [], loginHint: "" },
    () => ({ output: "Not logged in", ok: false }),
  );
  assert.equal(probe.loggedIn, false);
});

test("a missing binary is reported as cli-missing, not as logged out", () => {
  const probe = probeCliAuth(
    { bin: "nope", statusArgs: [], loginArgs: [], logoutArgs: [], loginHint: "" },
    () => {
      const error = new Error("spawn ENOENT") as Error & { code: string };
      error.code = "ENOENT";
      throw error;
    },
  );
  assert.equal(probe.missing, true);
  assert.equal(probe.loggedIn, false);
});

test("a throwing status command means no session, not a crash", () => {
  const probe = probeCliAuth(
    { bin: "codex", statusArgs: [], loginArgs: [], logoutArgs: [], loginHint: "" },
    () => {
      throw new Error("spawn failed");
    },
  );
  assert.equal(probe.missing, false);
  assert.equal(probe.loggedIn, false);
});

test("subscription option is ready when the vendor CLI holds a session", () => {
  const probe = (): CliProbeResult => ({ loggedIn: true, missing: false, detail: "ChatGPT" });
  const state = resolveAuthOption(option("openai:subscription"), { getStoredApiKey: noKeys, probe });
  assert.equal(state.state, "ready");
  assert.equal(state.detail, "ChatGPT");
});

test("subscription option is logged-out when the CLI has no session", () => {
  const probe = (): CliProbeResult => ({ loggedIn: false, missing: false, detail: "nicht angemeldet" });
  const state = resolveAuthOption(option("claude:subscription"), { getStoredApiKey: noKeys, probe });
  assert.equal(state.state, "logged-out");
});

test("subscription option is cli-missing when the binary is absent", () => {
  const probe = (): CliProbeResult => ({ loggedIn: false, missing: true, detail: "codex nicht installiert" });
  const state = resolveAuthOption(option("openai:subscription"), { getStoredApiKey: noKeys, probe });
  assert.equal(state.state, "cli-missing");
});

test("api-key option is key-missing without a key and names the env var", () => {
  const state = resolveAuthOption(option("deepseek:api-key"), { getStoredApiKey: noKeys });
  assert.equal(state.state, "key-missing");
  assert.match(state.detail, /DEEPSEEK_API_KEY/);
});

test("api-key option is ready with a stored key", () => {
  const state = resolveAuthOption(option("deepseek:api-key"), { getStoredApiKey: () => "sk-x" });
  assert.equal(state.state, "ready");
  assert.equal(state.detail, "Key gespeichert");
});

test("local options need no credential at all", () => {
  const state = resolveAuthOption(option("ollama:local"), { getStoredApiKey: noKeys });
  assert.equal(state.state, "ready");
});

test("groups keep catalog order and mark vendor readiness", () => {
  const probe = (): CliProbeResult => ({ loggedIn: false, missing: false, detail: "nicht angemeldet" });
  const groups = resolveAuthGroups({ getStoredApiKey: noKeys, probe });
  assert.equal(groups[0].vendor, "Claude");
  assert.equal(groups[1].vendor, "OpenAI");
  // Neither subscription nor key available → vendor not ready.
  assert.equal(groups[0].ready, false);
  // Claude offers subscription first, then the API key.
  assert.deepEqual(groups[0].options.map((entry) => entry.option.kind), ["subscription", "api-key"]);
});

test("a vendor counts as ready as soon as one method works", () => {
  const probe = (): CliProbeResult => ({ loggedIn: true, missing: false, detail: "ok" });
  const groups = resolveAuthGroups({ getStoredApiKey: noKeys, probe });
  const claude = groups.find((group) => group.vendor === "Claude");
  assert.ok(claude);
  assert.equal(claude.ready, true);
  assert.equal(vendorSummary(claude), "Abo");
});

test("every subscription option maps to a bridge provider and a vendor CLI", () => {
  for (const entry of AUTH_OPTIONS.filter((item) => item.kind === "subscription")) {
    assert.ok(entry.cli, `${entry.id} has a CLI`);
    assert.match(entry.provider, /-cli$/);
    assert.ok(entry.defaultModel, `${entry.id} has a default model`);
  }
});

test("provider lookup finds both Claude paths", () => {
  assert.deepEqual(
    authOptionsForProvider("claude-cli").map((entry) => entry.id),
    ["claude:subscription"],
  );
  assert.deepEqual(
    authOptionsForProvider("anthropic").map((entry) => entry.id),
    ["claude:api-key"],
  );
});

test("state badges are distinct and human-readable", () => {
  const badges = ["ready", "logged-out", "cli-missing", "key-missing"] as const;
  const rendered = badges.map(authStateBadge);
  assert.equal(new Set(rendered).size, badges.length);
});

test("picker filter matches vendor and method labels", () => {
  const groups = resolveAuthGroups({
    getStoredApiKey: noKeys,
    probe: () => ({ loggedIn: false, missing: false, detail: "" }),
  });
  assert.deepEqual(filterAuthGroups(groups, "codex").map((group) => group.vendor), ["OpenAI"]);
  assert.deepEqual(filterAuthGroups(groups, "claude").map((group) => group.vendor), ["Claude"]);
  assert.equal(filterAuthGroups(groups, "").length, groups.length);
});

test("secrets are never rendered as characters", () => {
  assert.equal(maskSecret(""), "");
  assert.equal(maskSecret("abc"), "•••");
  const long = maskSecret("x".repeat(50));
  assert.ok(!long.includes("x"));
  assert.match(long, /\(50\)$/);
});
