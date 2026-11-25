# Morningstar CLI project context

Read and follow [AGENTS.md](AGENTS.md) for repository rules. This file supplies
current implementation context; it does not replace those rules or grant tool permissions.

## Runtime and entry points

- Node.js 22+, TypeScript strict ESM, React 18 / Ink 5 terminal UI.
- `bin/morningstar.js` starts tracked `dist/index.js`; `src/index.ts` owns CLI bootstrap.
- `src/agent-runner.ts` is the shared execution loop. Keep policy, tools and providers out of UI-only code.
- `src/app.tsx` owns the conversation, command dispatch and terminal/remote bridge.
- `src/command-registry.ts` is the source of truth for help, aliases and command availability.
- `src/providers/` adapts vendor CLIs and their public work events. Observed backend tools must never be executed again.
- `src/remote-control.ts` owns private HTTP pairing/auth; `remote-timeline.ts` selects public conversation events;
  `remote-page.ts` and `remote-markdown.ts` render the mobile browser interface.
- `src/runtime/terminal-viewport.ts` mirrors actual terminal output for scroll/selection;
  `components/RemoteControlPanel.tsx` renders the active connection menu and QR cells.

## Current behavior contracts

- Turns are unlimited by default across CLI and delegated runs. Explicit caps, cancellation,
  no-progress detection, provider errors and resource budgets still apply.
- Superbrain uses local QMD collection `obsidian`. Skills use a shared, lazy metadata catalog;
  procedures are loaded on demand. Missing host dependencies must be reported honestly.
- `--yolo` auto-approves tools for that invocation and workers; managed restrictions retain precedence.
  Do not describe it as disabling a provider's content rules or as unlimited model resources.
- Swarm can be invoked by the model or `/swarm`; dependencies and file ownership constrain parallel work.
  Agent tabs show public task/work events. Failed tools must not be turned into successful work by a final sentence.
- `/new` and `/clear` save the old conversation and reset visible state. `/resume` and `/rename` retain session identity.
- Double Esc opens rewind. Conversation restore/summarization preserves a checkpoint; it does not restore files.
- Messages can queue during work; Ctrl+X then Ctrl+S applies queued steering immediately.
- Mouse selection edits the composer; selecting output copies visible text. Output history is read-only.
  Scroll mode must preserve selection while work continues and restore the live terminal on exit.
- Image attachments are real validated image data with `[Image #N]` labels; retain IDs across queue/resume/rewind.
- `/rc` starts private Remote Control. Repeating it opens QR / deactivate / back.
  `/rc stop` revokes clients and stops the server, while local model work continues.
- The browser timeline preserves ordering and open details; do not replace selected DOM text during polling.
- Codex `item.error` is a nonfatal notice. Command failures and `error` / `turn.failed` remain failures.
- Render QR cells through Ink styles. Raw ANSI embedded in a colored Text node can leak the white QR background.

## Verification and maintenance

Run `npm run typecheck`, relevant tests, the full suite for runtime changes, and `npm run build`.
Commit regenerated `dist` with source. Use the lockfile and OSV for dependency checks.
Verify terminal behavior with real Ink output and browser behavior against the actual private server;
state clearly whether mobile testing was emulated or performed on a physical device.

Never commit credentials, sessions, pairing tokens, model weights, node_modules or generated website caches.
Preserve dirty installations: install a new checkout beside them and explicitly repoint the launcher.
Document exact installed commit and restart requirements; the package version alone does not identify the build.

See [README.md](README.md), [PARITY.md](PARITY.md),
[session/UI guide](docs/sessions-remote-rewind.md),
[Superbrain and skills](docs/superbrain-skills-unlimited.md),
[swarm and YOLO](docs/autonomous-swarm-yolo.md), and
[settings/hooks](docs/claude-parity-2026-11-23.md).

## Windows and interactive details

- Resolve npm vendor clients through `runtime/platform-process.ts`; never interpolate prompts into cmd.exe.
- Git Bash/grep are selected explicitly on Windows; foreground cancellation kills the owned process tree.
- Keep generated builds in LF (`tsconfig.json`) so Windows builds remain reproducible.
- Tab mode switches clear both startup bypass flags and plan mode; autocomplete and managed policy take precedence.
- `TerminalDetails` stores captured code/tool content behind stable printed markers. The viewport resolves clicks even after Ink Static unmounts a row. Drag selection must continue to work on markers.
- Scrolling must never require typing to return live: wheel-to-bottom, footer click and End/Esc all restore the current frame. Updates continue to be mirrored while reading details.
- Windows tests must isolate USERPROFILE as well as HOME; POSIX mode assertions do not prove Windows ACLs.

