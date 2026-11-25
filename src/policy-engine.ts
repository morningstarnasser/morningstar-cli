// ─── Permission Policy Engine ────────────────────────────────────────────────
// Pure, shared allow / ask / deny decisions for every runner. Explicit deny
// rules are always authoritative; modes then provide conservative defaults.

import { classifyCommand } from "./safety.js";
import { homedir } from "node:os";
import { resolve, relative, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import type { PermissionMode } from "./permissions.js";

export type Decision = "allow" | "ask" | "deny";
export type Risk = "none" | "low" | "medium" | "high";

export interface PolicyVerdict {
  decision: Decision;
  risk: Risk;
  reason: string;
}

type ActionKind = "read" | "edit" | "delete" | "shell" | "network" | "delegate" | "orchestrate" | "unknown";

interface ActionProfile {
  kind: ActionKind;
  risk: Risk;
  reason: string;
  requiresApproval: boolean;
}

const READ_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "ls",
  "web",
  "vault",
  "skill",
  "bg_status",
  "bg_list",
]);
const EDIT_TOOLS = new Set(["write", "edit"]);
const VALID_MODES = new Set<PermissionMode>([
  "auto",
  "ask",
  "strict",
  "bypassPermissions",
  "acceptEdits",
  "plan",
  "dontAsk",
  "delegate",
]);

