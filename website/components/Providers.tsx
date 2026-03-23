import { Star } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const providers = [
  { name: "DeepSeek", models: "R1 Reasoner, Chat", color: "#4A90D9", cmd: "deepseek-reasoner", css: "provider-deepseek" },
  { name: "OpenAI", models: "o3, o4-mini, GPT-4.1, Codex", color: "#412991", cmd: "o3", css: "provider-openai" },
  { name: "Anthropic", models: "Claude Opus 4, Sonnet 4", color: "#D4A373", cmd: "claude-opus-4-20250514", css: "provider-anthropic" },
  { name: "Google", models: "Gemini 2.5 Flash, 3 Pro + Nano Banana Image", color: "#4285F4", cmd: "gemini-2.0-flash", css: "provider-google" },
  { name: "Ollama", models: "Morningstar 13B, LLaMA 3, Qwen, any local", color: "#22C55E", cmd: "morningstar", css: "provider-ollama" },
  { name: "Groq", models: "LLaMA 3.3, Mixtral", color: "#F55036", cmd: "llama-3.3-70b-versatile", css: "provider-groq" },
  { name: "OpenRouter", models: "Any model via API", color: "#6366F1", cmd: "openrouter/auto", css: "provider-openrouter" },
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
              7 Providers.{" "}
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
