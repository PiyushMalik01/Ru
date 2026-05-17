"use client";

import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden" style={{ background: "#faf8f5" }}>
      {/* Top nav bar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <span style={{ fontFamily: "var(--font-serif)", fontSize: "28px", color: "#2d2a26" }}>
          Ru
        </span>
        <div className="flex items-center gap-8">
          <a href="#features" className="text-sm font-medium" style={{ color: "#8a847b" }}>Features</a>
          <a href="#how" className="text-sm font-medium" style={{ color: "#8a847b" }}>How it works</a>
          <a
            href="#"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
            style={{ background: "#e8593c" }}
          >
            Get early access
          </a>
        </div>
      </nav>

      {/* Decorative hand-drawn circle */}
      <svg className="pointer-events-none absolute right-[10%] top-[15%] opacity-[0.07]" width="340" height="340" viewBox="0 0 340 340" fill="none">
        <circle cx="170" cy="170" r="150" stroke="#2d2a26" strokeWidth="2" strokeDasharray="8 6" />
        <circle cx="170" cy="170" r="120" stroke="#e8593c" strokeWidth="1.5" strokeDasharray="4 8" />
      </svg>

      {/* Small decorative dots */}
      <svg className="pointer-events-none absolute left-[8%] bottom-[20%] opacity-[0.08]" width="120" height="120" viewBox="0 0 120 120">
        {[0,1,2,3,4].map(row =>
          [0,1,2,3,4].map(col => (
            <circle key={`${row}-${col}`} cx={12 + col * 24} cy={12 + row * 24} r="2.5" fill="#2d2a26" />
          ))
        )}
      </svg>

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-12 md:px-12 md:pt-20">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="h-px w-10" style={{ background: "#e8593c" }} />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#e8593c" }}>
            AI Life Organizer
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
          style={{ fontFamily: "var(--font-serif)", color: "#2d2a26", fontSize: "clamp(48px, 8vw, 100px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
        >
          Just talk.
          <br />
          <span style={{ color: "#e8593c" }}>Your life</span> gets
          <br />
          organized.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
          className="mt-6 max-w-lg text-lg leading-relaxed"
          style={{ color: "#6b665e" }}
        >
          Tell Ru about your day in plain English. It figures out what&apos;s a task,
          what&apos;s a habit, what needs a reminder. No forms, no apps — just conversation.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <a
            href="#"
            className="rounded-full px-8 py-4 text-base font-semibold text-white transition-all hover:scale-[1.03]"
            style={{ background: "#e8593c" }}
          >
            Get started — it&apos;s free
          </a>
          <a
            href="#how"
            className="rounded-full border-2 px-8 py-4 text-base font-semibold transition-colors hover:bg-[#2d2a26] hover:text-white"
            style={{ borderColor: "#2d2a26", color: "#2d2a26" }}
          >
            See how it works
          </a>
        </motion.div>

        {/* Hero card — conversation preview */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
          className="mt-14 max-w-xl overflow-hidden rounded-2xl border shadow-xl"
          style={{ background: "#fff", borderColor: "#e8e4de" }}
        >
          {/* Card header */}
          <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: "#e8e4de", background: "#f7f4ef" }}>
            <div className="h-3 w-3 rounded-full" style={{ background: "#e8593c" }} />
            <div className="h-3 w-3 rounded-full" style={{ background: "#d4a853" }} />
            <div className="h-3 w-3 rounded-full" style={{ background: "#3d8c6e" }} />
            <span className="ml-3 text-xs font-medium" style={{ color: "#b5af a5" }}>Ru</span>
          </div>

          <div className="p-5">
            {/* User */}
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#d4a853" }}>P</div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3" style={{ background: "#f7f4ef" }}>
                <p className="text-sm leading-relaxed" style={{ color: "#2d2a26" }}>
                  Just finished a 5K run, need groceries on the way home, and remind me to call the dentist tomorrow at 9
                </p>
              </div>
            </div>

            {/* Ru */}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#e8593c" }}>Ru</div>
              <div className="flex-1">
                <p className="mb-3 text-sm font-medium" style={{ color: "#2d2a26" }}>Done! Here&apos;s what I organized:</p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#f0faf4", borderLeft: "3px solid #3d8c6e" }}>
                    <span className="text-xs font-bold" style={{ color: "#3d8c6e" }}>LOGGED</span>
                    <span className="text-sm" style={{ color: "#2d2a26" }}>5K run — just now</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#fef9ee", borderLeft: "3px solid #d4a853" }}>
                    <span className="text-xs font-bold" style={{ color: "#d4a853" }}>TASK</span>
                    <span className="text-sm" style={{ color: "#2d2a26" }}>Buy groceries — today</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ background: "#eef5fb", borderLeft: "3px solid #4a7fb5" }}>
                    <span className="text-xs font-bold" style={{ color: "#4a7fb5" }}>REMINDER</span>
                    <span className="text-sm" style={{ color: "#2d2a26" }}>Call dentist — tomorrow, 9 AM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
