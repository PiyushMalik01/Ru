"use client";

import { ScrollReveal } from "./scroll-reveal";
import { WaveDivider } from "./wave-divider";

const STATS = [
  { value: "5 → 1", label: "apps replaced", color: "#7c3aed" },
  { value: "< 3s", label: "to organize a thought", color: "#f97316" },
  { value: "0", label: "forms to fill", color: "#14b8a6" },
];

export function Story() {
  return (
    <>
      <WaveDivider topColor="#0a0a0f" bottomColor="#faf7f2" />

      <section className="relative overflow-hidden bg-[#faf7f2] px-4 pb-28 pt-20">
        {/* Decorative colored blobs */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `
              radial-gradient(circle 300px at 90% 20%, rgba(139,92,246,0.08) 0%, transparent 60%),
              radial-gradient(circle 250px at 10% 80%, rgba(251,146,60,0.06) 0%, transparent 60%),
              radial-gradient(circle 200px at 50% 50%, rgba(244,114,182,0.04) 0%, transparent 60%)
            `,
          }}
        />

        <div className="relative mx-auto max-w-4xl">
          <ScrollReveal>
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-[#1a1a1a] md:text-5xl">
              You weren&apos;t meant to be your own{" "}
              <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                personal assistant.
              </span>
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <div className="mt-8 max-w-2xl space-y-4 text-base leading-relaxed text-[#6b6560] md:text-lg">
              <p>
                You open one app to add a task. Another to log a habit. A third to set a
                reminder. By the time you&apos;re done organizing your life, you&apos;ve lost
                the energy to actually live it.
              </p>
              <p className="font-semibold text-[#1a1a1a]">
                Ru changes that. One conversation replaces the whole stack.
              </p>
            </div>
          </ScrollReveal>

          {/* Colorful stats */}
          <ScrollReveal delay={0.2}>
            <div className="mt-16 grid grid-cols-3 gap-4 md:gap-8">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col gap-2 rounded-2xl border border-[#1a1a1a]/5 bg-white/60 p-5 backdrop-blur-sm"
                >
                  <span
                    className="font-mono text-3xl font-extrabold md:text-5xl"
                    style={{ color: stat.color, letterSpacing: "-0.03em" }}
                  >
                    {stat.value}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#9a9590] md:text-sm">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
