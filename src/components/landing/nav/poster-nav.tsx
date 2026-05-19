"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Size = "sm" | "md" | "lg";
type Active = "typing" | "voice" | "pulse" | undefined;
type ColorKey = "cream" | "lime" | "lavender" | "cyan" | "forest";

type Pill = {
  phrases: string[]; // 1 or many — cycles slowly if many
  size: Size;
  pos: { left: string; top: string };
  rotate: number;
  drift: { x: number; y: number };
  cycleMs?: number; // text cycle interval (slow fade)
  active?: Active;
  color?: ColorKey;
};

// New palette: bold pops used sparingly (Wispr Flow-style), coral kept for the
// active brand pills. Each variant defines bg + text + border + the icon tint.
const PILL_COLORS: Record<ColorKey, { bg: string; text: string; border: string; icon: string }> = {
  cream:    { bg: "#ffffff", text: "#2d2a26", border: "#e8e4de", icon: "#8a847b" },
  lime:     { bg: "#d9fb60", text: "#1a5632", border: "#1a5632", icon: "#1a5632" },
  lavender: { bg: "#c8c3ff", text: "#2a2270", border: "#9a92ff", icon: "#5a4fd4" },
  cyan:     { bg: "#1fd7df", text: "#0a3438", border: "#0d6068", icon: "#0a3438" },
  forest:   { bg: "#1a5632", text: "#d9fb60", border: "#1a5632", icon: "#d9fb60" },
};

// 10 pills laid out on a loose 5-row grid. Positions chosen so each pill
// (with its min-width) has clear breathing room from its neighbours,
// even during drift and text cycles.
//
// Color rotation is intentional — most pills are cream/coral (brand
// continuity) with strategic pops of lime / lavender / cyan / forest
// to give the constellation visual rhythm without becoming a tag-cloud.
const PILLS: Pill[] = [
  // Row 1 — top edge
  { phrases: ["log 5K", "log morning walk", "rest day today"],          size: "sm", pos: { left: "22%", top: "8px"   }, rotate: -3, drift: { x: 4,  y: 3 },  cycleMs: 7200, color: "cyan" },
  { phrases: ["skip yoga today", "pause meditation", "back from break"], size: "sm", pos: { left: "44%", top: "12px"  }, rotate: 2,  drift: { x: -3, y: -3 }, cycleMs: 6800, color: "lavender" },
  { phrases: ["draft Monday", "plan my week", "set up next week"],       size: "sm", pos: { left: "64%", top: "6px"   }, rotate: 3,  drift: { x: 3,  y: -4 }, cycleMs: 8400, color: "cream" },

  // Row 2
  { phrases: ["remind me Tuesday", "buzz me at 3", "ping me later"],     size: "md", pos: { left: "28%", top: "76px"  }, rotate: 1,  drift: { x: -3, y: 4 },  cycleMs: 8500, color: "forest" },
  { phrases: ["weekly recap?", "what did I do?", "show this week"],      size: "sm", pos: { left: "60%", top: "82px"  }, rotate: -2, drift: { x: 3,  y: 3 },  cycleMs: 7800, color: "lime" },

  // Row 3 — the typing pill + a static neighbour
  { phrases: ["build a study plan", "plan our beta launch", "how’s my running streak?"], size: "lg", pos: { left: "16%", top: "146px" }, rotate: -1, drift: { x: 5, y: 3 }, active: "typing" },
  { phrases: ["move yoga to 6", "shift run to 7", "delay habit 1h"],     size: "sm", pos: { left: "60%", top: "156px" }, rotate: 1,  drift: { x: -4, y: -3 }, cycleMs: 9000, color: "lavender" },

  // Row 4 — voice + pulse (active, coral)
  { phrases: ["meditate at 7am"],                                        size: "md", pos: { left: "30%", top: "216px" }, rotate: -2, drift: { x: 4,  y: 3 },  active: "voice" },
  { phrases: ["buy groceries"],                                          size: "sm", pos: { left: "62%", top: "224px" }, rotate: 2,  drift: { x: 3,  y: -3 }, active: "pulse" },

  // Row 5 — bottom
  { phrases: ["I want to read 30m a day", "30 pages tonight", "read before bed"], size: "md", pos: { left: "44%", top: "282px" }, rotate: 1, drift: { x: -3, y: 3 }, cycleMs: 8200, color: "lime" },
];

const SIZE_STYLES: Record<Size, { padding: string; fontSize: string; mic: number; minWidth: number }> = {
  sm: { padding: "5px 12px",  fontSize: "12px", mic: 10, minWidth: 110 },
  md: { padding: "7px 15px",  fontSize: "13px", mic: 12, minWidth: 165 },
  lg: { padding: "10px 20px", fontSize: "16px", mic: 14, minWidth: 240 },
};

