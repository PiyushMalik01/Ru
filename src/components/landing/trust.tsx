"use client";

import { motion } from "framer-motion";
import { ScrollReveal } from "./scroll-reveal";
import { WobblyUnderline, Squiggle } from "./marginalia";

// Animated key icon — rotates ±5° back and forth
function AnimatedKey() {
  return (
    <motion.svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      animate={{ rotate: [-5, 5, -5] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      style={{ transformOrigin: "center" }}
    >
      <circle cx="9" cy="14" r="5" stroke="#1a5632" strokeWidth="2" fill="none" />
      <path d="M14 14 L25 14" stroke="#1a5632" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 14 L21 18 M25 14 L25 17" stroke="#1a5632" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}

// Animated padlock — shackle unlocks and re-locks every 3s
function AnimatedPadlock() {
  return (
    <svg width="32" height="32" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="6" y="13" width="16" height="11" rx="2" stroke="#ffffff" strokeWidth="2" fill="none" />
      <motion.path
        d="M9 13 V9 C 9 5, 19 5, 19 9 V13"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        animate={{ y: [0, -3, -3, 0, 0], rotate: [0, -12, -12, 0, 0] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
          times: [0, 0.25, 0.55, 0.8, 1],
        }}
        style={{ transformOrigin: "9px 13px" }}
      />
      <circle cx="14" cy="18" r="1.5" fill="#ffffff" />
    </svg>
  );
}

// Animated door/arrow — moves right then comes back
function AnimatedExit() {
  return (
    <motion.svg
      width="32"
      height="32"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      animate={{ x: [0, 6, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <path d="M5 14 H22" stroke="#d9fb60" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 8 L22 14 L16 20" stroke="#d9fb60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </motion.svg>
  );
}

const PROVIDER_DOTS = ["#1a5632", "#d9fb60", "#1fd7df", "#2a2270"];

export function Trust() {
  return (
    <section className="relative overflow-hidden px-5 py-20 md:px-12 md:py-32" style={{ background: "#f4ecf2" }}>
      {/* Marginalia */}
      <Squiggle className="pointer-events-none absolute right-[8%] top-20 hidden md:block" width={160} height={22} opacity={0.35} color="#2a2270" />

      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: "#2a2270" }} />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#2a2270" }}>Privacy &amp; Trust</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(30px, 5vw, 56px)", lineHeight: 1.15 }}>
            Your keys. Your data.
            <br />
            <span style={{ color: "#1a5632", position: "relative", display: "inline-block" }}>
              Your rules.
              <WobblyUnderline color="#1a5632" opacity={0.9} thickness={5} />
            </span>
          </h2>
        </ScrollReveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-3 sm:gap-7 md:mt-14">
          {/* Card 1 — White card, BYOK sticker, tilted */}
          <ScrollReveal delay={0}>
            <motion.div
              whileHover={{ y: -6, rotate: 0.5, scale: 1.02, transition: { duration: 0.3, ease: "easeOut" } }}
              className="relative h-full rounded-3xl p-6"
              style={{
                background: "#ffffff",
                border: "2px solid #1a5632",
                transform: "rotate(-1.5deg)",
                transformStyle: "preserve-3d",
                perspective: "1000px",
              }}
            >
              {/* BYOK sticker */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "-12px",
                  right: "-10px",
                  padding: "4px 10px",
                  background: "#d9fb60",
                  color: "#1a5632",
                  border: "2px solid #1a5632",
                  boxShadow: "2px 3px 0 0 #1a5632",
                  borderRadius: 999,
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  transform: "rotate(5deg)",
                  zIndex: 2,
                }}
              >
                BYOK
              </div>
              <div
                className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: "#d9fb60" }}
              >
                <AnimatedKey />
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#1a5632", fontFamily: "var(--font-serif)" }}>
                Bring your own AI
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#5a6258" }}>
                Connect your OpenAI, Anthropic, or Google key. We never touch your AI costs — you pay the provider directly.
              </p>
            </motion.div>
          </ScrollReveal>

          {/* Card 2 — Solid lavender, large white padlock */}
          <ScrollReveal delay={0.1}>
            <motion.div
              whileHover={{ y: -6, rotate: 3, scale: 1.02, transition: { duration: 0.3, ease: "easeOut" } }}
              className="relative h-full rounded-3xl p-6"
              style={{
                background: "#c8c3ff",
                transform: "rotate(1deg)",
                transformStyle: "preserve-3d",
                perspective: "1000px",
              }}
            >
              <div className="mb-5">
                <AnimatedPadlock />
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#2a2270", fontFamily: "var(--font-serif)" }}>
                Encrypted credentials
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#2a2270", opacity: 0.78 }}>
                Your API keys are encrypted with AES-256-GCM before storage. We literally cannot read them.
              </p>
            </motion.div>
          </ScrollReveal>

          {/* Card 3 — Solid dark-ink, lime headline + exit arrow */}
          <ScrollReveal delay={0.2}>
            <motion.div
              whileHover={{ y: -6, rotate: 0, scale: 1.02, transition: { duration: 0.3, ease: "easeOut" } }}
              className="relative h-full rounded-3xl p-6"
              style={{
                background: "#0d1f15",
                transform: "rotate(-2deg)",
                transformStyle: "preserve-3d",
                perspective: "1000px",
              }}
            >
              <div className="mb-5">
                <AnimatedExit />
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#d9fb60", fontFamily: "var(--font-serif)" }}>
                No lock-in, ever
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#a9b2a3" }}>
                Switch AI providers with one click. Export all your data anytime. It’s your life, not ours to keep.
              </p>
            </motion.div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.3}>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2" style={{ color: "#b5afa5" }}>
            {["OpenAI", "Anthropic", "Google Gemini", "ChatGPT"].map((p, i) => (
              <span key={p} className="inline-flex items-center gap-2 text-sm font-semibold">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: PROVIDER_DOTS[i % PROVIDER_DOTS.length] }}
                />
                {p}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
