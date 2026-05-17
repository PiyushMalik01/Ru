"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { WaveDivider } from "./wave-divider";
import { ScrollReveal } from "./scroll-reveal";

const RESULT_CARDS = [
  {
    borderColor: "#22c55e",
    bgColor: "rgba(34,197,94,0.08)",
    icon: "✓",
    type: "Activity logged",
    detail: "5K run",
    time: "just now",
    tagColor: "#22c55e",
  },
  {
    borderColor: "#f59e0b",
    bgColor: "rgba(245,158,11,0.08)",
    icon: "○",
    type: "Task created",
    detail: "Grab groceries",
    time: "today",
    tagColor: "#f59e0b",
  },
  {
    borderColor: "#60a5fa",
    bgColor: "rgba(96,165,250,0.08)",
    icon: "🔔",
    type: "Reminder set",
    detail: "Call dentist",
    time: "tomorrow, 9 AM",
    tagColor: "#60a5fa",
  },
  {
    borderColor: "#a78bfa",
    bgColor: "rgba(167,139,250,0.06)",
    icon: "✨",
    type: "Pattern detected",
    detail: "3 runs this week",
    time: "routine forming",
    tagColor: "#a78bfa",
    dashed: true,
  },
];

export function Demo() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <>
      <WaveDivider topColor="#faf7f2" bottomColor="#0a0a0f" />

      <section id="demo" className="relative overflow-hidden bg-[#0a0a0f] px-4 pb-28 pt-20">
        {/* Purple glow behind demo */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(139,92,246,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative mx-auto max-w-5xl">
          <ScrollReveal>
            <h2 className="text-center text-3xl font-bold tracking-tight text-white md:text-5xl">
              One sentence.{" "}
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Everything sorted.
              </span>
            </h2>
          </ScrollReveal>

          {/* Demo container */}
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-12 max-w-2xl overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-[#141418] to-[#0f0f14] shadow-2xl shadow-purple-500/5"
          >
            {/* Top bar */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
              <span className="ml-3 font-mono text-[11px] text-white/20">Ru — Chat</span>
            </div>

            <div className="p-6">
              {/* User message */}
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-[11px] font-bold text-white">
                  P
                </div>
                <div className="mt-0.5 rounded-2xl rounded-tl-md bg-white/[0.06] px-4 py-3">
                  <p className="text-sm leading-relaxed text-[#e4e4e7]">
                    Just finished a 5K run, need to grab groceries on the way home, and remind
                    me to call the dentist tomorrow at 9
                  </p>
                </div>
              </div>

              {/* Ru response */}
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-[11px] font-bold text-white">
                  Ru
                </div>
                <div className="flex-1">
                  <p className="mb-3 text-sm text-white/80">
                    Nice run! 🏃 Here&apos;s what I set up:
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {RESULT_CARDS.map((card, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
                        transition={{
                          duration: 0.5,
                          delay: 0.5 + i * 0.12,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className="flex items-center gap-3 rounded-xl px-4 py-3"
                        style={{
                          background: card.bgColor,
                          borderLeft: `3px ${card.dashed ? "dashed" : "solid"} ${card.borderColor}`,
                        }}
                      >
                        <span className="text-base">{card.icon}</span>
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <div>
                            <span
                              className="block text-[11px] font-semibold uppercase tracking-wider"
                              style={{ color: card.tagColor }}
                            >
                              {card.type}
                            </span>
                            <span className="text-sm font-medium text-white">{card.detail}</span>
                          </div>
                          <span className="font-mono text-xs text-white/30">{card.time}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Input pill */}
              <div className="mt-5 flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
                <span className="flex-1 text-sm text-white/20">Talk to Ru...</span>
                <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white transition-opacity hover:opacity-80">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>

          <ScrollReveal delay={0.3}>
            <p className="mt-8 text-center text-sm text-white/30">
              This is a single AI call. No rules engine. No routing.{" "}
              <span className="text-purple-400/60">Just understanding.</span>
            </p>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
