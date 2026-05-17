"use client";

import { motion } from "framer-motion";
import { Marquee } from "./marquee";
import { NoiseTexture } from "./noise-texture";

const EASE = [0.16, 1, 0.3, 1] as const;

const BAR_CONFIG = [
  { h: 24, color: "#a78bfa" },
  { h: 44, color: "#c084fc" },
  { h: 64, color: "#f472b6" },
  { h: 36, color: "#fb923c" },
  { h: 56, color: "#fbbf24" },
  { h: 72, color: "#34d399" },
  { h: 48, color: "#38bdf8" },
  { h: 68, color: "#818cf8" },
  { h: 32, color: "#a78bfa" },
  { h: 52, color: "#f472b6" },
  { h: 76, color: "#fb923c" },
  { h: 40, color: "#34d399" },
  { h: 58, color: "#38bdf8" },
  { h: 28, color: "#fbbf24" },
  { h: 62, color: "#c084fc" },
  { h: 46, color: "#f472b6" },
];

function AnimatedWaveform() {
  return (
    <>
      <style>{`
        ${BAR_CONFIG.map(
          (b, i) => `
          @keyframes wave-${i} {
            0%, 100% { height: ${b.h * 0.4}px; opacity: 0.4; }
            50% { height: ${b.h}px; opacity: 0.9; }
          }
        `
        ).join("")}
      `}</style>
      <div className="flex w-full max-w-2xl items-end justify-center gap-[4px]" style={{ height: "80px" }}>
        {BAR_CONFIG.map((b, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: "4px",
              backgroundColor: b.color,
              animation: `wave-${i} ${1.2 + (i % 5) * 0.2}s ease-in-out ${i * 0.08}s infinite`,
              height: `${b.h * 0.4}px`,
            }}
          />
        ))}
      </div>
    </>
  );
}

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0f] px-4 text-center">
      <NoiseTexture />

      {/* Colorful gradient mesh blobs */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 20% 20%, rgba(139,92,246,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 30%, rgba(244,114,182,0.10) 0%, transparent 60%),
            radial-gradient(ellipse 40% 50% at 50% 80%, rgba(52,211,153,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 70% 70%, rgba(251,146,60,0.06) 0%, transparent 60%)
          `,
        }}
      />

      {/* Top marquee */}
      <div className="absolute top-0 left-0 right-0 z-10 border-b border-white/[0.06] py-3">
        <Marquee />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-5 pt-12">
        {/* Pill badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5"
        >
          <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
          <span className="font-mono text-xs font-medium text-purple-300">AI Life Organizer</span>
        </motion.div>

        {/* Giant headline */}
        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
          className="font-extrabold tracking-tighter"
          style={{ fontSize: "clamp(56px, 11vw, 130px)", lineHeight: 0.95 }}
        >
          <span className="bg-gradient-to-r from-white via-purple-200 to-white bg-clip-text text-transparent">
            Just talk.
          </span>
        </motion.h1>

        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          className="tracking-tighter"
          style={{ fontSize: "clamp(36px, 8vw, 96px)", lineHeight: 1.0, fontWeight: 300 }}
        >
          <span className="bg-gradient-to-r from-[#71717a] via-purple-400/60 to-[#71717a] bg-clip-text text-transparent">
            Your life gets organized.
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
          className="max-w-xl text-base leading-relaxed text-[#a1a1aa] md:text-lg"
        >
          Tell Ru about your day in plain English — it figures out what&apos;s a task,
          what&apos;s a habit, what needs a reminder.{" "}
          <span className="text-white/80">No forms. No apps. No friction.</span>
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.26, ease: EASE }}
          className="flex flex-wrap items-center justify-center gap-4 pt-2"
        >
          <a
            href="#"
            className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-500/25 transition-all duration-200 hover:scale-[1.03] hover:shadow-xl hover:shadow-purple-500/30"
          >
            Get started — it&apos;s free
          </a>
          <a
            href="#demo"
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3.5 text-base text-[#a1a1aa] transition-all hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-white"
          >
            See how it works ↓
          </a>
        </motion.div>

        {/* Waveform */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5, ease: EASE }}
          className="mt-8 flex w-full items-center justify-center"
        >
          <AnimatedWaveform />
        </motion.div>
      </div>
    </section>
  );
}
