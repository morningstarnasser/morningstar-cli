import { Star } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-gray-200 py-16 px-4 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        {/* Star icon */}
        <div className="flex justify-center mb-4 text-amber-500">
          <Star size={36} fill="currentColor" strokeWidth={0} />
        </div>

        <div className="text-gray-500 text-sm mb-6">
          Built by{" "}
          <a
            href="https://github.com/morningstarnasser"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-600 hover:text-amber-500 transition-colors"
          >
            Ali Nasser
          </a>
        </div>

        <div className="flex items-center justify-center gap-6 mb-8 text-sm">
          <a
            href="https://github.com/morningstarnasser/morningstar-cli"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-amber-600 transition-colors"
          >
            GitHub
          </a>
          <span className="text-gray-300">·</span>
          <a
            href="https://github.com/morningstarnasser/morningstar-cli/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-amber-600 transition-colors"
          >
            Issues
          </a>
          <span className="text-gray-300">·</span>
          <a
            href="https://github.com/morningstarnasser/morningstar-cli/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-amber-600 transition-colors"
          >
            MIT License
          </a>
        </div>

        <div className="text-gray-400 text-xs font-mono tracking-wider">
          Your Terminal. Your AI. No Limits.
        </div>
      </div>
    </footer>
  );
}