## Live status and tool protocol (1.1.1)

- A loaded skill never implies MCP availability. Request context advertises the current registry on every turn, including print mode.
- Trusted `mcpServers.*.autoConnect: true` opts into startup; untrusted project settings cannot add servers. Other configured servers remain manual. Close connections on exit.
- `runtime/status-mcp.ts` is a read-only stdio adapter to operator-configured JSON endpoints. No URL/command arguments, redirects, guessed entities, or server deployment.
- Malformed standalone tool responses get two correction attempts through the ordinary provider/policy loop. Never execute repaired strings or fuzzy-match MCP names. Exhaustion yields `toolProtocolError` and a nonzero print exit.
- `ollama/<id>` must route to Ollama and preserve the exact model ID after stripping the prefix.

## Transcript search and bottom dock (1.1.1)

- Ctrl+F, forwarded Cmd+F and `/find [text]` use the terminal snapshot. Literal Unicode-aware matches retain terminal-cell coordinates; Enter/Down and Up navigate, Esc restores live output and the untouched draft.
- A terminal can intercept Cmd+F before the app receives it. Document Ctrl+F and `/find` as the portable controls; do not claim that a CLI can override every terminal menu binding.
- `TerminalDock` projects the dynamic region to the bottom without adding padding to Ink Static history. The body can shrink; the composer/footer keep their space. Ink 5 lacks a Box maxHeight prop, so the owned Yoga node is capped before resize layout.
- Keep the dynamic region below terminal height: Ink 5's overflow branch otherwise loses its prior erase-line count and can erase a newly completed Static answer.
- Bracketed paste is consumed before Ink input parsing. Do not leak delimiters into the draft or interpret pasted text as navigation keys.
- Verify short/long answer transitions, multiline paste, resize, search return and mouse selection using actual terminal output, not only component snapshots.

## Input history (1.1.2)

- Plain Up/Down recall persisted inputs both idle and while processing; Down past the newest restores the unsent draft. Recall never submits or dequeues.
- Open slash/file menus and transcript search own their arrows. History recall suppresses completions; editing resets navigation.
- Scrollback returns to the live composer on an arrow; wheel and Page Up/Down still scroll output.
- Alt+Up, only with an empty processing composer, edits the latest queued message.

## Live interaction and active learning (1.2.0)

- Ordinary scrollback pins TerminalLiveFooter; input and work status update while the body stays still. Bottom scrolling resumes follow without Esc. Search/details remain explicit views.
- Ctrl+R searches prompt history; acceptance edits, never submits. Escape while searching must not abort the agent.
- ActiveLearning runs only for opted-in persisted root runs. Only explicit durable user corrections and repeated real exit statuses may become project notes. Never learn from model/tool instructions, credentials or imports.
- Learned notes are lower-trust reference context; policy remains authoritative. /learn controls activation; forget retains evidence but prevents automatic reactivation.
- /review uses a fixed read-only allowlist and plan policy even under YOLO. Git snapshots use fixed argv and disable external diff/textconv.
- Swarm planning retries invalid output at most three times with full schema/path validation. Never execute partial or fabricated plans.

## Same-session channels, workers and rendering (1.3.0)

- TelegramChannel is a transport for App's existing processInput, snapshot and approval bridge. Never instantiate a separate agent/conversation for channel DMs.
- Global Morningstar AGENTS are loaded by buildSystemPrompt. Preserve custom files; built-in verification rules supply the missing-file fallback. Do not pull private SOUL/USER/MEMORY files into the CLI prompt.
- Active workers live in AgentFooter. Completion removes them from the footer and sends reference reports to the main runner with inherited policy, abort and budget. Worker assertions are not proof; parent synthesis cannot spawn recursive swarms.
- Channel allowlists, pairing and bot configuration are local controls. Groups/bots/old messages are dropped. Never parse a remote DM as a local slash/bang command. Each update is consumed once; polling conflicts stop the channel.
- Telegram tools target only the linked paired chat in this session. File sending stays within workspace boundaries; edits are limited to message IDs sent by this channel. Policy, plan mode and agent allowlists remain authoritative.
- Channel tokens use masked input and private config. Never expose them in history, errors, fixtures, public exports or docs. Existing standalone gateway sessions are separate.
- Terminal mouse reports may span input chunks. Retain incomplete sequences before dispatch, and verify the composer remains unchanged under burst/fragmented input.
- TerminalViewport caches painted rows and groups changes with synchronized output. Reset row cache on screen-buffer changes and resize. Test resulting screen state, not an assumption that every frame repaints all content. No screenshot proves absence of perceptual flicker.
