# Morningstar CLI 1.5.1 — tool details and launcher updates

Tool activity separates status, commands, file paths, ordinary output and failures
with distinct colors. Completed calls show measured execution time and available exit
codes. A counted `+N Zeilen` marker opens the complete captured output; Escape returns
to the live session. File diffs retain line numbers and addition/deletion counts.
Missing timings and exit codes are not invented for denied or unexecuted tools.

Execution timing is excluded from no-progress detection: repeated identical tool
results still stop the loop, even when each call takes a different amount of time.

The Pinokio menu now includes **Update Morningstar**, using the same `morningstar update`
command as source installations. Install from a Git clone and stop the active Pinokio
terminal before updating. Pinokio's generated local agent instructions, cache and
workspace are excluded from source control and release packaging.

Validation includes focused runner, viewport, output-preview and distribution tests,
full public/private suites, and real macOS Ink/PTY checks at 110 and 74 columns.
The terminal checks ran actual successful/failing shell commands, observed distinct
colors, opened all omitted lines and returned to the preview. These are UI and tool
execution checks, not a claim of model quality or universal flicker-free rendering.
