import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MORNINGSTAR CLI — Terminal AI Coding Assistant",
  description:
    "Open-source terminal AI coding assistant with 7 providers, 9 tools, custom agents, and VS Code syntax highlighting. Built with Ink (React) + Shiki.",
  keywords: [
    "AI", "CLI", "terminal", "coding assistant", "DeepSeek", "OpenAI",
    "Claude", "Gemini", "Ollama", "developer tools", "open source",
  ],
  authors: [{ name: "Ali Nasser", url: "https://github.com/morningstarnasser" }],
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.svg",
  },
  openGraph: {
    title: "MORNINGSTAR CLI",
    description: "Your Terminal. Your AI. No Limits.",
    url: "https://morningstar-cli.vercel.app",
    siteName: "Morningstar CLI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MORNINGSTAR CLI",
    description: "Your Terminal. Your AI. No Limits.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body className="bg-black text-white font-mono antialiased">
        {children}
      </body>
    </html>
  );
}
