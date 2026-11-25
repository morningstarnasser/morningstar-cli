# Morningstar CLI 1.3.0

Telegram now connects to the running terminal conversation through
`--channels telegram` or `/telegram on`. The setup, private-DM pairing and local
access controls follow Claude Code's Telegram channel workflow. Replies, work
status, approval buttons and cancellation share the terminal's state. Incoming
photos/text files and outgoing project files are supported, together with reactions
and edits to the bot's own messages. The existing standalone gateway remains separate.

Active subagents are pinned below the transcript with real task states and counts.
Completed workers leave the footer, hand their reports to the main agent, and the
main agent produces a consolidated answer. Reports are reference data and do not
prove their own claims. The main handoff retains permissions, cancellation and budget.

Markdown tables use one aligned header and compact rows on wide terminals, and
label/value output on narrow ones. Mouse reports split across input chunks are
buffered before the composer sees them. Repeated frames only redraw changed rows;
synchronized output reduces intermediate painting on terminals that support it.
This does not establish that every terminal is perceptually flicker-free.

Global Morningstar AGENTS now enter the CLI's system context. The evidence contract
requires testing uncertain claims, reproducing runtime bugs, preserving user work,
verifying each installation separately and reporting missing checks. Custom profiles
remain intact. Restart the CLI to load code and global instruction changes.

## Boundaries

- Private Telegram DMs only; terminal must remain open; one consumer per bot.
- No Telegram history/search or offline relay. Incoming PDF/binary interpretation
  is not provided. Image analysis depends on the selected model.
- Local learning remains evidence-based project memory, not weight training or
  automatic modification of executable source or permission rules.
- This implements the requested channel workflow; it is not a claim of complete
  Claude Code product or plugin compatibility.

## Verification scope

Focused tests cover authorization, pairing expiry/replay, session-bound approvals,
queue/stop behavior, cancellation during downloads, attachment bounds, file-send
policy, own-message edits, handoff failures, instructions, table layout, fragmented
input and incremental terminal rendering. They run twice after fixes, followed by
the full suite, typecheck and build. Production CLI PTY/ConPTY proofs use isolated
profiles and deterministic model/Telegram transports. The real Telegram getMe API
is checked separately; mock message exchanges are not a real phone round trip.
