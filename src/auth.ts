import { vendorCommand } from "./runtime/platform-process.js";
// ─── Authentication model ────────────────────────────────────────────────────
// Morningstar knows two ways to reach a hosted model:
//
//   1. subscription — drive the vendor's own CLI (`claude`, `codex`), which
//      holds a real OAuth session created by that vendor's official login flow.
//      Morningstar never implements OAuth itself and never touches the tokens:
//      it shells out and the vendor CLI authenticates. No API key, no per-token
//      billing — the user's existing plan pays.
//   2. api-key — talk to the vendor's HTTP API with a key stored in
//      ~/.morningstar/config.json (0600) or read from the environment.
//
// Local backends (Ollama, Hydra) need neither and are listed as "local".
//
// This module is pure data + pure functions plus one injectable process probe,
// so the whole login surface is testable without spawning anything.

import { execFile, spawnSync } from "node:child_process";

export type AuthKind = "subscription" | "api-key" | "local";

/** Resolved usability of an auth option, worst-first when rendering. */
export type AuthState =
  | "ready"        // usable right now
  | "logged-out"   // CLI installed, but no active session
  | "cli-missing"  // vendor CLI not installed
  | "key-missing"; // no API key stored or in the environment

export interface VendorCli {
  /** Executable name, resolved via PATH. */
  bin: string;
  /** Arguments that report login state without side effects. */
  statusArgs: string[];
  /** Arguments that start the vendor's interactive OAuth login. */
  loginArgs: string[];
  /** Arguments that drop the stored session. */
  logoutArgs: string[];
  /** Human-readable command shown when we cannot run the login ourselves. */
  loginHint: string;
}

export interface AuthOption {
  /** Stable id, e.g. "claude:subscription". */
  id: string;
  /** Vendor grouping shown in the picker, e.g. "Claude". */
  vendor: string;
  kind: AuthKind;
  /** Provider name in the model registry this option unlocks. */
  provider: string;
  /** Row label, e.g. "Abo · Claude Code (OAuth)". */
  label: string;
  /** Model selected after a successful login. */
  defaultModel: string;
  cli?: VendorCli;
  /** Environment variable consulted for api-key options. */
  envKey?: string;
}

const CLAUDE_CLI: VendorCli = {
  bin: "claude",
  statusArgs: ["auth", "status"],
  loginArgs: ["auth", "login"],
  logoutArgs: ["auth", "logout"],
  loginHint: "claude auth login",
};

const CODEX_CLI: VendorCli = {
  bin: "codex",
  statusArgs: ["login", "status"],
  loginArgs: ["login"],
  logoutArgs: ["logout"],
  loginHint: "codex login",
};

/**
 * Every way to authenticate, grouped by vendor. Subscription options come
 * before their api-key sibling: using an existing plan is cheaper than paying
 * per token.
 */
export const AUTH_OPTIONS: readonly AuthOption[] = [
  {
    id: "claude:subscription",
    vendor: "Claude",
    kind: "subscription",
    provider: "claude-cli",
    label: "Abo · Claude Code (OAuth)",
    defaultModel: "claude-cli",
    cli: CLAUDE_CLI,
  },
  {
    id: "claude:api-key",
    vendor: "Claude",
    kind: "api-key",
    provider: "anthropic",
    label: "API-Key · Anthropic",
    defaultModel: "claude-fable-5",
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai:subscription",
    vendor: "OpenAI",
    kind: "subscription",
    provider: "codex-cli",
    label: "Abo · Codex / ChatGPT (OAuth)",
    defaultModel: "codex-cli",
    cli: CODEX_CLI,
  },
  {
    id: "openai:api-key",
    vendor: "OpenAI",
    kind: "api-key",
    provider: "openai",
    label: "API-Key · OpenAI",
    defaultModel: "gpt-5.2",
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "google:api-key",
    vendor: "Google",
    kind: "api-key",
    provider: "google",
    label: "API-Key · Gemini",
    defaultModel: "gemini-3.5-pro",
    envKey: "GOOGLE_API_KEY",
  },
  {
    id: "deepseek:api-key",
    vendor: "DeepSeek",
    kind: "api-key",
    provider: "deepseek",
    label: "API-Key · DeepSeek",
    defaultModel: "deepseek-reasoner",
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    id: "nvidia:api-key",
    vendor: "NVIDIA NIM",
    kind: "api-key",
    provider: "nvidia",
    label: "API-Key · NVIDIA NIM",
    defaultModel: "nvidia/moonshotai/kimi-k2.6",
    envKey: "NVIDIA_NIM_API_KEY",
  },
  {
    id: "groq:api-key",
    vendor: "Groq",
    kind: "api-key",
    provider: "groq",
    label: "API-Key · Groq",
    defaultModel: "groq/llama-3.3-70b-versatile",
    envKey: "GROQ_API_KEY",
  },
  {
    id: "openrouter:api-key",
    vendor: "OpenRouter",
    kind: "api-key",
    provider: "openrouter",
    label: "API-Key · OpenRouter",
    defaultModel: "openrouter/auto",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "github-models:api-key",
    vendor: "GitHub Models",
    kind: "api-key",
    provider: "github-models",
    label: "Token · GitHub Models",
    defaultModel: "github/openai/gpt-4.1",
    envKey: "GITHUB_MODELS_TOKEN",
  },
  {
    id: "ollama:local",
    vendor: "Ollama",
    kind: "local",
    provider: "ollama",
    label: "Lokal · kein Login nötig",
    defaultModel: "",
  },

];

