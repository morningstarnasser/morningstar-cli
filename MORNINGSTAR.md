# MORNINGSTAR CLI

> Terminal AI Coding Assistant — Built with Ink (React) + Shiki

## Project Overview

Morningstar CLI is an open-source terminal AI coding assistant supporting 7 AI providers, 9 tools, custom agents, and a full permission system. The UI is built with **Ink** (React for Terminal) and uses **Shiki** for VS Code-quality syntax highlighting.

## Tech Stack

- **Runtime**: Node.js 18+ (ESM)
- **Language**: TypeScript 5 (strict mode)
- **UI Framework**: Ink 5 (React 18 for Terminal)
- **Syntax Highlighting**: Shiki 1 (VS Code themes)
- **CLI Framework**: Commander.js
- **Build**: tsc (TypeScript compiler)

## Architecture

```
src/
├── index.ts                  ← CLI entry point (commander setup + render)
├── app.tsx                   ← Main Ink app (state management, slash commands, AI loop)
├── components/
│   ├── Banner.tsx            ← ASCII logo + project info display
│   ├── Help.tsx              ← /help command output
│   ├── Features.tsx          ← /features command output
│   ├── Input.tsx             ← Terminal input (replaces readline)
│   ├── Suggestions.tsx       ← Autocomplete dropdown for slash commands
│   ├── StreamingOutput.tsx   ← AI response renderer (text + code blocks)
│   ├── CodeBlock.tsx         ← Shiki syntax highlighting box
│   ├── PlanBox.tsx           ← AI reasoning/thinking display
│   ├── ToolResult.tsx        ← Tool execution result display
│   └── Spinner.tsx           ← Claude-style animated spinner
├── context/
│   └── AppContext.tsx         ← Global state (useReducer pattern)
├── hooks/
│   ├── useTheme.ts           ← Theme colors for Ink components
│   ├── useChat.ts            ← AI streaming state management
│   └── useHistory.ts         ← Command history (up/down arrows)
├── ai.ts                     ← Multi-provider streaming (SSE/REST)
├── providers.ts              ← 7 providers (DeepSeek, OpenAI, Anthropic, Google, Ollama, Groq, OpenRouter)
├── tools.ts                  ← 9 tools (read, write, edit, delete, bash, grep, glob, ls, git)
├── agents.ts                 ← 6 built-in agents
├── custom-agents.ts          ← Custom agent CRUD + persistence
├── context.ts                ← Project auto-detection + system prompt
├── settings.ts               ← Per-project + global settings
├── permissions.ts            ← Tool & command permission system
├── memory.ts                 ← Persistent notes
├── project-memory.ts         ← MORNINGSTAR.md loader
├── todo.ts                   ← Task management
├── history.ts                ← Session save/load
├── undo.ts                   ← File change undo stack
├── theme.ts                  ← 6 color themes
├── cost-tracker.ts           ← Token usage & cost estimation
├── repo-map.ts               ← Repository analysis
├── mentions.ts               ← @file mentions in prompts
├── vision.ts                 ← Image analysis (LLaVA)
├── image-gen.ts              ← Local Stable Diffusion
├── git-integration.ts        ← Smart commits
├── server.ts                 ← HTTP API server
└── types.ts                  ← TypeScript interfaces
```

## Key Design Decisions

1. **Ink over readline**: All UI rendering through React components instead of console.log. This enables proper layout, state management, and reusable components.
2. **Shiki over cli-highlight**: VS Code-quality syntax highlighting with theme support. Loaded eagerly on startup with graceful fallback.
3. **useReducer for state**: Central AppContext with reducer pattern for predictable state updates across components.
4. **Streaming architecture**: AI responses stream token-by-token. Code blocks are detected mid-stream and rendered with Shiki once closed.
5. **Multi-turn tool loop**: AI can chain up to 5 rounds of tool calls automatically, with results fed back into the conversation.

## Providers

| Provider | Env Variable | Example Models |
|----------|-------------|----------------|
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-reasoner, deepseek-chat |
| OpenAI | `OPENAI_API_KEY` | o3, o4-mini, gpt-4.1, codex-mini-latest |
| Anthropic | `ANTHROPIC_API_KEY` | claude-opus-4-20250514, claude-sonnet-4-20250514 |
| Google | `GOOGLE_API_KEY` | gemini-2.0-flash, gemini-2.0-pro |
| Ollama | — | Any local model |
| Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile |
| OpenRouter | `OPENROUTER_API_KEY` | Any model via API |

## Configuration Files

```
~/.morningstar/
├── config.json              ← API keys (per provider), model, theme
├── settings.json            ← Global permission defaults
├── agents.json              ← Custom agents
├── memory.json              ← Persistent notes
├── todo.json                ← Tasks
├── history/                 ← Saved sessions
└── images/                  ← Generated images

.morningstar/
└── settings.local.json      ← Per-project overrides
```

## Commands

50+ slash commands organized in categories: General, Settings, AI/Model, Agents, Memory, Todos, Git, Image/Vision, Files/History/Appearance. Use `/help` to see all.

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run start        # Run compiled
npm run dev          # Run with tsx (hot reload)
npm link             # Make 'morningstar' globally available
```
