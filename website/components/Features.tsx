import { Globe, Wrench, Sparkles, Bot, Lock, Brain, Paintbrush, Eye, Palette } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import type { LucideIcon } from "lucide-react";

const features: { icon: LucideIcon; title: string; desc: string; color: string }[] = [
  {
    icon: Globe,
    title: "7 AI Providers",
    desc: "DeepSeek, OpenAI, Anthropic, Google, Ollama, Groq, OpenRouter — switch mid-session with /model",
    color: "text-amber-400",
  },
  {
    icon: Wrench,
    title: "9 Built-in Tools",
    desc: "read, write, edit, delete, bash, grep, glob, ls, git — with undo support and colored diffs",
    color: "text-cyan-400",
  },
  {
    icon: Sparkles,
    title: "VS Code Highlighting",
    desc: "Shiki-powered syntax highlighting with the vitesse-dark theme — same engine as VS Code",
    color: "text-purple-400",
  },
  {
    icon: Bot,
    title: "Custom Agents",
    desc: "6 built-in agents + create your own with custom system prompts, export & import as JSON",
    color: "text-green-400",
  },
  {
    icon: Lock,
    title: "Permission System",
    desc: "Per-project permissions with allow/deny lists, 3 modes: auto, ask, strict — like Claude Code",
    color: "text-red-400",
  },
  {
    icon: Brain,
    title: "Memory & History",
    desc: "Persistent notes across sessions, todo system with priorities, save & restore conversations",
    color: "text-blue-400",
  },
  {
    icon: Paintbrush,
    title: "Image Generation",
    desc: "Local Stable Diffusion (txt2img) — generate images directly from your terminal",
    color: "text-pink-400",
  },
  {
    icon: Eye,
    title: "Vision Analysis",
    desc: "Analyze screenshots and images with LLaVA / multimodal models for UI reviews",
    color: "text-emerald-400",
  },
  {
    icon: Palette,
    title: "6 Themes",
    desc: "Default (gold), Ocean (blue), Hacker (green), Sunset (red), Nord (frost), Rose (pink)",
    color: "text-orange-400",
  },
];

export default function Features() {
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
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <ScrollReveal key={f.title} delay={i * 80}>
              <div className="glass-card rounded-xl p-6 h-full">
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
