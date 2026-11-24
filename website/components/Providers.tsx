import { Star } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const providers = [
  { name: "DeepSeek", models: "Models available in your account", color: "#4A90D9", cmd: "deepseek-<model>", css: "provider-deepseek" },
  { name: "OpenAI", models: "Models available in your account", color: "#412991", cmd: "gpt-<model>", css: "provider-openai" },
  { name: "Anthropic", models: "Models available in your account", color: "#D4A373", cmd: "claude-<model>", css: "provider-anthropic" },
  { name: "Google", models: "Models available in your account", color: "#4285F4", cmd: "gemini-<model>", css: "provider-google" },
  { name: "NVIDIA NIM", models: "Your configured provider catalog", color: "#76B900", cmd: "nvidia/<model-id>", css: "provider-nvidia" },
  { name: "GitHub Models", models: "Your configured provider catalog", color: "#F0F0F0", cmd: "github/<model-id>", css: "provider-github" },
  { name: "Ollama", models: "Models from your configured local server", color: "#22C55E", cmd: "ollama/<model-id>", css: "provider-ollama" },
  { name: "Claude CLI", models: "Use your local Claude Code login", color: "#D4A373", cmd: "claude-cli", css: "provider-claude-cli" },
  { name: "Codex CLI", models: "Use your local Codex CLI login", color: "#8ECDF8", cmd: "codex-cli", css: "provider-codex-cli" },
  { name: "Groq", models: "Your configured provider catalog", color: "#F55036", cmd: "groq/<model-id>", css: "provider-groq" },
  { name: "OpenRouter", models: "Your configured provider catalog", color: "#6366F1", cmd: "openrouter/<model-id>", css: "provider-openrouter" },
];

export default function Providers() {
  return (
    <section id="providers" className="py-32 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Providers
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              {providers.length} Providers.{" "}
              <span className="text-amber-400">Any Model.</span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {providers.map((p, i) => (
            <ScrollReveal key={p.name} delay={i * 60}>
              <div
                className={`glass-card rounded-xl p-5 text-center ${p.css} transition-all cursor-default`}
              >
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: p.color }}
                >
                  {p.name}
                </div>
                <div className="text-gray-400 text-xs mb-3">{p.models}</div>
                <code className="text-[11px] text-gray-500 bg-black/50 px-2 py-1 rounded">
                  --model {p.cmd}
                </code>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={500}>
          <div className="mt-10 text-center">
            <div className="terminal-window inline-block max-w-md glow-amber">
              <div className="terminal-header">
                <div className="terminal-dot bg-red-500" />
                <div className="terminal-dot bg-yellow-500" />
                <div className="terminal-dot bg-green-500" />
              </div>
              <div className="p-4 font-mono text-sm text-left">
                <div className="text-gray-400">
                  $ <span className="text-white">morningstar --model o3</span>
                </div>
                <div className="text-amber-400 mt-1 flex items-center gap-1">
                  <Star size={12} fill="currentColor" strokeWidth={0} className="inline" />
                  Provider auto-detected: OpenAI
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
