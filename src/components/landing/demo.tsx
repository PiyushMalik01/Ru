"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ScrollReveal } from "./scroll-reveal";

const STEPS = [
  {
    number: "01",
    title: "You speak naturally",
    desc: "\"Just got back from the gym, need to meal prep, and I have a dentist appointment Thursday.\"",
    accent: "#e8593c",
  },
  {
    number: "02",
    title: "Ru understands everything",
    desc: "One AI call — no rules engine, no routing. Ru identifies the activity, the task, and the appointment in a single pass.",
    accent: "#d4a853",
  },
  {
    number: "03",
    title: "Your life is organized",
    desc: "Gym logged. Meal prep added to tasks. Thursday dentist goes on your calendar. All in under 3 seconds.",
    accent: "#3d8c6e",
  },
];

export function Demo() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="how" className="relative px-6 py-24 md:px-12 md:py-32" style={{ background: "#faf8f5" }}>
      {/* Decorative dots */}
      <svg className="pointer-events-none absolute left-[5%] top-[10%] opacity-[0.05]" width="80" height="80" viewBox="0 0 80 80">
        {[0,1,2,3].map(r => [0,1,2,3].map(c => (
          <circle key={`${r}-${c}`} cx={10 + c * 20} cy={10 + r * 20} r="2" fill="#2d2a26" />
        )))}
      </svg>

      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-10" style={{ background: "#d4a853" }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#d4a853" }}>
              How it works
            </span>
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15 }}>
            Three steps. <span style={{ color: "#e8593c" }}>Three seconds.</span>
          </h2>
        </ScrollReveal>

        <div ref={ref} className="mt-16 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border p-8"
              style={{ background: "#fff", borderColor: "#e8e4de" }}
            >
              <span
                className="text-5xl font-extrabold"
                style={{ color: step.accent, fontFamily: "var(--font-serif)", opacity: 0.3 }}
              >
                {step.number}
              </span>
              <h3 className="mt-4 text-xl font-bold" style={{ color: "#2d2a26" }}>
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "#8a847b" }}>
                {step.desc}
              </p>
              {/* Colored underline accent */}
              <div className="mt-6 h-1 w-12 rounded-full" style={{ background: step.accent }} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
