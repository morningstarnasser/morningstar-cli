"use client";

import { useEffect, useState } from "react";
import { Star, Check, ArrowRight } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

type LineType = "star" | "check" | "arrow" | "text";

interface DemoLine {
  text: string;
  color: string;
  prefix?: string;
  type?: LineType;
}

const LINES: DemoLine[] = [
  { text: "Model    morningstar-14b [local]", color: "text-amber-400", type: "star" },
  { text: "Project  my-app (TypeScript / Next.js)", color: "text-gray-400", type: "star" },
  { text: "Branch   main", color: "text-gray-400", type: "star" },
  { text: "Perms    ask", color: "text-gray-400", type: "star" },
  { text: "", color: "" },
  { text: "> Analysiere dieses Projekt und finde Bugs", color: "text-white", prefix: "  " },
  { text: "", color: "" },
  { text: "\u250C\u2500 Thinking (effort: high) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510", color: "text-gray-600" },
  { text: "\u2502 Scanning project structure and reading        \u2502", color: "text-gray-400" },
  { text: "\u2502 main files for potential issues...             \u2502", color: "text-gray-400" },
  { text: "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 2.1s \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518", color: "text-gray-600" },
  { text: "", color: "" },
  { text: "\u23FA Read(src/app/page.tsx)", color: "text-blue-400", type: "check" },
  { text: "  \u23BF  42 lines", color: "text-gray-500" },
  { text: "", color: "" },
  { text: "\u23FA Search(\"useEffect\")", color: "text-sky-400", type: "check" },
  { text: "  \u23BF  3 matches in 2 files", color: "text-gray-500" },
  { text: "", color: "" },
  { text: "\u23FA Update(src/app/page.tsx)", color: "text-yellow-400", type: "check" },
  { text: "  \u23BF  - const data = fetchData()", color: "text-red-400" },
  { text: "     + const data = await fetchData()", color: "text-green-400" },
  { text: "", color: "" },
  { text: "\u23BF 3 issues found, 1 auto-fixed:", color: "text-white" },
  { text: "", color: "" },
  { text: "  1. \u2705 Missing 'await' in getData() — fixed", color: "text-green-400" },
  { text: "  2. useEffect missing dependency array", color: "text-gray-300" },
  { text: "  3. No error boundary around async component", color: "text-gray-300" },
  { text: "", color: "" },
  { text: "\u2714 Auto-Test [vitest] PASSED (0.8s)", color: "text-green-400", type: "check" },
  { text: "  \u23BF  Tests: 12 passed, 0 failed", color: "text-gray-500" },
  { text: "", color: "" },
  { text: "\u25D0 Context [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591] 34% \u00B7 Free 66% \u00B7 Tokens: 1,847", color: "text-teal-400" },
];

function LineIcon({ type }: { type?: LineType }) {
  if (type === "star") return <Star size={12} fill="currentColor" strokeWidth={0} className="text-gray-500 shrink-0 mt-0.5" />;
  if (type === "check") return <Check size={14} strokeWidth={2.5} className="text-green-400 shrink-0 mt-0.5" />;
  if (type === "arrow") return <ArrowRight size={12} strokeWidth={2} className="text-gray-400 shrink-0 mt-0.5" />;
  return null;
}

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
                className={`terminal-line ${line.color} ${line.type ? "flex items-start gap-1.5" : ""}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {line.type && <LineIcon type={line.type} />}
                <span>{line.prefix || (line.type ? "" : "  ")}{line.text || "\u00A0"}</span>
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
