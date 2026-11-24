# Morningstar CLI 1.1.1 — 2026-11-24

Local Ollama models could finish with an incomplete text tool call instead of
returning measured status values. The shared runner now requests up to two valid
corrections through the normal tool and permission loop. It never executes a
broken string or guesses an MCP alias. Exhaustion is an explicit protocol failure,
including a failed swarm worker and a nonzero print-mode exit.

## Live status

The current MCP tool registry is included in every request, including print mode.
A skill description alone does not imply that its connector exists. Trusted
server settings can opt into startup with `autoConnect: true`; other servers stay
manual. Failed connections are reported, and child clients close on exit.

`morningstar status-mcp <operator-config.json>` provides a read-only bridge to
existing JSON monitoring endpoints. Only configured entities are accepted. Tool
arguments cannot supply URLs or commands, redirects are rejected, and responses
have time and size limits. No new public monitoring endpoint is deployed.
The explicit `ollama/<model>` route now selects Ollama and preserves model case.

## Terminal behavior

- Ctrl+F and `/find [text]` search retained output with highlighted matches and a
  match counter. Enter/Down advances, Up goes back, and Esc returns live while
  preserving the draft. Work continues during inspection.
- Forwarded macOS Cmd+F is supported. If the terminal owns that shortcut, use
  Ctrl+F or `/find`; application code cannot override a key it never receives.
- The composer, mode and context footer stay at the bottom after completion,
  multiline paste and resize. Long streaming output cannot erase its completed
  answer during the transition to static history.
- Bracketed-paste delimiters no longer appear in multiline drafts.

## Verification

Actual local Ollama models on macOS and Windows called an operator-configured test
status connector and returned the measured values and timestamp. Host targets are operator configuration and are not included in the repository.
Search/docking checks use real PTYs and Ink output on macOS, Windows ConPTY and
Linux. The Windows run uses the real model and status call; Mac/Linux keyboard
and resize checks use a synthetic work fixture. Model evidence and UI fixture
evidence are recorded separately.

The full suite covers protocol repair, policy denial, worker failure propagation,
MCP startup, response bounds/redirect rejection, Unicode search, navigation and
bottom-dock coordinates. macOS: 605 passed; Windows: 602 passed, three platform
skips; Linux: 21 focused tests passed. Typecheck and build passed. OSV reported
zero findings for the root and website lockfiles. The actual CLI `/help` →
`/find activity` → Esc path was also checked on macOS.

Operational settings, host inventories and local test transcripts are excluded from this source distribution. Restart existing CLI processes
to load the new build.
