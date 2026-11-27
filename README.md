# Morningstar CLI

Current release: **1.5.7** (2026-11-27).

A local-first, multi-provider coding assistant for your terminal. Morningstar combines
editable input, visible tool work, parallel agents, shared skills and private phone access.
Built with TypeScript, React/Ink and Shiki.

## Current features

| Area | Available behavior |
| --- | --- |
| Models | Provider API catalogs, installed Ollama models, Claude CLI aliases and the local Codex model catalog |
| Long tasks | Unlimited turns by default; optional turn/cost limits, cancellation and no-progress detection |
| Tools | Files, edits, shell, search, Git and supported integrations through the shared permission/runtime layer |
| Swarm | Live workers in the pinned footer, dependencies, actual task states and result handoff to the main agent |
| Work log | Colored commands and paths, measured duration, exit codes, counted expandable output and red/green file diffs |
| Input | Cursor placement, selection, multiline input, persistent ↑/↓ history, Ctrl+R search and queued messages |
| Output | Markdown, syntax highlighting, scrollback with live composer/status, automatic bottom follow and selection/copy |
| Learning | Project-scoped durable corrections and repeated verified checks; unresolved references and immediate follow-up tasks are excluded; /learn inspects or disables learning |
| Review | /review reads staged/unstaged diffs and files with enforced read-only tools |
| Images | Numbered `[Image #1]` attachments with real image data for supported providers |
| Sessions | New, clear, resume, rename, conversation rewind and summarization checkpoints |
| Superbrain | Bounded local QMD retrieval from the `obsidian` collection |
| Skills | Shared user/project/plugin skill discovery; relevant procedures loaded on demand |
| Telegram | Pair a private DM with the same terminal session; approvals, progress, photos, text files and outgoing project files |
| Remote Control | Pair a browser by QR code; view and control the same running session over a private network |
| Automation | Print/JSON/NDJSON, lifecycle command hooks, validated settings and optional whole-session worktrees |

This is Morningstar's implementation of these workflows, not a complete Claude Code clone.
[PARITY.md](PARITY.md) records the remaining boundaries.

## Install from source

Requirements: **Node.js 22+**, npm and Git. Shell tools also need Bash; on Windows,
install Git for Windows. Morningstar resolves its Bash and grep directly; command hooks
use Git Bash too. Windows file privacy follows the Windows user-profile ACLs rather than
POSIX chmod bits.

Install from the public product repository:

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

Update from any working directory (close running Morningstar sessions first):

```sh
morningstar update --check
morningstar update
```

On Windows, `morningstar.cmd update` also works. The updater follows this installation's
configured Git remote and tracking branch, including private installations. It refuses
local changes, untracked files, detached HEADs and divergent commits. Dependencies,
typecheck, build and a version-start check run in a temporary checkout before a
fast-forward activates the update. Your settings, sessions and downloaded models stay
in their existing locations. Restart Morningstar afterwards.

`morningstar update --json` returns a machine-readable result; combine it with `--check`
for a check without installation. `/update` inside Morningstar checks availability;
`/update run` shows the terminal instructions. An interrupted preparation leaves the
current installation in place. During the short activation step, cancellation waits
for completion. Updates require Git, npm, network access and room for a second set of
dependencies. They use only the configured upstream; there is no public-repo fallback.

For versions before 1.5.0, bootstrap the new command once in a **clean checkout**:

```sh
git pull --ff-only
npm ci
npm run build
```

Standalone npm/tarball installs without Git must use their original installation method.
`--version` reports the package version; `git rev-parse HEAD` identifies the exact source.

## Public launchers and distribution

