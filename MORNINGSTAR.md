# Morningstar CLI project guide

Morningstar is a TypeScript/Node.js 22 terminal coding agent using React and Ink.
Read [AGENTS.md](AGENTS.md) for development rules and [CLAUDE.md](CLAUDE.md) for
current runtime contracts. [README.md](README.md) documents installation, providers,
permissions, sessions, skills, search, teams and private Remote Control.

The canonical model/tool/policy loop lives in `src/agent-runner.ts`. Terminal UI
is in `src/app.tsx` and `src/components/`; noninteractive commands start in
`src/index.ts`. Generated `dist/` must be rebuilt from source before publication.

Turns have no default fixed cap. Explicit budgets, cancellation, policy and
no-progress detection still apply. Models and skills are discovered from each
user's own configured environment; no account, model weights, personal skills,
vault, host inventory or runtime state is bundled with this repository.

Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`. See the
[1.1.1 release notes](docs/release-1.1.1-2026-11-24.md) for the current changes.
