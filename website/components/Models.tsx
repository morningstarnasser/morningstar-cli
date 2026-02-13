"use client";

import { ExternalLink, Download, Cpu, Zap, Brain, Star, Trophy, Flame } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

interface ModelCard {
  name: string;
  hfId: string;
  size: string;
  description: string;
  architecture: string;
  highlight?: string;
  badge?: string;
  downloads: string;
  color: string;
  gradient: string;
}

const models: ModelCard[] = [
  {
    name: "Morningstar 13B",
    hfId: "NewstaR/Morningstar-13b-hf",
    size: "13B",
    description: "Flagship text generation model. Optimized for fluent, coherent output across diverse topics. Strong reasoning and instruction-following.",
    architecture: "LLaMA 2",
    highlight: "812+ Downloads",
    badge: "FLAGSHIP",
    downloads: "812+",
    color: "text-amber-400",
    gradient: "from-amber-500/20 to-orange-500/10",
  },
  {
    name: "Starlight 13B",
    hfId: "NewstaR/Starlight-13B",
    size: "13B",
    description: "Conversational powerhouse with Alpaca-style prompting. Excels at dialogue, summarization, and creative writing tasks.",
    architecture: "LLaMA 2",
    highlight: "778+ Downloads",
    downloads: "778+",
    color: "text-purple-400",
    gradient: "from-purple-500/20 to-fuchsia-500/10",
  },
  {
    name: "OpenStar 13B",
    hfId: "NewstaR/OpenStar-13b",
    size: "13B",
    description: "Open-source research model trained on curated datasets. Part of the OpenStar Family collection for reproducible AI research.",
    architecture: "LLaMA 2",
    downloads: "6",
    color: "text-cyan-400",
    gradient: "from-cyan-500/20 to-blue-500/10",
  },
  {
    name: "ARC 4B",
    hfId: "NewstaR/arc-4b",
    size: "4B",
    description: "Compact reasoning model fine-tuned from Qwen3. Optimized for efficiency — runs on consumer hardware with minimal resources.",
    architecture: "Qwen3",
    badge: "LATEST",
    downloads: "2",
    color: "text-green-400",
    gradient: "from-green-500/20 to-emerald-500/10",
  },
];

interface Benchmark {
  name: string;
  morningstar: number;
  llama2_13b: number;
  mistral_7b: number;
}

const benchmarks: Benchmark[] = [
  { name: "ARC (25-shot)", morningstar: 59.04, llama2_13b: 55.4, mistral_7b: 53.5 },
  { name: "HellaSwag (10-shot)", morningstar: 81.93, llama2_13b: 80.7, mistral_7b: 81.0 },
  { name: "MMLU (5-shot)", morningstar: 54.63, llama2_13b: 55.7, mistral_7b: 60.1 },
  { name: "TruthfulQA (0-shot)", morningstar: 44.12, llama2_13b: 36.2, mistral_7b: 42.2 },
  { name: "Winogrande (5-shot)", morningstar: 74.51, llama2_13b: 72.2, mistral_7b: 75.3 },
];

const datasets = [
  { name: "JaffaMath", size: "458K", desc: "Mathematical reasoning dataset", color: "text-amber-400" },
  { name: "CoTton-67K", size: "67.8K", desc: "Chain-of-Thought training collective", color: "text-purple-400" },
  { name: "Orbita", size: "132K", desc: "Multi-domain instruction dataset", color: "text-cyan-400" },
  { name: "Reasoning-Graded", size: "29.9K", desc: "Graded reasoning evaluation set", color: "text-green-400" },
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
              Open-weight models built by the Morningstar team. Free to download,
              fine-tune, and deploy. Run locally with Ollama or use via the CLI.
            </p>
            <a
              href="https://huggingface.co/NewstaR"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-amber-400/80 hover:text-amber-400 text-sm transition-colors"
            >
              <span>huggingface.co/NewstaR</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </ScrollReveal>

        {/* Model Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-20">
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
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${m.color} shrink-0`}>
                      <Cpu size={24} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`text-lg font-bold ${m.color}`}>{m.name}</h3>
                        <span className="text-xs text-white/30 font-mono bg-white/5 px-2 py-0.5 rounded">{m.size}</span>
                      </div>
                      <p className="text-gray-400 text-sm leading-relaxed mb-3">{m.description}</p>
                      <div className="flex items-center gap-4 text-xs text-white/30">
                        <span className="flex items-center gap-1">
                          <Brain size={12} /> {m.architecture}
                        </span>
                        <span className="flex items-center gap-1">
                          <Download size={12} /> {m.downloads}
                        </span>
                        <span className="flex items-center gap-1 group-hover:text-amber-400/60 transition-colors">
                          <ExternalLink size={12} /> View on HF
                        </span>
                      </div>
                    </div>
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
            <p className="text-gray-500 text-sm">Morningstar 13B vs popular open-source models on standard benchmarks</p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="glass-card rounded-xl p-6 mb-20 max-w-3xl mx-auto">
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mb-6 text-xs">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-amber-400">Morningstar 13B</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-gray-500" />
                <span className="text-gray-400">LLaMA 2 13B</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-blue-400">Mistral 7B</span>
              </span>
            </div>

            <div className="space-y-5">
              {benchmarks.map((b) => {
                const max = 100;
                const isWinner = b.morningstar >= b.llama2_13b && b.morningstar >= b.mistral_7b;
                return (
                  <div key={b.name}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white/70 font-medium">{b.name}</span>
                      {isWinner && <Flame size={14} className="text-amber-400" />}
                    </div>
                    <div className="space-y-1.5">
                      <BarChart value={b.morningstar} max={max} color="bg-amber-500" />
                      <BarChart value={b.llama2_13b} max={max} color="bg-gray-500" />
                      <BarChart value={b.mistral_7b} max={max} color="bg-blue-500" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 text-center">
              <p className="text-xs text-white/30">
                Source: Open LLM Leaderboard. Morningstar beats LLaMA 2 13B on ARC (+3.6), HellaSwag (+1.2),
                Winogrande (+2.3), and TruthfulQA (+7.9).
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Datasets */}
        <ScrollReveal>
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white flex items-center justify-center gap-3">
              <Zap size={20} className="text-amber-400" />
              Open Training Datasets
            </h3>
            <p className="text-gray-500 text-sm mt-2">50+ datasets on Hugging Face — powering the next generation of AI</p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {datasets.map((d, i) => (
            <ScrollReveal key={d.name} delay={i * 80}>
              <div className="glass-card rounded-xl p-5 text-center hover:border-amber-500/20 transition-all">
                <div className={`text-2xl font-bold ${d.color} mb-1`}>{d.size}</div>
                <div className="text-white font-semibold text-sm mb-1">{d.name}</div>
                <div className="text-gray-500 text-xs">{d.desc}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={400}>
          <div className="mt-8 text-center">
            <a
              href="https://huggingface.co/NewstaR"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-amber-500/30 text-amber-400 font-bold rounded-lg hover:border-amber-400/60 hover:bg-amber-500/5 transition-all text-sm"
            >
              View all 19 Models &amp; 50+ Datasets on Hugging Face
              <ExternalLink size={16} />
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