Use `npm run launch:ollama` to choose an installed Ollama model. A Pinokio launcher
is included in `pinokio/`. Official Ollama launch-menu and directory inclusion are
not yet available. See [distribution and release hygiene](docs/distribution.md)
for setup, verification and upstream status; see [SECURITY.md](SECURITY.md) for reporting.

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
an unavailable model works. Old Hydra entries are no longer advertised in the picker.

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
| `/sidebar` or Ctrl+B | Open the sidebar with documents, agents and project sessions |
| `/open <path or link number>` | Read a local file or Vault note in the document preview |
| `/find [text]` | Search the retained terminal transcript; Ctrl+F opens the same view |
| `/swarm` | Start a team; active workers appear below, then hand results to the main agent and close |
| `/telegram on`, `/telegram off` | Connect/disconnect Telegram for this terminal conversation |
| `/telegram:configure` | Enter the bot token in a masked field |
| `/telegram:access pair <code>` | Pair a Telegram account locally |
| `/btw <question>` | Ask an isolated side question without tools or mutation of the main conversation |
| `/max-turns <n>` | Set an optional cap; `0` or `unlimited` removes it |
| `/rc` | Start private Remote Control, or open its menu when already active |
| `/rc qr`, `/rc stop` | Refresh the pairing code, or revoke clients and stop Remote Control |

In the composer, **Tab** cycles **Normal → Plan → YOLO → Normal**; **Shift+Tab** cycles
backwards. Open command/file suggestions take precedence over plain Tab. The colored label
shows the selected mode. This switch applies to the next request and is not saved as a new
default; managed permission restrictions still apply. `/permissions` remains available.

**↑ / ↓** recall older/newer submitted inputs, including while the agent is working.
Down past the newest entry restores your unsent draft. Recalling never submits a message
or removes it from the queue. Open command/file suggestions and transcript search use
arrows for their own selection. From scrollback, an arrow returns to the composer and
recalls history; use the mouse wheel or Page Up/Down to scroll output. **Alt+↑** with an
empty composer edits the latest queued message. History persists across restarts.

Click **▸ Details** above a code block or tool result to inspect its captured contents,
including the complete retained diff or output, while the agent keeps working. Scroll and
select/copy inside that view. Tool capture limits still apply; the viewer cannot recover data
that an upstream tool already truncated. Scrollback retains details for the latest 1,000 blocks.

While scrolling, the composer and work status stay live. Type without leaving older output;
scroll to the bottom to resume automatic following. **↓ Neueste** and **End** jump to the
latest output. Esc remains optional. Explicit search/detail views retain their own controls.

The generated `/help` output is the authoritative full command list.

**Ctrl+F** opens transcript search on macOS, Windows and Linux. Forwarded **Cmd+F**
also works on macOS; terminals that reserve Cmd+F for their own Find window need
Ctrl+F or `/find`. Type a literal search, use Enter/Down for the next match or Up
for the previous one, and Esc to return live. Matches are highlighted, the count
is visible, and the composer draft is preserved. Search inspects the retained
terminal snapshot; work continues in the background. Reopen search for newer output.

**Ctrl+R** searches submitted prompts. Type to filter, use Ctrl+R/Up for an older match,
Down for a newer match, and Enter/Tab to put it in the composer for editing. This does not
submit the match. Esc cancels search and restores the draft, including while work runs.

## Sidebar and document preview

Click a file link such as **Project guide [3]** in an assistant answer to read the
file inside Morningstar. **Ctrl+B** or `/sidebar` opens the same workspace with
three tabs: documents, agents and saved sessions in the current project. The
project README and instruction files appear automatically; links from the current
session join that list. `/open README.md`, `/open 3` and `/open "docs/My guide.md"`
provide keyboard access. Absolute file paths, `file:` URLs and `:line`/`#Lline`
positions are supported. Ordinary web links remain visible URLs.

Use **1/2/3** or click a tab, **Up/Down** and **Enter** to choose an entry, and
**Tab** to move focus between the list and preview. The mouse wheel and Page Up/Down
scroll the document. **Esc** or **Ctrl+B** returns to the chat with the composer
intact. Below 88 columns the list and document use separate views; Tab switches
between them. The navigator is a reading view: work continues, live agent details
and status update, and approvals remain in the chat. It does not accept new prompts.
In Sessions, **R** resumes the selected session after saving the current one;
switching is blocked while a task or another dialog is active.

Preview reads are local and are not added to model context or Telegram messages.
Files must resolve inside the project or `MORNINGSTAR_VAULT_DIR` (default:
`~/Documents/obsidian-vault`), including after symlink resolution. Credentials,
private keys, binary/special files and files above 512 KiB are refused. Existing
`qmd://obsidian/…` links use the configured QMD command and its existing path filter,
with a labelled preview of at most 1,000 lines. The navigator requires the interactive
terminal renderer; `MORNINGSTAR_MOUSE=0` disables it together with the mouse layer.

