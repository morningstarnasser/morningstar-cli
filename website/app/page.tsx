import Hero from "@/components/Hero";
import Features from "@/components/Features";
import TerminalDemo from "@/components/TerminalDemo";
import Providers from "@/components/Providers";
import Tools from "@/components/Tools";
import Installation from "@/components/Installation";
import Footer from "@/components/Footer";
import MatrixRain from "@/components/MatrixRain";

export default function Home() {
  return (
    <main className="relative bg-black min-h-screen bg-grid scanline overflow-hidden">
      {/* Matrix rain background */}
      <MatrixRain />

      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDuration: `${4 + Math.random() * 6}s`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <Hero />

      <div className="section-divider" />
      <Features />

      <div className="section-divider" />
      <TerminalDemo />

      <div className="section-divider" />
      <Providers />

      <div className="section-divider" />
      <Tools />

      <div className="section-divider" />
      <Installation />

      <Footer />
    </main>
  );
}
