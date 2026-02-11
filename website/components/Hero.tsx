"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

const ASCII_STAR = `    . .  *  . .
   .  ./ . \\.  .
  .  /  . | .  \\  .
  -- * -----+----- * --
  .  \\  . | .  /  .
   .  .\\ . /.  .
    . .  *  . .`;

const TAGLINE = "Your Terminal. Your AI. No Limits.";

export default function Hero() {
  const [typed, setTyped] = useState("");
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= TAGLINE.length) {
        setTyped(TAGLINE.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const blink = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-32">
      {/* ASCII Star */}
      <div className="star-glow mb-8">
        <pre className="text-amber-400 text-sm sm:text-base md:text-lg leading-relaxed text-center font-mono select-none">
          {ASCII_STAR}
        </pre>
      </div>

      {/* Title */}
      <h1
        className="glitch-text text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-[0.2em] text-white text-glow-amber mb-6"
        data-text="MORNINGSTAR"
      >
        MORNINGSTAR
      </h1>

      {/* Tagline with typing effect */}
      <div className="h-8 mb-10">
        <span className="text-gray-400 text-lg sm:text-xl font-mono">
          {typed}
          <span
            className={`inline-block w-[3px] h-5 bg-amber-400 ml-1 align-middle ${
              showCursor ? "opacity-100" : "opacity-0"
            }`}
          />
        </span>
      </div>

      {/* CTA Buttons */}
      <div className="flex gap-4 mb-16 flex-wrap justify-center">
        <a
          href="#install"
          className="btn-primary relative px-8 py-3 bg-amber-500 text-black font-bold rounded-lg glow-amber-strong hover:bg-amber-400 transition-colors"
        >
          Get Started
        </a>
        <a
          href="https://github.com/morningstarnasser/morningstar-cli"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary relative px-8 py-3 border border-amber-500/30 text-amber-400 font-bold rounded-lg hover:border-amber-400/60 hover:bg-amber-500/5 transition-all"
        >
          View on GitHub
        </a>
      </div>

      {/* Terminal Preview */}
      <div className="w-full max-w-3xl terminal-window glow-amber">
        <div className="terminal-header">
          <div className="terminal-dot bg-red-500" />
          <div className="terminal-dot bg-yellow-500" />
          <div className="terminal-dot bg-green-500" />
          <span className="ml-3 text-gray-500 text-sm">morningstar</span>
        </div>
        <div className="p-6 font-mono text-sm leading-relaxed">
          <div className="text-amber-400 flex items-center gap-2">
            <Star size={12} fill="currentColor" strokeWidth={0} />
            <span>Model</span>
            <span className="ml-4 text-white">DeepSeek R1 (Thinking)</span>
            <span className="text-gray-500">[deepseek]</span>
          </div>
          <div className="text-amber-400 flex items-center gap-2">
            <Star size={12} fill="currentColor" strokeWidth={0} />
            <span>Projekt</span>
            <span className="ml-2 text-white">my-app</span>
            <span className="text-gray-500">(TypeScript / Next.js)</span>
          </div>
          <div className="text-amber-400 flex items-center gap-2">
            <Star size={12} fill="currentColor" strokeWidth={0} />
            <span>Branch</span>
            <span className="ml-3 text-white">main</span>
          </div>
          <div className="mt-3 text-gray-500">
            {"  Tools     "}
            <span className="text-cyan-400">
              read · write · edit · bash · grep · glob · ls · git
            </span>
          </div>
          <div className="text-gray-500">
            {"  Agents    "}
            <span className="text-purple-400">
              code · debug · review · refactor · architect · test
            </span>
          </div>
          <div className="mt-4 text-gray-400">
            {"  > "}
            <span className="text-white">
              Analysiere dieses Projekt und finde Bugs
            </span>
            <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}
