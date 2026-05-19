"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ScrollReveal } from "./scroll-reveal";
import { DotGrid, RuMark } from "./marginalia";

type Step = {
  number: string;
  title: React.ReactNode;
  desc: React.ReactNode;
};

const STEPS: Step[] = [
  {
    number: "01",
    title: "You speak naturally",
    desc: "\"Just got back from the gym, need to meal prep, and I have a dentist appointment Thursday.\"",
  },
  {
    number: "02",
    title: (
      <>
        <RuMark /> understands everything
      </>
    ),
    desc: (
      <>
        One AI call — no rules engine, no routing. <RuMark /> identifies the
        activity, the task, and the appointment in a single pass.
      </>
    ),
  },
  {
    number: "03",
    title: "Your life is organized",
    desc: "Gym logged. Meal prep added to tasks. Thursday dentist goes on your calendar. All in under 3 seconds.",
  },
];

// Animation: waveform bars under card 01 (forest on white bubble)
function WaveformAnimation({ color = "#1a5632" }: { color?: string }) {
  const bars = [0, 1, 2];
  return (
    <div className="mt-4 flex items-end gap-1" aria-hidden="true" style={{ height: 18 }}>
      {bars.map((b) => (
        <motion.span
          key={b}
          style={{
            display: "inline-block",
            width: 3,
            background: color,
            borderRadius: 2,
          }}
          animate={{ height: [6, 16, 8, 14, 6] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: b * 0.18,
          }}
        />
      ))}
    </div>
  );
}

// Animation: dark-ink dots on a lime pill (card 02 — sits on forest)
function ProcessingDots() {
  const dots = [0, 1, 2];
  return (
    <div
      className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
      aria-hidden="true"
      style={{ background: "#d9fb60" }}
    >
      {dots.map((d) => (
        <motion.span
          key={d}
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#0a3438",
          }}
          animate={{ opacity: [0.2, 0.2, 1, 1, 1, 0.2] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
            times: [0, d * 0.2, d * 0.2 + 0.01, 0.9, 0.95, 1],
          }}
        />
      ))}
    </div>
  );
}

// Animation: forest checkmark that draws itself (card 03 — sits on lime)
function DrawingCheck() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="mt-4"
    >
      <motion.path
        d="M6 17 L13 24 L26 9"
        stroke="#1a5632"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: [0, 1, 1, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", times: [0, 0.4, 0.85, 1] }}
      />
    </svg>
  );
}

export function Demo() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="how" className="relative overflow-hidden px-5 py-20 md:px-12 md:py-32" style={{ background: "#f4ecf2" }}>
      <DotGrid className="pointer-events-none absolute left-[5%] top-[10%] hidden md:block" rows={4} cols={4} gap={20} opacity={0.08} />

      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: "#1a5632" }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#1a5632" }}>
              How it works
            </span>
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(30px, 5vw, 56px)", lineHeight: 1.15 }}>
            Three steps. <span style={{ color: "#1a5632" }}>Three seconds.</span>
          </h2>
        </ScrollReveal>

        <div ref={ref} className="relative mt-12 grid gap-8 md:mt-16 md:grid-cols-3 md:gap-8">
          {/* Hand-drawn connector arrows between cards — desktop */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-1/2 hidden h-12 w-full -translate-y-1/2 md:block"
            viewBox="0 0 1000 60"
            preserveAspectRatio="none"
            style={{ zIndex: 1 }}
          >
            <path
              d="M 320 30 C 340 18, 360 42, 380 30"
              stroke="#1a5632"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
            <path d="M 372 22 L 380 30 L 372 38" stroke="#1a5632" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
            <path
              d="M 660 30 C 680 18, 700 42, 720 30"
              stroke="#1a5632"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
            <path d="M 712 22 L 720 30 L 712 38" stroke="#1a5632" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
          </svg>

          {STEPS.map((step, i) => {
            const isBubble = i === 0;
            const isForest = i === 1;
            const isLime = i === 2;

            const cardBg = isForest ? "#1a5632" : isLime ? "#d9fb60" : "#ffffff";
            const numberColor = isForest ? "#d9fb60" : "#1a5632";
            const titleColor = isForest ? "#f5f5f0" : isLime ? "#1a5632" : "#2d2a26";
            const descColor = isForest ? "#a9b2a3" : isLime ? "#1a5632" : "#6b665e";

            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 24 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{
                  y: -6,
                  rotateX: 4,
                  rotateY: -3,
                  scale: 1.02,
                  transition: { duration: 0.25, ease: "easeOut" },
                }}
                className={`relative p-6 md:p-8 ${
                  isBubble ? "rounded-3xl rounded-bl-md border-2" : "rounded-3xl"
                }`}
                style={{
                  background: cardBg,
                  borderColor: isBubble ? "#1a5632" : "transparent",
                  boxShadow: isForest
                    ? "0 16px 40px rgba(13, 31, 21, 0.25)"
                    : isLime
                    ? "0 12px 30px rgba(26, 86, 50, 0.18)"
                    : "0 6px 18px rgba(13, 31, 21, 0.08)",
                  transformStyle: "preserve-3d",
                  perspective: 800,
                  zIndex: 2,
                }}
              >
                {/* Speech-bubble tail on card 01 */}
                {isBubble && (
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute"
                    style={{ left: 18, bottom: -14 }}
                    width="28"
                    height="18"
                    viewBox="0 0 28 18"
                    fill="none"
                  >
                    <path d="M0 0 L24 0 L4 16 Z" fill="#ffffff" />
                    <path d="M0 0 L4 16" stroke="#1a5632" strokeWidth="2" />
                    <path d="M4 16 L24 0" stroke="#1a5632" strokeWidth="2" />
                  </svg>
                )}

                <div className="flex items-baseline gap-3">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      display: "inline-block",
                      color: numberColor,
                      fontFamily: "var(--font-serif)",
                      fontSize: "clamp(56px, 7vw, 96px)",
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                      fontWeight: 800,
                    }}
                  >
                    {step.number}
                  </motion.span>
                  {/* Tiny sketched underline beneath the number */}
                  <svg width="28" height="8" viewBox="0 0 28 8" fill="none" aria-hidden="true">
                    <path
                      d="M2 4 C 8 1, 16 7, 26 3"
                      stroke={numberColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                      fill="none"
                      opacity="0.5"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-xl font-bold" style={{ color: titleColor, fontFamily: "var(--font-serif)" }}>
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: descColor }}>
                  {step.desc}
                </p>
                {isBubble && <WaveformAnimation color="#1a5632" />}
                {isForest && <ProcessingDots />}
                {isLime && <DrawingCheck />}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
