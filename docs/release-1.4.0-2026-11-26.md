# Morningstar CLI 1.4.0

File links in assistant answers now open a document preview inside the terminal.
The visible label remains clickable after the answer moves into scrollback.
Numbered links also work through `/open <number>`; paths support spaces, file URLs
and line positions. Web URLs retain their ordinary text representation.

`Ctrl+B` and `/sidebar` open the workspace navigator: documents, live agent details
and saved project sessions. Wide terminals show the list beside the preview;
below 88 columns, Tab switches between them. Mouse, keyboard, resize and returning
to the composer use the existing terminal viewport. The navigator never submits
a prompt. Work continues behind it, status remains visible, and Esc returns to the
chat without discarding its draft. Session switching requires an idle session and
no pending dialog; R resumes the selected session through the existing controller.

Markdown previews render headings, lists, code and nested document links. Files
are read on demand, not injected into the model context or Telegram output.
Workspace and configured Vault boundaries, symlink checks, file type/size limits
and credential-path exclusions apply. Existing QMD links use the existing read-only
QMD integration. No new network endpoint or dependency is introduced.

Tests cover local/Vault reads, file URLs, spaces, line positions, unsafe schemes,
traversal, symlinks, binary/large files, terminal escape stripping, wrapped link
hit testing, nested previews, responsive layout, live agent updates, blocked
session switches and restoration of live output. An existing process needs to
restart to load the new renderer.
