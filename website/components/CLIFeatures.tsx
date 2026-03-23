"use client";

import {
  Keyboard, Waves, GitCompare, Command, Brain, RotateCcw,
  PenTool, Terminal, BookOpen, Puzzle, Shield, Download,
  Image, History, FlaskConical, Users, ListChecks, Zap,
  FolderSearch, GitBranch, RefreshCw, LayoutDashboard,
  Files, GitPullRequest, Database, PanelLeftClose
} from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import type { LucideIcon } from "lucide-react";

interface CLIFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
}

const cliFeatures: CLIFeature[] = [
  {
    icon: Keyboard,
    title: "Interactive Mode",
    description: "Full autocomplete, syntax highlighting, and inline suggestions.",
    detail: "Tab completion for commands, flags, and file paths",
  },
  {
    icon: Waves,
    title: "Streaming Output",
    description: "Watch AI responses stream in real-time with live formatting.",
    detail: "Token-by-token rendering with markdown support",
  },
  {
    icon: GitCompare,
    title: "Live Diff View",
    description: "Review every change before it is applied with highlighted diffs.",
    detail: "Claude Code-style inline diffs with line numbers",
  },
  {
    icon: Command,
    title: "Keyboard Shortcuts",
    description: "Power-user shortcuts for maximum velocity.",
    detail: "ctrl+o expand \u00B7 ctrl+c cancel \u00B7 Esc+Esc rewind \u00B7 Ctrl+R search",
  },
  {
    icon: Brain,
    title: "Extended Thinking",
    description: "4 effort levels with provider-specific thinking parameters.",
    detail: "/effort low|medium|high|ultra \u00B7 /ultrathink",
  },
  {
    icon: RotateCcw,
    title: "Checkpoints & Rewind",
    description: "Git-based checkpoints paired with conversation state.",
    detail: "/checkpoint create \u00B7 /rewind N \u00B7 Esc+Esc undo",
  },
  {
    icon: PenTool,
    title: "Vim Mode",
    description: "Native Vim keybindings for the input editor.",
    detail: "Normal, Insert, motions, and ex commands",
  },
  {
    icon: Terminal,
    title: "! Bash Mode",
    description: "Prefix with ! to execute shell commands directly.",
    detail: "!npm test \u00B7 !git status \u00B7 instant execution",
  },
  {
    icon: BookOpen,
    title: "Skills & Rules",
    description: "Reusable .md-based skills and project rules with auto-trigger.",
    detail: "/skill:list \u00B7 /rules list \u00B7 YAML frontmatter",
  },
  {
    icon: Puzzle,
    title: "MCP & Plugins",
    description: "Connect external tool servers and install community plugins.",
    detail: "/mcp add \u00B7 /plugins install \u00B7 Plugin API",
  },
  {
    icon: Shield,
    title: "Sandbox Mode",
    description: "OS-level sandboxing restricts filesystem access.",
    detail: "--sandbox \u00B7 macOS sandbox-exec \u00B7 Linux firejail",
  },
  {
    icon: Download,
    title: "Export & Copy",
    description: "Export conversations as markdown, copy last response.",
    detail: "/export \u00B7 /copy \u00B7 /rename session",
  },
  {
    icon: Image,
    title: "AI Image Generation",
    description: "Nano Banana Pro (Gemini 3) + local RealVisXL with auto-fallback.",
    detail: "/imagine <prompt> \u00B7 6 models \u00B7 no content filters",
  },
  {
    icon: History,
    title: "Persistent History",
    description: "Input history persists across sessions. Arrow keys to navigate.",
    detail: "Ctrl+R search \u00B7 case-insensitive cd \u00B7 ~/Downloads",
  },
  {
    icon: FlaskConical,
    title: "Auto-Test",
    description: "Detects test runners and runs relevant tests after file changes.",
    detail: "vitest \u00B7 jest \u00B7 pytest \u00B7 cargo test \u00B7 go test",
  },
  {
    icon: Users,
    title: "Sub-Agent Delegation",
    description: "Delegate tasks to specialized agents with own conversation context.",
    detail: "/delegate <agent> <task> \u00B7 /delegate:list",
  },
  {
    icon: ListChecks,
    title: "Task Progress",
    description: "Live checklist tracking agentic loop turns, tokens, and duration.",
    detail: "\u2714 done \u00B7 \u25FC running \u00B7 \u25FB pending \u00B7 up to 10 turns",
  },
  {
    icon: Zap,
    title: "Native Function Calling",
    description: "API-level tool definitions instead of regex parsing.",
    detail: "OpenAI tools \u00B7 Anthropic tool_use \u00B7 Google functionCall",
  },
  {
    icon: FolderSearch,
    title: "File Watcher",
    description: "Auto-detects directories, watches for external changes.",
    detail: "/watch \u00B7 debounced \u00B7 auto-test trigger",
  },
  {
    icon: GitBranch,
    title: "Conversation Branching",
    description: "Fork, switch, and merge conversation branches.",
    detail: "/branch \u00B7 /branch switch \u00B7 /branch merge",
  },
  {
    icon: RefreshCw,
    title: "Self-Update",
    description: "Check for updates and pull latest from GitHub.",
    detail: "/update check \u00B7 /update run \u00B7 auto-rebuild",
  },
  {
    icon: LayoutDashboard,
    title: "Web Dashboard",
    description: "Browser-based session dashboard with live stats.",
    detail: "/dashboard \u00B7 costs \u00B7 tools \u00B7 conversation",
  },
  {
    icon: Files,
    title: "Multi-File Context",
    description: "10 @-mention types with smart chunking and context budget.",
    detail: "@files:glob \u00B7 @diff:file \u00B7 @tree \u00B7 32k budget",
  },
  {
    icon: GitPullRequest,
    title: "Smart PR Review",
    description: "Fetch, analyze, and review GitHub PRs with severity ratings.",
    detail: "/pr-review <number> \u00B7 gh CLI \u00B7 auto-post comments",
  },
  {
    icon: Database,
    title: "Prompt Caching",
    description: "Provider-aware caching with hit stats and cost savings.",
    detail: "/cache \u00B7 Anthropic \u00B7 OpenAI \u00B7 Google",
  },
  {
    icon: PanelLeftClose,
    title: "Terminal Multiplexer",
    description: "Split-pane layouts with focus navigation and scrolling.",
    detail: "/split \u00B7 default \u00B7 split \u00B7 triple \u00B7 quad",
  },
];

