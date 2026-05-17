"use client";

import { ScrollReveal } from "./scroll-reveal";

const FEATURES = [
  {
    tag: "Voice",
    accent: "#e8593c",
    title: "Talk like you think",
    desc: "No typing, no tapping, no forms. Just speak naturally — Ru picks up context, intent, and nuance from your voice. Powered by Deepgram Nova-3.",
    visual: (
      <div className="flex items-end gap-[3px]" style={{ height: "48px" }}>
        {[14, 28, 38, 22, 42, 32, 18, 36, 24, 40, 16, 30].map((h, i) => (
          <div key={i} className="w-[4px] rounded-full" style={{ height: `${h}px`, background: "#e8593c", opacity: 0.3 + (h / 42) * 0.5 }} />
        ))}
      </div>
    ),
  },
  {
    tag: "Smart",
    accent: "#d4a853",
    title: "One sentence does it all",
    desc: "Mention a task, a habit, and an appointment in the same breath. Ru separates them, categorizes them, and files them — all in a single AI call.",
    visual: (
      <div className="flex flex-col gap-1.5">
        {[
          { label: "Activity", color: "#3d8c6e" },
          { label: "Task", color: "#d4a853" },
          { label: "Reminder", color: "#4a7fb5" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: `${item.color}12`, border: `1px solid ${item.color}30` }}>
            <div className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            <span className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    tag: "Patterns",
    accent: "#3d8c6e",
    title: "Habits you didn&apos;t know you had",
    desc: "Ru spots that you run every Monday, read every Thursday, and skip cooking on Fridays. It surfaces these patterns so you can lean into them.",
    visual: (
      <div className="flex gap-1.5">
        {["M","T","W","T","F","S","S"].map((d, i) => {
          const filled = [0,2,4,6].includes(i);
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold"
                style={filled
                  ? { background: "#3d8c6e", color: "#fff" }
                  : { background: "#f0ebe3", color: "#b5afa5" }
                }
              >
                {filled ? "✓" : ""}
              </div>
              <span className="text-[9px] font-medium" style={{ color: "#b5afa5" }}>{d}</span>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    tag: "Insights",
    accent: "#4a7fb5",
    title: "Your day at a glance",
    desc: "Morning briefs, evening summaries, weekly trends. Ru turns raw activity into clear insights — without you lifting a finger.",
    visual: (
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: "4", l: "Done", c: "#3d8c6e" },
          { v: "2", l: "Pending", c: "#d4a853" },
          { v: "12d", l: "Streak", c: "#e8593c" },
          { v: "↑", l: "Trend", c: "#4a7fb5" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg p-2 text-center" style={{ background: "#f7f4ef" }}>
            <span className="block text-lg font-extrabold" style={{ color: s.c }}>{s.v}</span>
            <span className="text-[9px] font-medium uppercase" style={{ color: "#b5afa5" }}>{s.l}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden px-6 py-24 md:px-12 md:py-32" style={{ background: "#f0ebe3" }}>
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-10" style={{ background: "#3d8c6e" }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#3d8c6e" }}>Features</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15 }}>
            Everything you need.
            <br />
            <span style={{ color: "#8a847b" }}>Nothing you don&apos;t.</span>
          </h2>
        </ScrollReveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {FEATURES.map((feat, i) => (
            <ScrollReveal key={feat.tag} delay={i * 0.08}>
              <div
                className="flex flex-col justify-between rounded-2xl border p-8 transition-shadow hover:shadow-lg"
                style={{ background: "#fff", borderColor: "#e8e4de", minHeight: "320px" }}
              >
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: feat.accent }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: feat.accent }}>{feat.tag}</span>
                  </div>
                  <h3 className="text-2xl font-bold" style={{ color: "#2d2a26", fontFamily: "var(--font-serif)" }}>
                    {feat.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "#8a847b" }}>
                    {feat.desc}
                  </p>
                </div>
                <div className="mt-8">
                  {feat.visual}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
