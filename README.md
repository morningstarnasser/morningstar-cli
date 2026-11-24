# Morningstar CLI

Current release: **1.1.1** (2026-11-24).

A local-first, multi-provider coding assistant for your terminal. Morningstar combines
editable input, visible tool work, parallel agents, shared skills and private phone access.
Built with TypeScript, React/Ink and Shiki.

## Current features

| Area | Available behavior |
| --- | --- |
| Models | Provider API catalogs, installed Ollama models, Claude CLI aliases and the local Codex model catalog |
| Long tasks | Unlimited turns by default; optional turn/cost limits, cancellation and no-progress detection |
| Tools | Files, edits, shell, search, Git and supported integrations through the shared permission/runtime layer |
| Swarm | Model-selected or explicit parallel tasks, dependencies, file ownership and selectable agent views |
| Work log | Executed commands, exit status, output and actual red/green file diffs with addition/deletion counts |
| Input | Cursor placement, mouse drag selection, editing, multiline input, history and queued messages |
| Output | Markdown, syntax-highlighted code, scrollback and mouse selection/copy |
| Images | Numbered `[Image #1]` attachments with real image data for supported providers |
| Sessions | New, clear, resume, rename, conversation rewind and summarization checkpoints |
| Superbrain | Bounded local QMD retrieval from the `obsidian` collection |
| Skills | Shared user/project/plugin skill discovery; relevant procedures loaded on demand |
| Remote Control | Pair a browser by QR code; view and control the same running session over a private network |
| Automation | Print/JSON/NDJSON, lifecycle command hooks, validated settings and optional whole-session worktrees |

This is Morningstar's implementation of these workflows, not a complete Claude Code clone.
[PARITY.md](PARITY.md) records the remaining boundaries.

## Install from source

Requirements: **Node.js 22+**, npm and Git. Shell tools also need Bash; on Windows,
install Git for Windows. Morningstar resolves its Bash and grep directly; command hooks
use Git Bash too. Windows file privacy follows the Windows user-profile ACLs rather than
POSIX chmod bits.

Clone the public source repository:

```sh
git clone https://github.com/morningstarnasser/morningstar-cli.git morningstar-cli
cd morningstar-cli
npm ci
npm run typecheck
npm run build
npm link
morningstar
```

In PowerShell, use `npm.cmd` / `morningstar.cmd` when script execution policy blocks `.ps1` shims.
Do not overwrite an existing dirty checkout. Install beside it, then link the new checkout.

To update a clean checkout:

```sh
git pull --ff-only
npm ci
npm run build
npm link
git rev-parse --short HEAD
```

Restart running Morningstar processes after updating. `--version` is the package version;
`git rev-parse HEAD` identifies the exact installed source revision.

## Choose a model

Start `morningstar`, then use `/login` and `/model`. Vendor CLI subscriptions use their own
installed client and login; API providers use their own credentials. Keys belong in the
provider's environment variable or the private user configuration, never in tracked files.

```sh
morningstar --model codex-cli
morningstar --model claude-cli
morningstar --model ollama/<installed-model-id>
```

Cloud API adapters include OpenAI, Anthropic, Google, DeepSeek, Groq, OpenRouter, NVIDIA
and GitHub Models. Availability depends on the provider and account. The picker uses
provider discovery rather than invented model names; an empty catalog does not prove
an unavailable model works. Unavailable legacy entries are no longer advertised in the picker.

The Codex adapter observes its public tool events and retains its read-only sandbox.
`--yolo` does not change the vendor CLI's own sandbox or content policy.

## Everyday commands

| Command | What it does |
| --- | --- |
| `/help` | Show the current command registry and supported options |
| `/model`, `/login` | Select a provider/model and authenticate |
| `/new`, `/clear` | Save the previous conversation, start a new session and clear the visible transcript |
| `/resume [name or id]` | Pick or resume a saved conversation in this project |
| `/rename <name>` | Rename the current session |
| `/rewind` or double Esc | Pick a message to restore or summarize from/up to; preserve the old conversation |
| `/activity` | Inspect the latest public tool activity |
| `/find [text]` | Search the retained terminal transcript; Ctrl+F opens the same view |
| `/swarm` | Start an explicit team plan; the model can also choose swarm itself |
| `/btw <question>` | Ask an isolated side question without tools or mutation of the main conversation |
| `/max-turns <n>` | Set an optional cap; `0` or `unlimited` removes it |
| `/rc` | Start private Remote Control, or open its menu when already active |
| `/rc qr`, `/rc stop` | Refresh the pairing code, or revoke clients and stop Remote Control |

