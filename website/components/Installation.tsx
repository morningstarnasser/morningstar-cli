"use client";

import { useState } from "react";
import ScrollReveal from "./ScrollReveal";

const INSTALL_CMD = `git clone https://github.com/morningstarnasser/morningstar-cli.git
cd morningstar-cli
npm install && npm run build && npm link
morningstar`;

export default function Installation() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="install" className="py-32 px-4 relative z-10">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">
                Install
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Get started in{" "}
              <span className="text-amber-400">30 seconds.</span>
            </h2>
            <p className="text-gray-400 mt-4">
              Requires Node.js 18+
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="terminal-window glow-amber-strong relative">
            <div className="terminal-header">
              <div className="terminal-dot bg-red-500" />
              <div className="terminal-dot bg-yellow-500" />
              <div className="terminal-dot bg-green-500" />
              <span className="ml-3 text-gray-500 text-sm">terminal</span>
              <button
                onClick={copy}
                className={`ml-auto text-xs px-3 py-1 rounded border transition-all ${
                  copied
                    ? "border-green-500/50 text-green-400 bg-green-500/10"
                    : "border-gray-700 text-gray-400 hover:border-amber-500/30 hover:text-amber-400"
                }`}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="p-6 font-mono text-sm">
              <div className="text-gray-400">
                <span className="text-green-400">$</span> git clone
                https://github.com/morningstarnasser/morningstar-cli.git
              </div>
              <div className="text-gray-400">
                <span className="text-green-400">$</span> cd morningstar-cli
              </div>
              <div className="text-gray-400">
                <span className="text-green-400">$</span> npm install && npm run
                build && npm link
              </div>
              <div className="text-gray-400 mt-2">
                <span className="text-green-400">$</span>{" "}
                <span className="text-white font-bold">morningstar</span>
              </div>
              <div className="mt-3 text-amber-400">
                ★ Welcome to Morningstar AI
              </div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={400}>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div className="glass-card rounded-xl p-5">
              <div className="text-amber-400 text-lg font-bold mb-1">
                Environment
              </div>
              <code className="text-xs text-gray-400">
                export DEEPSEEK_API_KEY=sk-...
              </code>
            </div>
            <div className="glass-card rounded-xl p-5">
              <div className="text-amber-400 text-lg font-bold mb-1">
                .env File
              </div>
              <code className="text-xs text-gray-400">
                OPENAI_API_KEY=sk-proj-...
              </code>
            </div>
            <div className="glass-card rounded-xl p-5">
              <div className="text-amber-400 text-lg font-bold mb-1">
                Interactive
              </div>
              <code className="text-xs text-gray-400">
                First launch prompts you
              </code>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
