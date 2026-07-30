// ─── Claude CLI Provider ─────────────────────────────────────────────────────
// Use the locally-installed `claude` CLI (Claude Code, subscription OAuth — no
// API key, no per-token cost) as Carry's model backend. We run it in print mode
// as a pure text brain: Claude Code's OWN tools are disabled, so it never runs
// its agent loop — it just returns text, including Carry's own `<tool:...>`
// protocol tags, which Carry's loop then parses and executes.
//
// Additive: a new provider plugged into the registry; existing providers are
// untouched. The runner is injectable so tests never spawn a real process.
import { spawn } from "node:child_process";
/** Claude Code's native tools, disabled so it acts as a plain text model. */
export const DISABLED_CLAUDE_CODE_TOOLS = [
    "Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch",
    "Task", "TodoWrite", "NotebookEdit", "BashOutput", "KillShell",
];
/** Build the system prompt (arg) and the conversation prompt (stdin) from messages. */
export function buildClaudePrompt(messages) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const convo = messages.filter((m) => m.role !== "system");
    if (convo.length === 1 && convo[0].role === "user") {
        return { system, prompt: convo[0].content };
    }
    const prompt = convo
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
    return { system, prompt };
}
/** Build the `claude` CLI argv for a print-mode, tool-free brain call. */
export function buildClaudeArgs(modelAlias, system) {
    const args = ["-p", "--output-format", "text"];
    if (modelAlias)
        args.push("--model", modelAlias);
    if (system)
        args.push("--system-prompt", system);
    args.push("--disallowedTools", DISABLED_CLAUDE_CODE_TOOLS.join(" "));
    return args;
}
const defaultRunner = async function* (args, prompt, signal) {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], signal });
    let stderr = "";
    child.stderr?.on("data", (d) => {
        stderr += d.toString();
    });
    const closed = new Promise((resolve) => child.on("close", (code) => resolve(code ?? 0)));
    child.stdin?.write(prompt);
    child.stdin?.end();
    try {
        for await (const chunk of child.stdout) {
            yield chunk.toString();
        }
    }
    catch (err) {
        if (err.name === "AbortError")
            return;
        throw err;
    }
    const code = await closed;
    if (code !== 0) {
        throw new Error(`claude CLI exited ${code}: ${stderr.slice(0, 300) || "no stderr"}`);
    }
};
/** Stream a model response by driving the local `claude` CLI as a text brain. */
export async function* claudeCliStream(modelAlias, messages, signal, runner = defaultRunner) {
    const { system, prompt } = buildClaudePrompt(messages);
    const args = buildClaudeArgs(modelAlias, system);
    for await (const chunk of runner(args, prompt, signal)) {
        if (signal?.aborted)
            return;
        if (chunk)
            yield { type: "content", text: chunk };
    }
}
//# sourceMappingURL=claude-cli.js.map