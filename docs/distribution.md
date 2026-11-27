# Public distribution

Only the public product belongs in this repository. User profiles, credentials, agent memories, host inventories, sessions and private integrations stay outside it. Export reviewed product files individually; never merge private repository history into this public history.

## Ollama

Install from the README, start Ollama and install a tool-capable model appropriate for your hardware. Then run:

```sh
npm run launch:ollama
# Or select an installed model explicitly:
npm run launch:ollama -- <installed-model-id> --dir /path/to/project
```

The launcher reads the running server's model catalog, prompts for a model and starts Morningstar with an explicit `ollama/` model. It respects `OLLAMA_HOST`, does not download models and does not change saved model defaults. Permission prompts stay enabled. The direct equivalent is `morningstar --model ollama/<installed-model-id>`.

**Upstream status:** Morningstar is not included in official `ollama launch` builds. That list is compiled into Ollama's [integration registry](https://github.com/ollama/ollama/blob/main/cmd/launch/registry.go). An [upstream proposal](https://github.com/ollama/ollama/issues/19941) has been submitted; maintainer acceptance is still required; a local helper is not official inclusion. Follow [Ollama's contribution process](https://github.com/ollama/ollama/blob/main/CONTRIBUTING.md), which asks for discussion before non-trivial pull requests. The npm package is not currently published; use the documented source installation.

## Pinokio

The repository includes a launcher in `pinokio/`, supported by versions with nested launcher discovery. Import the public repository URL in Pinokio, choose **Install**, then **Start with Ollama**. Requirements: Node.js 22+ in Pinokio's environment and an accessible Ollama server with an installed model. Installation stops if Node is too old; update that runtime and retry.

The terminal asks which installed model to use. Its initial working directory is `pinokio/workspace/`; use `/cd` to change projects. This folder and Pinokio's local state are ignored by Git. Morningstar still uses the current operating-system user's private configuration and session directory; Pinokio is not an OS security sandbox. The launcher performs no global npm installation, credential migration, automatic model download or permission bypass.

**Rebuild / repair** runs the locked dependency installation and rebuild. For updates, stop the app and choose **Update Morningstar**, which runs the verified source updater on its configured upstream. `morningstar update` is the terminal equivalent. No automatic reset or deletion of user work is provided. Inclusion in Pinokio's Discover catalog is a separate maintainer decision; the repository launcher does not imply verified catalog status. See the [Pinokio manual](https://desktop.pinokio.co/docs/).

## Awesome lists

A factual listing sentence:

> Morningstar CLI is an MIT-licensed terminal coding agent with Ollama and cloud providers, visible tool execution, parallel agents and resumable sessions.

Potential directories include [Awesome Agents](https://github.com/kyrolabs/awesome-agents) and [Awesome AI Coding Agents](https://github.com/collabnix/awesome-ai-coding-agents). Read each repository's current rules before submission. Awesome Agents requires maintained open-source projects with demonstrated traction; new repositories without traction are excluded. Do not invent usage, benchmarks, stars or acceptance, and do not submit to lists whose thresholds are unmet.

## Release hygiene

Run on the public checkout before every release or public push:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run hygiene:worktree
# After selecting and staging the intended files:
npm run hygiene
gitleaks git . --redact
osv-scanner scan source -r .
npm pack
```

Extract the generated archive into a temporary directory, then run:

```sh
node scripts/check-public-hygiene.mjs --package /path/to/extracted/package
gitleaks dir /path/to/extracted/package --redact
```

Install that exact archive into a separate prefix and check `morningstar --version`, `--help`, and an isolated task with a real provider. Do not call a unit test a provider or terminal E2E test. Record the OS, commit, commands, failures and untested platforms. Check the final diff, license, README claims and generated `dist/` files. Recheck relevant findings before publishing; scanning is not a guarantee.

The GitHub workflow repeats the automated checks on pushes and pull requests, with read-only repository permissions and pinned scanner versions/action revisions. It does not publish npm packages or submit upstream listings. Local commands are still required before pushing: CI cannot prevent a secret from entering Git history in the first place.

The Pinokio menu includes **Update Morningstar** after installation. It invokes the
same verified updater from the product checkout. Stop its running terminal first.
Install the launcher from a Git clone so that the configured upstream is available.

## Updating an existing source installation

Version 1.5.0 adds `morningstar update` and `morningstar update --check` (also
`--json`). It updates the installed Git checkout, independent of the current working
directory, using that checkout's configured tracking remote and branch. Public and
private installations keep their respective sources. No npm-registry release is
required for this source-installation path.

The update refuses dirty, untracked, detached or divergent checkouts. It prepares
locked dependencies and verifies typecheck, build and executable version in a separate
worktree, then fast-forwards and checks the installed version. A failed preparation
preserves the live checkout. A failed activation reports the remaining state and keeps
its dependency backup when recovery cannot be verified; it never resets user commits.
A lock prevents overlapping updater runs. After a forced process termination, inspect
`morningstar-update.lock` in the Git common directory and remove it only after confirming
that its process is no longer running. Run updates outside an active Morningstar session
and restart all existing sessions afterwards.

Automated verification covers real local Git remotes and npm, failure recovery, local
changes, tracking branches, command argument handling, and check/update exit codes.
An update's own startup check is not a full model or external-service E2E test.
