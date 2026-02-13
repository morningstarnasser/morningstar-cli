"use client";

import { ExternalLink, Download, Cpu, Zap, Brain, Trophy, Flame, Eye } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

interface ModelCard {
  name: string;
  hfId: string;
  size: string;
  params: string;
  description: string;
  architecture: string;
  context: string;
  highlight?: string;
  badge?: string;
  downloads: string;
  color: string;
  gradient: string;
}

const models: ModelCard[] = [
  {
    name: "Morningstar 14B",
    hfId: "kurdman991/morningstar-14b",
    size: "~9 GB",
    params: "14.2B",
    description: "Daily driver for coding. Fast iteration, 128K context, 100+ languages. QLoRA fine-tuned from Qwen2.5-Coder-14B-Instruct. Grade S on internal benchmark (19/19).",
    architecture: "Qwen2.5-Coder-14B",
    context: "128K",
    highlight: "HumanEval 82.3",
    badge: "DEFAULT",
    downloads: "75+",
    color: "text-amber-400",
    gradient: "from-amber-500/20 to-orange-500/10",
  },
  {
    name: "Morningstar 32B",
    hfId: "kurdman991/morningstar-32b",
    size: "~20 GB",
    params: "32.5B",
    description: "Maximum quality for complex architecture, system design, and deep code review. 64 layers, 128K context. When 14B isn't enough.",
    architecture: "Qwen2.5-Coder-32B",
    context: "128K",
    badge: "FLAGSHIP",
    downloads: "27+",
    color: "text-purple-400",
    gradient: "from-purple-500/20 to-fuchsia-500/10",
  },
  {
    name: "Morningstar Vision",
    hfId: "kurdman991/morningstar-vision",
    size: "~8 GB",
    params: "13B",
    description: "Multimodal model with image understanding. Screenshot-to-code, visual debugging, UI review, diagram analysis. Built on LLaVA 13B.",
    architecture: "LLaVA 13B",
    context: "4K",
    highlight: "Multimodal",
    badge: "VISION",
    downloads: "54+",
    color: "text-cyan-400",
    gradient: "from-cyan-500/20 to-blue-500/10",
  },
];

interface Benchmark {
  name: string;
  morningstar: number;
  qwen_14b: number;
  codellama_34b: number;
  deepseek_33b: number;
}

const benchmarks: Benchmark[] = [
  { name: "HumanEval", morningstar: 82.3, qwen_14b: 79.9, codellama_34b: 53.7, deepseek_33b: 56.1 },
  { name: "HumanEval+", morningstar: 76.8, qwen_14b: 74.2, codellama_34b: 47.0, deepseek_33b: 49.4 },
  { name: "MBPP", morningstar: 76.5, qwen_14b: 74.1, codellama_34b: 56.2, deepseek_33b: 60.8 },
  { name: "MBPP+", morningstar: 65.2, qwen_14b: 62.8, codellama_34b: 47.1, deepseek_33b: 51.3 },
  { name: "MultiPL-E", morningstar: 68.2, qwen_14b: 65.3, codellama_34b: 38.4, deepseek_33b: 42.1 },
  { name: "DS-1000", morningstar: 47.8, qwen_14b: 45.1, codellama_34b: 32.5, deepseek_33b: 37.2 },
];

const capabilities = [
  { label: "100+ Languages", desc: "C, Rust, Go, Python, TS, Solidity & more", color: "text-amber-400" },
  { label: "128K Context", desc: "Read entire codebases in one prompt", color: "text-purple-400" },
  { label: "Uncensored", desc: "No safety filters or content refusal", color: "text-red-400" },
  { label: "Apache 2.0", desc: "Free for commercial & personal use", color: "text-green-400" },
];

function BarChart({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-12 text-right font-mono">{value.toFixed(1)}</span>
    </div>
  );
}

function ModelIcon({ model }: { model: ModelCard }) {
  if (model.hfId.includes("vision")) return <Eye size={24} strokeWidth={1.5} />;
  return <Cpu size={24} strokeWidth={1.5} />;
}