export function canonicalToolName(name: string): string {
  const aliases: Record<string, string> = { webfetch: "fetch", websearch: "web" };
  return aliases[name.trim().toLowerCase()] ?? name.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match the argument portion of a tool pattern.
 *
 * `git:*` follows the Claude-style command pattern convention and matches
 * `git`, `git status`, and `git:status`. Ordinary `*` globbing is also
 * supported.
 */
function matchTargetPattern(pattern: string, target: string, forAllowRule: boolean): boolean {
  const normalizedPattern = pattern.trim();
  const normalizedTarget = target.trim();

  if (normalizedPattern === "*") return true;

  if (normalizedPattern.endsWith(":*")) {
    const prefix = normalizedPattern.slice(0, -2).trim();
    return normalizedTarget === prefix
      || normalizedTarget.startsWith(`${prefix} `)
      || normalizedTarget.startsWith(`${prefix}:`);
  }

  const expression = normalizedPattern
    .split("*")
    .map(escapeRegExp)
    .join(".*");
  return new RegExp(`^${expression}$`, "i").test(normalizedTarget);
}

/**
 * Supported rules:
 * - `*` matches every action
 * - `read` matches the whole read tool
 * - `bash(git:*)` matches git commands executed through bash
 * - `bash(*)` matches every bash command
 */
function matchesToolPattern(
  pattern: string,
  tool: string,
  target: string,
  forAllowRule: boolean,
  cwd?: string,
): boolean {
  const rule = pattern.trim();
  if (!rule) return false;
  if (rule === "*") return true;

  const scoped = /^([^()]+)\((.*)\)$/.exec(rule);
  const canonical = canonicalToolName;
  if (!scoped) return new RegExp(`^${canonical(rule).split("*").map(escapeRegExp).join(".*")}$`).test(tool);

  const [, ruleTool, ruleTarget] = scoped;
  if (canonical(ruleTool) !== tool) return false;
  if (tool === "fetch" && ruleTarget.startsWith("domain:")) {
    try { return matchTargetPattern(ruleTarget.slice(7), new URL(target).hostname, forAllowRule); }
    catch { return false; }
  }
  if (cwd && ["read", "write", "edit", "delete"].includes(tool)) {
    const expand = (path: string) => path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path;
    const pattern = expand(ruleTarget);
    const absoluteTarget = resolve(cwd, expand(target));
    let canonicalTarget = absoluteTarget;
    let canonicalCwd = cwd;
    try { canonicalCwd = realpathSync(cwd); } catch {}
    try { canonicalTarget = realpathSync(absoluteTarget); } catch {}
    const match = (path: string, base: string = cwd) => {
      const candidate = isAbsolute(pattern) ? path : relative(base, path);
      const normalized = pattern.replace(/^\.\//, "");
      const expression = normalized.split("**").map((part) => part.split("*").map(escapeRegExp).join("[^/]*")).join(".*");
      return new RegExp(`^${expression}$`).test(candidate);
    };
    // Grants must cover both the named path and symlink destination; denials cover either.
    return forAllowRule ? match(absoluteTarget) && match(canonicalTarget, canonicalCwd) : match(absoluteTarget) || match(canonicalTarget, canonicalCwd);
  }
  // A scoped Bash allow rule authorizes one command shape, never a second
  // command smuggled through chaining, redirection, or substitution. Apply
  // this to every scoped wildcard form, not only the `prefix:*` shorthand.
  if (
    forAllowRule
    && ruleTool.trim().toLowerCase() === "bash"
    && /[\r\n;&|><]|`|\$\(/.test(target)
  ) {
    return false;
  }
  return canonical(ruleTool) === tool
    && matchTargetPattern(ruleTarget, target, forAllowRule);
}

function firstMatchingPattern(
  patterns: readonly string[] | undefined,
  tool: string,
  target: string,
  forAllowRule: boolean,
  cwd?: string,
): string | undefined {
  return patterns?.find((pattern) => matchesToolPattern(pattern, tool, target, forAllowRule, cwd));
}

function classifyGitAction(target: string): ActionProfile {
  const args = target.trim();
  const command = /^git(?:\s|$)/i.test(args) ? args : `git ${args}`.trim();
  const destructive = classifyCommand(command);

  if (destructive.destructive) {
    return {
      kind: "shell",
      risk: "high",
      reason: destructive.reason || "destructive git command",
      requiresApproval: true,
    };
  }

  const readOnlyStructuredGit = !/[\r\n|><;&$`\\'"()]/.test(args)
    && /^(?:status|log|diff|show|ls-files|branch(?:\s+(?:--show-current|--list))?|remote(?:\s+-v)?|)$/i.test(args);
  if (readOnlyStructuredGit) {
    return { kind: "read", risk: "none", reason: "read-only git operation", requiresApproval: false };
  }

  return { kind: "shell", risk: "medium", reason: "mutating git operation", requiresApproval: true };
}

function classifyAction(tool: string, target: string): ActionProfile {
  if (tool === "swarm") {
    return { kind: "orchestrate", risk: "low", reason: "local orchestration; each child tool inherits and enforces parent permissions", requiresApproval: false };
  }
  if (READ_TOOLS.has(tool)) {
    return { kind: "read", risk: "none", reason: "read-only tool", requiresApproval: false };
  }

  if (tool === "git") return classifyGitAction(target);

  if (EDIT_TOOLS.has(tool)) {
    return { kind: "edit", risk: "medium", reason: "file modification", requiresApproval: true };
  }

  if (tool === "delete") {
    return { kind: "delete", risk: "high", reason: "destructive deletion", requiresApproval: true };
  }

  if (tool === "bash") {
    const destructive = classifyCommand(target);
    if (destructive.destructive) {
      return {
        kind: "shell",
        risk: "high",
        reason: destructive.reason || "destructive shell command",
        requiresApproval: true,
      };
    }
    return {
      kind: "shell",
      risk: "high",
      reason: "shell commands require approval unless an explicit allow rule matches",
      requiresApproval: true,
    };
  }

  if (tool === "fetch" || ["telegram_reply", "telegram_react", "telegram_edit_message"].includes(tool)) {
    return {
      kind: "network",
      risk: "high",
      reason: "network fetch can disclose data to or ingest content from an external target",
      requiresApproval: true,
    };
  }

  if (tool === "jerry") {
    return {
      kind: "delegate",
      risk: "medium",
      reason: "delegated action may mutate external state",
      requiresApproval: true,
    };
  }

  return {
    kind: "unknown",
    risk: "high",
    reason: "unknown tool is not trusted by default",
    requiresApproval: true,
  };
}

/**
 * Decide whether a tool action may run.
 *
 * Precedence:
 * 1. A matching disallowed pattern always denies.
 * 2. Plan mode allows reads and orchestration; child tools retain plan mode.
 * 3. Strict mode asks for every action.
 * 4. A matching allowed pattern allows the action.
 * 5. The selected mode supplies the fail-closed default.
 */
export function decidePermission(
  toolName: string,
  argumentOrTarget: string,
  mode: PermissionMode,
  allowedPatterns: readonly string[] = [],
  disallowedPatterns: readonly string[] = [],
  askPatterns: readonly string[] = [],
  disableBypass = false,
  cwd?: string,
): PolicyVerdict {
  const tool = toolName.trim().toLowerCase();
  const target = argumentOrTarget ?? "";
  const profile = classifyAction(tool, target);
  const deniedBy = firstMatchingPattern(disallowedPatterns, tool, target, false, cwd);

  if (deniedBy !== undefined) {
    return {
      decision: "deny",
      risk: profile.risk === "none" ? "low" : profile.risk,
      reason: `explicitly disallowed by pattern "${deniedBy}"`,
    };
  }

  if (!VALID_MODES.has(mode)) {
    return {
      decision: "deny",
      risk: profile.risk === "none" ? "low" : profile.risk,
      reason: `unsupported permission mode: ${String(mode)}`,
    };
  }

  if (mode === "plan" && profile.kind !== "read" && profile.kind !== "orchestrate") {
    return {
      decision: "deny",
      risk: profile.risk,
      reason: `plan mode denies non-read-only actions: ${profile.reason}`,
    };
  }

  if (disableBypass && mode === "bypassPermissions") {
    return { decision: "deny", risk: "high", reason: "bypass permissions is disabled by settings" };
  }
  const askBy = firstMatchingPattern(askPatterns, tool, target, false, cwd);
  if (askBy !== undefined) {
    return { decision: mode === "dontAsk" ? "deny" : "ask", risk: profile.risk, reason: `explicit approval required by pattern "${askBy}"` };
  }

  if (mode === "strict") {
    return {
      decision: "ask",
      risk: profile.risk === "none" ? "low" : profile.risk,
      reason: `strict mode requires approval: ${profile.reason}`,
    };
  }

  const allowedBy = firstMatchingPattern(allowedPatterns, tool, target, true, cwd);
  if (allowedBy !== undefined) {
    return {
      decision: "allow",
      risk: profile.risk,
      reason: `explicitly allowed by pattern "${allowedBy}"`,
    };
  }

  switch (mode) {
    case "bypassPermissions":
      return {
        decision: "allow",
        risk: profile.risk,
        reason: `permission prompts bypassed: ${profile.reason}`,
      };

    case "acceptEdits":
      if (profile.kind === "edit") {
        return { decision: "allow", risk: profile.risk, reason: `edit accepted: ${profile.reason}` };
      }
      if (tool === "bash" || profile.kind === "delete") {
        return {
          decision: "ask",
          risk: profile.risk === "none" ? "low" : profile.risk,
          reason: `acceptEdits requires approval for bash/delete: ${profile.reason}`,
        };
      }
      if (profile.kind === "read" || profile.kind === "orchestrate") {
        return { decision: "allow", risk: profile.risk, reason: profile.reason };
      }
      return {
        decision: "ask",
        risk: profile.risk,
        reason: `acceptEdits does not pre-approve this action: ${profile.reason}`,
      };

    case "dontAsk":
      if (!profile.requiresApproval) {
        return { decision: "allow", risk: profile.risk, reason: profile.reason };
      }
      return {
        decision: "deny",
        risk: profile.risk,
        reason: `dontAsk denies actions that require approval: ${profile.reason}`,
      };

    case "plan":
      return { decision: "allow", risk: profile.risk, reason: profile.reason };

    case "auto":
    case "ask":
    case "delegate":
      if (!profile.requiresApproval) {
        return { decision: "allow", risk: profile.risk, reason: profile.reason };
      }
      return {
        decision: "ask",
        risk: profile.risk,
        reason: `${mode} mode requires approval: ${profile.reason}`,
      };

    default:
      return { decision: "deny", risk: "high", reason: "unsupported permission mode" };
  }
}

/**
 * Backward-compatible wrapper for callers using the old boolean policy API.
 * Its `strict` flag historically meant "gate mutations", not the named strict
 * mode, so it maps to `ask`; false maps to the conservative automatic mode.
 */
export function evaluateToolAction(tool: string, args: string, strict = true): PolicyVerdict {
  return decidePermission(tool, args, strict ? "ask" : "auto");
}