const colors = ["text-cyan-400", "text-purple-400", "text-green-400", "text-amber-400"];
const bgColors = ["bg-cyan-500/10", "bg-purple-500/10", "bg-green-500/10", "bg-amber-500/10"];
const borderColors = ["border-cyan-500/15", "border-purple-500/15", "border-green-500/15", "border-amber-500/15"];

export default function CLIFeatures() {
  return (
    <section id="cli-features" className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs border border-amber-500/20 text-amber-400/60 bg-amber-500/[0.06]">
              CLI Design
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mt-4 mb-4">
              Built for <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">Speed</span>
            </h2>
            <p className="text-white/40 max-w-2xl mx-auto leading-relaxed">
              A CLI experience designed for power users. Every interaction is
              optimized for developer velocity.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cliFeatures.map((feature, index) => {
            const ci = index % 4;
            return (
              <ScrollReveal key={feature.title} delay={index * 80}>
                <div className={`glass-card p-5 ${borderColors[ci]} h-full rounded-xl`}>
                  <div className={`w-10 h-10 rounded-lg ${bgColors[ci]} flex items-center justify-center mb-4 ${colors[ci]}`}>
                    <feature.icon size={20} strokeWidth={1.5} />
                  </div>
                  <h3 className={`text-sm font-semibold mb-1.5 ${colors[ci]}`}>
                    {feature.title}
                  </h3>
                  <p className="text-white/45 text-xs leading-relaxed mb-3">
                    {feature.description}
                  </p>
                  <div className="font-mono text-[11px] text-white/25 leading-relaxed">
                    {feature.detail}
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
