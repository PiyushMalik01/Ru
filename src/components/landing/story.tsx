"use client";

import { ScrollReveal } from "./scroll-reveal";

export function Story() {
  return (
    <section className="relative overflow-hidden px-6 py-24 md:px-12 md:py-32" style={{ background: "#f0ebe3" }}>
      {/* Hand-drawn squiggle accent */}
      <svg className="pointer-events-none absolute right-[5%] top-12 opacity-[0.06]" width="200" height="60" viewBox="0 0 200 60" fill="none">
        <path d="M5 30 C30 5, 60 55, 90 30 C120 5, 150 55, 195 30" stroke="#2d2a26" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15 }}>
            You open one app to add a task.
            <br className="hidden md:block" />
            Another to log a habit. A third to
            <br className="hidden md:block" />
            set a reminder.{" "}
            <span style={{ color: "#e8593c" }}>Sound familiar?</span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed" style={{ color: "#6b665e" }}>
            By the time you&apos;re done organizing your life, you&apos;ve lost the energy to
            actually live it. Ru replaces the whole stack with a single conversation.
          </p>
        </ScrollReveal>

        {/* Stats */}
        <ScrollReveal delay={0.2}>
          <div className="mt-16 grid grid-cols-3 gap-6">
            {[
              { number: "5 → 1", label: "Apps replaced", accent: "#e8593c" },
              { number: "< 3s", label: "To organize a thought", accent: "#d4a853" },
              { number: "Zero", label: "Forms to fill out", accent: "#3d8c6e" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border p-6"
                style={{ background: "#fff", borderColor: "#e8e4de" }}
              >
                <span
                  className="block text-3xl font-extrabold md:text-4xl"
                  style={{ color: stat.accent, fontFamily: "var(--font-serif)" }}
                >
                  {stat.number}
                </span>
                <span className="mt-2 block text-sm font-medium" style={{ color: "#8a847b" }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
