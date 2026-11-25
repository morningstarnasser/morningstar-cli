# Morningstar CLI 1.2.0

This release fixes explicit Swarm planning, keeps the composer and work status live
while scrolling, enables project learning, and fills two everyday workflow gaps.

- `/swarm` validates complete plans and retries invalid model output up to three
  times. Empty, truncated or invalid plans never launch workers. Local plan files,
  aborts and budgets produce clear errors without inappropriate retries.
- Ordinary scrollback keeps a live composer and work status. Typing preserves the
  reading position; downward scrolling to the latest output resumes following.
  Search, detail inspection and selection retain their dedicated behavior.
- Learning is enabled for persisted root runs. Explicit durable user corrections
  become project notes; recognized verification commands need real exit status 0
  in two separate runs. Failed checks lose active confidence. `/learn` shows evidence,
  toggles learning, or deactivates a rule. `--no-self-improvement` disables recall
  and generation. Ephemeral sessions and nested workers do not learn.
- `Ctrl+R` filters prompt history. Enter/Tab copies the match into the composer for
  editing, without sending it; Esc restores the draft without cancelling work.
- `/review [focus]` runs an isolated, enforced read-only review. Fixed Git commands
  supply staged and unstaged diffs; external diff drivers and textconv are disabled.
  No shell, mutations, delegation or automatic test execution are permitted.

Learning changes local project reference notes, not model weights or executable
source. Notes never grant permissions or establish that current tests passed.
Imported notes are not automatically activated; credentials are excluded.

## Comparison and selection

Checked against the installed Codex CLI help and current official
[Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli),
[Codex command documentation](https://learn.chatgpt.com/docs/developer-commands),
and [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode).
These are behavioral references, not claims of full product equivalence.

| Everyday capability | Morningstar result |
| --- | --- |
| Persisted prompts and quick recall | Existing ↑/↓ retained; live Ctrl+R search now wired into the composer |
| Reading output while work continues | Live composer/status and bottom-follow added |
| Review before accepting changes | Read-only `/review` added, including staged and unstaged diffs |
| Durable project knowledge | Active corrections and verified-check learning added with controls |
| Resume, rename, fork/branch, rewind | Existing session and checkpoint implementation retained |
| Plan mode, approvals, steering and queues | Existing shared policy and composer flows retained |
| Background commands and progress | Existing background process tools and work log retained |
| Skills, hooks, MCP and worktrees | Existing integrations retained; remaining differences listed in PARITY.md |

Voice input, user-defined keymaps, a general LSP client and vendor-hosted services
remain outside this release. They are not required to repair these daily coding flows.

## Verification

Focused regression suites cover recovery, budgets, aborts, read-only review, real
Git snapshots, learning persistence and negative trust cases, Ctrl+R, and live scrollback.
The focused suites run twice after fixes, followed by the complete suite, typecheck
and build. Terminal proofs exercise production components in real PTY/ConPTY
sessions; isolated installed-CLI processes verify learning across restarts. A real
Ollama model also exercises planning, retry and dependent Swarm tasks.

User settings and the older dirty Windows checkout are preserved. Restart running
CLI sessions to load this version. Private profiles, learning files and machine
addresses are excluded from the public export.
