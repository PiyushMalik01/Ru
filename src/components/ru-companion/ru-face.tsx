"use client";

// Ru's face — eyes, brows, mouth. Pure SVG so it scales/recolors cleanly.
// Expressions swap the eyebrow and mouth paths. A subtle blink loop runs
// in the background (eyes scale-y briefly every few seconds).

import { motion } from "framer-motion";
import type { RuExpression } from "@/lib/stores/ru-companion-store";

interface FacePaths {
  /** Left eyebrow SVG path d attribute. */
  browL: string;
  /** Right eyebrow d attribute. */
  browR: string;
  /** Mouth d attribute. */
  mouth: string;
  /** Optional eyelid override — when set, eyes render as lines (closed/winking). */
  closeLeft?: boolean;
  closeRight?: boolean;
  /** Mouth stroke width tweak. */
  mouthWidth?: number;
}

const PATHS: Record<RuExpression, FacePaths> = {
  // Default friendly look — arched curious brows, soft smile.
  happy: {
    browL: "M 22 32 Q 30 27 42 32",
    browR: "M 58 32 Q 70 27 78 32",
    mouth: "M 42 64 Q 50 71 58 64",
    mouthWidth: 3.2,
  },
  // Quick wink — left eye closed, mouth slightly grins higher one side.
  wink: {
    browL: "M 22 33 Q 30 30 42 33",
    browR: "M 58 32 Q 70 27 78 32",
    mouth: "M 42 64 Q 50 72 58 63",
    mouthWidth: 3.2,
    closeLeft: true,
  },
  // Pondering — one brow up, mouth pinched to the side.
  thinking: {
    browL: "M 22 30 Q 30 26 42 31",
    browR: "M 58 33 Q 70 31 78 33",
    mouth: "M 44 66 Q 50 64 56 66",
    mouthWidth: 3,
  },
  // Surprised — brows up high, mouth small "o".
  surprised: {
    browL: "M 22 28 Q 30 23 42 28",
    browR: "M 58 28 Q 70 23 78 28",
    mouth: "M 47 65 A 3 3 0 1 0 53 65 A 3 3 0 1 0 47 65 Z",
    mouthWidth: 0,
  },
  // Resting — eyes closed, mouth small line.
  sleeping: {
    browL: "M 22 34 Q 30 32 42 34",
    browR: "M 58 34 Q 70 32 78 34",
    mouth: "M 44 66 L 56 66",
    mouthWidth: 2.6,
    closeLeft: true,
    closeRight: true,
  },
};

interface Props {
  expression: RuExpression;
  size?: number;
}

export function RuFace({ expression, size = 90 }: Props) {
  const p = PATHS[expression];

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="pointer-events-none select-none"
      aria-hidden
    >
      {/* Left eye */}
      {p.closeLeft ? (
        <path d="M 28 44 Q 36 47 44 44" stroke="#1a1a18" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <Eye cx={36} cy={42} />
      )}
      {/* Right eye */}
      {p.closeRight ? (
        <path d="M 56 44 Q 64 47 72 44" stroke="#1a1a18" strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <Eye cx={64} cy={42} />
      )}

      {/* Eyebrows */}
      <motion.path
        key={`browL-${expression}`}
        d={p.browL}
        stroke="#1a1a18"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0.7, opacity: 0.7 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.22 }}
      />
      <motion.path
        key={`browR-${expression}`}
        d={p.browR}
        stroke="#1a1a18"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0.7, opacity: 0.7 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.22 }}
      />

      {/* Mouth */}
      <motion.path
        key={`mouth-${expression}`}
        d={p.mouth}
        stroke="#1a1a18"
        strokeWidth={p.mouthWidth ?? 3}
        strokeLinecap="round"
        fill={expression === "surprised" ? "#1a1a18" : "none"}
        initial={{ pathLength: 0.85 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.22 }}
      />
    </svg>
  );
}

/** A single eye — white sclera, black pupil, occasionally blinks via scaleY. */
function Eye({ cx, cy }: { cx: number; cy: number }) {
  return (
    <motion.g
      animate={{ scaleY: [1, 1, 0.08, 1, 1] }}
      transition={{
        duration: 4.8,
        repeat: Infinity,
        repeatDelay: Math.random() * 2 + 1, // staggered so eyes blink together-ish but with variation
        ease: "easeInOut",
        // The values array passes through the keyframes; blink happens at ~50%.
        times: [0, 0.46, 0.5, 0.54, 1],
      }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <ellipse cx={cx} cy={cy} rx={11} ry={13} fill="#ffffff" />
      <circle cx={cx} cy={cy + 1.5} r={5.5} fill="#1a1a18" />
    </motion.g>
  );
}
