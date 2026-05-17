"use client";

import { ScrollReveal } from "./scroll-reveal";

const PILLARS = [
  {
    accent: "#e8593c",
    title: "Bring your own AI",
    desc: "Connect your OpenAI, Anthropic, or Google key. We never touch your AI costs — you pay the provider directly.",
  },
  {
    accent: "#d4a853",
    title: "Encrypted credentials",
    desc: "Your API keys are encrypted with AES-256-GCM before storage. We literally cannot read them.",
  },
  {
    accent: "#3d8c6e",
    title: "No lock-in, ever",
    desc: "Switch AI providers with one click. Export all your data anytime. It's your life, not ours to keep.",
  },
];

export function Trust() {
  return (
    <section className="relative px-6 py-24 md:px-12 md:py-32" style={{ background: "#faf8f5" }}>
      {/* Decorative hand-drawn underline */}
      <svg className="pointer-events-none absolute right-[8%] top-20 opacity-[0.06]" width="140" height="20" viewBox="0 0 140 20" fill="none">
        <path d="M5 15 C35 5, 70 18, 100 8 C115 4, 130 12, 135 10" stroke="#2d2a26" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-10" style={{ background: "#4a7fb5" }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#4a7fb5" }}>Privacy &amp; Trust</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15 }}>
            Your keys. Your data.
            <br />
            <span style={{ color: "#e8593c" }}>Your rules.</span>
          </h2>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PILLARS.map((p, i) => (
            <ScrollReveal key={p.title} delay={i * 0.1}>
              <div className="rounded-2xl border p-6" style={{ background: "#fff", borderColor: "#e8e4de" }}>
                <div className="mb-4 h-1 w-10 rounded-full" style={{ background: p.accent }} />
                <h3 className="text-lg font-bold" style={{ color: "#2d2a26" }}>{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "#8a847b" }}>{p.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal delay={0.3}>
          <div className="mt-10 flex flex-wrap gap-6" style={{ color: "#b5afa5" }}>
            {["OpenAI", "Anthropic", "Google Gemini", "ChatGPT"].map((p) => (
              <span key={p} className="text-sm font-semibold">{p}</span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
