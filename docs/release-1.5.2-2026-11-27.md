# Morningstar CLI 1.5.2 — access context and empty answers

Unresolved requests such as “remember that and give me the status now” no longer become permanent project preferences. Explicit self-contained preferences and repeated verified checks remain supported. Existing mistaken notes can be disabled with `/learn forget <id>`.

Skills now carry an applicability reminder when loaded: instructions for a different agent or sandbox do not establish the current environment's capabilities. The system prompt directs the agent to inspect existing operator memory and documented access before claiming that a connection is missing, and distinguishes single status observations from stability over time. These instructions improve guidance; they are not a guarantee of model correctness.

An empty model completion now triggers one bounded request for an answer, retaining previous tool results. A second empty completion raises an explicit failure instead of completing silently. The Swarm planner keeps its existing separate three-attempt validation loop for empty or malformed JSON.

No credentials or operator profiles are distributed with the public product. Existing permission checks, denied actions and host-key verification remain in force. Source installations update with `morningstar update`; Pinokio exposes the same updater through **Update Morningstar**. Restart existing sessions after updating.

For recognized single endpoint/SSH status snapshots, the final-output guard scopes the observed German blanket stability and health claims to the actual measurements. It preserves values, quoted examples and code. Raw streaming deltas are unchanged; this is a narrow correction, not a general fact checker.

When a renewed status request names a previously measured endpoint, a response without a current remote-tool attempt triggers one refresh request. Repeating historical values without that attempt ends with an explicit error. Historical questions and unrelated status tasks are excluded. This check does not prove that every possible metric or host was covered.
