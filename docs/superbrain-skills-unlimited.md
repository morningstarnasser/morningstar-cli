# Superbrain, shared skills and unlimited turns

Implemented 2026-11-24. This extends the shared runner; it does not claim complete
Claude Code feature parity.

## Defaults and controls

| Surface | Default turns | Explicit cap |
| --- | --- | --- |
| Terminal | Unlimited | `/max-turns <n>`; `0` / `unlimited` removes it |
| Print / NDJSON | Unlimited | `--max-turns <n>`; `0` removes it |
| One-shot cron | Unlimited | Headless configuration |
| Telegram | Unlimited when omitted / zero | Global `telegram.json` `maxTurns` |
| Delegated and parallel runs | Unlimited when omitted / zero | Caller `maxTurns` |
| Pure chat and side questions | One answer | Intentional, tools disabled |

Omitted `maxTurns` and `0` now mean unlimited in the headless API. Negative,
fractional and non-finite values fail validation. Existing explicit positive
Telegram settings remain explicit caps; change them to zero to opt out.
An answer, cancellation, permission failures, configured monetary budget, provider
error or a no-progress loop can still end a run. This removes the artificial turn
ceiling; it does not remove real model or machine resource limits.

`--context-chars <n>` controls the provider request budget (default 60000,
minimum 4000), independently of the output-token setting. The runner keeps the
system instructions, first/latest user requests and recent complete native tool
batches. Older messages become labelled extractive excerpts. This is lossy
compaction, not an LLM-generated semantic memory. If instructions alone exceed the
budget, the runner reports that instead of silently truncating them. Oversized
individual tool batches become excerpts; re-read relevant evidence in smaller
pieces. The full runner transcript remains available in `result.messages` and is
retained by terminal/print sessions. Telegram retains its existing chat-history
policy, independently of the per-run request compactor.

## Superbrain

Normal CLI, one-shot cron and Telegram configurations enable `autoKnowledge`. Headless embedders
opt in with `CLIConfig.autoKnowledge = true`. `--no-auto-knowledge` disables the
automatic prelude; authorized manual vault/skill tools remain available.

The prelude performs a bounded local QMD BM25 search in collection `obsidian` and
adds up to four attributed excerpts. It uses no new model or external service.
Repeated identical automatic searches reuse filtered public hits for at most 15 seconds (32 entries, memory-only); manual searches and note reads stay fresh. Missing QMD is reported as unavailable context and does not abort the task. Search
and get execute without a shell, with timeout, output bound and abort signal.

```bash
morningstar superbrain status
morningstar superbrain search <query>
morningstar superbrain vsearch <query>
morningstar superbrain get <relative-note.md> [start-line]
```

The native/text `vault` tool accepts the same commands. `get` returns up to 80
lines; advance the start line for longer notes. URI collection boundaries,
traversal, credentials, secrets, private records and session-log folders are
rejected. Search snippets from those locations are filtered before entering the
model. This is a path-based safeguard, not a content-based secret detector: public
notes must still be maintained without credentials. Retrieved notes are reference
data, can be stale, and do not grant authority or replace current evidence.

Automatic retrieval respects the active tool allowlist, deny/ask rules and trusted
PreToolUse/PostToolUse hooks. A lookup requiring approval is skipped automatically;
normal model tool calls can request approval through the normal runtime. Tool-less
side questions do not initiate new retrieval. Direct diagnostic CLI subcommands
are explicit local reads, similar to reading a file in the terminal.

## Skills

One metadata catalog serves the terminal and both tool protocols. Default roots:

- Project `.morningstar/skills`.
- Global `~/.morningstar/skills`, `~/.agents/skills`, `~/.claude/skills`,
  `~/.codex/skills` and `~/.codex/skills/.system`.
- `~/.kimi/skills`, `~/.kimi-code/skills`, `~/.pi/agent/skills`,
  `~/.qwen/skills`, `~/.gemini/skills`.
- The latest locally cached version of each Claude/Codex plugin's `skills` folder.
  A cached procedure is available independently of its original host's enablement;
  discovering it does not install or execute that plugin.

Global symlinks are followed, cycles stop, and canonical file duplicates collapse.
Distinct files with the same ID remain accessible through source-qualified IDs.
Project symlinks and escapes are rejected. No user skill files are copied or
modified. New skills appear after the five-second metadata cache expires.

```bash
morningstar skills status
morningstar skills list 2
morningstar skills search testing --page 2
morningstar skills load <id> [character-offset]
morningstar skills read <id> references/guide.md [character-offset]
```

Lists contain 30 entries per page; load/read contain up to 10000 characters with
continuation offsets. Individual files must be regular UTF-8 text, at most 256 KiB.
A source-qualified variant is a separate entry, not necessarily a distinct skill.
Package references cannot traverse or follow symlinks outside their package.
Only metadata and six candidate descriptions are included automatically. The model
must load the relevant procedure. Skills do not install their dependencies, grant
permissions, execute scripts on load or conjure unavailable host-specific tools.

## Executed validation

Tests cover 120 native tool rounds followed by completion, explicit caps, abort
beyond ten rounds, stable-versus-changing read results, bounded requests, preserved
native call/result groups, private-path filtering, policy/hook boundaries, shared
root discovery, duplicate/cycle handling, reference traversal and lazy pagination.
A built-CLI smoke test uses a synthetic streaming model with real local skill,
QMD and fixture-file tools for 120 rounds. No paid model or Telegram messages are
needed for this test. Additional real QMD search/get and complete catalog readback
verify the local installation. Local transcripts and installed skill inventories are not distributed.
