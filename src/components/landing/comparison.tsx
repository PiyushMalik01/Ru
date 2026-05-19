"use client";

import { motion } from "framer-motion";
import { ScrollReveal } from "./scroll-reveal";
import { Squiggle, RuMark } from "./marginalia";

const BEFORE_STACK = [
  "AI chat",
  "Notion doc",
  "Todoist",
  "Apple Calendar",
  "Sticky note",
];

function MiniWaveform() {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: "22px" }}>
      {[10, 18, 12, 20, 8].map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-sm"
          style={{ background: "#d9fb60" }}
          animate={{ height: [h, h * 1.6, h * 0.55, h] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: i * 0.14,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Row of tiny lime dots for After card top decoration
function VoiceSampleDots() {
  // varying heights to suggest a quiet waveform
  const dots = [3, 5, 4, 7, 4, 6, 3, 5, 4, 6, 5, 7, 4, 5, 3, 6, 4, 5, 3, 5];
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-[6px]"
      style={{ height: 10 }}
    >
      {dots.map((d, i) => (
        <motion.span
          key={i}
          style={{
            display: "inline-block",
            width: 3,
            height: 3,
            borderRadius: 999,
            background: "#d9fb60",
          }}
          animate={{ opacity: [0.25, 1, 0.25], scale: [1, d / 4, 1] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.06,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function Comparison() {
  return (
    <section
      className="relative overflow-hidden px-5 py-20 md:px-12 md:py-32"
      style={{ background: "#f4ecf2" }}
    >
      <Squiggle
        className="pointer-events-none absolute left-[6%] top-14 hidden md:block"
        width={220}
        height={26}
        opacity={0.42}
        color="#1fd7df"
      />
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: "#1a5632" }} />
            <span
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#1a5632" }}
            >
              Before / after
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              color: "#2d2a26",
              fontSize: "clamp(30px, 5vw, 56px)",
              lineHeight: 1.12,
            }}
          >
            Organizing your day shouldn&rsquo;t take{" "}
            <span style={{ fontStyle: "italic", color: "#1a5632" }}>
              longer than the day.
            </span>
          </h2>
        </ScrollReveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:mt-16 md:grid-cols-2">
          {/* LEFT — Before as faux browser window */}
          <ScrollReveal delay={0.1}>
            <motion.div
              className="relative overflow-hidden rounded-2xl"
              style={{
                background: "#ffffff",
                border: "1px solid #d8d2c6",
                transformStyle: "preserve-3d",
                perspective: 800,
              }}
              whileHover={{
                y: -6,
                rotateY: -3,
                scale: 1.02,
                transition: { duration: 0.3, ease: "easeOut" },
              }}
            >
              {/* Faux browser titlebar */}
              <div
                className="flex items-center gap-3 border-b px-4 py-3"
                style={{ borderColor: "#ece7dd", background: "#faf8f3" }}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block rounded-full"
                    style={{ width: 10, height: 10, background: "#1fd7df" }}
                  />
                  <span
                    aria-hidden="true"
                    className="inline-block rounded-full"
                    style={{ width: 10, height: 10, background: "#c8c3ff" }}
                  />
                  <span
                    aria-hidden="true"
                    className="inline-block rounded-full"
                    style={{ width: 10, height: 10, background: "#d9fb60" }}
                  />
                </div>
                <div
                  className="flex-1 truncate rounded-md px-3 py-1 text-[11px] font-medium"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #ece7dd",
                    color: "#8a847b",
                    letterSpacing: "0.02em",
                  }}
                >
                  your-day &middot; today
                </div>
              </div>

              <div className="relative p-8 md:p-10">
                {/* Squiggle marginalia top-right (inside body) */}
                <div
                  className="pointer-events-none absolute right-5 top-6"
                  aria-hidden="true"
                >
                  <Squiggle width={48} height={14} opacity={0.5} color="#2a2270" />
                </div>

                <span
                  className="block text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "#8a847b" }}
                >
                  Before &middot; today
                </span>

                <div className="mt-6 flex items-baseline gap-3">
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      color: "#2d2a26",
                      fontSize: "clamp(56px, 10vw, 120px)",
                      lineHeight: 0.95,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    47
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      color: "#2d2a26",
                      fontSize: "clamp(28px, 5vw, 56px)",
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    min
                  </span>
                </div>
                <p
                  className="mt-3 text-base md:text-lg"
                  style={{ color: "#6b665e" }}
                >
                  to get the day on paper
                </p>

                <ul className="mt-8 flex flex-col gap-2">
                  {BEFORE_STACK.map((tool) => (
                    <li
                      key={tool}
                      className="flex items-center gap-3 text-sm font-medium md:text-base"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block"
                        style={{ width: 10, height: 2, background: "#c9c2b7", borderRadius: 2 }}
                      />
                      <span
                        className="line-through"
                        style={{ color: "#8a847b" }}
                      >
                        {tool}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </ScrollReveal>

          {/* RIGHT — After as dark voice surface */}
          <ScrollReveal delay={0.2}>
            <motion.div
              className="relative overflow-hidden rounded-2xl p-8 md:p-10"
              style={{
                background: "#0d1f15",
                transformStyle: "preserve-3d",
                perspective: 800,
              }}
              whileHover={{
                y: -6,
                rotateY: 3,
                scale: 1.02,
                transition: { duration: 0.3, ease: "easeOut" },
              }}
            >
              {/* Row of lime voice-sample dots — top decoration (not a strip) */}
              <div className="mb-6">
                <VoiceSampleDots />
              </div>

              <span
                className="block text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: "#d9fb60" }}
              >
                After &middot; with ru.
              </span>

              <div className="mt-6 flex items-baseline gap-3">
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    color: "#d9fb60",
                    fontSize: "clamp(56px, 10vw, 120px)",
                    lineHeight: 0.95,
                    letterSpacing: "-0.03em",
                  }}
                >
                  9
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    color: "#d9fb60",
                    fontSize: "clamp(28px, 5vw, 56px)",
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  sec
                </span>
              </div>
              <p
                className="mt-3 text-base md:text-lg"
                style={{ color: "rgba(217, 251, 96, 0.72)" }}
              >
                to tell <RuMark /> everything
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm"
                  style={{ background: "#d9fb60", color: "#1a5632" }}
                >
                  <span style={{ fontFamily: "var(--font-serif)" }}>
                    ru<span style={{ color: "#1a5632" }}>.</span>
                  </span>
                  <span
                    className="text-[11px] font-medium uppercase tracking-[0.15em]"
                    style={{ color: "#1a5632" }}
                  >
                    one conversation
                  </span>
                </span>
                <MiniWaveform />
              </div>
            </motion.div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
