# Morningstar CLI 1.5.0 — source updates

`morningstar update` updates the installed Git checkout from its existing tracking
remote and branch. `--check` checks without installation; `--json` emits one result
object. Run it outside an active Morningstar session, then restart existing sessions.

The former `/update` implementation threw `ReferenceError: __dirname is not defined`
in ESM. Installation discovery now uses the module location and never the caller's
working directory. The launcher routes updates before loading application dependencies,
project settings or model credentials. `/update` checks asynchronously in the TUI;
`/update run` gives the terminal command.

Updates refuse local edits, untracked files, detached HEADs and divergent commits.
Preparation uses a separate worktree, locked npm dependencies, typecheck, build and an
executable version check. Only a checked candidate is activated by fast-forward, followed
by another installed-version check. Failures preserve the current installation during
preparation; dependency moves are restored after a failed merge. If recovery cannot be
verified, the updater reports that and retains its backup. It never resets Git history.
Private installations keep their configured private remote. No public fallback is used.

A checkout-wide lock prevents overlapping updater runs. A dedicated temporary Git ref
avoids races with another fetch's FETCH_HEAD. Commands use argument arrays without shell
interpolation; Windows npm runs through its JavaScript entry point. Source, generated
runtime and launcher files use LF through `.gitattributes` so Windows builds do not
introduce mixed line endings. Existing checkouts with generated-file drift should be
preserved and replaced by a fresh checkout before relinking, as described in the README.

Validation for the updater implementation:

- 20 focused tests passed twice on macOS, including real isolated Git/npm updates,
  non-main tracking branches, same-version commits, dirty/divergent states, candidate
  failure, mid-build edits, failed activation recovery, hooks, cancellation and argv.
- Full macOS suites: 711 public tests and 707 private tests passed.
- Windows PC: 20 focused tests passed twice; full suite 704 passed, 3 skipped,
  0 failed. Typecheck/build and installed private-upstream check passed.
- Actual macOS TUI: `/update run` instructions and asynchronous `/update` result observed.
- Public Linux CI passed for the updater implementation.
- Public source/lockfile scan: OSV found no issues; public history, staged diff and actual
  npm archive passed Gitleaks. The archive was installed in a clean prefix; version and
  unsupported non-Git update behavior were checked.

An updater startup check is not a model-quality or external-service E2E test. Packages
installed without Git must use their original installation method. The npm registry
package remains unpublished; this release supports the documented source/npm-link path.
