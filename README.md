<div align="center">

# Morningstar CLI

**Terminal-based AI Coding Assistant powered by DeepSeek R1**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-R1_Reasoner-4A90D9?style=flat-square)](https://deepseek.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

Morningstar is a fully-featured AI coding assistant that lives in your terminal — inspired by Claude Code. It connects to **DeepSeek R1** (Reasoning model), streams responses in real-time with **Plan display** (visible thinking), and provides **40+ slash commands**, **9 tools**, **custom agents**, **memory**, **todos**, **session history**, **undo**, **themes**, and more.

---

## Demo

```
$ morningstar

  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║                    . .  ★  . .                           ║
  ║                   .  ./ . \.  .                          ║
  ║                  .  /  . | .  \  .                       ║
  ║                  ── * ─────+───── * ──                   ║
  ║                  .  \  . | .  /  .                       ║
  ║                   .  .\ . /.  .                          ║
  ║                    . .  ★  . .                           ║
  ║                                                          ║
  ║              M O R N I N G S T A R                       ║
  ║              ━━━━━━━━━━━━━━━━━━━━━━                      ║
  ║           Terminal AI Coding Assistant                    ║
  ║           Powered by Mr.Morningstar                      ║
  ║           github.com/morningstarnasser                   ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────┐
  │ ★ Model    deepseek-reasoner (R1 Thinking)           │
  │ ★ Projekt  my-app (TypeScript / Next.js)             │
  │ ★ Branch   main                                      │
  │ ★ CWD      /Users/dev/my-app                         │
  │ ★ Theme    Morningstar Default                        │
  └──────────────────────────────────────────────────────┘

  Tools   read · write · edit · bash · grep · glob · ls · git
  Agents  code · debug · review · refactor · architect · test
  Hilfe   /help · /features · /agents · /agent:create · /quit

    2 offene Aufgabe(n) — /todo list
    3 Notiz(en) gespeichert — /memory list
  ────────────────────────────────────────────────────────────

> Analysiere dieses Projekt und finde Probleme

  ┌─ Plan ──────────────────────────────────────────────┐
  │ Ich schaue mir zuerst die Projektstruktur an,       │
  │ dann lese ich die Hauptdateien...                   │
  └─────────────────────────────────────────────────────┘

  ★ Ich analysiere die Struktur...

  ✓ [ls]
    src/
    package.json
    tsconfig.json
    ...

  ★ Jetzt lese ich die Hauptdateien...

  ✓ [read] src/app/page.tsx
    1│ import ...
    2│ export default function Home() {
    ...

  ★ Ich habe 3 Probleme gefunden:

  ✓ [edit] src/app/page.tsx
  - const data = fetchData()
  + const data = await fetchData()
```

---

## Features

### Core
- **DeepSeek R1 Reasoning** — thinks step-by-step before answering
- **Plan Display** — visible reasoning/thinking in styled box (like Claude Code)
- **Real-time Streaming** — responses appear token-by-token
- **Multi-Turn Tool Execution** — AI chains tool calls automatically (up to 5 rounds)
- **Automatic Project Detection** — detects language, framework, and git branch
- **Custom Agent System** — create, edit, delete, import/export your own agents
- **Memory System** — persistent notes across sessions
- **Todo System** — task management with priorities
- **Session History** — save and restore conversations
- **Undo System** — revert file changes with full undo stack
- **6 Themes** — customizable terminal color themes
- **Colored Diffs** — red (old) / blue (new) for edit operations
- **Input Buffering** — type while AI is still processing
- **Smart Autocomplete** — tab completion for all slash commands
- **Crash-Proof** — global error handlers prevent any crash

### 9 Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read files with line numbers |
| `write` | Create/overwrite files (auto-creates directories, with undo) |
| `edit` | Find & replace in files (colored diff, with undo) |
| `delete` | Delete files (with undo) |
| `bash` | Execute shell commands (30s timeout) |
| `grep` | Search for patterns across files |
| `glob` | Find files by glob pattern (e.g. `**/*.ts`) |
| `ls` | List directory contents with file sizes |
| `git` | Git status + last 5 commits |

### 6 Built-in Agents

| Agent | Command | Focus |
|-------|---------|-------|
| Code | `/agent:code` | Write code, implement features, create files |
| Debug | `/agent:debug` | Find bugs, root cause analysis |
| Review | `/agent:review` | Code review, security, performance analysis |
| Refactor | `/agent:refactor` | Code cleanup, optimization |
| Architect | `/agent:architect` | System design, architecture planning |
| Test | `/agent:test` | Write tests, improve coverage |

### Custom Agents

Create your own specialized agents with custom system prompts:

```
> /agent:create

  Neuer Agent erstellen:

  ID (z.B. security):  security
  Name:                 Security Agent
  Beschreibung:         Security Audits und Vulnerability Scanning
  Farbe (#hex):         #ef4444

  System Prompt (mehrzeilig, leere Zeile zum Beenden):
  Du bist ein Security-Experte...

  ✓ Agent "security" erstellt! Aktiviere mit /agent:security
```

Custom agents are stored persistently in `~/.morningstar/agents.json` and support export/import for sharing.

---

## Installation

### Prerequisites
- **Node.js** 18+
- **DeepSeek API Key** ([get one here](https://platform.deepseek.com))

### From Source

```bash
git clone https://github.com/morningstarnasser/morningstar-cli.git
cd morningstar-cli
npm install
npm run build
npm link
```

Now `morningstar` is available globally in your terminal.

### Set API Key

```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

Or create a `.env` file in your project directory:
```
DEEPSEEK_API_KEY=sk-your-key-here
```

Or configure via the CLI:
```
> /config set apiKey sk-your-key-here
```

---

## Usage

```bash
# Start in any project directory
morningstar

# Start in a specific directory
morningstar --dir /path/to/project

# Chat-only mode (no file tools)
morningstar --chat

# Use a different model
morningstar --model deepseek-chat
```

### Example Prompts

```
> Erklaere mir src/app/page.tsx
> Schreibe eine REST API mit Authentication
> Finde alle TODO Kommentare im Projekt
> /agent:debug Warum crasht die App beim Login?
> /agent:code Fuege Dark Mode hinzu
> /agent:review Analysiere src/auth.ts auf Security
```

---

## All Commands (40+)

### General

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/features` | Show all features, tools, and agents |
| `/clear` | Reset conversation history |
| `/compact` | Compress conversation (keep recent messages) |
| `/quit` | Exit (also `/exit`, `/q`) |

### AI & Model

| Command | Description |
|---------|-------------|
| `/model <id>` | Switch model (`deepseek-reasoner`, `deepseek-chat`) |
| `/context` | Show detected project info |
| `/cost` | Show estimated token usage |
| `/stats` | Session statistics (uptime, messages, tools used) |
| `/plan` | Toggle plan mode (think before acting) |

### Agents

| Command | Description |
|---------|-------------|
| `/agents` | List available agents |
| `/agent:<id>` | Activate agent (e.g. `/agent:code`, `/agent:debug`) |
| `/agent:off` | Deactivate agent, return to default mode |
| `/agent:create` | Interactive wizard to create a custom agent |
| `/agent:edit <id>` | Edit a custom agent |
| `/agent:delete <id>` | Delete a custom agent |
| `/agent:show <id>` | Show full agent details including system prompt |
| `/agent:list` | List all agents (built-in + custom) |
| `/agent:export <id>` | Export agent as JSON |
| `/agent:import` | Import agent from JSON |

### Memory

| Command | Description |
|---------|-------------|
| `/memory add <text>` | Save a persistent note |
| `/memory list` | Show all notes |
| `/memory search <q>` | Search notes |
| `/memory remove <n>` | Remove a note |
| `/memory clear` | Clear all notes |

### Todos

| Command | Description |
|---------|-------------|
| `/todo add <text>` | Add a task (supports `!high` priority) |
| `/todo list` | Show all tasks |
| `/todo done <id>` | Toggle task done/undone |
| `/todo remove <id>` | Remove a task |
| `/todo clear` | Clear completed tasks |

### Git

| Command | Description |
|---------|-------------|
| `/diff` | Show git diff |
| `/diff staged` | Show staged changes |
| `/commit` | Smart commit (AI analyzes changes and suggests message) |
| `/log` | Show git log |
| `/branch` | Show branches |
| `/status` | Show git status |

### Files & Project

| Command | Description |
|---------|-------------|
| `/init` | Create MORNINGSTAR.md project note |
| `/undo` | Undo last file change |
| `/undo list` | Show undo stack |
| `/search <query>` | Search project files (grep) |

### History & Sessions

| Command | Description |
|---------|-------------|
| `/history save <name>` | Save current conversation |
| `/history list` | List saved sessions |
| `/history load <id>` | Load a saved session |
| `/history delete <id>` | Delete a saved session |

### Appearance & Config

| Command | Description |
|---------|-------------|
| `/theme` | Show current theme |
| `/theme <name>` | Set theme (`default`, `ocean`, `hacker`, `sunset`, `nord`, `rose`) |
| `/config` | Show current configuration |
| `/config set <key> <value>` | Change a setting |
| `/doctor` | Diagnose setup (API, tools, git, Node.js) |

---

## Project Detection

Morningstar automatically detects your project when you start it:

| Detected By | Language |
|-------------|----------|
| `package.json` | TypeScript/JavaScript |
| `requirements.txt` / `pyproject.toml` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` / `build.gradle` | Java |

**Frameworks:** Next.js, React, Vue, Svelte, Express, Fastify, Django, FastAPI, Flask

---

## Architecture

```
morningstar-cli/
├── bin/
│   └── morningstar.js        # Entry point (#!/usr/bin/env node)
├── src/
│   ├── index.ts              # CLI loop, readline, 40+ slash commands, banner
│   ├── ai.ts                 # DeepSeek R1 streaming + reasoning/plan tokens
│   ├── tools.ts              # 9 tools + tool call parser + undo tracking
│   ├── agents.ts             # 6 built-in agent definitions
│   ├── custom-agents.ts      # Custom agent CRUD + persistence
│   ├── memory.ts             # Persistent memory/notes system
│   ├── todo.ts               # Todo/task management with priorities
│   ├── history.ts            # Session save/load/list/delete
│   ├── undo.ts               # Undo stack for file operations
│   ├── theme.ts              # 6 color themes
│   ├── context.ts            # Project auto-detection
│   └── types.ts              # TypeScript interfaces
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### How It Works

1. **Startup** — Detects project type, language, framework, git branch. Loads memory, todos, config.
2. **Input** — Readline captures user input with smart autocomplete. Slash commands handled locally.
3. **AI Request** — Sends conversation to DeepSeek R1 API with streaming.
4. **Plan Display** — Shows `reasoning_content` and `<think>` blocks in a styled Plan box.
5. **Response Streaming** — Content tokens displayed in real-time with markdown formatting.
6. **Tool Execution** — Parses `<tool:name>args</tool>` blocks, executes tools, shows colored diffs, tracks undo.
7. **Multi-Turn** — AI receives tool results and can chain more tool calls (up to 5 rounds).
8. **Input Buffering** — Users can type while AI is processing; messages are queued and processed.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Language | TypeScript 5.x |
| AI Model | DeepSeek R1 (Reasoner) / DeepSeek Chat |
| Streaming | Native `fetch` + `ReadableStream` |
| CLI | Node.js `readline` with custom autocomplete |
| Terminal UI | chalk, ora |
| Markdown | marked + marked-terminal |
| File Search | glob |
| Build | tsc |

---

## Themes

Switch between 6 built-in themes:

| Theme | Style |
|-------|-------|
| `default` | Morningstar gold/amber |
| `ocean` | Blue/cyan deep sea |
| `hacker` | Green terminal classic |
| `sunset` | Warm orange/red |
| `nord` | Arctic blue/frost |
| `rose` | Pink/rose elegance |

```
> /theme hacker
  ✓ Theme gewechselt: hacker
```

---

## Configuration

All settings are persisted in `~/.morningstar/config.json`:

```
> /config
  apiKey     : sk-...****
  model      : deepseek-reasoner
  baseUrl    : https://api.deepseek.com/v1
  maxTokens  : 8192
  temperature: 0.6
  theme      : default

> /config set temperature 0.8
  ✓ temperature = 0.8
```

---

## CLI Options

```
Usage: morningstar [options]

Options:
  -V, --version          output version number
  -k, --api-key <key>    DeepSeek API Key
  -m, --model <model>    Model ID (default: deepseek-reasoner)
  -d, --dir <path>       Working directory
  --chat                 Chat-only mode (no tools)
  -h, --help             display help for command
```

---

## License

MIT

---

<div align="center">

**Built for engineers who live in the terminal.**

[GitHub](https://github.com/morningstarnasser/morningstar-cli)

</div>
