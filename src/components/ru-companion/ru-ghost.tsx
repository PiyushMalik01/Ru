"use client";

// RuGhost — Ru's character presence. Three layers of motion stacked so the
// movement reads as alive rather than scripted:
//
//   1. Travel layer (outermost): every 22-35s Ru picks a new anchor from a
//      route-specific list and springs to it.
//   2. Drift layer (middle): around the current anchor, Ru floats in a
//      slow ellipse — keyframes on x/y over ~14s.
//   3. Body layer (inner): the silhouette morphs via animated border-radius
//      and rotates 0-5° so the shape is never identical frame to frame.
//
// On top, the face blinks, expressions tween, and the cloud bubble pops.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { RuFace } from "./ru-face";
import { RuSpeech } from "./ru-speech";
import { pickGreeting, pickIdleLine } from "./messages";

const SIZE = 90;

interface Anchor {
  /** distance from viewport right edge in px */
  right: number;
  /** distance from viewport top in px */
  top: number;
  /** which side the speech cloud should appear on */
  tail?: "left" | "right";
}

/**
 * Per-route anchor sets — Ru roams between them. Positions are kept in the
 * right-side gutter so she doesn't fly across content. Each anchor is a
 * resting spot; the drift layer gives her micro-motion around it.
 */
const ANCHORS: Record<string, Anchor[]> = {
  today: [
    { right: 90, top: 150, tail: "right" },
    { right: 60, top: 340, tail: "right" },
    { right: 110, top: 520, tail: "right" },
    { right: 70, top: 720, tail: "right" },
  ],
  sheet: [
    { right: 60, top: 140, tail: "right" },
    { right: 96, top: 380, tail: "right" },
    { right: 56, top: 600, tail: "right" },
  ],
  plans: [
    { right: 80, top: 160, tail: "right" },
    { right: 60, top: 380, tail: "right" },
    { right: 100, top: 580, tail: "right" },
  ],
  planDetail: [
    { right: 64, top: 200, tail: "right" },
    { right: 90, top: 420, tail: "right" },
    { right: 56, top: 640, tail: "right" },
  ],
  fallback: [{ right: 70, top: 160, tail: "right" }],
};

function bucketFor(pathname: string): keyof typeof ANCHORS | null {
  if (pathname.startsWith("/chat")) return null;
  if (pathname.startsWith("/settings")) return null;
  if (pathname.startsWith("/onboarding")) return null;

  if (/^\/plans\/[0-9a-f-]{36}/i.test(pathname)) return "planDetail";
  if (pathname.startsWith("/plans")) return "plans";
  if (pathname.startsWith("/sheet")) return "sheet";
  if (pathname.startsWith("/today")) return "today";
  return "fallback";
}

export function RuGhost() {
  const pathname = usePathname();
  const bucket = useMemo(() => bucketFor(pathname), [pathname]);
  const anchors = bucket ? ANCHORS[bucket] : null;

  const [anchorIdx, setAnchorIdx] = useState(0);

  useEffect(() => {
    setAnchorIdx(0);
  }, [bucket]);

  // Rotate anchors every 22-35s.
  useEffect(() => {
    if (!anchors || anchors.length <= 1) return;
    const wait = 22_000 + Math.random() * 13_000;
    const t = setTimeout(() => {
      setAnchorIdx((i) => (i + 1) % anchors.length);
    }, wait);
    return () => clearTimeout(t);
  }, [anchorIdx, anchors]);

  const expression = useRuCompanion((s) => s.expression);
  const said = useRuCompanion((s) => s.said);
  const say = useRuCompanion((s) => s.say);
  const setHidden = useRuCompanion((s) => s.setHidden);

  useEffect(() => {
    setHidden(!bucket);
  }, [bucket, setHidden]);

  // Greeting on route change.
  const lastGreetRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!bucket) return;
    if (lastGreetRoute.current === pathname) return;
    lastGreetRoute.current = pathname;
    const line = pickGreeting(pathname);
    if (line) say(line, 4400);
  }, [bucket, pathname, say]);

  // Idle observations every 32-60s when she's quiet.
  useEffect(() => {
    if (!bucket) return;
    const wait = 32_000 + Math.random() * 28_000;
    const t = setTimeout(() => {
      const current = useRuCompanion.getState().said;
      if (!current) {
        const line = pickIdleLine(pathname);
        if (line) useRuCompanion.getState().say(line, 3800);
      }
    }, wait);
    return () => clearTimeout(t);
  }, [bucket, pathname, anchorIdx]);

  if (!bucket || !anchors) return null;

  const currentAnchor = anchors[anchorIdx] ?? anchors[0];
  const tail = currentAnchor.tail ?? "right";

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed right-0 top-0 z-[5] hidden sm:block"
      animate={{
        x: -currentAnchor.right,
        y: currentAnchor.top,
      }}
      transition={{
        type: "spring",
        stiffness: 36,
        damping: 14,
        mass: 1.1,
      }}
      style={{ width: SIZE, height: SIZE }}
    >
      {/* Drift — slow ellipse around the current anchor */}
      <motion.div
        animate={{
          x: [0, 14, -8, 6, 0, -10, 4, 0],
          y: [0, -10, 8, -4, -12, 6, -6, 0],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative h-full w-full"
      >
        {/* Body — morphing blob with gentle rotation */}
        <motion.div
          animate={{
            borderRadius: [
              "48% 52% 51% 49% / 53% 47% 49% 51%",
              "52% 48% 49% 51% / 48% 52% 51% 49%",
              "50% 50% 52% 48% / 51% 49% 48% 52%",
              "47% 53% 50% 50% / 52% 48% 53% 47%",
              "48% 52% 51% 49% / 53% 47% 49% 51%",
            ],
            rotate: [0, 4, -3, 5, 0],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 flex items-center justify-center bg-[#f4d2bd] dark:bg-[#e9bba0]"
          style={{
            boxShadow:
              "0 10px 30px -10px rgba(0,0,0,0.25), inset 0 -8px 16px rgba(0,0,0,0.06)",
          }}
        >
          <RuFace expression={expression} size={SIZE} />
        </motion.div>

        {/* Speech cloud — anchored to the side opposite the tail */}
        {tail === "right" ? (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ right: SIZE + 18 }}
          >
            <RuSpeech text={said?.text ?? null} tail="right" />
          </div>
        ) : (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: SIZE + 18 }}
          >
            <RuSpeech text={said?.text ?? null} tail="left" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