In the composer, **Tab** cycles **Normal → Plan → YOLO → Normal**; **Shift+Tab** cycles
backwards. Open command/file suggestions take precedence over plain Tab. The colored label
shows the selected mode. This switch applies to the next request and is not saved as a new
default; managed permission restrictions still apply. `/permissions` remains available.

Click **▸ Details** above a code block or tool result to inspect its captured contents,
including the complete retained diff or output, while the agent keeps working. Scroll and
select/copy inside that view. Tool capture limits still apply; the viewer cannot recover data
that an upstream tool already truncated. Scrollback retains details for the latest 1,000 blocks.

When scrolling the transcript, the footer shows new updates. Scroll to the bottom, click
**↓ Live**, or press **End/Esc** to resume live tracking without typing into the composer.

The generated `/help` output is the authoritative full command list.

**Ctrl+F** opens transcript search on macOS, Windows and Linux. Forwarded **Cmd+F**
also works on macOS; terminals that reserve Cmd+F for their own Find window need
Ctrl+F or `/find`. Type a literal search, use Enter/Down for the next match or Up
for the previous one, and Esc to return live. Matches are highlighted, the count
is visible, and the composer draft is preserved. Search inspects the retained
terminal snapshot; work continues in the background. Reopen search for newer output.

## Editing, scrolling and seeing the work

Click inside the input to place the cursor; drag to select text. Backspace/Delete acts
at the cursor or on the selection. Shift+arrows selects with the keyboard, Ctrl+S selects
the whole draft, Ctrl+X cuts, and Alt+Enter inserts a newline.

Drag over answers or code to select and copy output. Output is a transcript, not an editable
draft. The mouse wheel, trackpad or Page Up/Down opens scroll mode; Esc/End returns live.
Work continues while you inspect or select older output. The viewport retains up to 20,000
terminal lines; saved conversations remain separate. Terminals must support SGR mouse
reports and cursor-position reports. Set `MORNINGSTAR_MOUSE=0` to use native terminal selection.
With the integrated viewport enabled, the composer, mode and context bar remain
at the bottom, including after completed answers, multiline paste and terminal
resize. Scrolling and search remain available above them. Very short terminals
may clip the dynamic work preview; full captured output remains in Details/history.

During a task, Enter queues messages. **Ctrl+X, then Ctrl+S** applies queued steering
immediately after interrupting the current run. The original task remains part of the conversation.

Click an agent tab to see its task, public updates and work. File edits show actual `+`/`-`
counts and colored lines. Provider events that contain only paths do not receive invented diffs.
Private reasoning is not exposed. Nonfatal backend notices remain notices; failed tools remain failures.

### Images and formatted answers

Drop an image file path into the terminal to attach `[Image #1]`, then `[Image #2]`, etc.
PNG, JPEG, GIF and WebP are supported, including quoted paths and paths with spaces.
Limits: 5 MB per image, 20 images / 20 MB in active context. Numbering survives queue,
resume and rewind; `/new` resets it. Input markers have a distinct purple style.

Assistant replies render bold text, lists, inline code and code blocks. The private browser
also supports tables and code-copy buttons. Model HTML is displayed as text, not executed.
The Remote Control browser currently has no image-upload route.

## Swarm and permissions

```sh
morningstar --yolo
morningstar --yolo -p "Implement the API and documentation in parallel, then verify them"
morningstar --max-turns 25 -p "Inspect this project"
```

The model can split independent work into a swarm. Workers have task ownership and dependencies;
a failed tool prevents a success-only worker report. Automatic worktree creation per worker is
not implemented; `--worktree` isolates the whole session.

`--yolo` auto-approves tools for this invocation, including delegated workers. Managed deny rules
and restrictions still apply. It neither guarantees that every model answers every request nor
removes provider quotas, context limits or machine limits. Normal mode requests required approvals.

See [automatic swarm and YOLO](docs/autonomous-swarm-yolo.md).

## Superbrain and all your skills

Morningstar discovers skills from the project and installed user roots, including `.agents`,
`.claude`, `.codex`, `.kimi`, `.kimi-code`, `.pi`, `.qwen`, `.gemini`, `.morningstar` and
locally cached Claude/Codex plugin skill folders. Canonical duplicates collapse; distinct
variants remain addressable. Loading a skill does not install its tools or grant permission.

