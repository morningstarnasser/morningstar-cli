# Morningstar CLI 1.3.3

Fixes conversations failing before the model request when many MCP tools are
connected. The TUI used to persist the full catalog in the system prompt, and the
runner added it again. A large catalog could exceed the default 60,000-character
request budget even for a short greeting.

The runner now adds the current catalog once. Large catalogs use a bounded index
of every exact tool name; complete native schemas and tool permissions remain
unchanged. Generated catalogs in older session prompts are replaced for the
provider request, while stored history and surrounding instructions are retained.

Telegram now labels failed model turns as failures instead of showing a completed
task status. Existing error markers from older sessions are also recognized.

Regression coverage includes a 128-tool catalog, complete native schemas, restored
legacy sessions, the normal context budget, and both current and legacy Telegram
error outcomes. Real external round trips are documented separately from fixtures.
