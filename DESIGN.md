---
name: "Morningstar CLI"
description: "A calm, sovereign terminal workbench for agentic software work."
colors:
  copper-glow: "#f4c27a"
  burnished-copper: "#c98b52"
  quiet-mint: "#7ed7c1"
  success-green: "#7bd88f"
  error-coral: "#ff7d7d"
  warning-amber: "#ffb86b"
  information-blue: "#8ecdf8"
  graphite-muted: "#6f7785"
  terminal-ink: "#e5e7eb"
  terminal-shadow: "#3f4652"
typography:
  title:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "1em"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.04em"
  body:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "1em"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "1em"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
rounded:
  none: "0"
  terminal-panel: "8px"
spacing:
  inline-tight: "1ch"
  inline: "2ch"
  row: "1lh"
  section: "2lh"
components:
  composer:
    textColor: "{colors.terminal-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "{spacing.inline-tight}"
  composer-focus:
    textColor: "{colors.copper-glow}"
  command-selected:
    backgroundColor: "{colors.terminal-shadow}"
    textColor: "{colors.copper-glow}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "{spacing.inline-tight}"
  tool-active:
    textColor: "{colors.copper-glow}"
    typography: "{typography.label}"
  tool-success:
    textColor: "{colors.success-green}"
    typography: "{typography.label}"
  permission-danger:
    textColor: "{colors.error-coral}"
    typography: "{typography.label}"
---

# Design System: Morningstar CLI

## 1. Overview

**Creative North Star: "The Sovereign Workbench"**

Morningstar is the terminal developers return to when real work must move. The interface is warm but restrained: a compact identity masthead gives way immediately to the transcript, the active task, and a stable composer. Copper carries identity and active intent; muted terminal neutrals let long sessions remain calm.

The layout borrows the clarity of the best agentic coding tools without becoming a Claude Code skin. Morningstar rejects Anthropic mascots and ASCII art, trademark mimicry, crowded dashboards, walls of boxed cards, neon cyberpunk decoration, and controls that claim capabilities not wired into the runtime. Its larger capability set appears through progressive disclosure, not permanent chrome.

**Key Characteristics:**

- One continuous transcript with a fixed interaction point.
- Warm Copper identity with Claude-inspired restraint.
- Dense enough for experts, quiet enough for long sessions.
- Details, tools, and diagnostics collapse until requested.
- State is always communicated by a glyph and text, never color alone.
- Layout adapts at 60, 80, and 120 terminal columns.

## 2. Colors

The palette combines Morningstar Copper with muted, terminal-safe semantic colors. The terminal's own background remains authoritative; Morningstar does not paint an artificial full-screen backdrop in classic mode.

### Primary

- **Copper Glow:** The star, active mode, focused command, and one current action. Its warmth supplies identity without flooding the transcript.
- **Burnished Copper:** Secondary Morningstar identity, inactive star detail, and low-priority brand metadata.

### Secondary

- **Quiet Mint:** Interactive hints, safe navigation, and selected file references. It should appear less often than Copper.
- **Information Blue:** Read operations, neutral diagnostics, links, and context information.

### Tertiary

- **Success Green:** Completed tools, passing verification, and confirmed state.
- **Warning Amber:** Pending approval, budget pressure, and recoverable caution.
- **Error Coral:** Refused, failed, destructive, or invalid state.

### Neutral

- **Terminal Ink:** Primary transcript text when an explicit foreground is required.
- **Graphite Muted:** Metadata, elapsed time, separators, secondary copy, and collapsed detail.
- **Terminal Shadow:** Selected-row backing and tonal separation where reverse video is unavailable.

### Named Rules

**The One Warm Voice Rule.** Copper marks identity and the current action only. If three unrelated regions glow Copper at once, the hierarchy has failed.

**The Semantic Pair Rule.** Every success, warning, error, and active state includes a glyph or label in addition to color.

## 3. Typography

**Display Font:** The user's terminal monospace stack.
**Body Font:** The user's terminal monospace stack.
**Label/Mono Font:** The user's terminal monospace stack.

**Character:** Morningstar respects the terminal instead of fighting it. Hierarchy comes from weight, indentation, whitespace, glyph choice, and selective dimming; never from decorative type or simulated oversized headings.

### Hierarchy

- **Title** (700, terminal cell size, 1.25): Product name, active overlay title, and the single most important state label.
- **Body** (400, terminal cell size, 1.45): Conversation content and readable tool output. Prose wraps to the available viewport instead of a fixed 72-column box.
- **Label** (500, terminal cell size, 1.25): Tool names, command names, permission choices, model identity, and status metadata.

