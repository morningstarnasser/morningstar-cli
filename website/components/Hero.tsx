"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

function MorningStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="starGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="rayGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d97706" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="sparkGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* Main star */}
      <path d="M10.5766 8.70419C11.2099 7.56806 11.5266 7 12 7C12.4734 7 12.7901 7.56806 13.4234 8.70419L13.5873 8.99812C13.7672 9.32097 13.8572 9.48239 13.9975 9.5889C14.1378 9.69541 14.3126 9.73495 14.6621 9.81402L14.9802 9.88601C16.2101 10.1643 16.825 10.3034 16.9713 10.7739C17.1176 11.2443 16.6984 11.7345 15.86 12.715L15.643 12.9686C15.4048 13.2472 15.2857 13.3865 15.2321 13.5589C15.1785 13.7312 15.1965 13.9171 15.2325 14.2888L15.2653 14.6272C15.3921 15.9353 15.4554 16.5894 15.0724 16.8801C14.6894 17.1709 14.1137 16.9058 12.9622 16.3756L12.6643 16.2384C12.337 16.0878 12.1734 16.0124 12 16.0124C11.8266 16.0124 11.663 16.0878 11.3357 16.2384L11.0378 16.3756C9.88634 16.9058 9.31059 17.1709 8.92757 16.8801C8.54456 16.5894 8.60794 15.9353 8.7347 14.6272L8.76749 14.2888C8.80351 13.9171 8.82152 13.7312 8.76793 13.5589C8.71434 13.3865 8.59521 13.2472 8.35696 12.9686L8.14005 12.715C7.30162 11.7345 6.88241 11.2443 7.02871 10.7739C7.17501 10.3034 7.78993 10.1643 9.01977 9.88601L9.33794 9.81402C9.68743 9.73495 9.86217 9.69541 10.0025 9.5889C10.1428 9.48239 10.2328 9.32097 10.4127 8.99812L10.5766 8.70419Z" fill="url(#starGold)" />
      {/* Cardinal rays */}
      <path opacity="0.85" fillRule="evenodd" clipRule="evenodd" d="M12 1.25C12.4142 1.25 12.75 1.58579 12.75 2V4C12.75 4.41421 12.4142 4.75 12 4.75C11.5858 4.75 11.25 4.41421 11.25 4V2C11.25 1.58579 11.5858 1.25 12 1.25ZM1.25 12C1.25 11.5858 1.58579 11.25 2 11.25H4C4.41421 11.25 4.75 11.5858 4.75 12C4.75 12.4142 4.41421 12.75 4 12.75H2C1.58579 12.75 1.25 12.4142 1.25 12ZM19.25 12C19.25 11.5858 19.5858 11.25 20 11.25H22C22.4142 11.25 22.75 11.5858 22.75 12C22.75 12.4142 22.4142 12.75 22 12.75H20C19.5858 12.75 19.25 12.4142 19.25 12ZM12 19.25C12.4142 19.25 12.75 19.5858 12.75 20V22C12.75 22.4142 12.4142 22.75 12 22.75C11.5858 22.75 11.25 22.4142 11.25 22V20C11.25 19.5858 11.5858 19.25 12 19.25Z" fill="url(#rayGold)" />
      {/* Diagonal sparks */}
      <g opacity="0.55">
        <path d="M18.5304 5.46967C18.8233 5.76256 18.8233 6.23744 18.5304 6.53033L18.1872 6.87359C17.8943 7.16648 17.4194 7.16648 17.1265 6.87359C16.8336 6.5807 16.8336 6.10583 17.1265 5.81293L17.4698 5.46967C17.7627 5.17678 18.2376 5.17678 18.5304 5.46967Z" fill="url(#sparkGold)" />
        <path d="M5.46967 5.46979C5.76256 5.17689 6.23744 5.17689 6.53033 5.46979L6.87359 5.81305C7.16648 6.10594 7.16648 6.58081 6.87359 6.87371C6.5807 7.1666 6.10583 7.1666 5.81293 6.87371L5.46967 6.53045C5.17678 6.23755 5.17678 5.76268 5.46967 5.46979Z" fill="url(#sparkGold)" />
        <path d="M6.87348 17.1266C7.16637 17.4195 7.16637 17.8944 6.87348 18.1873L6.53043 18.5303C6.23754 18.8232 5.76266 18.8232 5.46977 18.5303C5.17688 18.2375 5.17688 17.7626 5.46977 17.4697L5.81282 17.1266C6.10571 16.8337 6.58058 16.8337 6.87348 17.1266Z" fill="url(#sparkGold)" />
        <path d="M17.1265 17.1269C17.4194 16.834 17.8943 16.834 18.1872 17.1269L18.5302 17.4699C18.8231 17.7628 18.8231 18.2377 18.5302 18.5306C18.2373 18.8235 17.7624 18.8235 17.4695 18.5306L17.1265 18.1875C16.8336 17.8946 16.8336 17.4198 17.1265 17.1269Z" fill="url(#sparkGold)" />
      </g>
    </svg>
  );
}

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
      {/* Gold Star SVG */}
      <div className="star-glow mb-8">
        <MorningStar className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]" />
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
          <div className="mt-2 text-gray-500 text-xs">
            {" "}
            <span className="text-teal-400">{"\u25D0"} Context</span>
            {" "}
            <span className="text-green-500">{"\u2588\u2588\u2588\u2588\u2588"}</span>
            <span className="text-gray-700">{"\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591"}</span>
            {" "}
            <span className="text-gray-500">24% · Free 76%</span>
          </div>
          <div className="mt-3 text-gray-400">
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
