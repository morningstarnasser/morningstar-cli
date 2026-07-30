# Claude Code Parity — Morningstar CLI

Last audited: 2026-07-29

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
| Multi-turn tool feedback loop | ✅ | One bounded runner with abort, usage, turn limit, and loop detection |
| Permission decision before execution | ✅ | Deny-first policy, exact approval prompt, workspace guards |
| Permission modes | ✅ | `ask`, `acceptEdits`, `plan`, `strict`, `dontAsk`, `auto`, `delegate`, and explicit bypass |
| Per-user and per-project settings | ✅ | Morningstar settings and local project overrides |
| Direct `!` shell mode | ✅ | Uses the same policy and approval path as model-requested Bash |
| Plan mode | 🟡 | Mutation denial exists; the full Claude plan-review interaction is not identical |
| Checkpoints and rewind | ✅ | Conversation checkpoints plus git-aware snapshots |
| Conversation compaction | ✅ | Budget-based runtime compaction and `/compact` |
| Session save, resume, rename, and history | ✅ | Persistent sessions and searchable history |
| Conversation branching | ➕ | Named branch, switch, merge, and delete workflows |
| Auto-test after edits | ➕ | Detects project test runners and verifies changed files |

## Terminal interaction

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Slash-command discovery and filtering | ✅ | Typed registry drives autocomplete, help, aliases, and availability |
| Project/file mentions | ✅ | Files, folders, globs, git, diffs, URLs, tree, and codebase context |
| Command history | ✅ | Persistent per-user input history |
| Reverse history search | ✅ | Morningstar history search component |
| Vim input mode | ✅ | Toggleable Vim input hook |
| Background commands | ✅ | Background process tools with status and output retrieval |
| Task/progress display | ✅ | Live turn, tool, duration, and token progress |
| Responsive terminal layout | ✅ | Explicit compact/comfortable/wide behavior at 60/80/120 columns |
| Custom keybinding file | ⬜ | Built-in input handling only |
| Full-screen transcript viewer | ⬜ | Classic inline Ink transcript only |
| Terminal voice input | ⬜ | Telegram transcription exists, but not terminal voice input |
| `/btw` side-question flow | ⬜ | No isolated side-question context yet |
| Generated prompt suggestions | ⬜ | Command/file completion exists; AI follow-up suggestions do not |

## Extensibility

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Project rules and persistent memory | 🟡 | Rules, project/session memory, and Vault work in terminal; weighted Brain recall remains Telegram-specific |
| Skills | ✅ | User/project skill discovery and runtime loading |
| Custom agents and subagents | ✅ | Specialized agents and delegated isolated context |
| Agent teams | ➕ | Parallel team orchestration and shared task coordination |
| Lifecycle hooks | 🟡 | Morningstar hooks exist; not every documented Claude event/type is equivalent |
| MCP servers and tools | 🟡 | Stdio lifecycle and routed tools exist; remote OAuth/SSE/HTTP parity remains |
| Plugins | 🟡 | Morningstar JavaScript plugin API exists; Claude marketplace/schema parity remains |
| Plugin-bundled LSP servers | ⬜ | No general LSP client |
| Worktree-isolated subagents | ⬜ | Delegation exists without Claude-compatible worktree isolation |

## Integrations and product surfaces

| Public workflow | Morningstar status | Implementation note |
|---|---:|---|
| Browser automation | 🟡 | Direct Chrome DevTools integration; not the Claude in Chrome extension |
| GitHub/PR workflows | ✅ | GitHub CLI tools and structured PR review |
| IDE extension | ⬜ | Terminal-first product |
| Desktop application | ⬜ | Terminal-first product |
| GitHub Actions integration | ⬜ | No first-party Morningstar action |
| Anthropic account, billing, remote-control, or cloud sessions | N/A | Anthropic-owned services are not reproduced |
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
  a 15-minute cache, and static offline fallbacks.
- Model selection from both terminal and Telegram using the shared catalog.

Model discovery is read-only. Morningstar does not copy, move, quantize, train,
or delete model weights as part of the CLI picker.

## Current parity boundary

The core terminal coding loop is the parity priority and must remain
trustworthy across interactive mode, print mode, and Telegram. The remaining
gaps are primarily product-specific surfaces (IDE/Desktop/Anthropic cloud) and
newer interaction features (fullscreen, voice, generated suggestions,
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