### Named Rules

**The Native Cell Rule.** Never fake a display font, gradient text, or giant ASCII headline. The terminal cell is the type scale.

**The Seventy-Character Rule.** Long prose should remain near 65–75 characters when space permits, while code and diffs may use the full viewport.

## 4. Elevation

The system is flat. Depth comes from transcript order, one-cell indentation, blank rows, dimmed metadata, selection backing, and hairline box-drawing separators. Rounded boxes are reserved for true overlays or approval boundaries, not routine content.

### Named Rules

**The Flat Transcript Rule.** Messages and tool calls sit directly in the flow. Never wrap every response, metric, or command in a card.

**The Boundary Earns a Box Rule.** A border is justified only when the user must make a contained choice, such as permissions, model selection, session resume, or destructive confirmation.

## 5. Components

### Composer

- **Shape:** A full-width input lane between one-cell horizontal rules, with no rounded container.
- **Primary:** A leading `>` prompt, live input, optional attachment chips, and a concise mode hint.
- **Focus:** Copper prompt glyph; selection and cursor remain terminal-native.
- **Processing:** The composer stays usable for queued or steering input while the active turn runs.

### Command and Model Pickers

- **Style:** One overlay surface with aligned labels, descriptions, availability, and keyboard hints.
- **State:** The selected row uses tonal backing plus a leading glyph. Disabled models remain visible only when an actionable reason can be shown.
- **Local models:** Installed Ollama models are first-class rows, use their exact manifest IDs, and are labelled local. Names containing `/` must not be misclassified as cloud routes.

### Transcript

- **Style:** User prompts, assistant prose, reasoning summaries, tools, and verification share one chronological stream.
- **User Prompt:** Begins with `>` and uses subtle tonal backing only when selection or rewind context requires it.
- **Assistant:** Begins with a small solid glyph. Body copy is unboxed.
- **Collapsed Detail:** Uses Graphite Muted with a direct expansion hint.

### Tool Calls

- **Active:** Copper activity glyph, concise verb, primary argument, elapsed time, and optional next step.
- **Success:** Success glyph plus summary. Expanded output aligns beneath the invocation.
- **Failure:** Error glyph, first actionable error line, and a clear retry or inspection path.
- **Diff:** Line numbers and `+`/`-` markers remain visible at narrow widths; context folds before meaning is lost.

### Permission Prompt

- **Style:** A bounded decision surface because the action has consequence.
- **Content:** Exact tool, normalized target, risk reason, scope of any saved approval, and ordered choices.
- **Focus:** Selection is explicit with a leading glyph, text, and tonal backing.
- **Error / Disabled:** Unsafe or impossible options explain why rather than disappearing.

### Footer and Status

- **Style:** One restrained row below the composer for project, branch, model, permission mode, context, cost, and active background work.
- **Priority:** Current mode and anything needing input outrank cost and passive diagnostics.
- **Narrow Terminals:** Low-priority fields collapse into `/status`; the composer never loses width to the footer.

### Startup Masthead

- **Style:** Compact, left aligned, and no taller than four content rows in standard terminals.
- **Content:** Morningstar star and name, version, selected model, provider/locality, project path, branch, and one help hint.
- **First Run:** Missing configuration becomes an actionable line, not a permanent dashboard card.

## 6. Do's and Don'ts

### Do:

- **Do** make Copper Glow the single warm voice for identity and current intent.
- **Do** keep transcript content unboxed and reveal depth on demand.
- **Do** show every installed Ollama model directly in model discovery.
- **Do** verify terminal layouts at 60, 80, and 120 columns.
- **Do** pair every color state with a glyph or textual label.
- **Do** preserve terminal-native selection, copy, cursor, and screen-reader behavior.
- **Do** expose Hydra, Jerry, Telegram, multiple providers, teams, memory, browser, and image features without crowding the default flow.

### Don't:

- **Don't** create a Claude Code skin, reuse Anthropic mascots or ASCII art, imitate trademarked product identity, or copy proprietary wording and assets.
- **Don't** turn the terminal into a crowded dashboard or a wall of boxed cards.
- **Don't** use neon cyberpunk styling, decorative gradients, gradient text, or default glassmorphism.
- **Don't** advertise a command, tool, permission mode, or integration unless it is wired end to end.
- **Don't** hide failure, denial, model unavailability, or fallback behind silent substitution.
- **Don't** use color as the only signal.
- **Don't** let fixed-width 58, 68, or 72-column components clip or waste wide terminals.