## Active learning and review

Learning is on by default for persisted root sessions. Explicit durable corrections such as
`Merke dir: Verwende pnpm statt npm` become project rules. Recognized verification commands
become suggestions only after successful exit codes in two separate runs; a later failure
removes the suggestion from active recall. Tool output and assistant claims cannot create
preferences. Learned notes are reference context, never permission grants or proof that a
new task has passed. Model weights and CLI source code are not changed automatically.

Use `/learn` to inspect rules and evidence, `/learn off` or `--no-self-improvement` to disable
learning and recall, and `/learn forget <id>` to deactivate a rule while retaining its record.
Ephemeral sessions, planners and nested workers do not persist learning. Imports are not
automatically activated. Learning stays local under the user profile and is not synced to Git.

`/review [path or focus]` inspects current changes in an isolated read-only run, including
staged and unstaged diffs and relevant new files. It reports concrete findings with locations
and limitations. Review does not run tests or modify the main conversation.

## Editing, scrolling and seeing the work

Click inside the input to place the cursor; drag to select text. Backspace/Delete acts
at the cursor or on the selection. Shift+arrows selects with the keyboard, Ctrl+S selects
the whole draft, Ctrl+X cuts, and Alt+Enter inserts a newline.

Drag over answers or code to select and copy output. Output is a transcript, not an editable
draft. The mouse wheel, trackpad or Page Up/Down scrolls output; reaching the bottom follows live output again.
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

## Telegram: continue the same session from your phone

Create a bot with Telegram's **@BotFather**. In Morningstar, run
`/telegram:configure` and paste its token into the masked input. Tokens are excluded
from the conversation and prompt history. Existing private gateway credentials can
also be reused. Start with `morningstar --channels telegram` on subsequent launches,
or use `/telegram on` in a running session.

1. DM your bot while the terminal session is connected.
2. If the account is new, the bot returns a short-lived code.
3. In the terminal, enter `/telegram:access pair <code>`.
4. Continue by DM: messages and answers use this terminal's conversation, model,
   project and permission mode. Pairing automatically switches to `allowlist`.

The pinned footer shows the connected bot. One Telegram progress message shows
recent tool steps, active workers and elapsed time, then becomes the final answer.
Headings, code and compact table rows are formatted for the phone. Status and Help
buttons remain after completion; `/status`, `/help` and `/stop` appear in the bot
menu. Approval buttons remain bound to the current request. New messages queue while work runs. Approvals are single-use and bound to
the current account, session and request. `/telegram off` disconnects the channel
without closing the terminal conversation. Access changes remain local:
`/telegram:access policy pairing|allowlist|disabled` and
`/telegram:access revoke <numeric-user-id>`.

Short polling disconnects reconnect automatically without adding repeated transcript warnings. Longer outages show a bounded warning with a safe error category; the footer and `/telegram status` show reconnection until a successful poll. Retries back off and respect Telegram rate-limit delays. A successful recovery is announced once. Local `connection.json` diagnostics contain timestamps and allowlisted error classes, never tokens, URLs or message bodies. Stop cancels a pending retry immediately; invalid tokens and competing consumers still stop the channel.

Photos/images up to 5 MB and UTF-8 text files up to 256 KB enter the same prompt.
Image analysis still requires a vision-capable model. Incoming PDF and other binary
files are not interpreted by this channel. The agent can send requested project
files (up to 50 MB each), react, and edit its own channel messages using
`telegram_reply`, `telegram_react`, and `telegram_edit_message`; the normal tool
policy applies. Credential paths and files outside the workspace are refused.
Plain final answers are relayed automatically, without an extra reply tool call.

