"use client";

import ScrollReveal from "./ScrollReveal";

interface InterfaceLang {
  name: string;
  native: string;
  flag: string;
  rtl?: boolean;
}

const interfaceLanguages: InterfaceLang[] = [
  { name: "English", native: "English", flag: "\u{1F1EC}\u{1F1E7}" },
  { name: "US English", native: "English", flag: "\u{1F1FA}\u{1F1F8}" },
  { name: "German", native: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}" },
  { name: "French", native: "Fran\u00e7ais", flag: "\u{1F1EB}\u{1F1F7}" },
  { name: "Spanish", native: "Espa\u00f1ol", flag: "\u{1F1EA}\u{1F1F8}" },
  { name: "Italian", native: "Italiano", flag: "\u{1F1EE}\u{1F1F9}" },
  { name: "Arabic", native: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", flag: "\u{1F1F8}\u{1F1E6}", rtl: true },
  { name: "Kurdish", native: "\u06A9\u0648\u0631\u062F\u06CC", flag: "\u{1F7E1}", rtl: true },
  { name: "Turkish", native: "T\u00fcrk\u00e7e", flag: "\u{1F1F9}\u{1F1F7}" },
  { name: "Portuguese", native: "Portugu\u00eas", flag: "\u{1F1F5}\u{1F1F9}" },
  { name: "Dutch", native: "Nederlands", flag: "\u{1F1F3}\u{1F1F1}" },
  { name: "Russian", native: "\u0420\u0443\u0441\u0441\u043A\u0438\u0439", flag: "\u{1F1F7}\u{1F1FA}" },
  { name: "Chinese", native: "\u4E2D\u6587", flag: "\u{1F1E8}\u{1F1F3}" },
  { name: "Japanese", native: "\u65E5\u672C\u8A9E", flag: "\u{1F1EF}\u{1F1F5}" },
  { name: "Korean", native: "\uD55C\uAD6D\uC5B4", flag: "\u{1F1F0}\u{1F1F7}" },
  { name: "Swiss German", native: "Schwiizerd\u00fctsch", flag: "\u{1F1E8}\u{1F1ED}" },
  { name: "Austrian", native: "\u00D6sterreichisch", flag: "\u{1F1E6}\u{1F1F9}" },
  { name: "Chinese (Trad.)", native: "\u7E41\u9AD4\u4E2D\u6587", flag: "\u{1F1F9}\u{1F1FC}" },
  { name: "UK English", native: "British", flag: "\u{1F1EC}\u{1F1E7}" },
];

export default function InterfaceLanguages() {
  return (
    <section id="interface-languages" className="relative py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs border border-cyan-500/20 text-cyan-400/60 bg-cyan-500/[0.06]">
              Internationalization
            </span>
            <h2 className="text-4xl md:text-5xl font-bold mt-4 mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">19</span> Interface Languages
            </h2>
            <p className="text-white/40 max-w-2xl mx-auto leading-relaxed">
              The CLI speaks your language. Full UI translation including prompts,
              errors, and help text. RTL support included.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-w-5xl mx-auto">
            {interfaceLanguages.map((lang) => (
              <div
                key={lang.name}
                className="glass-card p-4 text-center border-cyan-500/10 hover:border-cyan-500/30 transition-all duration-300 cursor-default rounded-xl"
              >
                <div className="text-2xl mb-2">{lang.flag}</div>
                <div className="text-sm text-white/80 font-medium mb-0.5">{lang.name}</div>
                <div className="text-xs text-white/30">{lang.native}</div>
                {lang.rtl && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-300/80 px-2 py-0.5 rounded mt-2 inline-block">
                    RTL
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
