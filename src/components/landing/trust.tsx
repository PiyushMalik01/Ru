"use client";

import { ScrollReveal } from "./scroll-reveal";
import { WaveDivider } from "./wave-divider";

const PILLARS = [
  {
    icon: "🛡️",
    title: "Bring your own AI",
    body: "Connect OpenAI, Anthropic, or Google. Zero markup on AI costs.",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.15)",
  },
  {
    icon: "🔒",
    title: "Encrypted at rest",
    body: "API keys encrypted with AES-256-GCM. We can't read them even if we wanted to.",
    color: "#38bdf8",
    bg: "rgba(56,189,248,0.08)",
    border: "rgba(56,189,248,0.15)",
  },
  {
    icon: "🚀",
    title: "No vendor lock-in",
    body: "Switch providers or export your data anytime. It's your life, not ours.",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.15)",
  },
];

const PROVIDERS = [
  { name: "OpenAI", color: "#22c55e" },
  { name: "Anthropic", color: "#fb923c" },
  { name: "Google Gemini", color: "#38bdf8" },
  { name: "ChatGPT", color: "#a78bfa" },
];

export function Trust() {
  return (
    <>
      <WaveDivider topColor="#faf7f2" bottomColor="#0a0a0f" />

      <section className="relative overflow-hidden bg-[#0a0a0f] px-4 pb-28 pt-20">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 50% 30%, rgba(56,189,248,0.06) 0%, transparent 60%)",
          }}
        />

        <div className="relative mx-auto max-w-4xl">
          <ScrollReveal>
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
              <span className="text-white">Your keys. Your data. </span>
              <span className="bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                Your rules.
              </span>
            </h2>
          </ScrollReveal>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {PILLARS.map((pillar, i) => (
              <ScrollReveal key={pillar.title} delay={i * 0.1}>
                <div
                  className="flex flex-col gap-4 rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]"
                  style={{ background: pillar.bg, border: `1px solid ${pillar.border}` }}
                >
                  <span className="text-3xl">{pillar.icon}</span>
                  <div>
                    <h3 className="text-base font-semibold text-white">{pillar.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/50">{pillar.body}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={0.3}>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
              {PROVIDERS.map((p) => (
                <span key={p.name} className="font-mono text-sm font-semibold" style={{ color: p.color }}>
                  {p.name}
                </span>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
