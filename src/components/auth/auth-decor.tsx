"use client";

import { motion } from "framer-motion";

// Left-rail decorative panel for the auth pages. Mirrors the landing
// poster-nav's pill constellation (cream, lime, lavender, cyan, forest)
// so signing in feels continuous with the marketing surface.
//
// Composition rule: ONE pill per row, well-spaced. The whole rail breathes
// instead of feeling like a tag cloud.

type Pill = {
  text: string;
  pos: { left: string; top: string };
  rotate: number;
  drift: { x: number; y: number };
  size: "sm" | "md" | "lg";
  color: "cream" | "lime" | "lavender" | "cyan" | "forest";
  active?: boolean;
};

const PILL_COLORS: Record<
  Pill["color"],
  { bg: string; text: string; border: string }
> = {
  cream: { bg: "#ffffff", text: "#2d2a26", border: "#e8e4de" },
  lime: { bg: "#d9fb60", text: "#1a5632", border: "#1a5632" },
  lavender: { bg: "#c8c3ff", text: "#2a2270", border: "#9a92ff" },
  cyan: { bg: "#1fd7df", text: "#0a3438", border: "#0d6068" },
  forest: { bg: "#1a5632", text: "#d9fb60", border: "#1a5632" },
};

const SIZE_STYLES: Record<
  Pill["size"],
  { padding: string; fontSize: string }
> = {
  sm: { padding: "5px 12px", fontSize: "12px" },
  md: { padding: "7px 16px", fontSize: "13.5px" },
  lg: { padding: "10px 22px", fontSize: "16px" },
};

const PILLS: Pill[] = [
  { text: "log 5K run",         pos: { left: "12%", top: "8%"  }, rotate: -3, drift: { x: 4,  y: 3 },  size: "sm", color: "cyan" },
  { text: "remind me Tuesday",  pos: { left: "58%", top: "14%" }, rotate: 2,  drift: { x: -3, y: 4 },  size: "md", color: "lavender" },
  { text: "what did I do?",     pos: { left: "22%", top: "30%" }, rotate: -1, drift: { x: 5,  y: -3 }, size: "sm", color: "lime" },
  { text: "draft Monday plan",  pos: { left: "52%", top: "44%" }, rotate: 1,  drift: { x: -4, y: 3 },  size: "lg", color: "cream", active: true },
  { text: "meditate at 7am",    pos: { left: "16%", top: "58%" }, rotate: -2, drift: { x: 3,  y: 4 },  size: "md", color: "forest" },
  { text: "skip yoga today",    pos: { left: "60%", top: "72%" }, rotate: 2,  drift: { x: -3, y: -3 }, size: "sm", color: "lavender" },
];

function PillBox({ pill, delay }: { pill: Pill; delay: number }) {
  const c = PILL_COLORS[pill.color];
  const s = SIZE_STYLES[pill.size];
  const driftSeed = Math.abs(pill.drift.x) + Math.abs(pill.drift.y);
  const xDur = 26 + driftSeed * 0.9;
  const yDur = xDur * 1.31;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.92 }}
      animate={{
        opacity: pill.active ? 1 : 0.85,
        scale: 1,
        x: [0, pill.drift.x, -pill.drift.x * 0.6, pill.drift.x * 0.3, 0],
        y: [0, pill.drift.y, -pill.drift.y * 0.6, pill.drift.y * 0.3, 0],
      }}
      transition={{
        opacity: { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] },
        scale:   { duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] },
        y:       { duration: yDur, repeat: Infinity, ease: "easeInOut", delay: delay + Math.random() * 1.6 },
        x:       { duration: xDur, repeat: Infinity, ease: "easeInOut", delay: delay + Math.random() * 1.6 },
      }}
      className="pointer-events-none absolute"
      style={{
        left: pill.pos.left,
        top: pill.pos.top,
        transform: `rotate(${pill.rotate}deg)`,
      }}
    >
      <div
        className="relative inline-flex items-center gap-2 whitespace-nowrap rounded-full border shadow-sm"
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          background: c.bg,
          borderColor: c.border,
          color: c.text,
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: c.text, opacity: 0.55 }}
        />
        {pill.text}
        {pill.active && (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full"
            style={{ boxShadow: "0 0 28px 6px rgba(26,86,50,0.18)" }}
          />
        )}
      </div>
    </motion.div>
  );
}

export function AuthDecor() {
  return (
    <div className="relative hidden lg:block">
      {/* Brandmark — same treatment as the landing nav: oversized DM Serif
          with the forest period flourish, plus the marker underline. */}
      <div className="absolute left-10 top-12 z-10">
        <a href="/" className="relative inline-block">
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "72px",
              color: "#000000",
              lineHeight: 0.85,
              letterSpacing: "-0.035em",
              display: "inline-block",
            }}
          >
            ru<span style={{ color: "#1a5632" }}>.</span>
          </span>
          <svg
            aria-hidden
            className="pointer-events-none absolute -bottom-2 left-0"
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
        </a>

        <div
          className="mt-4"
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: "18px",
            color: "#2d2a26",
            letterSpacing: "-0.01em",
          }}
        >
          tell<span style={{ color: "#1a5632" }}>.</span> forget
          <span style={{ color: "#1a5632" }}>.</span>
        </div>
      </div>

      {/* Pull-quote — anchored bottom-left, magazine pull-quote style */}
      <div className="absolute bottom-14 left-10 right-12 z-10">
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "28px",
            lineHeight: 1.15,
            color: "#0d1f15",
            letterSpacing: "-0.015em",
          }}
        >
          Talk to{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            Ru
            <svg
              aria-hidden
              viewBox="0 0 60 10"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                left: 0,
                bottom: "-0.08em",
                width: "100%",
                height: "0.18em",
                pointerEvents: "none",
              }}
            >
              <path
                d="M2 6 C 12 1, 28 8, 40 4 S 56 7, 58 5"
                stroke="#1a5632"
                strokeWidth="2.8"
                strokeLinecap="round"
                fill="none"
                opacity="0.8"
              />
            </svg>
          </span>{" "}
          like a friend who remembers everything, and your{" "}
          <em style={{ color: "#1a5632", fontStyle: "italic" }}>
            tasks, habits, plans
          </em>{" "}
          quietly fall into place.
        </p>
      </div>

      {/* The pill constellation — drifts continuously, same vibe as nav */}
      <div className="absolute inset-0">
        {PILLS.map((pill, i) => (
          <PillBox key={pill.text} pill={pill} delay={0.3 + i * 0.08} />
        ))}
      </div>

      {/* Vertical divider — hand-rendered, not a hard CSS border */}
      <svg
        aria-hidden
        className="absolute right-0 top-0 h-full"
        width="2"
        viewBox="0 0 2 800"
        preserveAspectRatio="none"
      >
        <path
          d="M 1 10 C 1.4 200, 0.6 400, 1 600 S 1.2 790, 1 800"
          stroke="#1a5632"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.2"
        />
      </svg>
    </div>
  );
}
