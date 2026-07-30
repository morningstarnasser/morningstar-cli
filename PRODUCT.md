# Product

## Register

product

## Users

Morningstar CLI is a local-first power tool for developers and technical operators. It is used from a terminal to direct complex coding, research, automation, infrastructure, and business-operations work without micromanaging individual tool calls. The primary context is a focused developer session, with Telegram available as an optional remote surface.

## Product Purpose

Morningstar is an independent, multi-model agentic coding environment inspired by the workflow quality of Claude Code. It should make the full loop feel coherent: understand a repository, plan, edit, run tools, ask for consequential approvals, verify the result, preserve context, delegate work, and resume later. Success means the terminal experience is clear and dependable for local work while retaining broader provider choice, optional local routing, Telegram, memory, agent teams, image and browser tooling, and other extensions.

The product is not a model-weight clone and is not an Anthropic-branded client. It is a clean-room Morningstar implementation of publicly documented interaction contracts, backed by Morningstar's own runtime and identity.

## Brand Personality

Focused, sovereign, and capable. Morningstar should feel calm under load, technically serious, and quietly powerful. It may borrow the warmth and restraint of Claude Code's terminal palette, but the product remains unmistakably Morningstar through its name, star mark, Copper identity, wider model freedom, and direct language.

## Anti-references

Do not create a Claude Code skin, reuse Anthropic mascots or ASCII art, imitate trademarked product identity, or copy proprietary wording and assets. Do not turn the terminal into a crowded dashboard, a wall of boxed cards, a neon cyberpunk console, or a decorative AI demo. Avoid controls that advertise features without actually wiring them into the runtime. Visual familiarity is useful; deceptive sameness and hollow parity are not.

## Design Principles

1. **One trustworthy loop.** Terminal, print mode, Telegram, and delegated agents should share the same tool, permission, event, and verification contracts.
2. **Calm by default, depth on demand.** Keep the main transcript sparse and readable; reveal details, diagnostics, tools, and Morningstar extras through progressive disclosure.
3. **Approval before consequence.** Permission checks, workspace guards, sandboxing, and user approval happen before external or destructive actions, never after them.
4. **Behavioral parity, independent identity.** Reproduce useful documented workflows cleanly while preserving Morningstar naming, capabilities, storage, and code.
5. **More power without more clutter.** Local routing, optional remote agents, Telegram, multiple providers, teams, memory, browser, and image features stay available without crowding the core coding flow.
6. **Evidence over claims.** A command or feature is considered present only when it is wired end to end and covered by an appropriate test.
7. **Installed local models are real choices.** `/model` discovers exact Ollama manifest names under `~/.ollama/models`, including Hugging Face-backed names containing `/`, and routes them to Ollama before applying generic `provider/model` detection. Discovery is read-only and never touches model blobs.
8. **Provider choice is explicit.** `/model` first selects a provider and then one of its models. Hosted catalogs refresh from provider APIs when credentials permit, use a bounded TTL cache, and fall back to a maintained offline catalog.

## Accessibility & Inclusion

The terminal experience must be fully keyboard operable and usable at narrow, standard, and wide terminal widths. It should provide reduced-motion behavior, non-color status cues, readable contrast, stable focus and cursor behavior, and a screen-reader-friendly mode with concise announcements. macOS is the first supported environment, but the architecture should not unnecessarily block Linux or Windows support.
