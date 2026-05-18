"use client";

// Ru's limbs — stubby pen-stroke arms and legs that sway/dangle. Drawn in
// the same black-ink style as the face so they read as one character.
//
// Layout: an SVG that fills its parent container at 100x100 viewBox. The
// body sits in the middle (visually 70% of the container) and the limbs
// extend from where the body's silhouette would be out to the container
// edges. Because limbs sit BEHIND the body (z-order) the joints disappear
// inside the body's solid color — only the stubs stick out.

import { motion } from "framer-motion";

export function RuLimbs() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      aria-hidden
    >
      {/* ── Arms ── */}
      {/* Left arm — shoulder around (24, 58), curls out and down. */}
      <motion.g
        animate={{ rotate: [0, 4, -2, 3, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "24px 58px", transformBox: "fill-box" }}
      >
        <path
          d="M 24 58 Q 14 70 8 84"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* Hand — small filled dot at the wrist */}
        <circle cx="7" cy="86" r="3.6" fill="#1a1a18" />
      </motion.g>

      {/* Right arm — shoulder (76, 58), mirror of left. */}
      <motion.g
        animate={{ rotate: [0, -4, 2, -3, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "76px 58px", transformBox: "fill-box" }}
      >
        <path
          d="M 76 58 Q 86 70 92 84"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="93" cy="86" r="3.6" fill="#1a1a18" />
      </motion.g>

      {/* ── Legs ── */}
      {/* Left leg — hip at (40, 82), gentle dangle. */}
      <motion.g
        animate={{ rotate: [0, 2, -1.5, 2, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "40px 82px", transformBox: "fill-box" }}
      >
        <path
          d="M 40 82 Q 38 90 36 96"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="35" cy="97" r="3.6" fill="#1a1a18" />
      </motion.g>

      {/* Right leg — hip at (60, 82). */}
      <motion.g
        animate={{ rotate: [0, -2, 1.5, -2, 0] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "60px 82px", transformBox: "fill-box" }}
      >
        <path
          d="M 60 82 Q 62 90 64 96"
          stroke="#1a1a18"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="65" cy="97" r="3.6" fill="#1a1a18" />
      </motion.g>
    </svg>
  );
}