export interface CliProbeResult {
  /** True when the CLI reports an active session. */
  loggedIn: boolean;
  /** True when the executable could not be run at all. */
  missing: boolean;
  /** Short human-readable detail, e.g. an account email or plan. */
  detail: string;
}

/**
 * Interpret a vendor CLI's status output.
 *
 * `claude auth status` prints JSON to stdout. `codex login status` prints a
 * sentence to *stderr* and leaves stdout empty, so callers pass both streams
 * combined and the exit code carries the real signal: status commands exit 0
 * only when a session exists.
 */
export function parseCliStatus(
  bin: string,
  output: string,
  exitOk = true,
): CliProbeResult {
  const text = output.trim();
  if (bin === "claude") {
    try {
      const parsed = JSON.parse(text) as {
        loggedIn?: boolean;
        email?: string;
        subscriptionType?: string;
        authMethod?: string;
      };
      if (parsed.loggedIn === false) {
        return { loggedIn: false, missing: false, detail: "nicht angemeldet" };
      }
      const plan = parsed.subscriptionType ? parsed.subscriptionType.toUpperCase() : "";
      const detail = [parsed.email, plan && `Plan ${plan}`]
        .filter(Boolean)
        .join(" · ");
      return { loggedIn: true, missing: false, detail: detail || "angemeldet" };
    } catch {
      return {
        loggedIn: exitOk,
        missing: false,
        detail: text.slice(0, 60) || (exitOk ? "angemeldet" : "nicht angemeldet"),
      };
    }
  }

  // codex login status → "Logged in using ChatGPT" / "Not logged in"
  if (/not logged in/i.test(text)) {
    return { loggedIn: false, missing: false, detail: "nicht angemeldet" };
  }
  const loggedIn = exitOk || /logged in/i.test(text);
  return {
    loggedIn,
    missing: false,
    detail: loggedIn
      ? text.replace(/^Logged in using\s*/i, "").trim() || "angemeldet"
      : "nicht angemeldet",
  };
}

export interface CliStatusOutput {
  /** stdout and stderr combined — vendors disagree on which one they use. */
  output: string;
  /** True when the command exited 0. */
  ok: boolean;
}

/** Runs a vendor CLI status command. Injectable so tests never spawn. */
export type CliStatusRunner = (bin: string, args: string[]) => CliStatusOutput;

const defaultStatusRunner: CliStatusRunner = (bin, args) => {
  // execFileSync would discard stderr on success, which is exactly where codex
  // writes its answer, so both streams are captured explicitly.
  const executable = vendorCommand(bin, args);
  const result = spawnSync(executable.file, executable.args, { encoding: "utf-8", timeout: 10_000 });
  if (result.error) throw result.error;
  return {
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    ok: result.status === 0,
  };
};

/** Ask a vendor CLI whether it holds a session. Never throws. */
export function probeCliAuth(
  cli: VendorCli,
  runner: CliStatusRunner = defaultStatusRunner,
): CliProbeResult {
  try {
    const { output, ok } = runner(cli.bin, cli.statusArgs);
    return parseCliStatus(cli.bin, output, ok);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return { loggedIn: false, missing: true, detail: `${cli.bin} nicht installiert` };
    }
    // A non-zero exit from a status command means "no session", not a crash.
    return { loggedIn: false, missing: false, detail: "nicht angemeldet" };
  }
}

/**
 * Non-blocking probe. The interactive UI must not freeze for the second or two
 * a vendor CLI needs to answer, so the picker uses this variant and the two
 * vendor probes run concurrently.
 */
