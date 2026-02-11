import { Check } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const tools = [
  { name: "read", desc: "Read files with line numbers", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  { name: "write", desc: "Create & overwrite files", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { name: "edit", desc: "Find & replace with diffs", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { name: "delete", desc: "Delete files (undoable)", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { name: "bash", desc: "Execute any command", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { name: "grep", desc: "Search patterns in files", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { name: "glob", desc: "Find files by pattern", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { name: "ls", desc: "List directory contents", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { name: "git", desc: "Status + commit history", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
];

export default function Tools() {
  return (
    <section id="tools" className="py-32 px-4 relative z-10">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Tools
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              9 Tools.{" "}
              <span className="text-amber-400">Full Control.</span>
            </h2>
            <p className="text-gray-400 mt-4 max-w-lg mx-auto">
              The AI chains tool calls automatically — up to 5 rounds per
              message. Every file change is undoable.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 60}>
              <div className="glass-card rounded-xl p-5 flex items-start gap-4">
                <span
                  className={`inline-block px-3 py-1 rounded-md text-sm font-bold border ${t.color}`}
                >
                  {t.name}
                </span>
                <span className="text-gray-400 text-sm">{t.desc}</span>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={600}>
          <div className="mt-10 terminal-window max-w-xl mx-auto glow-amber">
            <div className="terminal-header">
              <div className="terminal-dot bg-red-500" />
              <div className="terminal-dot bg-yellow-500" />
              <div className="terminal-dot bg-green-500" />
            </div>
            <div className="p-4 font-mono text-sm">
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 font-bold">{"\u23FA "}</span>
                <span className="text-yellow-400 font-bold">Update</span>
                <span className="text-gray-500">(src/app/page.tsx)</span>
              </div>
              <div className="mt-1">
                <span className="text-gray-500">{" \u23BF  "}</span>
                <span className="text-red-400">- const data = fetchData()</span>
              </div>
              <div>
                <span className="text-gray-500">{"    "}</span>
                <span className="text-green-400">+ const data = await fetchData()</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                <span className="text-blue-400 font-bold">{"\u23FA "}</span>
                <span className="text-blue-400 font-bold">Bash</span>
                <span className="text-gray-500">(npm test)</span>
              </div>
              <div>
                <span className="text-gray-500">{" \u23BF  "}</span>
                <span className="text-white">Tests: 12 passed, 0 failed</span>
              </div>
              <div>
                <span className="text-gray-600">{"    "}</span>
                <span className="text-white">Time: 1.24s</span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
