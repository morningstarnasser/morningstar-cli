import {
  Globe, Wrench, Sparkles, Bot, Lock, Brain, Paintbrush, Eye, Palette,
  Radar, GitCompare, Network, ArrowUpCircle, Zap, FileText, Shield,
  Terminal, Puzzle, BookOpen, Cpu, Layers
} from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import type { LucideIcon } from "lucide-react";

const features: { icon: LucideIcon; title: string; desc: string; color: string; badge?: string }[] = [
  {
    icon: Globe,
    title: "7 AI Providers",
    desc: "DeepSeek, OpenAI, Anthropic, Google, Ollama, Groq, OpenRouter — switch mid-session with /model",
    color: "text-amber-400",
  },
  {
    icon: Wrench,
    title: "12 Built-in Tools",
    desc: "read, write, edit, delete, bash, grep, glob, ls, git, web, fetch, gh — with undo, diffs & permissions",
    color: "text-cyan-400",
  },
  {
    icon: Zap,
    title: "Skills System",
    desc: "Reusable prompt-based skills loaded from .md files — auto-trigger on keywords, stack with agents",
    color: "text-yellow-400",
    badge: "NEW",
  },
  {
    icon: Puzzle,
    title: "MCP Integration",
    desc: "Model Context Protocol — connect external tool servers, expose Morningstar as MCP server",
    color: "text-violet-400",
    badge: "NEW",
  },
  {
    icon: Lock,
    title: "8 Permission Modes",
    desc: "auto, ask, strict, bypassPermissions, acceptEdits, plan, dontAsk, delegate — granular access control",
    color: "text-red-400",
    badge: "NEW",
  },
  {
    icon: Cpu,
    title: "Extended Thinking",
    desc: "4 effort levels (low → ultra) with provider-specific thinking params — Anthropic, OpenAI, DeepSeek, Google",
    color: "text-indigo-400",
    badge: "NEW",
  },
  {
    icon: Bot,
    title: "File-Based Agents",
    desc: "Define agents as .md files with YAML frontmatter — custom tools, models, temperature per agent",
    color: "text-green-400",
    badge: "NEW",
  },
  {
    icon: BookOpen,
    title: "Rules System",
    desc: "Project rules from .md files with @import, path patterns, and priority — auto-injected into system prompt",
    color: "text-teal-400",
    badge: "NEW",
  },
  {
    icon: FileText,
    title: "Enhanced Hooks",
    desc: "14 hook events — preToolExecution, postFileWrite, preBash, sessionStart & more with JSON decision control",
    color: "text-orange-400",
    badge: "NEW",
  },
  {
    icon: Layers,
    title: "Agent Teams",
    desc: "Orchestrate multiple agents with roles (lead, worker, reviewer) — shared task queue & sequential execution",
    color: "text-pink-400",
    badge: "NEW",
  },
  {
    icon: Radar,
    title: "Context Radar",
    desc: "Real-time context window monitor — see token usage per segment (System, Chat, Code, Tools) with color-coded bar",
    color: "text-teal-400",
  },
  {
    icon: GitCompare,
    title: "Animated Diff",
    desc: "Code morphing animation — old lines fade out in red, new lines type in green with typewriter effect",
    color: "text-rose-400",
  },
  {
    icon: Network,
    title: "Dependency Graph",
    desc: "ASCII architecture visualization with /graph — scans imports, builds layered topology with box-drawing",
    color: "text-sky-400",
  },
  {
    icon: Shield,
    title: "Sandbox Mode",
    desc: "OS-level sandboxing — macOS sandbox-exec, Linux firejail — restrict filesystem access to project directory",
    color: "text-emerald-400",
    badge: "NEW",
  },
  {
    icon: Terminal,
    title: "Plugin System",
    desc: "Discover, install & manage plugins — registerTool, registerAgent, registerSkill, registerHook API",
    color: "text-purple-400",
    badge: "NEW",
  },
  {
    icon: Sparkles,
    title: "VS Code Highlighting",
    desc: "Shiki-powered syntax highlighting with the vitesse-dark theme — same engine as VS Code",
    color: "text-purple-400",
  },
  {
    icon: Brain,
    title: "Memory & History",
    desc: "Persistent notes + input history across sessions, todo system with priorities, save & restore conversations",
    color: "text-blue-400",
  },
  {
    icon: ArrowUpCircle,
    title: "Smart Auto-Fallback",
    desc: "Cloud API blocked? Auto-fallback to local models. Local too weak? Upgrades to cloud. Seamless multi-tier routing",
    color: "text-yellow-400",
    badge: "NEW",
  },
  {
    icon: Eye,
    title: "Git Checkpoints",
    desc: "Create, list & restore checkpoints — pairs git state with conversation history for full rewind",
    color: "text-emerald-400",
    badge: "NEW",
  },
  {
    icon: Paintbrush,
    title: "AI Image Generation",
    desc: "Nano Banana Pro (Gemini 3) + RealVisXL local fallback — 6 models, auto-fallback, no content filters, saves to ~/Downloads",
    color: "text-pink-400",
    badge: "NEW",
  },
  {
    icon: Palette,
    title: "7 Themes",
    desc: "Default, Ocean, Hacker, Sunset, Nord, Rose, Claude — from bold colors to minimalist monochrome",
    color: "text-orange-400",
  },
];

export default function Features() {
  const newCount = features.filter(f => f.badge === "NEW").length;
  return (
    <section id="features" className="py-32 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Capabilities
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Everything you need.{" "}
              <span className="text-amber-400">Nothing you don&apos;t.</span>
            </h2>
            <p className="text-gray-400 mt-4 max-w-lg mx-auto text-sm">
              {features.length} features. {newCount} brand-new capabilities rivaling Claude Code.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <ScrollReveal key={f.title} delay={i * 60}>
              <div className={`glass-card rounded-xl p-6 h-full relative ${f.badge ? "ring-1 ring-amber-500/30" : ""}`}>
                {f.badge && (
                  <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
                    {f.badge}
                  </span>
                )}
                <div className={`mb-3 ${f.color}`}>
                  <f.icon size={28} strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
