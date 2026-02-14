"use client";

import { Monitor, Terminal, ArrowRight, Download } from "lucide-react";

export default function DesktopBanner() {
  return (
    <section className="relative z-10 py-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.15em] uppercase text-amber-400 mb-4">
            <span className="w-6 h-px bg-gradient-to-r from-transparent to-amber-400" />
            New
            <span className="w-6 h-px bg-gradient-to-l from-transparent to-amber-400" />
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Prefer a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500">
              Desktop App
            </span>
            ?
          </h2>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Same power. Beautiful GUI. Morningstar Desktop brings the full AI
            coding experience to a premium Electron app.
          </p>
        </div>

        {/* Two cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* CLI Card */}
          <div className="group relative rounded-2xl border border-amber-500/15 bg-black/40 backdrop-blur-sm p-8 transition-all hover:border-amber-500/30 hover:shadow-[0_0_60px_rgba(245,158,11,0.06)]">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent rounded-t-2xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Terminal size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Morningstar CLI</h3>
                <span className="text-xs font-mono text-amber-400/60">
                  You are here
                </span>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Terminal-native AI assistant with 12 tools, agent teams, and full
              codebase intelligence. For developers who live in the terminal.
            </p>
            <ul className="space-y-2 mb-6">
              {[
                "12 built-in tools",
                "Agent teams & custom agents",
                "40+ languages, 19 UI languages",
                "Sandbox mode & prompt caching",
                "Install via npm",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-gray-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="#install"
              className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
            >
              Get Started
              <ArrowRight size={14} />
            </a>
          </div>

          {/* Desktop Card */}
          <div className="group relative rounded-2xl border border-purple-500/15 bg-black/40 backdrop-blur-sm p-8 transition-all hover:border-purple-500/30 hover:shadow-[0_0_60px_rgba(139,92,246,0.06)]">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent rounded-t-2xl" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Monitor size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Morningstar Desktop
                </h3>
                <span className="text-xs font-mono text-purple-400/60">
                  Flagship
                </span>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Premium Electron app with glassmorphism UI, visual code diffs,
              conversation sidebar, and elegant design for macOS & Windows.
            </p>
            <ul className="space-y-2 mb-6">
              {[
                "Beautiful GUI with dark theme",
                "Visual inline diffs & code preview",
                "7 AI providers, 9 tools",
                "Smart agents + custom builder",
                "macOS (.dmg) + Windows (.exe)",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-gray-400"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="https://github.com/morningstarnasser/Morningstar-Desktop"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-sm font-semibold text-purple-300 hover:bg-purple-500/25 hover:border-purple-400/40 transition-all"
            >
              <Download size={14} />
              Get Desktop App
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
