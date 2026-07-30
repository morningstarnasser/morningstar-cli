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
    "Open-source terminal AI coding assistant with 11 providers, local Ollama models, agents, tools, context intelligence, and safe project automation.",
  keywords: [
    "AI", "CLI", "terminal", "coding assistant", "DeepSeek", "OpenAI",
    "Claude", "Gemini", "Ollama", "developer tools", "open source",
  ],
  authors: [{ name: "Morningstar Contributors", url: "https://github.com/morningstarnasser/morningstar-cli" }],
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.svg",
  },
  openGraph: {
    title: "MORNINGSTAR CLI",
    description: "Your Terminal. Your AI. No Limits.",
    url: "https://morningstar-cli.creativesync.ch",
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
