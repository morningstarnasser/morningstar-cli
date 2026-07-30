# Repository Guidelines

## Project Structure and Architecture

Morningstar CLI is a Node.js 22+ ESM TypeScript project. `src/index.ts` owns
Commander bootstrap and runtime selection; `src/app.tsx` owns the Ink TUI and
slash-command routing; `src/agent-runner.ts` is the shared model → policy → tool
loop. Keep provider, tool, permission, and policy behavior in their dedicated
modules instead of adding more logic to `app.tsx`. Terminal components live in
`src/components/`; integrations live in `src/telegram/`, `src/providers/`, and
`src/runtime/`. Tests mirror behavior under `test/*.test.ts`. `website/` is a
separate Next.js application with its own package and lockfile.

## Build, Test, and Development Commands

- `npm ci` — install root dependencies from the lockfile.
- `npm run dev` — run the TypeScript CLI through `tsx`.
- `npm run typecheck` — strict TypeScript validation without output.
- `npm test` — run all `node:test` suites.
- `node --import tsx --test test/<name>.test.ts` — run a focused suite.
- `npm run build` — compile `src/` to tracked `dist/`.
- `npm --prefix website run build` — validate website changes.

For runtime changes, run the focused test, typecheck, full tests, and build.

## Coding Style and Security

Use strict TypeScript, two-space indentation, double quotes, semicolons, and
`.js` suffixes in relative ESM imports. Prefer explicit types at module and
security boundaries. Keep parsing, authorization, approval, and execution
separate.

Treat model output, project files, URLs, MCP payloads, provider responses, and
Telegram input as untrusted. Reuse the policy engine and workspace guards.
Unknown or mutating actions fail closed. Preserve traversal, symlink, SSRF,
redirect, response-size, dashboard-authentication, and environment-variable
protections. Every trust-boundary change needs a negative regression test.
Never commit keys, bot tokens, passwords, `.env` files, or user state.

## Generated Files and Git

Do not hand-edit `dist/`; `bin/morningstar.js` loads `dist/index.js`. Regenerate
and commit matching JavaScript, declarations, and source maps after `src/`
changes. Preserve unrelated work and never reset, clean, amend, rewrite history,
or force-push without explicit instruction. Follow the existing Conventional
Commit style (`feat(scope):`, `fix(scope):`, `test(scope):`, `docs:`,
`chore(build):`).
