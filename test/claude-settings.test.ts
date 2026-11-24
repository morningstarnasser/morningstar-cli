import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSettings, parseSettings } from "../src/settings-sources.js";
import { buildCLIConfig } from "../src/cli-bootstrap.js";
import { decidePermission } from "../src/policy-engine.js";

function fixture(t: { after: (fn: () => void) => void }) {
  const cwd = mkdtempSync(join(tmpdir(), "morningstar-settings-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, ".morningstar"));
  const write = (path: string, data: unknown) => writeFileSync(join(cwd, path), JSON.stringify(data));
  const options = { userPath: join(cwd, "user.json"), managedPath: join(cwd, "managed.json") };
  return { cwd, write, options };
}
test("managed settings win explicit/local/project/user; rules union, managed survives empty sources", (t) => {
  const { cwd, write, options } = fixture(t);
  write("user.json", { language: "en", permissions: { deny: ["Bash(rm:*)"] } });
  write(".morningstar/settings.json", { language: "fr", permissions: { deny: ["Write(secret)"] } });
  write(".morningstar/settings.local.json", { language: "de" });
  write("managed.json", { language: "it", permissions: { defaultMode: "plan" } });
  const resolved = resolveSettings(cwd, { ...options, settings: '{"language":"es"}' });
  assert.equal(resolved.settings.language, "it");
  assert.deepEqual(resolved.settings.permissions?.deny, ["Bash(rm:*)", "Write(secret)"]);
  assert.equal(buildCLIConfig({ permissionMode: "auto" }, {}, resolved.settings, () => "").config.permissionMode, "plan");
  assert.equal(resolveSettings(cwd, { ...options, sources: [] }).settings.permissions?.defaultMode, "plan");
});
test("project files cannot activate hooks, model routes, permission grants or bypass; explicit trust can", (t) => {
  const { cwd, write, options } = fixture(t);
  write(".morningstar/settings.json", { model: "gpt-4.1", permissions: { allow: ["*"], defaultMode: "bypassPermissions", deny: ["delete"] }, hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "exit 0" }] }] } });
  const untrusted = resolveSettings(cwd, options).settings;
  assert.equal(untrusted.model, undefined);
  assert.deepEqual(untrusted.trustedHooks, undefined === untrusted.trustedHooks ? undefined : {});
  assert.equal(untrusted.permissions?.allow, undefined);
  assert.equal(untrusted.permissions?.defaultMode, undefined);
  assert.deepEqual(untrusted.permissions?.deny, ["delete"]);
  const trusted = resolveSettings(cwd, { ...options, trustProject: true }).settings;
  assert.equal(trusted.model, "gpt-4.1");
  assert.equal(trusted.trustedHooks?.PreToolUse.length, 1);
});
test("managed-only policy discards project/user/CLI grants and disallows bypass", (t) => {
  const { cwd, write, options } = fixture(t);
  write("user.json", { permissions: { allow: ["*"] }, hooks: { Stop: [{ command: "exit 0" }] } });
  write("managed.json", { allowManagedPermissionRulesOnly: true, allowManagedHooksOnly: true, permissions: { allow: ["Read"], disableBypassPermissionsMode: "disable" } });
  const settings = resolveSettings(cwd, options).settings;
  const config = buildCLIConfig({ allowedTools: "Bash" }, {}, settings, () => "").config;
  assert.deepEqual(config.allowedTools, ["Read"]);
  assert.equal(settings.trustedHooks, undefined);
  assert.throws(() => buildCLIConfig({ dangerouslySkipPermissions: true }, {}, settings, () => ""), /disabled/);
});
test("malformed and unsupported security settings fail closed", () => {
  for (const value of [{ permissions: { deny: "Bash" } }, { hooks: { PreToolUse: [{}] } }, { hooks: { Stop: [{ hooks: [{ type: "http", url: "https://example.com" }] }] } }, { sandbox: { allowedDomains: ["example.com"] } }, { allowedProviders: ["anthropic"] }]) assert.throws(() => parseSettings(value));
});
test("dangling settings directory symlink and invalid JSON are rejected", (t) => {
  const { cwd, options } = fixture(t);
  writeFileSync(options.userPath, "{");
  assert.throws(() => resolveSettings(cwd, options), /Cannot load/);
  rmSync(options.userPath);
  rmSync(join(cwd, ".morningstar"), { recursive: true });
  symlinkSync(join(cwd, "missing"), join(cwd, ".morningstar"));
  assert.throws(() => resolveSettings(cwd, options), /symlink/);
});
test("permission deny and ask precede allows and bypass; native aliases and MCP wildcard match", () => {
  assert.equal(decidePermission("bash", "echo ok", "bypassPermissions", ["*"], [], ["Bash"]).decision, "ask");
  assert.equal(decidePermission("bash", "echo ok", "auto", ["*"], ["Bash"], ["Bash"]).decision, "deny");
  assert.equal(decidePermission("bash", "echo ok", "bypassPermissions", ["*"], [], [], true).decision, "deny");
  assert.equal(decidePermission("fetch", "https://example.com", "auto", [], ["WebFetch"]).decision, "deny");
  assert.equal(decidePermission("mcp__demo__read", "{}", "auto", [], ["mcp__demo__*"]).decision, "deny");
});
test("--tools is a capability restriction, never an authorization grant", () => {
  const { config } = buildCLIConfig({ tools: "Read,Bash" }, {}, {}, () => "");
  assert.deepEqual(config.toolAllowlist, ["Read", "Bash"]);
  assert.equal(config.allowedTools, undefined);
  assert.deepEqual(buildCLIConfig({ tools: "" }, {}, {}, () => "").config.toolAllowlist, []);
  assert.throws(() => buildCLIConfig({ maxTurns: NaN }, {}, {}, () => ""));
});
test("file rules cover relative/absolute paths and symlink destinations", (t) => {
  const { cwd } = fixture(t);
  writeFileSync(join(cwd, ".env"), "synthetic");
  symlinkSync(join(cwd, ".env"), join(cwd, "innocent"));
  for (const target of [".env", join(cwd, ".env"), "innocent"]) {
    assert.equal(decidePermission("read", target, "auto", ["*"], ["Read(./.env)"], [], false, cwd).decision, "deny");
  }
  assert.notEqual(decidePermission("write", "innocent", "ask", ["Write(innocent)"], [], [], false, cwd).decision, "allow");
  assert.equal(decidePermission("fetch", "https://example.com/path", "ask", ["WebFetch(domain:example.com)"]).decision, "allow");
  assert.notEqual(decidePermission("fetch", "https://example.com.evil.invalid/path", "ask", ["WebFetch(domain:example.com)"]).decision, "allow");
});