function Mic({ size = 12, color = "#8a847b" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="6" y="2" width="4" height="8" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M3 8 V9 C 3 12, 5.5 13.2, 8 13.2 C 10.5 13.2, 13 12, 13 9 V8" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Waveform() {
  return (
    <div className="flex items-center gap-[2px]" style={{ height: "14px" }}>
      {[5, 9, 7, 11, 6].map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-sm"
          style={{ background: "#1a5632" }}
          animate={{ height: [h, h * 1.6, h * 0.6, h] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function CyclingText({ phrases, intervalMs = 7000 }: { phrases: string[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (phrases.length <= 1) return;
    // Stagger start so pills don't all cycle in sync
    const startDelay = Math.random() * 3000;
    let timer: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      timer = setInterval(() => setI((x) => (x + 1) % phrases.length), intervalMs);
    }, startDelay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [phrases, intervalMs]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={i}
        initial={{ opacity: 0, y: -4, scale: 0.94, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: 4, scale: 0.94, filter: "blur(2px)" }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block whitespace-nowrap"
      >
        {phrases[i]}
      </motion.span>
    </AnimatePresence>
  );
}

function TypingText({ phrases }: { phrases: string[] }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const current = phrases[idx];
    if (typing) {
      if (text.length < current.length) {
        const t = setTimeout(() => setText(current.slice(0, text.length + 1)), 50);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setTyping(false), 1900);
      return () => clearTimeout(t);
    } else {
      if (text.length > 0) {
        const t = setTimeout(() => setText(text.slice(0, text.length - 1)), 24);
        return () => clearTimeout(t);
      }
      setIdx((i) => (i + 1) % phrases.length);
      setTyping(true);
    }
  }, [text, typing, idx, phrases]);

  return (
    <span>
      {text}
      <span className="ml-0.5 inline-block animate-pulse" style={{ color: "#1a5632" }}>|</span>
    </span>
  );
}

function PillBox({ pill, delay }: { pill: Pill; delay: number }) {
  const s = SIZE_STYLES[pill.size];
  const isActive = !!pill.active;
  // Active pills override colour to coral (brand). Otherwise use assigned colour.
  const c = isActive
    ? { bg: "#ffffff", text: "#2d2a26", border: "#1a5632", icon: "#1a5632" }
    : PILL_COLORS[pill.color ?? "cream"];
  // Slow, dreamlike drift — 22–34s per pill. X & Y use different durations
  // so the motion path is an irregular Lissajous, never repeating tightly.
  const driftSeed = Math.abs(pill.drift.x) + Math.abs(pill.drift.y);
  const xDur = 22 + driftSeed * 0.9;
  const yDur = xDur * 1.27;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.9 }}
      animate={{
        opacity: isActive ? 1 : 0.72,
        scale: 1,
        x: [0, pill.drift.x, -pill.drift.x * 0.55, pill.drift.x * 0.3, 0],
        y: [0, pill.drift.y, -pill.drift.y * 0.55, pill.drift.y * 0.3, 0],
      }}
      transition={{
        opacity: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] },
        scale:   { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] },
        y:       { duration: yDur, repeat: Infinity, ease: "easeInOut", delay: delay + Math.random() * 1.5 },
        x:       { duration: xDur, repeat: Infinity, ease: "easeInOut", delay: delay + Math.random() * 1.5 },
      }}
      className="pointer-events-auto absolute"
      style={{
        left: pill.pos.left,
        top: pill.pos.top,
        transform: `rotate(${pill.rotate}deg)`,
      }}
    >
      <div
        className="relative inline-flex items-center justify-center gap-2 rounded-full border whitespace-nowrap shadow-sm"
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          minWidth: s.minWidth,
          background: c.bg,
          borderColor: c.border,
          color: c.text,
        }}
      >
        {pill.active === "voice" ? <Waveform /> : <Mic size={s.mic} color={c.icon} />}
        <span>
          {pill.active === "typing" ? (
            <TypingText phrases={pill.phrases} />
          ) : pill.phrases.length > 1 ? (
            <CyclingText phrases={pill.phrases} intervalMs={pill.cycleMs} />
          ) : (
            pill.phrases[0]
          )}
        </span>

        {/* Soft halo behind active pills for that magical feel */}
        {isActive && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 rounded-full"
            style={{ boxShadow: "0 0 24px 4px rgba(232, 89, 60, 0.18)" }}
          />
        )}

        {/* Pulse ring for the "pulse" active pill */}
        {pill.active === "pulse" && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: "#d9fb60" }}
            animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.22, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </motion.div>
  );
}

