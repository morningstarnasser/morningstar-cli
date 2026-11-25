# Claude Code Parity — Morningstar CLI

Last audited: 2026-11-25. See [1.2.0 changes and comparison](docs/release-1.2.0-2026-11-25.md) and the earlier [implementation report](docs/claude-parity-2026-11-23.md).

Morningstar targets clean-room behavioral parity with the publicly documented
Claude Code terminal workflow. It does not copy Anthropic source, branding,
assets, private APIs, or proprietary service behavior. The public
[`anthropics/claude-code`](https://github.com/anthropics/claude-code) repository
is a distribution and issue-tracking repository, not the implementation source.

Legend:

- ✅ implemented end to end
- 🟡 usable, but not yet equivalent to the documented Claude Code surface
- ⬜ not implemented
- ➕ Morningstar-specific capability
- N/A Anthropic service or product surface, intentionally not cloned

## Core coding loop

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Streaming interactive coding session | ✅ | Ink transcript and the shared `runAgent` lifecycle |
| Read, search, edit, write, and run commands | ✅ | Native/text calls share one runner, policy contract, and result lifecycle |
| Native provider tool calling | ✅ | Enabled for supported providers, with text-tool compatibility |
| Multi-turn tool feedback loop | ✅ | Shared runner with unlimited default turns, explicit optional limits, abort and loop detection |
| Permission decision before execution | ✅ | Deny-first policy, exact approval prompt, workspace guards |
| Permission modes | ✅ | `ask`, `acceptEdits`, `plan`, `strict`, `dontAsk`, `auto`, `delegate`, and explicit bypass |
| Settings and managed policy | 🟡 | User/project/local/explicit/managed sources, deny/ask/allow, trust gate; unsupported Claude settings explicitly rejected |
| Direct `!` shell mode | ✅ | Uses the same policy and approval path as model-requested Bash |
| Plan mode | 🟡 | Mutation denial exists; the full Claude plan-review interaction is not identical |
| Checkpoints and rewind | ✅ | Double-Esc conversation restore/summarize with checkpoints; file restore is a separate workflow |
| Conversation compaction | ✅ | Budget-based runtime compaction and `/compact` |
| Session save, resume, rename, and history | ✅ | Persistent sessions and searchable history |
| Conversation branching | ➕ | Named branch, switch, merge, and delete workflows |
| Read-only code review | ✅ | /review reads staged/unstaged diffs and files; mutations and shell execution denied |
| Active project learning | ✅ | Explicit durable corrections and repeated successful checks, inspect/disable/forget via /learn; no model-weight training |
| Auto-test after edits | ➕ | Detects project test runners and verifies changed files |

## Terminal interaction

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Slash-command discovery and filtering | ✅ | Typed registry drives autocomplete, help, aliases, and availability |
| Project/file mentions | ✅ | Files, folders, globs, git, diffs, URLs, tree, and codebase context |
| Command history | ✅ | Persistent per-user input history |
| Reverse history search | ✅ | Ctrl+R wired into the live composer: filter, navigate, accept for editing, cancel |
| Vim input mode | ✅ | Toggleable Vim input hook |
| Background commands | ✅ | Background process tools with status and output retrieval |
| Task/progress display | ✅ | Live turn, tool, duration, and token progress |
| Responsive terminal layout | ✅ | Explicit compact/comfortable/wide behavior at 60/80/120 columns |
| Custom keybinding file | ⬜ | Built-in input handling only |
| Scrollable transcript selection | ✅ | Mouse wheel/Page Up/Down, live pinned composer/status, bottom auto-follow, frozen selection; 20,000 lines |
| Terminal voice input | ⬜ | Telegram transcription exists, but not terminal voice input |
| `/btw` side-question flow | ✅ | Isolated context, hard tool denial, no main-transcript mutation; queued while busy |
| Generated prompt suggestions | ⬜ | Command/file completion exists; AI follow-up suggestions do not |

## Extensibility

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Project rules and persistent memory | 🟡 | Rules and project/session memory plus bounded automatic QMD recall in CLI and configured shared runners; weighted Brain features remain separate |
| Skills | ✅ | Lazy shared user/project/vendor/plugin discovery with source-qualified variants and paged loading |
| Custom agents and subagents | ✅ | Specialized agents and delegated isolated context |
| Agent teams | ➕ | Parallel team orchestration and shared task coordination |
| Lifecycle hooks | 🟡 | Seven command-hook events execute in CLI/runner; HTTP/prompt/agent/async types remain unsupported |
| MCP servers and tools | 🟡 | Stdio lifecycle and routed tools exist; remote OAuth/SSE/HTTP parity remains |
| Plugins | 🟡 | Morningstar JavaScript plugin API exists; Claude marketplace/schema parity remains |
| Plugin-bundled LSP servers | ⬜ | No general LSP client |
| Worktree-isolated subagents | 🟡 | Whole-session `--worktree` is implemented; automatic per-agent isolation remains |

## Integrations and product surfaces

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Browser automation | 🟡 | Direct Chrome DevTools integration; not the Claude in Chrome extension |
| GitHub/PR workflows | ✅ | GitHub CLI tools and structured PR review |
| IDE extension | ⬜ | Terminal-first product |
| Desktop application | ⬜ | Terminal-first product |
| GitHub Actions integration | ⬜ | No first-party Morningstar action |
| Private Remote Control | ✅ | Single-use QR pairing, shared terminal session, mobile chat and active connection menu |
| Anthropic account, billing or cloud sessions | N/A | Anthropic-owned services are not reproduced |
| Telegram gateway | ➕ | Remote chat, approvals, sessions, models, voice, and scheduling |
| HTTP API and web dashboard | ➕ | Local API surface and operational dashboard |

## Model and provider freedom

Morningstar keeps capabilities that do not exist in the Anthropic-only product:

- Multiple hosted providers through one CLI.
- Claude subscription access through the installed Claude CLI bridge.
- Local Ollama inference without an API key.
- Dynamic Ollama discovery from the live local catalog, including exact
  Hugging Face-backed IDs containing `/`.
- A two-level provider → model picker, with live provider API discovery,
  a 15-minute cache; unavailable catalogs do not invent working models.
- Model selection from both terminal and Telegram using the shared catalog.

Model discovery is read-only. Morningstar does not copy, move, quantize, train,
or delete model weights as part of the CLI picker.

## Current parity boundary

The core terminal coding loop is the parity priority and must remain
trustworthy across interactive mode, print mode, and Telegram. The remaining
gaps are primarily product-specific surfaces (IDE/Desktop/Anthropic cloud) and
newer interaction features (voice, generated suggestions,
customizable keybindings), plus deeper MCP/plugin/LSP compatibility.

A command is advertised only when its handler is available. Planned commands
remain capability-gated in `src/command-registry.ts` instead of appearing as
non-functional menu items.

## Public references

- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [Interactive mode](https://code.claude.com/docs/en/interactive-mode)
- [Commands reference](https://code.claude.com/docs/en/commands)
- [Permissions](https://code.claude.com/docs/en/permissions)
- [Features overview](https://code.claude.com/docs/en/features-overview)
- [MCP](https://code.claude.com/docs/en/mcp)
- [Plugins](https://code.claude.com/docs/en/plugins)
- [Chrome integration](https://code.claude.com/docs/en/chrome)
