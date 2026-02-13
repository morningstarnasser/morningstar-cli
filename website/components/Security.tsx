"use client";

import { Shield, Lock, Eye, Server, AlertTriangle, Key, Layers } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import type { LucideIcon } from "lucide-react";

interface SecurityFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    icon: Shield,
    title: "8 Permission Modes",
    description: "From strict approval to full bypass — auto, ask, strict, bypassPermissions, acceptEdits, plan, dontAsk, delegate.",
  },
  {
    icon: Server,
    title: "OS-Level Sandbox",
    description: "macOS sandbox-exec and Linux firejail restrict filesystem access to your project directory only.",
  },
  {
    icon: Lock,
    title: "Encrypted Session Memory",
    description: "Session data is encrypted at rest. Conversation history never leaves your machine.",
  },
  {
    icon: Eye,
    title: "Local-Only Mode",
    description: "Run entirely offline with Ollama. Zero data transmitted to external servers.",
  },
  {
    icon: AlertTriangle,
    title: "Injection Prevention",
    description: "Built-in prompt injection detection and sanitization for all AI interactions.",
  },
  {
    icon: Key,
    title: "Hook-Based Access Control",
    description: "14 hook events with JSON decision control — pre/post validation on every tool execution.",
  },
  {
    icon: Layers,
    title: "Per-Project Settings",
    description: "Isolated allow/deny lists, tool restrictions, and command filters per project via .morningstar/settings.local.json.",
  },
];

export default function Security() {
  return (
    <section id="security" className="relative py-24 md:py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs border border-green-500/20 text-green-400/60 bg-green-500/[0.06]">
              Security
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mt-4 mb-4">
              Security <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">First</span>
            </h2>
            <p className="text-white/40 max-w-2xl mx-auto leading-relaxed">
              Your code is your most valuable asset. Morningstar treats it that way.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {securityFeatures.map((feature, index) => (
            <ScrollReveal key={feature.title} delay={index * 100}>
              <div className="glass-card p-6 border-green-500/10 hover:border-green-500/30 h-full rounded-xl transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-base font-semibold text-green-400 mb-2">
                  {feature.title}
                </h3>
                <p className="text-white/40 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
