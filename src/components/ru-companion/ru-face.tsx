"use client";

// Ru's face — kawaii-style mascot, not a clinical icon.
//   - Round small eyes with a sparkle highlight (anime-shiny)
//   - Pink cheek blush dots
//   - Brows hidden by default (cleaner, friendlier); they only appear for
//     thinking/surprised expressions
//   - Generous wide smile

import { motion } from "framer-motion";
import type { RuExpression } from "@/lib/stores/ru-companion-store";

interface FacePaths {
  brows?: { l: string; r: string };
  mouth: string;
  mouthFill?: string;
  closeLeftEye?: boolean;
  closeRightEye?: boolean;
}

const PATHS: Record<RuExpression, FacePaths> = {
  happy: {
    mouth: "M 38 62 Q 50 74 62 62",
  },
  wink: {
    mouth: "M 38 63 Q 50 75 62 61",
    closeLeftEye: true,
  },
  thinking: {
    brows: {
      l: "M 23 32 Q 30 28 41 32",
      r: "M 59 33 Q 70 32 77 34",
    },
    mouth: "M 44 66 Q 50 64 56 66",
  },
  surprised: {
    brows: {
      l: "M 22 28 Q 30 23 42 28",
      r: "M 58 28 Q 70 23 78 28",
    },
    mouth: "M 47 64 A 3.2 3.2 0 1 0 53 64 A 3.2 3.2 0 1 0 47 64 Z",
    mouthFill: "#1a1a18",
  },
  sleeping: {
    mouth: "M 44 66 L 56 66",
    closeLeftEye: true,
    closeRightEye: true,
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
      {/* Cheek blush — soft pink dots, sit behind everything for an "underglow" */}
      <circle cx={20} cy={58} r={6.5} fill="#f5a4a4" opacity={0.55} />
      <circle cx={80} cy={58} r={6.5} fill="#f5a4a4" opacity={0.55} />

      {p.closeLeftEye ? (
        <path
          d="M 26 46 Q 36 50 46 46"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <SparkleEye cx={36} cy={44} />
      )}
      {p.closeRightEye ? (
        <path
          d="M 54 46 Q 64 50 74 46"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <SparkleEye cx={64} cy={44} />
      )}

      {p.brows && (
        <>
          <motion.path
            key={`browL-${expression}`}
            d={p.brows.l}
            stroke="#1a1a18"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0.7, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.22 }}
          />
          <motion.path
            key={`browR-${expression}`}
            d={p.brows.r}
            stroke="#1a1a18"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0.7, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.22 }}
          />
        </>
      )}

      <motion.path
        key={`mouth-${expression}`}
        d={p.mouth}
        stroke="#1a1a18"
        strokeWidth={p.mouthFill ? 0 : 3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={p.mouthFill ?? "none"}
        initial={{ pathLength: 0.85, opacity: 0.85 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.22 }}
      />
    </svg>
  );
}

/**
 * Small round white sclera with a tiny pupil and a sparkle highlight up-left.
 * Blinks via a staggered scaleY keyframe so the two eyes don't lockstep.
 */
function SparkleEye({ cx, cy }: { cx: number; cy: number }) {
  return (
    <motion.g
      animate={{ scaleY: [1, 1, 0.08, 1, 1] }}
      transition={{
        duration: 5.2,
        repeat: Infinity,
        repeatDelay: 1 + Math.random() * 2,
        ease: "easeInOut",
        times: [0, 0.46, 0.5, 0.54, 1],
      }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      <ellipse cx={cx} cy={cy} rx={9} ry={10.5} fill="#ffffff" />
      <circle cx={cx} cy={cy + 1.5} r={4.2} fill="#1a1a18" />
      <circle cx={cx + 1.8} cy={cy - 1.2} r={1.5} fill="#ffffff" />
    </motion.g>
  );
}
