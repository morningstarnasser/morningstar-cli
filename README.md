<div align="center">

```
        *
       / \
      / | \
     *--+--*
      \ | /
       \ /
        *
```

# Morningstar CLI

**Terminal-based AI Coding Assistant powered by DeepSeek R1**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-R1_Reasoner-4A90D9?style=flat-square)](https://deepseek.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

Morningstar is a fully-featured AI coding assistant that lives in your terminal. It connects to **DeepSeek R1** (Reasoning model), streams responses in real-time, and can **read, write, edit files**, **execute shell commands**, **search codebases**, and **run git operations** — all through natural language.

---

## Demo

```
$ morningstar

        *
       / \
      / | \
     *--+--*
      \ | /
       \ /
        *

  Morningstar AI v1.0.0
  Dein Terminal-Coding-Assistant

  Model    : deepseek-reasoner
  Projekt  : my-app (TypeScript/JavaScript / Next.js)
  Branch   : main
  CWD      : /Users/dev/my-app

  Tools: read, write, edit, bash, grep, glob, ls, git
  Agents: /agent:code, /agent:debug, /agent:review, /agent:refactor
  Befehle: /help /clear /model /context /compact /quit
────────────────────────────────────────────────────────────

> Analysiere dieses Projekt und finde Probleme

  * Ich schaue mir zuerst die Projektstruktur an...

  ✓ [ls]
    src/
    package.json
    tsconfig.json
    ...

  * Jetzt lese ich die Hauptdateien...
```

---

## Features

### Core
- **DeepSeek R1 Reasoning** — thinks step-by-step before answering
- **Real-time Streaming** — responses appear token-by-token
- **Multi-Turn Tool Execution** — AI chains tool calls automatically (up to 5 rounds)
- **Automatic Project Detection** — detects language, framework, and git branch
- **6 Specialized Agents** — switch between coding modes
- **Crash-Proof** — global error handlers prevent any crash

### 9 Built-in Tools

| Tool | Description |
|------|-------------|
| `read` | Read files with line numbers |
| `write` | Create/overwrite files (auto-creates directories) |
| `edit` | Find & replace text in files |
| `delete` | Delete files |
| `bash` | Execute shell commands (30s timeout) |
| `grep` | Search for patterns across files |
| `glob` | Find files by glob pattern (e.g. `**/*.ts`) |
| `ls` | List directory contents with file sizes |
| `git` | Git status + last 5 commits |

### 6 Specialized Agents

| Agent | Command | Focus |
|-------|---------|-------|
| Code | `/agent:code` | Write code, implement features, create files |
| Debug | `/agent:debug` | Find bugs, root cause analysis |
| Review | `/agent:review` | Code review, security, performance analysis |
| Refactor | `/agent:refactor` | Code cleanup, optimization |
| Architect | `/agent:architect` | System design, architecture planning |
| Test | `/agent:test` | Write tests, improve coverage |

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
npm link
```

Now `morningstar` is available globally in your terminal.

### Set API Key (optional)

The CLI works out of the box. To use your own key:

```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

Or create a `.env` file:
```
DEEPSEEK_API_KEY=sk-your-key-here
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

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/features` | Show all features, tools, and agents |
| `/agents` | List available agents |
| `/agent:<id>` | Activate agent (`code`, `debug`, `review`, `refactor`, `architect`, `test`) |
| `/agent:off` | Deactivate agent, return to default mode |
| `/clear` | Reset conversation history |
| `/model <id>` | Switch model (`deepseek-reasoner`, `deepseek-chat`) |
| `/context` | Show detected project info |
| `/cost` | Show estimated token usage |
| `/compact` | Compress conversation (keep last messages) |
| `/quit` | Exit |

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
│   ├── index.ts              # CLI loop, readline, slash commands, banner
│   ├── ai.ts                 # DeepSeek R1 streaming + <think> filtering
│   ├── tools.ts              # 9 tools + tool call parser
│   ├── agents.ts             # 6 agent definitions + system prompts
│   ├── context.ts            # Project auto-detection
│   └── types.ts              # TypeScript interfaces
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

### How It Works

1. **Startup** — Detects project type, language, framework, git branch
2. **Input** — Readline captures user input, slash commands handled locally
3. **AI Request** — Sends conversation to DeepSeek R1 API with streaming
4. **Think Filtering** — Strips `<think>` reasoning blocks and `reasoning_content` tokens
5. **Tool Execution** — Parses `<tool:name>args</tool>` blocks, executes tools, feeds results back
6. **Multi-Turn** — AI receives tool results and can chain more tool calls (up to 5 rounds)

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Language | TypeScript 5.x |
| AI Model | DeepSeek R1 (Reasoner) |
| Streaming | Native `fetch` + `ReadableStream` |
| CLI | Node.js `readline` |
| Terminal UI | chalk, ora |
| File Search | glob |
| Build | tsc |

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