export function probeCliAuthAsync(cli: VendorCli): Promise<CliProbeResult> {
  return new Promise<CliProbeResult>((resolvePromise) => {
    const executable = vendorCommand(cli.bin, cli.statusArgs);
    execFile(
      executable.file,
      executable.args,
      { encoding: "utf-8", timeout: 10_000 },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ""}${stderr ?? ""}`;
        if (!error) {
          resolvePromise(parseCliStatus(cli.bin, output, true));
          return;
        }
        if ((error as { code?: string | number }).code === "ENOENT") {
          resolvePromise({ loggedIn: false, missing: true, detail: `${cli.bin} nicht installiert` });
          return;
        }
        resolvePromise(parseCliStatus(cli.bin, output, false));
      },
    );
  });
}

export interface AuthOptionState {
  option: AuthOption;
  state: AuthState;
  detail: string;
}

export interface AuthResolveDeps {
  /** Stored or environment API key for a provider; "" when absent. */
  getStoredApiKey: (provider: string) => string;
  /** Probe used for subscription options. */
  probe?: (cli: VendorCli) => CliProbeResult;
}

/** Resolve one option's usability. */
export function resolveAuthOption(
  option: AuthOption,
  deps: AuthResolveDeps,
): AuthOptionState {
  if (option.kind === "local") {
    return { option, state: "ready", detail: "lokal" };
  }

  if (option.kind === "subscription") {
    if (!option.cli) return { option, state: "cli-missing", detail: "keine CLI hinterlegt" };
    const probe = (deps.probe ?? ((cli: VendorCli) => probeCliAuth(cli)))(option.cli);
    if (probe.missing) {
      return { option, state: "cli-missing", detail: probe.detail };
    }
    return probe.loggedIn
      ? { option, state: "ready", detail: probe.detail }
      : { option, state: "logged-out", detail: probe.detail };
  }

  const key = deps.getStoredApiKey(option.provider);
  if (!key) {
    return {
      option,
      state: "key-missing",
      detail: option.envKey ? `kein Key · ${option.envKey}` : "kein Key",
    };
  }
  const fromEnv = Boolean(option.envKey && process.env[option.envKey] === key);
  return {
    option,
    state: "ready",
    detail: fromEnv ? `Key aus ${option.envKey}` : "Key gespeichert",
  };
}

export interface AuthVendorGroup {
  vendor: string;
  options: AuthOptionState[];
  /** True when at least one option of this vendor is usable. */
  ready: boolean;
}

/** Resolve every option and group by vendor, preserving catalog order. */
export function resolveAuthGroups(
  deps: AuthResolveDeps,
  options: readonly AuthOption[] = AUTH_OPTIONS,
): AuthVendorGroup[] {
  const groups: AuthVendorGroup[] = [];
  for (const option of options) {
    const resolved = resolveAuthOption(option, deps);
    const existing = groups.find((group) => group.vendor === option.vendor);
    if (existing) {
      existing.options.push(resolved);
      existing.ready ||= resolved.state === "ready";
      continue;
    }
    groups.push({
      vendor: option.vendor,
      options: [resolved],
      ready: resolved.state === "ready",
    });
  }
  return groups;
}

/**
 * Async twin of `resolveAuthGroups`: probes every distinct vendor CLI once, in
 * parallel, then resolves the catalog against those results.
 */
export async function resolveAuthGroupsAsync(
  deps: Omit<AuthResolveDeps, "probe">,
  options: readonly AuthOption[] = AUTH_OPTIONS,
): Promise<AuthVendorGroup[]> {
  const clis = new Map<string, VendorCli>();
  for (const option of options) {
    if (option.kind === "subscription" && option.cli) clis.set(option.cli.bin, option.cli);
  }
  const probed = await Promise.all(
    [...clis.values()].map(async (cli) => [cli.bin, await probeCliAuthAsync(cli)] as const),
  );
  const results = new Map(probed);
  return resolveAuthGroups(
    {
      ...deps,
      probe: (cli) => results.get(cli.bin)
        ?? { loggedIn: false, missing: true, detail: `${cli.bin} nicht geprüft` },
    },
    options,
  );
}

/** Short badge for a state, used by the picker. */
export function authStateBadge(state: AuthState): string {
  switch (state) {
    case "ready": return "bereit";
    case "logged-out": return "abgemeldet";
    case "cli-missing": return "CLI fehlt";
    case "key-missing": return "Key fehlt";
  }
}

/** Look up an option by id. */
export function findAuthOption(id: string): AuthOption | undefined {
  return AUTH_OPTIONS.find((option) => option.id === id);
}

/** Options that unlock a given registry provider. */
export function authOptionsForProvider(provider: string): AuthOption[] {
  return AUTH_OPTIONS.filter((option) => option.provider === provider);
}
