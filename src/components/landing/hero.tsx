"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WobblyUnderline, ScribbleCircle, DotGrid, CurvedArrow, RuMark } from "./marginalia";

const EASE = [0.16, 1, 0.3, 1] as const;

const HEADLINES = [
  { a: "Forget the apps.", b: "Just say it." },
  { a: "Skip the typing.", b: "Talk it out." },
] as const;

function CheckIcon({ color = "#1a5632", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5 L7 12 L13 4" />
    </svg>
  );
}

function SparkleIcon({ color = "#1a5632", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      aria-hidden="true"
    >
      <path d="M8 0 L9.4 6.6 L16 8 L9.4 9.4 L8 16 L6.6 9.4 L0 8 L6.6 6.6 Z" />
    </svg>
  );
}

function BellIcon({ color = "#0a3438", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 12 L12.5 12 C11.5 11 11 9.8 11 8.5 L11 6.5 C11 4.8 9.7 3.4 8 3.4 C6.3 3.4 5 4.8 5 6.5 L5 8.5 C5 9.8 4.5 11 3.5 12 Z" />
      <path d="M7 14 C7.3 14.4 7.6 14.6 8 14.6 C8.4 14.6 8.7 14.4 9 14" />
      <circle cx="8" cy="2.2" r="0.7" fill={color} />
    </svg>
  );
}

function MicIcon({ color = "#2a2270", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="2" width="4" height="8" rx="2" fill={color} />
      <path d="M3.5 8 C3.5 10.5 5.5 12.5 8 12.5 C10.5 12.5 12.5 10.5 12.5 8" />
      <path d="M8 12.5 L8 14.5" />
    </svg>
  );
}

