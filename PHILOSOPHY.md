# Morningstar / Carry Philosophy

> Adapted from the coordination philosophy of [claw-code](https://github.com/ultraworkers/claw-code).
> Where claw-code is a Rust harness driven from Discord, Carry is a TypeScript harness
> driven from Telegram and a local terminal. The lesson is the same; the surface differs.

## Stop Staring at the Files

If you only read `src/`, you are looking at the wrong layer.

The terminal UI is a byproduct. The Telegram gateway is a byproduct. The real thing worth
studying is the **loop that produces work**: a human gives direction from a phone, an
autonomous agent decomposes it into tool calls, executes them under an explicit permission
policy, verifies the result, and reports back — without the human sitting in a terminal
micromanaging every step.

Carry is not just a CLI. It is the same agent core exposed through two faces:

- an **Ink-based terminal REPL** for hands-on work at the desk, and
- a **Telegram gateway** for direction-from-anywhere.

Both faces share one runtime: the same tool registry, the same permission/policy engine,
the same memory (Brain), the same model-fallback chain.

## The Human Interface Is the Chat

The important interface is not tmux, Vim, or SSH.

The real human interface is a **Telegram chat** (and, at the desk, the terminal).

A person types a sentence from a phone, walks away, sleeps, or does something else. The agent
reads the directive, breaks it into tool calls, runs them, recovers from failures, persists
what it learned, and replies when the work passes or when it genuinely needs a decision.

That is the philosophy: **humans set direction; the agent performs the labor.**

## The Coordination Layer

Carry keeps the core loop local and can optionally lean on one remote peer:

### 1. The local runtime (Carry)
Sensing, hands, and voice: tool execution, file ops under workspace boundaries, bash under a
read-only/destructive classifier, MCP clients, Skills, Plugins, and the Brain. This is where
direction becomes execution.

### 2. Optional remote operator
The compatibility bridge (`src/jerry-bridge.ts`) can delegate a bounded task to a
user-configured Hermes-compatible operator over SSH. The legacy tool name remains for backwards
compatibility, but hosts, credentials, accounts, skills, and infrastructure state live only in a
trusted parent environment. Carry delegates remote-shaped tasks instead of pretending to be a server.

### 3. The memory (Brain + Vault)
Notification, recall, and self-improvement happen **outside** the model context window where
possible: episodic logs, distilled lessons, and the Obsidian vault (`src/vault.ts`,
`src/brain/*`). The agent stays focused on the task; the memory layer carries continuity across
turns and sessions.

## Permission by Default

The agent does not get "everything allowed." Every tool call is evaluated by a policy engine
(`src/policy-engine.ts`) and a permission layer (`src/permissions.ts`) with a risk verdict before
it runs. The Telegram path runs in **strict** mode by default — remote direction earns less
trust than a human sitting at the keyboard. File ops enforce workspace boundaries and size
limits (`src/file-guards.ts`); bash is classified read-only vs destructive (`src/safety.ts`).

This mirrors claw-code's three permission modes (read-only / workspace-write / full-access) and
its `claw-analog` read-only auditable agent.

## The Real Bottleneck Changed

When an agent can rebuild a feature in minutes, typing speed stops being the constraint. The
scarce resources become **architectural clarity, task decomposition, judgment, and taste** — and
**not breaking what already works**. Carry is built to be extended additively: new tools, new
runtime modules, new memory, without disturbing the live Telegram gateway that people depend on.

The code is evidence. The loop is the point.
