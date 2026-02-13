"use client";

import ScrollReveal from "./ScrollReveal";

const languages = [
  "Python", "TypeScript", "JavaScript", "Node.js", "Deno", "Bun",
  "Go", "Rust", "C", "C++", "C#", "Java", "Kotlin", "Swift",
  "Objective-C", "PHP", "Ruby", "Scala", "Dart", "Elixir",
  "Haskell", "Lua", "Groovy", "Shell", "PowerShell", "R",
  "MATLAB", "SQL", "GraphQL", "Solidity", "Vyper", "Assembly",
  "WebAssembly", "GDScript", "Nim", "Crystal", "Zig", "COBOL",
  "Fortran", "Hack",
];

export default function Languages() {
  return (
    <section id="languages" className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs border border-purple-500/20 text-purple-400/60 bg-purple-500/[0.06]">
              Languages
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mt-4 mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-fuchsia-400">40+</span> Programming Languages
            </h2>
            <p className="text-white/40 max-w-2xl mx-auto leading-relaxed">
              First-class support for every major language. Morningstar understands
              idioms, conventions, and best practices for each one.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="flex flex-wrap justify-center gap-3 max-w-5xl mx-auto">
            {languages.map((lang) => (
              <div
                key={lang}
                className="glass-card px-4 py-2.5 border-purple-500/10 hover:border-purple-500/30 transition-all duration-300 cursor-default"
                style={{ borderRadius: "10px" }}
              >
                <span className="text-sm text-white/70 font-medium">{lang}</span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
