<div align="center">

<br>

```
               . .  ★  . .
              .  ./ . \.  .
             .  /  . | .  \  .
             ── * ─────+───── * ──
             .  \  . | .  /  .
              .  .\ . /.  .
               . .  ★  . .
```

# ✦ M O R N I N G S T A R ✦

### Terminal AI Coding Assistant

**Powered by [Mr.Morningstar](https://github.com/morningstarnasser)**

<br>

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-R1_Reasoner-4A90D9?style=for-the-badge)](https://deepseek.com)
[![License](https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge)](LICENSE)

<br>

![Tools](https://img.shields.io/badge/Tools-9-06b6d4?style=flat-square)
![Agents](https://img.shields.io/badge/Agents-6_Built--in_+_Custom-a855f7?style=flat-square)
![Commands](https://img.shields.io/badge/Commands-40+-f59e0b?style=flat-square)
![Themes](https://img.shields.io/badge/Themes-6-ec4899?style=flat-square)

<br>

A fully-featured AI coding assistant that lives in your terminal — inspired by **Claude Code**.<br>
Streams responses in real-time with **Plan Display** (visible thinking), provides **40+ slash commands**,<br>
**9 tools**, **custom agents**, **memory**, **todos**, **session history**, **undo**, **themes**, and more.

<br>

---

</div>

## Demo

<div align="center">

```
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
║               M O R N I N G S T A R                      ║
║               ━━━━━━━━━━━━━━━━━━━━━━                     ║
║            Terminal AI Coding Assistant                   ║
║            Powered by Mr.Morningstar                     ║
║            github.com/morningstarnasser                  ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────┐
│  ★ Model    deepseek-reasoner (R1 Thinking)              │
│  ★ Projekt  my-app (TypeScript / Next.js)                │
│  ★ Branch   main                                         │
│  ★ CWD      /Users/dev/my-app                            │
│  ★ Theme    Morningstar Default                           │
└──────────────────────────────────────────────────────────┘

  Tools   read · write · edit · bash · grep · glob · ls · git
  Agents  code · debug · review · refactor · architect · test
  Hilfe   /help · /features · /agents · /agent:create · /quit

    2 offene Aufgabe(n) — /todo list
    3 Notiz(en) gespeichert — /memory list
  ──────────────────────────────────────────────────────────
```

</div>

**AI Thinking (Plan Display):**

```
> Analysiere dieses Projekt und finde Probleme

  ┌─ Plan ──────────────────────────────────────────────────┐
  │ Ich schaue mir zuerst die Projektstruktur an,           │
  │ dann lese ich die Hauptdateien um Probleme zu finden... │
  └─────────────────────────────────────────────────────────┘

  ★ Ich analysiere die Struktur...

  ✓ [ls]
    src/  package.json  tsconfig.json  ...

  ★ Jetzt lese ich die Hauptdateien...

  ✓ [read] src/app/page.tsx
    1│ import { getData } from './lib/api'
    2│ export default function Home() {
    ...
```

**Colored Diffs (Edit Operations):**

```diff
  ✓ [edit] src/app/page.tsx

- const data = fetchData()
+ const data = await fetchData()

- console.log(data)
+ console.log("Loaded:", data)
```

---

<div align="center">

## Features

</div>

> [!TIP]
> Morningstar erkennt dein Projekt automatisch — Sprache, Framework, Git Branch — und passt sich an.

### Core

| Feature | Description |
|:-------:|-------------|
| **DeepSeek R1 Reasoning** | Thinks step-by-step before answering |
| **Plan Display** | Visible AI reasoning in styled box (like Claude Code) |
| **Real-time Streaming** | Responses appear token-by-token |
| **Multi-Turn Tools** | AI chains tool calls automatically (up to 5 rounds) |
| **Project Detection** | Auto-detects language, framework, git branch |
| **Custom Agents** | Create, edit, delete, import/export your own agents |
| **Memory System** | Persistent notes across sessions |
| **Todo System** | Task management with priorities |
| **Session History** | Save and restore conversations |
| **Undo System** | Revert file changes with full undo stack |
| **6 Themes** | Customizable terminal color themes |
| **Colored Diffs** | Red (old) / blue (new) for edit operations |
| **Input Buffering** | Type while AI is still processing |
| **Smart Autocomplete** | Tab completion for all 40+ slash commands |
| **Crash-Proof** | Global error handlers prevent any crash |

---

<div align="center">

### 9 Built-in Tools

</div>

| Tool | Description | Undo |
|:----:|-------------|:----:|
| ![](https://img.shields.io/badge/read-06b6d4?style=flat-square) | Read files with line numbers | — |
| ![](https://img.shields.io/badge/write-10b981?style=flat-square) | Create/overwrite files (auto-creates directories) | ✓ |
| ![](https://img.shields.io/badge/edit-f59e0b?style=flat-square) | Find & replace in files (colored diff output) | ✓ |
| ![](https://img.shields.io/badge/delete-ef4444?style=flat-square) | Delete files | ✓ |
| ![](https://img.shields.io/badge/bash-a855f7?style=flat-square) | Execute shell commands (30s timeout) | — |
| ![](https://img.shields.io/badge/grep-3b82f6?style=flat-square) | Search for patterns across files | — |
| ![](https://img.shields.io/badge/glob-ec4899?style=flat-square) | Find files by glob pattern (e.g. `**/*.ts`) | — |
| ![](https://img.shields.io/badge/ls-f97316?style=flat-square) | List directory contents with file sizes | — |
| ![](https://img.shields.io/badge/git-6366f1?style=flat-square) | Git status + last 5 commits | — |

---

<div align="center">

### 6 Built-in Agents + Custom Agents

</div>

| Agent | Command | Focus |
|:-----:|---------|-------|
| ![](https://img.shields.io/badge/Code-06b6d4?style=flat-square) | `/agent:code` | Write code, implement features, create files |
| ![](https://img.shields.io/badge/Debug-ef4444?style=flat-square) | `/agent:debug` | Find bugs, root cause analysis |
| ![](https://img.shields.io/badge/Review-f59e0b?style=flat-square) | `/agent:review` | Code review, security, performance |
| ![](https://img.shields.io/badge/Refactor-10b981?style=flat-square) | `/agent:refactor` | Code cleanup, optimization |
| ![](https://img.shields.io/badge/Architect-d946ef?style=flat-square) | `/agent:architect` | System design, architecture planning |
| ![](https://img.shields.io/badge/Test-3b82f6?style=flat-square) | `/agent:test` | Write tests, improve coverage |
| ![](https://img.shields.io/badge/Custom-a855f7?style=flat-square) | `/agent:create` | **Create your own agents!** |

<details>
<summary><b>Custom Agent erstellen</b></summary>

```
> /agent:create

  Neuer Agent erstellen:

  ID (z.B. security):  security
  Name:                 Security Agent
  Beschreibung:         Security Audits und Vulnerability Scanning
  Farbe:                1. Rot  2. Orange  3. Gelb  4. Gruen ...

  System Prompt (mehrzeilig, leere Zeile zum Beenden):
  Du bist ein Security-Experte. Analysiere Code auf:
  - SQL Injection, XSS, CSRF
  - Authentication/Authorization Fehler
  - Secrets im Code

  ✓ Agent "security" erstellt! Aktiviere mit /agent:security
```

Custom agents are stored persistently in `~/.morningstar/agents.json` and support **export/import** for sharing.

</details>

---

<div align="center">

## Installation

</div>

> [!IMPORTANT]
> Requires **Node.js 18+** and a **DeepSeek API Key** ([get one here](https://platform.deepseek.com))

```bash
git clone https://github.com/morningstarnasser/morningstar-cli.git
cd morningstar-cli
npm install
npm run build
npm link
```

Now `morningstar` is available globally in your terminal.

**Set API Key** (choose one):

```bash
# Environment variable
export DEEPSEEK_API_KEY="sk-your-key-here"

# .env file in project directory
echo 'DEEPSEEK_API_KEY=sk-your-key-here' > .env

# Via CLI config
morningstar
> /config set apiKey sk-your-key-here
```

---

<div align="center">

## Usage

</div>

```bash
morningstar                          # Start in current directory
morningstar --dir /path/to/project   # Start in specific directory
morningstar --chat                   # Chat-only mode (no file tools)
morningstar --model deepseek-chat    # Use a different model
```

**Example Prompts:**

```
> Erklaere mir src/app/page.tsx
> Schreibe eine REST API mit Authentication
> Finde alle TODO Kommentare im Projekt
> /agent:debug Warum crasht die App beim Login?
> /agent:code Fuege Dark Mode hinzu
> /agent:review Analysiere src/auth.ts auf Security
```

---

<div align="center">

## All Commands (40+)

</div>

<details>
<summary><b>General</b></summary>

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/features` | Show all features, tools, and agents |
| `/clear` | Reset conversation history |
| `/compact` | Compress conversation (keep recent messages) |
| `/quit` | Exit (also `/exit`, `/q`) |

</details>

<details>
<summary><b>AI & Model</b></summary>

| Command | Description |
|---------|-------------|
| `/model <id>` | Switch model (`deepseek-reasoner`, `deepseek-chat`) |
| `/context` | Show detected project info |
| `/cost` | Show estimated token usage |
| `/stats` | Session statistics (uptime, messages, tools used) |
| `/plan` | Toggle plan mode (think before acting) |

</details>

<details>
<summary><b>Agents (10 commands)</b></summary>

| Command | Description |
|---------|-------------|
| `/agents` | List available agents |
| `/agent:<id>` | Activate agent (e.g. `/agent:code`) |
| `/agent:off` | Deactivate agent |
| `/agent:create` | Interactive wizard to create a custom agent |
| `/agent:edit <id>` | Edit a custom agent |
| `/agent:delete <id>` | Delete a custom agent |
| `/agent:show <id>` | Show full agent details |
| `/agent:list` | List all agents (built-in + custom) |
| `/agent:export <id>` | Export agent as JSON |
| `/agent:import` | Import agent from JSON |

</details>

<details>
<summary><b>Memory</b></summary>

| Command | Description |
|---------|-------------|
| `/memory add <text>` | Save a persistent note |
| `/memory list` | Show all notes |
| `/memory search <q>` | Search notes |
| `/memory remove <n>` | Remove a note |
| `/memory clear` | Clear all notes |

</details>

<details>
<summary><b>Todos</b></summary>

| Command | Description |
|---------|-------------|
| `/todo add <text>` | Add a task (supports `!high` priority) |
| `/todo list` | Show all tasks |
| `/todo done <id>` | Toggle task done/undone |
| `/todo remove <id>` | Remove a task |
| `/todo clear` | Clear completed tasks |

</details>

<details>
<summary><b>Git</b></summary>

| Command | Description |
|---------|-------------|
| `/diff` | Show git diff |
| `/diff staged` | Show staged changes |
| `/commit` | Smart commit (AI analyzes & suggests message) |
| `/log` | Show git log |
| `/branch` | Show branches |
| `/status` | Show git status |

</details>

<details>
<summary><b>Files & Project</b></summary>

| Command | Description |
|---------|-------------|
| `/init` | Create MORNINGSTAR.md project note |
| `/undo` | Undo last file change |
| `/undo list` | Show undo stack |
| `/search <query>` | Search project files (grep) |

</details>

<details>
<summary><b>History & Sessions</b></summary>

| Command | Description |
|---------|-------------|
| `/history save <name>` | Save current conversation |
| `/history list` | List saved sessions |
| `/history load <id>` | Load a saved session |
| `/history delete <id>` | Delete a saved session |

</details>

<details>
<summary><b>Appearance & Config</b></summary>

| Command | Description |
|---------|-------------|
| `/theme` | Show current theme |
| `/theme <name>` | Set theme (`default`, `ocean`, `hacker`, `sunset`, `nord`, `rose`) |
| `/config` | Show current configuration |
| `/config set <key> <value>` | Change a setting |
| `/doctor` | Diagnose setup (API, tools, git, Node.js) |

</details>

---

<div align="center">

## Themes

</div>

| Theme | Preview | Style |
|:-----:|---------|-------|
| ![](https://img.shields.io/badge/default-f59e0b?style=flat-square) | `default` | Morningstar gold/amber |
| ![](https://img.shields.io/badge/ocean-0ea5e9?style=flat-square) | `ocean` | Blue/cyan deep sea |
| ![](https://img.shields.io/badge/hacker-22c55e?style=flat-square) | `hacker` | Green terminal classic |
| ![](https://img.shields.io/badge/sunset-ef4444?style=flat-square) | `sunset` | Warm orange/red |
| ![](https://img.shields.io/badge/nord-88c0d0?style=flat-square) | `nord` | Arctic blue/frost |
| ![](https://img.shields.io/badge/rose-ec4899?style=flat-square) | `rose` | Pink/rose elegance |

```
> /theme hacker
  ✓ Theme gewechselt: hacker
```

---

<div align="center">

## Project Detection

</div>

Morningstar automatically detects your project:

| Detected By | Language |
|:-----------:|----------|
| `package.json` | TypeScript/JavaScript |
| `requirements.txt` / `pyproject.toml` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `pom.xml` / `build.gradle` | Java |

**Frameworks:** Next.js, React, Vue, Svelte, Express, Fastify, Django, FastAPI, Flask

---

<div align="center">

## Architecture

</div>

```
morningstar-cli/
├── bin/
│   └── morningstar.js          ← Entry point
├── src/
│   ├── index.ts                ← CLI loop, 40+ commands, banner, autocomplete
│   ├── ai.ts                   ← DeepSeek R1 streaming + plan tokens
│   ├── tools.ts                ← 9 tools + parser + undo tracking
│   ├── agents.ts               ← 6 built-in agents
│   ├── custom-agents.ts        ← Custom agent CRUD + persistence
│   ├── memory.ts               ← Persistent notes system
│   ├── todo.ts                 ← Task management
│   ├── history.ts              ← Session save/load
│   ├── undo.ts                 ← Undo stack
│   ├── theme.ts                ← 6 color themes
│   ├── context.ts              ← Project auto-detection
│   └── types.ts                ← TypeScript interfaces
├── dist/                       ← Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

<div align="center">

### How It Works

</div>

```
 ┌─────────┐    ┌──────────┐    ┌──────────────┐    ┌───────────┐
 │  Input   │───→│  Router   │───→│  DeepSeek R1 │───→│  Stream   │
 │ readline │    │ 40+ cmds  │    │  API + SSE   │    │  Output   │
 └─────────┘    └──────────┘    └──────────────┘    └───────────┘
                                        │                   │
                                        ▼                   ▼
                                 ┌──────────────┐    ┌───────────┐
                                 │  Tool Calls  │    │   Plan    │
                                 │ read/write/  │    │  Display  │
                                 │ edit/bash/.. │    │  (Think)  │
                                 └──────────────┘    └───────────┘
                                        │
                                        ▼
                                 ┌──────────────┐
                                 │  Multi-Turn  │
                                 │  (up to 5x)  │
                                 └──────────────┘
```

---

<div align="center">

## Tech Stack

</div>

| Component | Technology |
|:---------:|------------|
| Runtime | ![](https://img.shields.io/badge/Node.js_18+-339933?style=flat-square&logo=node.js&logoColor=white) |
| Language | ![](https://img.shields.io/badge/TypeScript_5.x-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| AI Model | ![](https://img.shields.io/badge/DeepSeek_R1-4A90D9?style=flat-square) ![](https://img.shields.io/badge/DeepSeek_Chat-06b6d4?style=flat-square) |
| Streaming | Native `fetch` + `ReadableStream` |
| CLI | Node.js `readline` + custom autocomplete |
| Terminal UI | `chalk` + `ora` |
| Markdown | `marked` + `marked-terminal` |
| File Search | `glob` |
| Build | `tsc` |

---

<div align="center">

## Configuration

</div>

All settings persisted in `~/.morningstar/`:

```
~/.morningstar/
├── config.json          ← API key, model, temperature, theme
├── agents.json          ← Custom agents
├── memory.json          ← Persistent notes
├── todo.json            ← Tasks
└── history/             ← Saved sessions
```

```
> /config
  apiKey      : sk-...****
  model       : deepseek-reasoner
  baseUrl     : https://api.deepseek.com/v1
  maxTokens   : 8192
  temperature : 0.6
  theme       : default

> /config set temperature 0.8
  ✓ temperature = 0.8
```

---

<div align="center">

## CLI Options

</div>

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

<div align="center">

## License

MIT

---

<br>

**Built for engineers who live in the terminal.**

<br>

[![GitHub](https://img.shields.io/badge/GitHub-morningstarnasser-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/morningstarnasser/morningstar-cli)

<br>

</div>