This follows the private-DM workflow in [Claude Code Channels](https://code.claude.com/docs/en/channels)
and its [official Telegram plugin](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram).
Morningstar integrates the transport directly: no Bun or extra MCP plugin is needed.
Groups, message-history/search APIs and an offline relay are not supplied. The
terminal must stay open. Use one running session per bot; disconnect on Mac before
connecting the same bot on Windows. A detected Telegram polling conflict stops the
channel instead of silently taking over. An existing webhook is detected before activation and shown explicitly. Disconnect its old service deliberately before connecting; Morningstar never deletes another integration automatically. The separate `morningstar telegram` gateway
retains its own conversations; do not run it with the same bot at the same time.

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
as a fallback. The interactive CLI also loads `~/.morningstar/AGENTS.md`, with
built-in evidence rules when that file is missing. Reload the CLI after changing
these global instructions. They require checking uncertain claims, reproducing bugs,
verifying actual behavior and reporting untested limits. Instructions are not a
guarantee that the model cannot make mistakes. Avoid copying unrelated credentials
or host-specific configuration between computers.

See [settings, hooks and parity details](docs/claude-parity-2026-11-23.md).

## Status error diagnostics (1.5.6)

Status requests distinguish permission denial from a failed measurement. DNS,
connection refusal, connection timeout and TLS errors include a concrete diagnostic
in the tool result. A failed request never reports unmeasured server values.
See [release notes](docs/release-1.5.6-2026-11-27.md).

## Fresh model selection (1.5.5)

`/model` opens immediately and fetches current provider inventories. While the
picker is open, it refreshes every 30 seconds; **Ctrl+R** refreshes immediately.
Successful inventories replace the previous list, including an empty inventory.
New models appear and removed models disappear from the picker. An unavailable
provider is shown as unavailable, with no stale entries advertised as live.

Ollama lists models from the configured inference server (`OLLAMA_HOST`, or the
active Ollama endpoint). A reachable server with zero models is shown as
**no models installed**, separately from a connection failure. Local and remote
inventories are not merged. Switching between Ollama models retains that server.
Refresh never downloads weights, deletes installed files, or silently switches
the active model. If the active model disappears, choose another model explicitly.

Hosted API inventories require their own credentials where applicable. Account
and endpoint changes invalidate cached entries; late responses cannot overwrite
a newer inventory. Invalid or explicitly incomplete inventories are rejected.
Claude CLI aliases and the installed Codex CLI catalog retain their existing
local discovery. This refresh applies to the terminal picker; the standalone
Telegram gateway has a separate menu.

## Fast configured status reads (1.5.4)

Short requests such as `lab and cloud status` can run without a model round trip.
Create the optional user file `~/.morningstar/status-shortcuts.json`:

```json
{
  "version": 1,
  "targets": [
    { "id": "lab", "aliases": ["lab", "lab server"],
      "source": { "kind": "ssh", "destination": "operator@lab.example",
        "services": ["network.service"] } },
    { "id": "cloud", "aliases": ["cloud"],
      "source": { "kind": "mcp", "server": "host_status",
        "tool": "entity_status", "entity": "cloud" } }
  ]
}
```

SSH uses an existing login and verified host key with a fixed Linux read-only
command (hostname, uptime, memory, root disk, named service states). Optional
`port` and absolute `identityFile` select an existing connection. No arbitrary
commands, credentials, key installation or host-key bypass are supported.
The MCP route needs the exact configured server/tool already connected.

Every word must match an explicit target alias or a supported status-request word.
Unknown targets, analysis, historical questions, additional actions, structured
JSON answers and tool-free modes keep the normal model path. An incomplete
configuration never executes only part of the request. Invalid config falls back
to the normal path. Remove the file to disable shortcuts.

Tools still pass through permissions, approvals, capability restrictions, hooks,
cancellation and the normal transcript. Denied, failed and unreadable results
are reported explicitly. Measured reports use no model tokens; inference for
other tasks is unchanged. User config is private and excluded from releases.
The shared terminal/print runtime and standalone Telegram chat support shortcuts;
custom stream integrations must explicitly pass `statusShortcuts` to `runAgent`.

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
OSV scanning and terminal keyboard/mouse read-back. See [1.5.1 tool details](docs/release-1.5.1-2026-11-27.md), [1.5.0 source updates](docs/release-1.5.0-2026-11-27.md), [1.4.0 sidebar and document links](docs/release-1.4.0-2026-11-26.md), [1.3.5 Telegram recovery](docs/release-1.3.5-2026-11-26.md), [1.3.4 native local tools and Telegram presentation](docs/release-1.3.4-2026-11-26.md), [1.3.3 large MCP catalogs and Telegram errors](docs/release-1.3.3-2026-11-25.md), [1.3.2 configured local images](docs/release-1.3.2-2026-11-25.md), [1.3.1 Telegram connection checks](docs/release-1.3.1-2026-11-25.md), [1.3.0 Telegram, workers and rendering](docs/release-1.3.0-2026-11-25.md), [1.2.0 learning and live interaction](docs/release-1.2.0-2026-11-25.md), [1.1.2 input history changes](docs/release-1.1.2-2026-11-25.md) and
[1.1.1 release verification](docs/release-1.1.1-2026-11-24.md);
a package version or screenshot alone is not an inference, security or cross-platform guarantee.

The previous README is preserved as a [historical document](docs/archive/README-before-2026-11-24.md).
Its model lists and implementation claims are not the current contract.

## License

[MIT](LICENSE) · Ali Nasser / Morningstar

### Configured image backend

`/imagine` can use an explicitly configured global backend in
`~/.morningstar/image-backend.json`. It receives a versioned JSON request on stdin
and returns a PNG plus actual dimensions, seed, steps and duration. Prompts are
never interpolated into shell commands. Startup failures, invalid output and timeouts
are reported without showing private backend logs. A configured backend takes
priority; `--model local` selects it explicitly. Model availability and GPU needs
depend on the operator's local setup. No universal speed or quality guarantee.


Tool activity uses separate colors for status, commands, paths, output and diffs.
Completed tool calls show measured runtime and available exit status. A counted
`+N Zeilen` marker opens the complete captured output; Escape returns to the live
session. Denied tools do not display an invented runtime or exit code.

## Free_Models und OpenCode (1.5.7)

`/model` enthält zwei zusätzliche Provider mit automatisch neu abgerufenen Katalogen:

- **Free_Models** verbindet den lokal laufenden [Our Free Model Standalone-Gateway](https://github.com/Ebony-Vinyl/dsh-our-free-model). Morningstar liest Port und Schlüssel aus `~/.our-free-model/settings.json`; `OFM_HOME`, `FREE_MODELS_BASE_URL` und `FREE_MODELS_API_KEY` erlauben explizite lokale Konfiguration. Nur Loopback-Adressen sind erlaubt. Die Modelle laufen bei externen Anbietern, nicht auf der lokalen GPU.
- **OpenCode** nutzt die offizielle OpenCode CLI 2 (`@opencode/cli`). Installation nach den [OpenCode-Anweisungen](https://opencode.ai/docs/cli/), danach `/model` → `OpenCode`. Die kostenlose Modellliste stammt aus `opencode models`. Optional setzt `OPENCODE_BIN` den absoluten Pfad zur ausführbaren Datei. Der Client läuft mit isolierter Konfiguration und gesperrten eigenen Werkzeugen; Morningstar prüft und führt seine eigenen Werkzeuge aus.

Beispiele: `/model free-models/liquid/lfm-3-1.7b:free` und `/model opencode/deepseek-v4.1-flash-free`. Modellnamen sind Beispiele; die aktuelle Auswahl steht in `/model`. Ctrl+R aktualisiert den Katalog. Gelöschte Modelle verschwinden, Abruffehler erzeugen keine erfundenen Einträge. Der Gateway-Katalog zeigt zusätzliche Kontokanäle erst nach deren Einrichtung; OpenCode-Gratis-Modelle und Gateway-Routing-Kombinationen werden dort nicht zusätzlich angeboten.

Gratis-Kontingente können erschöpft sein. Ein HTTP-429 ist eine Anbietergrenze, kein erfolgreicher Auftrag. Die CLI umgeht weder Kontingente noch Client-Zugangsschranken. Datenverarbeitung und mögliche Protokollierung richten sich nach dem ausgewählten Anbieter; für erste Tests synthetische Daten verwenden. Neue Provider werden nicht automatisch zum Standardmodell.
