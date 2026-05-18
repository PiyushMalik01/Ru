"use client";

// RuGhost — Ru's character presence. Soft morphing blob, simple face,
// drifts around an anchor point, occasionally speaks. Sits as a fixed
// floating layer with pointer-events: none so it never blocks anything.
//
// Architecture:
//   - One persistent component, mounted in AppLayout.
//   - Pathname picks an anchor position (top-right area on most pages,
//     near the page heading on /today). Anchor swaps with a soft transition
//     on route change.
//   - Around the anchor, Ru drifts in a small ellipse via framer-motion
//     keyframes — gives the body its own life.
//   - The body uses an animated border-radius blob (no SVG morph required)
//     so the silhouette is never a perfect circle and slowly reshapes.
//   - Expressions and speech read from the ru-companion store; either
//     auto-driven by route + time, or triggered by other components.
//   - Hidden entirely on /chat, /settings, /onboarding where it would clutter.

import { useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { RuFace } from "./ru-face";
import { RuSpeech } from "./ru-speech";
import { pickGreeting, pickIdleLine } from "./messages";

const SIZE = 88;

// Where Ru anchors per route. Coordinates are interpreted from the right edge
// (right) and top (top) of the viewport so she stays correctly placed on any
// width without breaking layout. On /today we sit her low-right of the page
// heading area; everywhere else she chills in the top-right gutter.
interface Anchor {
  /** distance from viewport right edge */
  right: number;
  /** distance from viewport top */
  top: number;
}

function anchorFor(pathname: string): Anchor | null {
  // Hide her entirely where she'd clutter input-heavy pages.
  if (pathname.startsWith("/chat")) return null;
  if (pathname.startsWith("/settings")) return null;
  if (pathname.startsWith("/onboarding")) return null;

  if (pathname.startsWith("/today")) return { right: 80, top: 150 };
  if (pathname.startsWith("/plans/")) return { right: 64, top: 140 };
  if (pathname.startsWith("/plans")) return { right: 80, top: 160 };
  if (pathname.startsWith("/sheet")) return { right: 56, top: 130 };

  // Default — top right, out of the way.
  return { right: 64, top: 140 };
}

export function RuGhost() {
  const pathname = usePathname();
  const anchor = useMemo(() => anchorFor(pathname), [pathname]);

  const expression = useRuCompanion((s) => s.expression);
  const said = useRuCompanion((s) => s.said);
  const say = useRuCompanion((s) => s.say);
  const setHidden = useRuCompanion((s) => s.setHidden);

  // Keep the store's "hidden" in sync so other components can read it.
  useEffect(() => {
    setHidden(anchor === null);
  }, [anchor, setHidden]);

  // Route greeting — say something fresh on route change.
  const lastGreetRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!anchor) return;
    if (lastGreetRoute.current === pathname) return;
    lastGreetRoute.current = pathname;
    const line = pickGreeting(pathname);
    if (line) say(line, 4200);
  }, [anchor, pathname, say]);

  // Idle observations — every 35-65s drop a gentle line, if Ru's quiet.
  useEffect(() => {
    if (!anchor) return;
    const tick = () => {
      const current = useRuCompanion.getState().said;
      if (!current) {
        const line = pickIdleLine(pathname);
        if (line) useRuCompanion.getState().say(line, 3800);
      }
    };
    const wait = 35_000 + Math.random() * 30_000;
    const t = setTimeout(tick, wait);
    return () => clearTimeout(t);
  }, [anchor, pathname]);

  if (!anchor) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[5] hidden sm:block"
      style={{
        right: anchor.right,
        top: anchor.top,
        width: SIZE,
        height: SIZE,
      }}
    >
      {/* The drift container — Ru's body floats inside an ellipse around the anchor. */}
      <motion.div
        animate={{
          x: [0, 14, -8, 6, 0, -10, 4, 0],
          y: [0, -10, 8, -4, -12, 6, -6, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative h-full w-full"
      >
        {/* The morphing blob body. border-radius animates to give organic shape. */}
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
          className="absolute inset-0 flex items-center justify-center bg-[#f4d2bd] shadow-[0_8px_28px_-8px_rgba(0,0,0,0.18)] dark:bg-[#e9bba0] dark:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.55)]"
          style={{
            // Keep the shadow softly outside the morphing edge.
            boxShadow:
              "0 8px 28px -10px rgba(0,0,0,0.22), inset 0 -6px 14px rgba(0,0,0,0.06)",
          }}
        >
          <RuFace expression={expression} size={SIZE} />
        </motion.div>

        {/* Speech bubble — anchored to the LEFT of the body (Ru is on the right) */}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ right: SIZE + 12 }}>
          <RuSpeech text={said?.text ?? null} tail="right" />
        </div>
      </motion.div>
    </div>
  );
}