export function PosterNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="relative z-20">
        <nav className="relative px-5 pb-3 pt-5 md:px-12 md:pb-5 md:pt-8 md:min-h-[360px]">
          {/* Constellation of scattered pills — desktop only */}
          <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
            {PILLS.map((pill, i) => (
              <PillBox key={pill.phrases[0] + i} pill={pill} delay={0.15 + i * 0.06} />
            ))}
          </div>

          <div className="relative flex items-start justify-between gap-4">
            {/* Left block — oversized logo + tagline */}
            <div className="shrink-0">
              <a href="#" aria-label="ru. — home" className="relative inline-block">
                <span
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "clamp(40px, 6.5vw, 76px)",
                    color: "#000000",
                    lineHeight: 0.85,
                    letterSpacing: "-0.035em",
                    display: "inline-block",
                  }}
                >
                  ru<span style={{ color: "#1a5632" }}>.</span>
                </span>
                {/* Marker underline — desktop */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-2 left-0 hidden md:block"
                  width="98"
                  height="12"
                  viewBox="0 0 98 12"
                  fill="none"
                >
                  <path
                    d="M3 7 C 20 1, 44 11, 68 4 S 90 8, 95 6"
                    stroke="#1a5632"
                    strokeWidth="3"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.75"
                  />
                </svg>
                {/* Marker underline — mobile */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-1 left-0 md:hidden"
                  width="56"
                  height="9"
                  viewBox="0 0 56 9"
                  fill="none"
                >
                  <path
                    d="M2 5 C 12 1, 28 8, 40 4 S 52 6, 54 5"
                    stroke="#1a5632"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.75"
                  />
                </svg>
              </a>
              {/* Quirky tagline — no AI, period flourish mirrors the brand */}
              <div
                className="mt-4 md:mt-5"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontStyle: "italic",
                  fontSize: "18px",
                  color: "#2d2a26",
                  letterSpacing: "-0.01em",
                }}
              >
                tell<span style={{ color: "#1a5632" }}>.</span> forget<span style={{ color: "#1a5632" }}>.</span>
              </div>
            </div>

            {/* Right block — stacked nav with stairstep baselines (desktop) */}
            <div className="hidden flex-col items-end gap-1.5 pt-2 md:flex">
              <a
                href="#features"
                className="group inline-flex items-center gap-2 transition-colors hover:text-black"
                style={{ color: "#0d1f15", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "19px" }}
              >
                features
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" className="opacity-40 transition-opacity group-hover:opacity-100">
                  <path d="M2 5 H 10 M7 2 L 11 5 L 7 8" stroke="#8a847b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </a>
              <a
                href="#how"
                className="group mr-6 inline-flex items-center gap-2 transition-colors hover:text-black"
                style={{ color: "#0d1f15", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "19px" }}
              >
                how it works
                <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true" className="opacity-40 transition-opacity group-hover:opacity-100">
                  <path d="M2 5 H 10 M7 2 L 11 5 L 7 8" stroke="#8a847b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </a>

              {/* Auth cluster — Sign in is a quiet italic link, Sign up is the
                  primary CTA with the marker underline. Returning users go
                  left, new users go to the heavier button. */}
              <div className="mt-5 mr-2 flex items-baseline gap-5">
                <a
                  href="/login"
                  className="transition-colors hover:text-black"
                  style={{ color: "#0d1f15", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "19px" }}
                >
                  sign in
                </a>
                <a
                  href="/signup"
                  className="group relative inline-flex items-center gap-2"
                  style={{ color: "#1a5632", fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "23px", fontWeight: 700 }}
                >
                  sign up
                  <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                    <path d="M2 7 H 17 M13 2 L 19 7 L 13 12" stroke="#1a5632" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-2 -left-2 -right-4"
                    viewBox="0 0 140 9"
                    preserveAspectRatio="none"
                    style={{ height: "7px" }}
                  >
                    <path
                      d="M3 5 C 30 1, 70 8, 105 3 S 130 6, 137 4"
                      stroke="#1a5632"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                      opacity="0.65"
                    />
                  </svg>
                </a>
              </div>
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full md:hidden"
              style={{ background: "#2d2a26" }}
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                {menuOpen ? (
                  <path d="M2 2 L16 12 M16 2 L2 12" stroke="#d9fb60" strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <>
                    <path d="M2 3 H16" stroke="#d9fb60" strokeWidth="2" strokeLinecap="round" />
                    <path d="M2 11 H16" stroke="#d9fb60" strokeWidth="2" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="relative z-20 mx-5 mb-2 rounded-2xl border p-5 md:hidden"
            style={{ background: "#fff", borderColor: "#e8e4de" }}
          >
            <a href="#features" onClick={() => setMenuOpen(false)} className="block py-2 text-base font-medium" style={{ color: "#2d2a26" }}>Features</a>
            <a href="#how" onClick={() => setMenuOpen(false)} className="block py-2 text-base font-medium" style={{ color: "#2d2a26" }}>How it works</a>
            <a href="/login" onClick={() => setMenuOpen(false)} className="block py-2 text-base font-medium" style={{ color: "#2d2a26" }}>Sign in</a>
            <a
              href="/signup"
              onClick={() => setMenuOpen(false)}
              className="mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: "#d9fb60", color: "#1a5632" }}
            >
              Sign up
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
