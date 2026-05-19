"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ScrollReveal } from "./scroll-reveal";
import { Squiggle, RuMark } from "./marginalia";

type Scenario = {
  tag: string;
  accent: string;
  userBubble: string;
  prompt: string;
  Response: React.FC;
};

// ──────────────────────────────────────────────────────────────────────────────
// Card 1 — Plan a roadmap
// Phases appear one at a time, hold, then fade out and loop.
// ──────────────────────────────────────────────────────────────────────────────
function RoadmapResponse() {
  const [phase, setPhase] = useState(-1);

  useEffect(() => {
    let mounted = true;
    const cycle = () => {
      if (!mounted) return;
      setPhase(-1);
      const t1 = setTimeout(() => mounted && setPhase(0), 600);
      const t2 = setTimeout(() => mounted && setPhase(1), 1500);
      const t3 = setTimeout(() => mounted && setPhase(2), 2400);
      const t4 = setTimeout(() => mounted && setPhase(-1), 4900); // fade out
      return [t1, t2, t3, t4];
    };
    let timers: ReturnType<typeof setTimeout>[] | undefined = cycle();
    const interval = setInterval(() => {
      if (timers) timers.forEach(clearTimeout);
      timers = cycle();
    }, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
      if (timers) timers.forEach(clearTimeout);
    };
  }, []);

  const phases = [
    {
      phase: "Phase 1 · Design polish",
      when: "Apr 21 — May 5",
      labelColor: "#1a5632",
      borderColor: "#1a5632",
      badge: { bg: "#1a5632", text: "#ffffff" },
      items: ["Final UI sweep", "Empty / error states", "Onboarding copy"],
    },
    {
      phase: "Phase 2 · Private beta",
      when: "May 6 — May 31",
      labelColor: "#1a5632",
      borderColor: "#1a5632",
      badge: { bg: "#d9fb60", text: "#1a5632" },
      items: ["Invite 40 testers", "Weekly feedback review", "Ship 2 hot-fixes"],
    },
    {
      phase: "Phase 3 · GA",
      when: "Jun 1 — Jun 15",
      labelColor: "#0a3438",
      borderColor: "#1fd7df",
      badge: { bg: "#1fd7df", text: "#0a3438" },
      items: ["Marketing site live", "Pricing tiers final", "Launch on Jun 15"],
    },
  ];

  return (
    <div>
      <p className="mb-3 text-sm font-medium" style={{ color: "#2d2a26" }}>
        Opened workspace · <span style={{ color: "#1a5632", fontWeight: 600 }}>Beta launch roadmap</span>
      </p>
      <div className="flex flex-col gap-3">
        {phases.map((p, idx) => (
          <motion.div
            key={p.phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: phase >= idx ? 1 : 0, y: phase >= idx ? 0 : 8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-lg border-l-2 pl-3"
            style={{ borderColor: p.borderColor }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-4 items-center rounded px-1.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: p.badge.bg, color: p.badge.text }}
                >
                  {idx + 1}
                </span>
                <span className="text-xs font-bold" style={{ color: p.labelColor }}>
                  {p.phase}
                </span>
              </div>
              <span className="text-[10px] font-medium" style={{ color: "#b5afa5" }}>
                {p.when}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {p.items.map((it) => (
                <span key={it} className="text-[12px]" style={{ color: "#6b665e" }}>
                  · {it}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Card 2 — Declare a routine
// Clock rotates continuously, nudge level word cycles.
// ──────────────────────────────────────────────────────────────────────────────
function RoutineResponse() {
  const NUDGES = ["Silent", "Gentle", "Active"];
  const [nudgeIdx, setNudgeIdx] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setNudgeIdx((i) => (i + 1) % NUDGES.length);
    }, 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <motion.p
        className="mb-3 text-sm font-medium"
        style={{ color: "#2d2a26" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        Routine added.
      </motion.p>
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: "#1a563230", background: "#e6f4ec" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-bold"
            style={{ color: "#2d2a26", fontFamily: "var(--font-serif)" }}
          >
            Morning meditation
          </span>
          <motion.span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "#1a5632", color: "#d9fb60" }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            Daily
          </motion.span>
        </div>
        <div
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          style={{ color: "#6b665e" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <motion.svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: "50% 50%" }}
            >
              <circle cx="7" cy="7" r="5.5" stroke="#1a5632" strokeWidth="1.4" fill="none" />
              <path
                d="M7 4 V7 L9.5 8.5"
                stroke="#1a5632"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </motion.svg>
            7:00 AM
          </span>
          <span className="inline-flex items-center">
            Nudge ·{" "}
            <span className="relative ml-1 inline-block" style={{ minWidth: 56 }}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={NUDGES[nudgeIdx]}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3 }}
                  style={{ color: "#1a5632", fontWeight: 600 }}
                  className="inline-block"
                >
                  {NUDGES[nudgeIdx]}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Card 3 — Check a streak
// Heatmap fills left to right, holds, resets and loops.
// ──────────────────────────────────────────────────────────────────────────────
function StreakResponse() {
  const intensities = [3, 2, 4, 3, 4, 1, 4, 4, 3, 4, 2, 4, 3, 4];
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cellIdx = 0;

    const step = () => {
      if (!mounted) return;
      cellIdx += 1;
      setFilled(cellIdx);
      if (cellIdx >= intensities.length) {
        timeoutId = setTimeout(() => {
          cellIdx = 0;
          setFilled(0);
          timeoutId = setTimeout(step, 400);
        }, 1500);
      } else {
        timeoutId = setTimeout(step, 150);
      }
    };
    timeoutId = setTimeout(step, 400);
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [intensities.length]);

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "#2d2a26" }}>
        You’re on a <span style={{ color: "#1a5632", fontWeight: 700 }}>12-day</span> running streak.
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg p-2.5" style={{ background: "#f5f5f0" }}>
          <span
            className="block text-xl font-extrabold"
            style={{ color: "#1a5632", fontFamily: "var(--font-serif)" }}
          >
            12
          </span>
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "#8a847b" }}
          >
            Current
          </span>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: "#f5f5f0" }}>
          <span
            className="block text-xl font-extrabold"
            style={{ color: "#1a5632", fontFamily: "var(--font-serif)" }}
          >
            24
          </span>
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "#8a847b" }}
          >
            Best
          </span>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: "#f5f5f0" }}>
          <span
            className="block text-xl font-extrabold"
            style={{ color: "#1a5632", fontFamily: "var(--font-serif)" }}
          >
            5/7
          </span>
          <span
            className="text-[10px] font-medium uppercase tracking-wider"
            style={{ color: "#8a847b" }}
          >
            This wk
          </span>
        </div>
      </div>
      {/* Mini heatmap row */}
      <div className="mt-3 flex gap-1">
        {intensities.map((intensity, i) => {
          const on = filled > i;
          return (
            <motion.div
              key={i}
              className="h-3 flex-1 rounded-sm"
              animate={{
                background: on
                  ? `rgba(26, 86, 50, ${intensity * 0.22})`
                  : "rgba(26, 86, 50, 0)",
                borderColor: on ? "rgba(26, 86, 50, 0)" : "rgba(26, 86, 50, 0.18)",
              }}
              transition={{ duration: 0.25 }}
              style={{ borderWidth: 1, borderStyle: "solid" }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Dark watch-face heatmap variant — lime on ink, used inside Scenario 3.
function WatchHeatmap() {
  const intensities = [3, 2, 4, 3, 4, 1, 4, 4, 3, 4, 2, 4, 3, 4];
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cellIdx = 0;
    const step = () => {
      if (!mounted) return;
      cellIdx += 1;
      setFilled(cellIdx);
      if (cellIdx >= intensities.length) {
        timeoutId = setTimeout(() => {
          cellIdx = 0;
          setFilled(0);
          timeoutId = setTimeout(step, 400);
        }, 1500);
      } else {
        timeoutId = setTimeout(step, 150);
      }
    };
    timeoutId = setTimeout(step, 400);
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [intensities.length]);

  return (
    <div className="mt-2.5 flex gap-1">
      {intensities.map((intensity, i) => {
        const on = filled > i;
        return (
          <motion.div
            key={i}
            className="h-2.5 flex-1 rounded-sm"
            animate={{
              background: on
                ? `rgba(217, 251, 96, ${intensity * 0.22})`
                : "rgba(217, 251, 96, 0)",
              borderColor: on ? "rgba(217, 251, 96, 0)" : "rgba(217, 251, 96, 0.22)",
            }}
            transition={{ duration: 0.25 }}
            style={{ borderWidth: 1, borderStyle: "solid" }}
          />
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Card 4 — Tweak on the fly
// 7:00 toggles to struck-through, 6:30 slides in from the right, loops.
// ──────────────────────────────────────────────────────────────────────────────
function TweakResponse() {
  const [struck, setStruck] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setStruck((s) => !s), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <p className="mb-3 text-sm font-medium" style={{ color: "#2d2a26" }}>
        Updated <span style={{ color: "#2a2270", fontWeight: 600 }}>Morning routine</span>.
      </p>
      <div className="flex items-center gap-3">
        <motion.span
          className="rounded-lg px-3 py-1.5 text-sm"
          animate={{
            textDecoration: struck ? "line-through" : "none",
            color: struck ? "#b5afa5" : "#2a2270",
            background: struck ? "#f5f5f0" : "#eee9ff",
          }}
          transition={{ duration: 0.4 }}
          style={{ background: "#eee9ff", color: "#2a2270" }}
        >
          7:00 AM
        </motion.span>
        <motion.svg
          width="20"
          height="14"
          viewBox="0 0 20 14"
          fill="none"
          aria-hidden="true"
          animate={{ opacity: struck ? 1 : 0, x: struck ? 0 : -6 }}
          transition={{ duration: 0.4 }}
        >
          <path d="M2 7 H 16" stroke="#2a2270" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M12 3 L 16 7 L 12 11"
            stroke="#2a2270"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </motion.svg>
        <motion.span
          className="rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ background: "#c8c3ff", color: "#2a2270" }}
          animate={{ opacity: struck ? 1 : 0, x: struck ? 0 : 20 }}
          transition={{ duration: 0.4 }}
        >
          6:30 AM
        </motion.span>
      </div>
      <p className="mt-3 text-xs" style={{ color: "#8a847b" }}>
        Takes effect tomorrow · Active routine
      </p>
    </div>
  );
}

const SCENARIOS: Scenario[] = [
  {
    tag: "Plan a roadmap",
    accent: "#1a5632",
    userBubble: "#1a5632",
    prompt: "Plan our beta launch — design polish in 2 weeks, private beta in May, GA on June 15.",
    Response: RoadmapResponse,
  },
  {
    tag: "Declare a routine",
    accent: "#1a5632",
    userBubble: "#1a5632",
    prompt: "I want to meditate every morning at 7 — keep nudges gentle.",
    Response: RoutineResponse,
  },
  {
    tag: "Check a streak",
    accent: "#1a5632",
    userBubble: "#1a5632",
    prompt: "How’s my running streak doing?",
    Response: StreakResponse,
  },
  {
    tag: "Tweak on the fly",
    accent: "#2a2270",
    userBubble: "#2a2270",
    prompt: "Push my morning routine to 6:30 from tomorrow.",
    Response: TweakResponse,
  },
];

export function Scenarios() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      className="relative overflow-hidden px-5 py-20 md:px-12 md:py-32"
      style={{ background: "#f4ecf2" }}
    >
      {/* Marginalia */}
      <Squiggle
        className="pointer-events-none absolute right-[8%] top-16 hidden md:block"
        width={200}
        height={22}
        opacity={0.38}
        color="#1a5632"
      />
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px w-10" style={{ background: "#1a5632" }} />
            <span
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#1a5632" }}
            >
              What you can say
            </span>
          </div>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              color: "#2d2a26",
              fontSize: "clamp(30px, 5vw, 56px)",
              lineHeight: 1.15,
            }}
          >
            More than logs and lists.{" "}
            <span style={{ color: "#8a847b" }}>Anything you’d tell a friend.</span>
          </h2>
          <p
            className="mt-6 max-w-2xl text-base leading-relaxed md:text-lg"
            style={{ color: "#6b665e" }}
          >
            Roadmap a launch in one breath. Set a routine with the nudge level
            you want. Ask about a streak. Move a habit by half an hour.{" "}
            <RuMark /> understands the shape of each request and responds in kind.
          </p>
        </ScrollReveal>

        <div className="mt-10 flex items-center gap-2 md:mt-12">
          <motion.span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "#d9fb60" }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: "#1a5632" }}>
            live · 4 conversations
          </span>
        </div>

        <div ref={ref} className="mt-8 grid gap-8 md:mt-10 md:grid-cols-2 md:gap-8">
          {SCENARIOS.map((s, i) => {
            const Response = s.Response;

            // Shared per-card entrance + hover motion props
            const baseMotion = {
              initial: { opacity: 0, y: 24 },
              animate: isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
              transition: { duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] as const },
              whileHover: {
                y: -6,
                rotateY: i % 2 === 0 ? -3 : 3,
                rotateX: 2,
                scale: 1.02,
                transition: { duration: 0.3, ease: "easeOut" as const },
              },
            };

            // ── Scenario 1 — Plan a roadmap → DESKTOP BROWSER WINDOW ──
            if (i === 0) {
              return (
                <motion.div
                  key={s.tag}
                  {...baseMotion}
                  className="relative mx-auto w-full overflow-hidden rounded-2xl shadow-xl"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #d8d2c6",
                    maxWidth: "440px",
                    rotate: "-1deg",
                    transformStyle: "preserve-3d",
                    perspective: "1200px",
                  }}
                >
                  {/* Titlebar */}
                  <div
                    className="flex items-center gap-3 border-b px-3 py-2.5"
                    style={{ borderColor: "#ece7dd", background: "#faf8f4" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#1fd7df" }} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#c8c3ff" }} />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#d9fb60" }} />
                    </div>
                    <div
                      className="flex-1 truncate rounded-full px-3 py-1 text-center text-[11px] font-medium"
                      style={{
                        background: "#ffffff",
                        border: "1px solid #ece7dd",
                        color: "#8a847b",
                      }}
                    >
                      ru.app/workspace/beta-launch
                    </div>
                  </div>

                  {/* Card header */}
                  <div
                    className="flex items-center justify-between border-b px-5 py-3"
                    style={{ borderColor: "#ece7dd", background: "#f5f5f0" }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: s.accent }} />
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: s.accent }}
                      >
                        {s.tag}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: "#b5afa5" }}
                    >
                      ru.
                    </span>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: "#c8c3ff", color: "#2a2270" }}
                      >
                        P
                      </div>
                      <div
                        className="rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                        style={{ background: "#f5f5f0" }}
                      >
                        <p className="text-sm leading-relaxed" style={{ color: "#2d2a26" }}>
                          {s.prompt}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: s.userBubble }}
                      >
                        ru
                      </div>
                      <div className="flex-1">
                        <Response />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            }

            // ── Scenario 2 — Declare a routine → iOS NOTIFICATION BANNER ──
            if (i === 1) {
              return (
                <motion.div
                  key={s.tag}
                  {...baseMotion}
                  className="relative mx-auto w-full overflow-hidden rounded-3xl"
                  style={{
                    background: "#f5f4fa",
                    boxShadow: "0 12px 30px rgba(42, 34, 112, 0.18)",
                    maxWidth: "460px",
                    rotate: "1.5deg",
                    transformStyle: "preserve-3d",
                    perspective: "1200px",
                  }}
                >
                  {/* Lock-screen header row */}
                  <div className="flex items-center gap-2.5 px-4 pt-3.5">
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold"
                      style={{ background: "#c8c3ff", color: "#2a2270" }}
                    >
                      ru
                    </div>
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "#2a2270" }}
                    >
                      ru
                    </span>
                    <span className="text-[11px]" style={{ color: "#8a83b8" }}>
                      now
                    </span>
                  </div>

                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: s.accent }} />
                      <span
                        className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: s.accent }}
                      >
                        {s.tag}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-medium uppercase tracking-wider"
                      style={{ color: "#2a2270" }}
                    >
                      ru.
                    </span>
                  </div>

                  <div className="space-y-4 px-5 pb-5">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{ background: "#c8c3ff", color: "#2a2270" }}
                      >
                        P
                      </div>
                      <div
                        className="rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                        style={{ background: "#ffffff" }}
                      >
                        <p className="text-sm leading-relaxed" style={{ color: "#2d2a26" }}>
                          {s.prompt}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: s.userBubble }}
                      >
                        ru
                      </div>
                      <div className="flex-1">
                        <Response />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            }

            // ── Scenario 3 — Check a streak → CIRCULAR SMARTWATCH FACE ──
            if (i === 2) {
              return (
                <motion.div
                  key={s.tag}
                  {...baseMotion}
                  className="relative mx-auto flex w-full items-center justify-center"
                  style={{
                    maxWidth: "460px",
                    rotate: "2deg",
                    transformStyle: "preserve-3d",
                    perspective: "1200px",
                  }}
                >
                  {/* Side button */}
                  <span
                    aria-hidden="true"
                    className="absolute z-10 h-10 w-1.5 rounded-full"
                    style={{
                      background: "#d9fb60",
                      right: "-2px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      boxShadow: "0 0 8px rgba(217, 251, 96, 0.4)",
                    }}
                  />
                  <div
                    className="flex aspect-square w-full flex-col justify-center px-8 py-10 shadow-2xl"
                    style={{
                      background: "#0d1f15",
                      borderRadius: "50%",
                      minHeight: 420,
                    }}
                  >
                    {/* Card header */}
                    <div className="mb-4 flex items-center justify-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: "#d9fb60" }} />
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "#d9fb60" }}
                      >
                        {s.tag}
                      </span>
                    </div>

                    {/* Prompt */}
                    <div className="mb-3 flex items-start gap-2.5">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: "#c8c3ff", color: "#2a2270" }}
                      >
                        P
                      </div>
                      <div
                        className="rounded-2xl rounded-tl-sm px-3 py-2"
                        style={{ background: "#1f3527" }}
                      >
                        <p className="text-xs leading-snug" style={{ color: "#f5f5e8" }}>
                          {s.prompt}
                        </p>
                      </div>
                    </div>

                    {/* Ru response — dark variant */}
                    <div className="flex items-start gap-2.5">
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: "#d9fb60", color: "#0d1f15" }}
                      >
                        ru
                      </div>
                      <div className="flex-1">
                        <p className="mb-2 text-xs" style={{ color: "#f5f5e8" }}>
                          You’re on a{" "}
                          <span style={{ color: "#d9fb60", fontWeight: 700 }}>12-day</span> running streak.
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 text-center">
                          {[
                            { val: "12", label: "Current" },
                            { val: "24", label: "Best" },
                            { val: "5/7", label: "This wk" },
                          ].map((t) => (
                            <div
                              key={t.label}
                              className="rounded-lg p-1.5"
                              style={{ background: "#1f3527" }}
                            >
                              <span
                                className="block text-base font-extrabold leading-tight"
                                style={{ color: "#d9fb60", fontFamily: "var(--font-serif)" }}
                              >
                                {t.val}
                              </span>
                              <span
                                className="text-[9px] font-medium uppercase tracking-wider"
                                style={{ color: "#8aa897" }}
                              >
                                {t.label}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* Mini heatmap */}
                        <WatchHeatmap />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            }

            // ── Scenario 4 — Tweak on the fly → iOS BOTTOM SHEET ──
            return (
              <motion.div
                key={s.tag}
                {...baseMotion}
                className="relative mx-auto w-full overflow-hidden shadow-xl"
                style={{
                  background: "#ffffff",
                  borderTopLeftRadius: "32px",
                  borderTopRightRadius: "32px",
                  borderBottomLeftRadius: "24px",
                  borderBottomRightRadius: "24px",
                  border: "1px solid #ece7dd",
                  maxWidth: "460px",
                  rotate: "-0.5deg",
                  transformStyle: "preserve-3d",
                  perspective: "1200px",
                }}
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <span
                    className="block rounded-full"
                    style={{ width: 40, height: 4, background: "#b5afa5" }}
                  />
                </div>

                {/* Card header */}
                <div
                  className="flex items-center justify-between border-b px-5 py-3"
                  style={{ borderColor: "#ece7dd", background: "#faf8f4" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: s.accent }} />
                    <span
                      className="text-xs font-bold uppercase tracking-wider"
                      style={{ color: s.accent }}
                    >
                      {s.tag}
                    </span>
                  </div>
                  <span
                    className="text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: "#b5afa5" }}
                  >
                    ru.
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ background: "#c8c3ff", color: "#2a2270" }}
                    >
                      P
                    </div>
                    <div
                      className="rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                      style={{ background: "#f5f5f0" }}
                    >
                      <p className="text-sm leading-relaxed" style={{ color: "#2d2a26" }}>
                        {s.prompt}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: s.userBubble }}
                    >
                      ru
                    </div>
                    <div className="flex-1">
                      <Response />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
