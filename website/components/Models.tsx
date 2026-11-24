import { Cpu, Terminal, Zap } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

const models = [
  {
    name: "Your Ollama models",
    id: "ollama/<model-id>",
    size: "Your hardware",
    role: "Local inference",
    description: "Choose from the models available on your configured Ollama server.",
    color: "text-emerald-400",
    glow: "from-emerald-500/20 to-teal-500/5",
  },
  {
    name: "Your provider catalog",
    id: "<provider-model-id>",
    size: "Your account",
    role: "Hosted inference",
    description: "Use the models available through your own configured provider credentials.",
    color: "text-amber-400",
    glow: "from-amber-500/20 to-orange-500/5",
  },
  {
    name: "Your connected CLI",
    id: "codex-cli",
    size: "Your login",
    role: "Vendor CLI integration",
    description: "Connect an installed vendor client. Its account access and model availability still apply.",
    color: "text-cyan-400",
    glow: "from-cyan-500/20 to-blue-500/5",
  },
];

export default function Models() {
  return (
    <section id="models" className="py-32 px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/50" />
              <span className="text-amber-400 text-sm tracking-[0.3em] uppercase">Model discovery</span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/50" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Your models. <span className="text-amber-400">Your machine.</span>
            </h2>
            <p className="text-gray-400 mt-4 max-w-2xl mx-auto text-sm leading-relaxed">
              Morningstar discovers models from your configured environment. The examples below
              describe connection types; no model weights, accounts or machine inventory are bundled.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {models.map((model, index) => (
            <ScrollReveal key={model.id} delay={index * 100}>
              <article className={`glass-card rounded-2xl p-6 h-full bg-gradient-to-br ${model.glow} hover:border-amber-500/40 transition-all duration-300 group`}>
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${model.color}`}>
                    <Cpu size={24} strokeWidth={1.5} />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] tracking-widest text-emerald-300 border border-emerald-500/25 bg-emerald-500/10 rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> USER CONFIGURED
                  </span>
                </div>
                <h3 className={`text-xl font-bold ${model.color}`}>{model.name}</h3>
                <p className="text-xs text-white/40 mt-1">{model.role} · {model.size}</p>
                <p className="text-gray-400 text-sm leading-relaxed mt-5 min-h-[3rem]">{model.description}</p>
                <div className="mt-6 pt-4 border-t border-white/5">
                  <code className="block text-[11px] text-gray-400 bg-black/40 rounded-lg px-3 py-2 truncate" title={model.id}>
                    <span className="text-amber-400">$</span> morningstar --model {model.id}
                  </code>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={300}>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="glass-card rounded-xl p-5 flex items-center gap-4">
              <Terminal className="text-amber-400 shrink-0" size={22} />
              <div><div className="text-white font-semibold text-sm">Dynamic discovery</div><div className="text-gray-500 text-xs mt-1">Install a model in Ollama — it appears in /model.</div></div>
            </div>
            <div className="glass-card rounded-xl p-5 flex items-center gap-4">
              <Zap className="text-cyan-400 shrink-0" size={22} />
              <div><div className="text-white font-semibold text-sm">Switch in one command</div><div className="text-gray-500 text-xs mt-1">Change providers or models without leaving your session.</div></div>
            </div>
          </div>
        </ScrollReveal>


      </div>
    </section>
  );
}
