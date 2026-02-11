"use client";

import { useEffect, useState } from "react";
import ScrollReveal from "./ScrollReveal";

const LINES = [
  { text: "★ Model    DeepSeek R1 (Thinking) [deepseek]", color: "text-amber-400" },
  { text: "★ Projekt  my-app (TypeScript / Next.js)", color: "text-amber-400" },
  { text: "", color: "" },
  { text: "> Analysiere dieses Projekt und finde Bugs", color: "text-white", prefix: "  " },
  { text: "", color: "" },
  { text: "┌─ Plan ──────────────────────────────────────────┐", color: "text-gray-600" },
  { text: "│ Ich schaue mir die Projektstruktur an,           │", color: "text-gray-400" },
  { text: "│ dann lese ich die Hauptdateien...                │", color: "text-gray-400" },
  { text: "└────────────────────────────── 2.1s ──────────────┘", color: "text-gray-600" },
  { text: "", color: "" },
  { text: "✔ [read] src/app/page.tsx", color: "text-green-400" },
  { text: "  │ 1│ import { getData } from './lib/api'", color: "text-gray-500" },
  { text: "  │ 2│ export default function Home() {", color: "text-gray-500" },
  { text: "", color: "" },
  { text: "✔ [grep] pattern: \"useEffect\" → 3 matches", color: "text-green-400" },
  { text: "", color: "" },
  { text: "★ Ich habe 3 Probleme gefunden:", color: "text-amber-400" },
  { text: "", color: "" },
  { text: "  1. Missing 'await' in getData() call", color: "text-cyan-400" },
  { text: "  2. useEffect missing dependency array", color: "text-cyan-400" },
  { text: "  3. No error boundary around async component", color: "text-cyan-400" },
];

export default function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );

    const el = document.getElementById("terminal-demo");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (visibleLines >= LINES.length) return;

    const delay = LINES[visibleLines]?.text === "" ? 200 : 120;
    const timer = setTimeout(() => setVisibleLines((v) => v + 1), delay);
    return () => clearTimeout(timer);
  }, [started, visibleLines]);

  return (
    <section className="py-32 px-4 relative z-10">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Live Demo
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Watch it <span className="text-amber-400">think.</span>
            </h2>
          </div>
        </ScrollReveal>

        <div id="terminal-demo" className="terminal-window glow-amber">
          <div className="terminal-header">
            <div className="terminal-dot bg-red-500" />
            <div className="terminal-dot bg-yellow-500" />
            <div className="terminal-dot bg-green-500" />
            <span className="ml-3 text-gray-500 text-sm">
              morningstar — ~/my-app
            </span>
          </div>
          <div className="p-6 font-mono text-sm min-h-[400px]">
            {LINES.slice(0, visibleLines).map((line, i) => (
              <div
                key={i}
                className={`terminal-line ${line.color}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {line.prefix || "  "}
                {line.text || "\u00A0"}
              </div>
            ))}
            {visibleLines < LINES.length && started && (
              <div className="mt-1 ml-2">
                <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
