# Morningstar CLI 1.3.4

Ollama now receives native tool definitions. Previously it was missing from the
native-tool provider list, so local models could print incomplete XML-like calls
instead of executing a tool. The runner recognizes incomplete calls after prose,
requests a bounded correction and reports repeated failures as errors. It never
guesses missing arguments or executes a partly malformed batch.

Large Ollama tool catalogs are selected per request. Core tools remain available;
up to eight matching MCP tools keep their complete parameter schemas. `tool_search`
finds connected tools for the next turn without changing execution permissions.
Small catalogs and other providers keep their existing schema behavior.

Malformed legacy assistant calls are labelled as invalid evidence in provider
requests, so resumed conversations do not repeat broken XML examples. Stored
transcripts stay intact. The read-only status adapter supplies tested uptime
formatting and memory percentages alongside unchanged raw measurements.
A narrow final-answer guard scopes the observed standalone German blanket-health
phrases after metrics-only reads. Quoted examples and code stay intact. This is
not a general fact checker; raw streaming deltas are unchanged.

The current native call/result batch also survives context compaction. Oversized
result text is shortened with an explicit notice in the provider copy; exact
call IDs and arguments remain intact and full results stay in session history.
This prevents repeated calls after a large service-list response.

Telegram uses one live progress message with recent tool steps, active workers,
elapsed time and a Stop button. The final answer replaces that message. Headings,
code and emphasis render as Telegram HTML; tables become compact labelled rows.
Long answers split into independently balanced pages. Model-supplied HTML is
escaped and unsafe links are not activated. Status and Help buttons remain after
completion, and `/status`, `/help` and `/stop` appear in the bot command menu.

Final-delivery failures are retained for retry. Failed runs and malformed tool
attempts cannot become successful completion notices. Pairing, account/session
binding, approval rules and the single-consumer requirement remain enforced.

Validation distinguishes unit/integration fixtures from real provider and Telegram
round trips. Two isolated Windows runs using the configured local model and real
read-only MCP status tool returned measured server values. The complete Telegram
DM round trip requires a running updated terminal session and a user-side message.
