"use client";

import ScrollReveal from "./ScrollReveal";

interface CLIFeature {
  icon: string;
  title: string;
  description: string;
  detail: string;
}

const cliFeatures: CLIFeature[] = [
  {
    icon: "\u2328\uFE0F",
    title: "Interactive Mode",
    description: "Full autocomplete, syntax highlighting, and inline suggestions.",
    detail: "Tab completion for commands, flags, and file paths",
  },
  {
    icon: "\uD83C\uDF0A",
    title: "Streaming Output",
    description: "Watch AI responses stream in real-time with live formatting.",
    detail: "Token-by-token rendering with markdown support",
  },
  {
    icon: "\uD83D\uDCCA",
    title: "Live Diff View",
    description: "Review every change before it is applied with highlighted diffs.",
    detail: "Claude Code-style inline diffs with line numbers",
  },
  {
    icon: "\u2318",
    title: "Keyboard Shortcuts",
    description: "Power-user shortcuts for maximum velocity.",
    detail: "ctrl+o expand \u00B7 ctrl+c cancel \u00B7 Esc+Esc rewind \u00B7 Ctrl+R search",
  },
  {
    icon: "\uD83E\uDDE0",
    title: "Extended Thinking",
    description: "4 effort levels with provider-specific thinking parameters.",
    detail: "/effort low|medium|high|ultra \u00B7 /ultrathink",
  },
  {
    icon: "\u21A9\uFE0F",
    title: "Checkpoints & Rewind",
    description: "Git-based checkpoints paired with conversation state.",
    detail: "/checkpoint create \u00B7 /rewind N \u00B7 Esc+Esc undo",
  },
  {
    icon: "\uD83D\uDCDD",
    title: "Vim Mode",
    description: "Native Vim keybindings for the input editor.",
    detail: "Normal, Insert, motions, and ex commands",
  },
  {
    icon: "\uD83D\uDD17",
    title: "! Bash Mode",
    description: "Prefix with ! to execute shell commands directly.",
    detail: "!npm test \u00B7 !git status \u00B7 instant execution",
  },
  {
    icon: "\uD83D\uDCCB",
    title: "Skills & Rules",
    description: "Reusable .md-based skills and project rules with auto-trigger.",
    detail: "/skill:list \u00B7 /rules list \u00B7 YAML frontmatter",
  },
  {
    icon: "\uD83D\uDD0C",
    title: "MCP & Plugins",
    description: "Connect external tool servers and install community plugins.",
    detail: "/mcp add \u00B7 /plugins install \u00B7 Plugin API",
  },
  {
    icon: "\uD83D\uDEE1\uFE0F",
    title: "Sandbox Mode",
    description: "OS-level sandboxing restricts filesystem access.",
    detail: "--sandbox \u00B7 macOS sandbox-exec \u00B7 Linux firejail",
  },
  {
    icon: "\uD83D\uDCE4",
    title: "Export & Copy",
    description: "Export conversations as markdown, copy last response.",
    detail: "/export \u00B7 /copy \u00B7 /rename session",
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
                  <div className={`w-10 h-10 rounded-lg ${bgColors[ci]} flex items-center justify-center text-xl mb-4`}>
                    {feature.icon}
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