export default function Models() {
  return (
    <section id="models" className="py-32 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Open Source Models
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Our Models on{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                Hugging Face
              </span>
            </h2>
            <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-sm">
              3 purpose-built open-weight models for code generation, architecture design, and vision.
              Free to download, fine-tune, and deploy. Run locally with Ollama.
            </p>
            <a
              href="https://huggingface.co/kurdman991"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-amber-400/80 hover:text-amber-400 text-sm transition-colors"
            >
              <span>huggingface.co/kurdman991</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </ScrollReveal>

        {/* Model Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-20">
          {models.map((m, i) => (
            <ScrollReveal key={m.name} delay={i * 100}>
              <a
                href={`https://huggingface.co/${m.hfId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full"
              >
                <div className={`glass-card rounded-xl p-6 h-full bg-gradient-to-br ${m.gradient} hover:border-amber-500/30 transition-all duration-300 group relative`}>
                  {m.badge && (
                    <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider">
                      {m.badge}
                    </span>
                  )}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${m.color} shrink-0`}>
                      <ModelIcon model={m} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-lg font-bold ${m.color}`}>{m.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded">{m.params}</span>
                        <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded">{m.size}</span>
                        <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded">{m.context}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">{m.description}</p>
                  <div className="flex items-center gap-4 text-xs text-white/30">
                    <span className="flex items-center gap-1">
                      <Brain size={12} /> {m.architecture}
                    </span>
                    <span className="flex items-center gap-1">
                      <Download size={12} /> {m.downloads}
                    </span>
                    <span className="flex items-center gap-1 group-hover:text-amber-400/60 transition-colors ml-auto">
                      <ExternalLink size={12} /> View on HF
                    </span>
                  </div>
                </div>
              </a>
            </ScrollReveal>
          ))}
        </div>

        {/* Benchmarks */}
        <ScrollReveal>
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Trophy size={20} className="text-amber-400" />
              <h3 className="text-2xl font-bold text-white">Benchmark Comparison</h3>
            </div>
            <p className="text-gray-500 text-sm">Morningstar 14B vs popular open-source coding models</p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="glass-card rounded-xl p-6 mb-20 max-w-3xl mx-auto">
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mb-6 text-xs flex-wrap">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-amber-400">Morningstar 14B</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-gray-500" />
                <span className="text-gray-400">Qwen2.5 14B</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-blue-400">CodeLlama 34B</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-green-400">DeepSeek 33B</span>
              </span>
            </div>

            <div className="space-y-5">
              {benchmarks.map((b) => {
                const max = 100;
                const isWinner = b.morningstar >= b.qwen_14b && b.morningstar >= b.codellama_34b && b.morningstar >= b.deepseek_33b;
                return (
                  <div key={b.name}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/70 font-medium">{b.name}</span>
                      {isWinner && <Flame size={14} className="text-amber-400" />}
                    </div>
                    <div className="space-y-1.5">
                      <BarChart value={b.morningstar} max={max} color="bg-amber-500" />
                      <BarChart value={b.qwen_14b} max={max} color="bg-gray-500" />
                      <BarChart value={b.codellama_34b} max={max} color="bg-blue-500" />
                      <BarChart value={b.deepseek_33b} max={max} color="bg-green-500" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-center">
              <p className="text-xs text-white/30">
                Morningstar 14B beats the base Qwen2.5-14B across all benchmarks, and outperforms
                CodeLlama-34B and DeepSeek-33B by a wide margin despite being smaller.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Capabilities */}
        <ScrollReveal>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
              <Zap size={20} className="text-amber-400" />
              Built for Developers
            </h3>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {capabilities.map((c, i) => (
            <ScrollReveal key={c.label} delay={i * 80}>
              <div className="glass-card rounded-xl p-5 text-center hover:border-amber-500/20 transition-all">
                <div className={`text-xl font-bold ${c.color} mb-1`}>{c.label}</div>
                <div className="text-gray-500 text-xs">{c.desc}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={400}>
          <div className="mt-8 text-center">
            <a
              href="https://huggingface.co/kurdman991"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-amber-500/30 text-amber-400 font-bold rounded-lg hover:border-amber-400/60 hover:bg-amber-500/5 transition-all text-sm"
            >
              View all Models on Hugging Face
              <ExternalLink size={16} />
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