function ChatDemoCard() {
  // phase: 0 = only user message, 1 = LOGGED, 2 = +TASK, 3 = +REMINDER
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const runCycle = () => {
      timers.push(setTimeout(() => setPhase(1), 1200));
      timers.push(setTimeout(() => setPhase(2), 2400));
      timers.push(setTimeout(() => setPhase(3), 3600));
      timers.push(setTimeout(() => setPhase(0), 7600));
    };

    runCycle();
    const interval = setInterval(runCycle, 8800);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  const chips = [
    {
      idx: 1,
      label: "LOGGED",
      body: "5K run — just now",
      bg: "#1a5632",
      labelColor: "#d9fb60",
      bodyColor: "#eef1ea",
    },
    {
      idx: 2,
      label: "TASK",
      body: "Buy groceries — today",
      bg: "#d9fb60",
      labelColor: "#0d1f15",
      bodyColor: "#0d1f15",
    },
    {
      idx: 3,
      label: "REMINDER",
      body: "Call dentist — tomorrow, 9 AM",
      bg: "#1fd7df",
      labelColor: "#0a3438",
      bodyColor: "#0a3438",
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.4, ease: EASE }}
      whileHover={{
        y: -6,
        rotateX: 3,
        rotateY: -4,
        scale: 1.02,
        transition: { duration: 0.4, ease: "easeOut" },
      }}
      className="relative max-w-xl overflow-hidden rounded-2xl border shadow-xl transition-shadow duration-300 hover:shadow-2xl"
      style={{
        background: "#fff",
        borderColor: "#e2e5dc",
        transformStyle: "preserve-3d",
        perspective: "1200px",
      }}
    >
      {/* Card header — dark forest mini-app chrome */}
      <div
        className="flex items-center gap-2.5 px-5 py-3"
        style={{ background: "#1a5632" }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: "#d9fb60", boxShadow: "0 0 0 3px rgba(217,251,96,0.18)" }}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold tracking-wide text-white">ru.</span>
        <div className="ml-auto flex items-center gap-1.5">
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "#d9fb60" }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden="true"
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#d9fb60" }}
          >
            live
          </span>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {/* User — thin pill */}
        <div className="mb-5 flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: "#c8c3ff", color: "#2a2270" }}
          >
            P
          </div>
          <div
            className="rounded-full px-4 py-2"
            style={{ background: "#eef1ea" }}
          >
            <p className="text-[13px] leading-snug" style={{ color: "#0d1f15" }}>
              Just finished a 5K run, need groceries on the way home, and remind me to call the dentist tomorrow at 9
            </p>
          </div>
        </div>

        {/* Ru */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: "#1a5632", color: "#d9fb60" }}
          >
            ru
          </div>
          <div className="flex-1">
            <motion.p
              className="mb-3 text-sm font-medium"
              style={{ color: "#0d1f15" }}
              animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 6 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              Done! Here&rsquo;s what I organized:
            </motion.p>
            <div className="flex flex-col gap-2">
              {chips.map((chip) => (
                <motion.div
                  key={chip.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{
                    opacity: phase >= chip.idx ? 1 : 0,
                    y: phase >= chip.idx ? 0 : 8,
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                  style={{ background: chip.bg }}
                >
                  <span
                    className="text-[10px] font-bold tracking-[0.14em]"
                    style={{ color: chip.labelColor }}
                  >
                    {chip.label}
                  </span>
                  <span className="text-sm" style={{ color: chip.bodyColor }}>
                    {chip.body}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Deterministic pseudo-random — keeps SSR/CSR in sync per letter
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function scatter(i: number, salt: number) {
  return {
    x: (rand(i * 2 + salt) - 0.5) * 160,
    y: (rand(i * 2 + salt + 1) - 0.5) * 140,
    rotate: (rand(i * 3 + salt + 2) - 0.5) * 120,
    scale: 0.4 + rand(i * 5 + salt + 3) * 0.35,
  };
}

function LetterLine({
  text,
  phaseKey,
  color,
  underline = false,
  delayChildren = 0,
}: {
  text: string;
  phaseKey: number;
  color: string;
  underline?: boolean;
  delayChildren?: number;
}) {
  const chars = Array.from(text);

  return (
    <span
      className="relative block"
      style={{ height: "1.05em" }}
      aria-hidden="true"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={phaseKey}
          className="absolute inset-0 block"
          style={{ color }}
          initial="initial"
          animate="enter"
          exit="exit"
          variants={{
            enter: {
              transition: {
                staggerChildren: 0.028,
                delayChildren,
              },
            },
            exit: {
              transition: {
                staggerChildren: 0.018,
              },
            },
          }}
        >
          <span style={{ position: "relative", display: "inline-block" }}>
            {chars.map((ch, i) => {
              const sIn = scatter(i, phaseKey * 31);
              const sOut = scatter(i, phaseKey * 31 + 7);
              return (
                <motion.span
                  key={i}
                  style={{ display: "inline-block", whiteSpace: "pre" }}
                  variants={{
                    initial: {
                      opacity: 0,
                      x: sIn.x,
                      y: sIn.y,
                      rotate: sIn.rotate,
                      scale: sIn.scale,
                    },
                    enter: {
                      opacity: 1,
                      x: 0,
                      y: 0,
                      rotate: 0,
                      scale: 1,
                      transition: {
                        type: "spring",
                        stiffness: 240,
                        damping: 18,
                        mass: 0.7,
                      },
                    },
                    exit: {
                      opacity: 0,
                      x: sOut.x,
                      y: sOut.y,
                      rotate: sOut.rotate,
                      scale: sOut.scale,
                      transition: { duration: 0.35, ease: "easeIn" },
                    },
                  }}
                >
                  {ch === " " ? " " : ch}
                </motion.span>
              );
            })}
            {underline && (
              <motion.span
                key={`u-${phaseKey}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.6 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                <WobblyUnderline color={color} opacity={0.9} thickness={5} />
              </motion.span>
            )}
          </span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function JugglingHeadline() {
  const [hi, setHi] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setHi((p) => (p + 1) % HEADLINES.length);
    }, 4400);
    return () => clearInterval(t);
  }, [paused]);

  const current = HEADLINES[hi];

  return (
    <motion.h1
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => setHi((p) => (p + 1) % HEADLINES.length)}
      style={{
        fontFamily: "var(--font-serif)",
        color: "#0d1f15",
        fontSize: "clamp(44px, 8vw, 100px)",
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
        cursor: "pointer",
      }}
    >
      <LetterLine text={current.a} phaseKey={hi} color="#0d1f15" />
      <LetterLine
        text={current.b}
        phaseKey={hi}
        color="#1a5632"
        underline
        delayChildren={0.18}
      />

      <span className="sr-only">
        {current.a} {current.b}
      </span>
    </motion.h1>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: "#f4ecf2" }}>
      {/* Marginalia — desktop only */}
      <ScribbleCircle className="pointer-events-none absolute right-[4%] top-[14%] hidden md:block" size={300} color="#1a5632" />
      <DotGrid className="pointer-events-none absolute left-[6%] bottom-[18%] hidden md:block" />

      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-5xl px-5 pb-20 pt-4 md:px-12 md:pt-12">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="h-px w-10" style={{ background: "#1a5632" }} />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#1a5632" }}>
            Talk · it&rsquo;s done
          </span>
        </motion.div>

        {/* Headline — two lines juggle between phrasings */}
        <JugglingHeadline />

        {/* Problem line — the punchy, relatable hook */}
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
          className="mt-6 max-w-2xl text-xl italic leading-snug md:text-2xl"
          style={{ fontFamily: "var(--font-serif)", color: "#0d1f15" }}
        >
          Your to-do list shouldn&rsquo;t need a to-do list.
        </motion.p>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="mt-4 max-w-lg text-base leading-relaxed md:text-lg"
          style={{ color: "#4a5547" }}
        >
          Tell <RuMark /> about your day in plain English. It figures out what&rsquo;s a task,
          what&rsquo;s a habit, what needs a reminder. No forms, no apps — just conversation.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          className="mt-8 flex flex-wrap items-center gap-3 md:gap-4"
        >
          <a
            href="/signup"
            className="rounded-full px-6 py-3.5 text-sm font-bold transition-all hover:scale-[1.03] md:px-8 md:py-4 md:text-base"
            style={{ background: "#d9fb60", color: "#1a5632", fontFamily: "var(--font-serif)" }}
          >
            Get started — it&rsquo;s free
          </a>
          <a
            href="#how"
            className="rounded-full border-2 border-[#1a5632] px-6 py-3.5 text-sm font-semibold text-[#1a5632] transition-colors hover:bg-[#1a5632] hover:text-[#eef1ea] md:px-8 md:py-4 md:text-base"
          >
            See how it works
          </a>
        </motion.div>

        {/* Hero card — conversation preview */}
        <div className="relative mt-12 md:mt-14">
          {/* Sketched curving arrow + label — desktop only */}
          <CurvedArrow
            className="pointer-events-none absolute hidden md:block"
            style={{ left: "calc(36rem - 8px)", top: "30px" }}
            label="try it →"
            color="#1a5632"
            opacity={0.7}
          />

          {/* Curved text arc — desktop only, wraps upper-left of chat card */}
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute hidden md:block"
            style={{ left: "-150px", top: "-30px", zIndex: 10 }}
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg width="420" height="420" viewBox="0 0 420 420">
              <defs>
                <path
                  id="hero-curve"
                  d="M 20,210 A 200,200 0 0 1 400,210"
                  fill="transparent"
                />
                <linearGradient id="hero-curve-fade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1a5632" stopOpacity="0" />
                  <stop offset="20%" stopColor="#1a5632" stopOpacity="0.55" />
                  <stop offset="80%" stopColor="#1a5632" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#1a5632" stopOpacity="0" />
                </linearGradient>
              </defs>
              <text
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "16px",
                  letterSpacing: "0.04em",
                }}
                fill="url(#hero-curve-fade)"
              >
                <textPath href="#hero-curve" startOffset="2%">
                  in plain English  ·  no forms  ·  just say it  ·  no apps to manage  ·  talk → done
                </textPath>
              </text>
            </svg>
          </motion.div>

          {/* Chat card wrapper — relative so stickers can anchor around it */}
          <div className="relative">
            <ChatDemoCard />

            {/* Sticker — Logged · 2s (top-right of card) */}
            <motion.div
              aria-hidden="true"
              className="absolute hidden md:flex items-center gap-1.5"
              style={{
                top: "12%",
                right: "-38px",
                background: "#d9fb60",
                border: "2px solid #1a5632",
                boxShadow: "3px 5px 0 0 #1a5632",
                padding: "6px 12px",
                borderRadius: "999px",
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "13px",
                color: "#1a5632",
                fontWeight: 700,
                zIndex: 20,
              }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: 5, y: [0, -3, 0] }}
              transition={{
                opacity: { duration: 0.6, delay: 1 },
                scale: { duration: 0.6, delay: 1, ease: [0.34, 1.56, 0.64, 1] },
                rotate: { duration: 0.6, delay: 1 },
                y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.6 },
              }}
            >
              <CheckIcon color="#1a5632" size={12} />
              Logged · 2s
            </motion.div>

            {/* Sticker — Reminder set (top-left, above card) */}
            <motion.div
              aria-hidden="true"
              className="absolute hidden md:flex items-center gap-1.5"
              style={{
                top: "-26px",
                left: "8%",
                background: "#1fd7df",
                border: "2px solid #0a3438",
                boxShadow: "-3px 5px 0 0 #0a3438",
                padding: "6px 12px",
                borderRadius: "999px",
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "13px",
                color: "#0a3438",
                fontWeight: 700,
                zIndex: 20,
              }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: -4, y: [0, -4, 0] }}
              transition={{
                opacity: { duration: 0.6, delay: 1.3 },
                scale: { duration: 0.6, delay: 1.3, ease: [0.34, 1.56, 0.64, 1] },
                rotate: { duration: 0.6, delay: 1.3 },
                y: { duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 2 },
              }}
            >
              <BellIcon color="#0a3438" size={12} />
              Reminder set
            </motion.div>

            {/* Sticker — Just spoken (bottom-right) */}
            <motion.div
              aria-hidden="true"
              className="absolute hidden md:flex items-center gap-1.5"
              style={{
                bottom: "14%",
                right: "-44px",
                background: "#c8c3ff",
                border: "2px solid #2a2270",
                boxShadow: "3px 5px 0 0 #2a2270",
                padding: "6px 12px",
                borderRadius: "999px",
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "13px",
                color: "#2a2270",
                fontWeight: 700,
                zIndex: 20,
              }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: 6, y: [0, -3, 0] }}
              transition={{
                opacity: { duration: 0.6, delay: 1.6 },
                scale: { duration: 0.6, delay: 1.6, ease: [0.34, 1.56, 0.64, 1] },
                rotate: { duration: 0.6, delay: 1.6 },
                y: { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 2.4 },
              }}
            >
              <MicIcon color="#2a2270" size={12} />
              Just spoken
            </motion.div>

            {/* Sticker — Plan ready (bottom-left, below card) */}
            <motion.div
              aria-hidden="true"
              className="absolute hidden md:flex items-center gap-1.5"
              style={{
                bottom: "-22px",
                left: "-26px",
                background: "#1a5632",
                border: "2px solid #d9fb60",
                boxShadow: "-3px 5px 0 0 #d9fb60",
                padding: "6px 12px",
                borderRadius: "999px",
                fontFamily: "var(--font-serif)",
                fontStyle: "italic",
                fontSize: "13px",
                color: "#d9fb60",
                fontWeight: 700,
                zIndex: 20,
              }}
              initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: -7, y: [0, -5, 0] }}
              transition={{
                opacity: { duration: 0.6, delay: 1.9 },
                scale: { duration: 0.6, delay: 1.9, ease: [0.34, 1.56, 0.64, 1] },
                rotate: { duration: 0.6, delay: 1.9 },
                y: { duration: 3.6, repeat: Infinity, ease: "easeInOut", delay: 2.8 },
              }}
            >
              <SparkleIcon color="#d9fb60" size={12} />
              Plan ready
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
