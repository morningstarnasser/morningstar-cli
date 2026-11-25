# Morningstar CLI 1.1.2 — 2026-11-25

Up and Down now recall submitted inputs even while an agent is working or after
scrolling through output. Up moves to older entries; Down moves forward and
restores the unsent draft after the newest entry. Recalling never submits a
message or removes a queued request. History remains available across restarts.

Open command/file suggestions and transcript search keep their own arrow
navigation. Recalling a slash command or file mention does not open completions
that would intercept the next history key. Editing or clearing a recalled input
starts fresh navigation. Multiline text and Unicode drafts survive a round-trip.

Use the mouse wheel or Page Up/Down to scroll output. Plain arrows return from
scrollback to the live composer. To edit the latest queued message, press Alt+Up
with an empty composer while the agent is working. The footer and help show the
updated shortcuts.

The regression suite exercises real Ink keyboard dispatch, persistence in an
isolated temporary directory, draft restoration, queue preservation and menu
priority. Terminal checks use the production components in a synthetic work
fixture; they measure keyboard behavior rather than model inference. No model,
provider, permissions or connector configuration needs to change for this update.