```sh
morningstar skills status
morningstar skills search testing
morningstar skills load <id>
morningstar superbrain status
morningstar superbrain search "project handover"
```

Superbrain needs QMD and the `obsidian` collection on the host. Without them, Morningstar
reports unavailable context and continues. Automatic retrieval includes bounded attributed
excerpts and filters private paths. `--no-auto-knowledge` disables automatic retrieval.

Skills are loaded lazily; the entire library is not inserted into every prompt. A vendor CLI
may separately warn `Exceeded skills context budget`: its own automatic skill list was shortened,
not deleted from disk. A successful `sed`/file-read event below that warning means the selected
procedure was read; it is work-log output, not an edit to your source code.

See [Superbrain, skills and unlimited turns](docs/superbrain-skills-unlimited.md).

## Phone / Remote Control

Run `/rc` and scan the QR code. The browser controls the **same live process**, including
messages, stopping work, approvals, sessions and agent views.

| Command | Network / action |
| --- | --- |
| `/rc` | Prefer the machine's Tailscale address; otherwise private LAN / loopback |
| `/rc lan` | Same local network; local HTTP |
| `/rc local` | This computer only |
| `/rc status` | Show whether the server is active |
| `/rc` while active | QR code again, deactivate, or back |
| `/rc stop` | Stop the server and revoke all paired clients; local work continues |

Pairing codes are single-use and expire after ten minutes. Browser sessions expire after twelve
hours; at most four clients remain paired. Refreshing the QR invalidates the previous unused code.
Keep pairing links private. On the phone, enable Tailscale when using the tailnet address.
This is a private server, not a public relay or an HTTPS deployment; LAN HTTP is unencrypted.

Answers and work are chronological. Work groups expand for commands, output and diffs. Open details
and selected text survive polling. Restart Morningstar and pair again after installing an update.

See [sessions, input, rewind, images and Remote Control](docs/sessions-remote-rewind.md).

## Settings and scripting

Settings precedence is managed > explicit > local > project > user. Project files can restrict
behavior; `--trust-project` is required before they may grant permissions, run hooks or alter routes.
Unsupported settings fail validation instead of being silently accepted.

```sh
morningstar settings check examples/settings/readonly.json
morningstar --settings examples/settings/readonly.json
morningstar --worktree feature-a "Implement this task"
morningstar -p "Explain this module" --output-format json
morningstar --continue
```

User configuration, history and settings live under `~/.morningstar`. Project settings live in
`.morningstar/`. Project instructions include Morningstar files, `AGENTS.md`, and `CLAUDE.md`
as a fallback. Avoid copying credentials or host-specific configuration between computers.

See [settings, hooks and parity details](docs/claude-parity-2026-11-23.md).

## Connected live status (1.1.1)

A skill is a procedure, not a connection. Only connected MCP tools can return live
measurements. Standalone malformed tool output triggers at most two correction
attempts, then an explicit protocol error; it is never silently executed or
presented as a successful measurement.

Trusted user/explicit settings can opt a stdio MCP server into startup with
`"autoConnect": true`. Without this flag, `/mcp connect <name>` remains manual.
Both interactive and print modes expose the connected tools to the agent.

For existing read-only JSON monitoring endpoints, `morningstar status-mcp
<absolute-config.json>` supplies an `entity_status` MCP tool. The operator file maps
entity IDs to `{ "label": "My server", "url": "https://monitor.example/status" }`.
Register it with an absolute Node executable and arguments
`["/path/to/morningstar/bin/morningstar.js", "status-mcp", "/path/to/targets.json"]`.
Targets come only from that file; tools cannot select arbitrary URLs. The adapter
uses GET, refuses redirects, caps responses at 64 KB, and reports missing targets
or connection failures. It does not start or publish a monitoring endpoint.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
osv-scanner scan source -r .
```

Source is in `src/`; tests are in `test/`. `dist/` is tracked and must match the source.
The `website/` package has its own lockfile and build. Follow [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md) before contributing.

The release checks include the complete test suite on Mac and Windows, typecheck, build,
OSV scanning and terminal keyboard/mouse read-back. See [1.1.1 release verification](docs/release-1.1.1-2026-11-24.md);
a package version or screenshot alone is not an inference, security or cross-platform guarantee.


## License

[MIT](LICENSE) · Ali Nasser / Morningstar
