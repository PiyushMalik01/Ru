"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ScrollReveal } from "./scroll-reveal";
import { Squiggle, RuMark } from "./marginalia";

const CHAIN = [
  { name: "AI chat", sub: "generate" },
  { name: "Doc", sub: "paste & shape" },
  { name: "Tracker", sub: "split into tasks" },
  { name: "Calendar", sub: "schedule the bits" },
];

export function Story() {
  const statsRef = useRef<HTMLDivElement>(null);
  const statsInView = useInView(statsRef, { once: true, amount: 0.3 });

  return (
    <section className="relative mx-3 overflow-hidden rounded-[32px] px-5 py-20 md:mx-6 md:rounded-[40px] md:px-12 md:py-32" style={{ background: "#d9fb60" }}>
      {/* Floating Polaroid-sticker character — breaks out of the chip top-left */}
      <motion.div
        className="pointer-events-none absolute -top-6 left-6 hidden md:block"
        aria-hidden="true"
        animate={{ rotate: [-3, 3, -3] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
          <circle cx="70" cy="50" r="22" stroke="#1a5632" strokeWidth="2.5" fill="#ffffff" />
          <rect x="48" y="70" width="44" height="44" rx="6" stroke="#1a5632" strokeWidth="2.5" fill="#ffffff" />
          <circle cx="62" cy="48" r="2.5" fill="#1a5632" />
          <circle cx="78" cy="48" r="2.5" fill="#1a5632" />
          <path d="M62 56 Q 70 62 78 56" stroke="#1a5632" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <line x1="70" y1="28" x2="70" y2="18" stroke="#1a5632" strokeWidth="2" />
          <circle cx="70" cy="15" r="3" fill="#1a5632" />
        </svg>
      </motion.div>

      <Squiggle className="pointer-events-none absolute right-[6%] top-12 hidden md:block" width={220} height={28} opacity={0.4} color="#1a5632" />

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#0d1f15", fontSize: "clamp(28px, 5vw, 56px)", lineHeight: 1.15 }}>
            You open one app to add a task. Another to log a habit. A third to set a reminder.{" "}
            <span style={{ color: "#1a5632", position: "relative", display: "inline-block" }}>
              Sound familiar?
            </span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="mt-6 max-w-2xl text-base leading-relaxed md:mt-8 md:text-lg" style={{ color: "#0d1f15" }}>
            And it’s worse than that. You generate a plan in one tool, paste it
            into another, split it into tasks in a third, schedule the bits in a
            fourth. By the time you’re done, you’ve forgotten what you set out
            to do. <RuMark /> replaces the whole chain with a single conversation.
          </p>
        </ScrollReveal>

        {/* Tool-chain visual — desktop */}
        <ScrollReveal delay={0.18}>
          <div className="mt-10 hidden items-center gap-3 md:flex">
            {CHAIN.map((tool, i) => (
              <div key={tool.name} className="flex items-center gap-3">
                <div className="relative">
                  <div className="rounded-xl border-2 px-4 py-3 text-center" style={{ borderColor: "#c9c2b7", background: "#f4ecf2", borderStyle: "dashed" }}>
                    <span className="block text-sm font-bold line-through" style={{ color: "#8a847b" }}>{tool.name}</span>
                    <span className="block text-[10px] font-medium uppercase tracking-wider" style={{ color: "#b5afa5" }}>{tool.sub}</span>
                  </div>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-1 -top-1 h-[calc(100%+8px)] w-[calc(100%+8px)]"
                    viewBox="0 0 100 60"
                    preserveAspectRatio="none"
                    fill="none"
                  >
                    <path
                      d="M5 12 C 30 8, 55 50, 95 48"
                      stroke="#1a5632"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      fill="none"
                      opacity="0.5"
                    />
                  </svg>
                </div>
                {i < CHAIN.length - 1 && (
                  <span className="text-lg" style={{ color: "#c9c2b7" }}>→</span>
                )}
              </div>
            ))}
            <span className="mx-3 text-lg" style={{ color: "#1a5632" }}>becomes</span>
            <div className="rounded-xl border-2 px-5 py-3 text-center shadow-sm" style={{ borderColor: "#1a5632", background: "#1a5632" }}>
              <span className="block text-base font-bold" style={{ fontFamily: "var(--font-serif)" }}>
                <span style={{ color: "#f5f5f0" }}>ru</span><span style={{ color: "#d9fb60" }}>.</span>
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wider" style={{ color: "#d9fb60" }}>one conversation</span>
            </div>
          </div>

          {/* Mobile-friendly version — stacked */}
          <div className="mt-8 flex flex-col gap-2 md:hidden">
            <div className="flex flex-wrap gap-2">
              {CHAIN.map((tool) => (
                <div key={tool.name} className="rounded-lg border-2 border-dashed px-3 py-1.5" style={{ borderColor: "#c9c2b7", background: "#f4ecf2" }}>
                  <span className="text-xs font-bold line-through" style={{ color: "#8a847b" }}>{tool.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs" style={{ color: "#8a847b" }}>becomes</span>
              <div className="rounded-lg border-2 px-3 py-1.5" style={{ borderColor: "#1a5632", background: "#fff" }}>
                <span className="text-xs font-bold" style={{ fontFamily: "var(--font-serif)" }}>
                  <span style={{ color: "#2d2a26" }}>ru</span><span style={{ color: "#d9fb60" }}>.</span>{" "}
                  <span style={{ color: "#1a5632" }}>— one conversation</span>
                </span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Stats — three differently-shaped cards: Polaroid / Stopwatch / Folded-paper */}
        <div ref={statsRef} className="mt-12 grid grid-cols-1 items-center gap-8 sm:grid-cols-3 sm:gap-6 md:mt-14">
          {/* Card 1 — Polaroid */}
          <ScrollReveal delay={0.25}>
            <motion.div
              className="relative mx-auto flex flex-col items-center justify-center"
              style={{
                background: "#ffffff",
                border: "4px solid #1a5632",
                boxShadow: "4px 6px 0 0 #0d1f15",
                width: "100%",
                maxWidth: 260,
                padding: "28px 18px 36px",
                rotate: "-2deg",
              }}
              whileHover={{ y: -6, rotate: 0, transition: { duration: 0.3 } }}
            >
              <motion.span
                style={{
                  color: "#1a5632",
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(54px, 7vw, 72px)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  display: "inline-block",
                  transformOrigin: "center",
                }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={
                  statsInView
                    ? { scale: [1, 1.05, 1], opacity: 1 }
                    : { scale: 0.6, opacity: 0 }
                }
                transition={
                  statsInView
                    ? {
                        scale: {
                          duration: 0.5,
                          repeat: Infinity,
                          repeatDelay: 6.5,
                          ease: "easeInOut",
                          delay: 0.9,
                        },
                        opacity: { duration: 0.6, delay: 0.25, ease: "easeOut" },
                      }
                    : { duration: 0.6, delay: 0.25, ease: "easeOut" }
                }
              >
                5 → 1
              </motion.span>
              <span
                className="mt-3"
                style={{
                  color: "#1a5632",
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: 18,
                }}
              >
                apps replaced
              </span>
            </motion.div>
          </ScrollReveal>

          {/* Card 2 — Stopwatch */}
          <ScrollReveal delay={0.33}>
            <motion.div
              className="relative mx-auto flex flex-col items-center justify-center rounded-full"
              style={{
                background: "#1a5632",
                width: 240,
                height: 240,
                rotate: "3deg",
                boxShadow: "0 8px 24px rgba(13, 31, 21, 0.18)",
              }}
              whileHover={{ y: -6, rotate: 5, transition: { duration: 0.3 } }}
            >
              {/* Stopwatch top button */}
              <span
                aria-hidden="true"
                className="absolute"
                style={{
                  top: -10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 18,
                  height: 12,
                  background: "#d9fb60",
                  borderRadius: 3,
                }}
              />
              <span
                aria-hidden="true"
                className="absolute"
                style={{
                  top: -16,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 8,
                  height: 8,
                  background: "#d9fb60",
                  borderRadius: 999,
                }}
              />
              <motion.span
                style={{
                  color: "#d9fb60",
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(48px, 6vw, 64px)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  display: "inline-block",
                  transformOrigin: "center",
                }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={
                  statsInView
                    ? { scale: [1, 1.05, 1], opacity: 1 }
                    : { scale: 0.6, opacity: 0 }
                }
                transition={
                  statsInView
                    ? {
                        scale: {
                          duration: 0.5,
                          repeat: Infinity,
                          repeatDelay: 6.5,
                          ease: "easeInOut",
                          delay: 1.0,
                        },
                        opacity: { duration: 0.6, delay: 0.33, ease: "easeOut" },
                      }
                    : { duration: 0.6, delay: 0.33, ease: "easeOut" }
                }
              >
                &lt; 3s
              </motion.span>
              <span
                className="mt-2 px-6 text-center"
                style={{
                  color: "rgba(245, 245, 240, 0.75)",
                  fontSize: 12,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                }}
              >
                to organize a thought
              </span>
            </motion.div>
          </ScrollReveal>

          {/* Card 3 — Folded paper */}
          <ScrollReveal delay={0.41}>
            <motion.div
              className="relative mx-auto"
              style={{
                background: "#ffffff",
                border: "2px solid #c8c3ff",
                width: "100%",
                maxWidth: 260,
                padding: "28px 22px 32px",
                rotate: "1deg",
                // Folded corner via clip-path (top-right triangle cut)
                clipPath:
                  "polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%)",
              }}
              whileHover={{ y: -6, rotate: 3, transition: { duration: 0.3 } }}
            >
              {/* Folded corner triangle overlay */}
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{ top: 0, right: 0 }}
                width="30"
                height="30"
                viewBox="0 0 30 30"
                fill="none"
              >
                <path d="M30 0 L0 0 L30 30 Z" fill="#f0edff" />
                <path d="M30 0 L0 0 L30 30" stroke="#c8c3ff" strokeWidth="2" fill="none" />
              </svg>
              <motion.span
                style={{
                  color: "#2a2270",
                  fontFamily: "var(--font-serif)",
                  fontSize: "clamp(54px, 7vw, 72px)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  display: "inline-block",
                  transformOrigin: "left center",
                }}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={
                  statsInView
                    ? { scale: [1, 1.05, 1], opacity: 1 }
                    : { scale: 0.6, opacity: 0 }
                }
                transition={
                  statsInView
                    ? {
                        scale: {
                          duration: 0.5,
                          repeat: Infinity,
                          repeatDelay: 6.5,
                          ease: "easeInOut",
                          delay: 1.1,
                        },
                        opacity: { duration: 0.6, delay: 0.41, ease: "easeOut" },
                      }
                    : { duration: 0.6, delay: 0.41, ease: "easeOut" }
                }
              >
                Zero
              </motion.span>
              <span
                className="mt-3 block"
                style={{
                  color: "rgba(42, 34, 112, 0.7)",
                  fontFamily: "var(--font-serif)",
                  fontSize: 16,
                  fontStyle: "italic",
                }}
              >
                forms to fill out
              </span>
            </motion.div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
