"use client";

// RuGhost — Ru's character presence as a Harry-Potter-ghost-like floating layer.
//
// Five overlapping motion behaviors run in parallel:
//
//   1. Travel  — every 16-28s Ru picks a new anchor and springs across the
//                full viewport (left, right, top, bottom, corners). Stays in
//                negative space when possible but can drift over cards.
//   2. Drift   — slow ~14s ellipse around the current anchor for micro-motion.
//   3. Body    — animated border-radius + small rotation so the silhouette
//                never reads as a perfect circle.
//   4. Depth   — scale + opacity + blur cycle (near / default / far / phasing)
//                that simulates flying toward the screen and back.
//   5. Mood    — body color cycles through soft pastel pops every ~24s.
//
// Plus: subscribes to the chat store and reacts (expression + speech) when
// the user is voice-mode'ing or Ru is streaming back a reply.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { RuFace } from "./ru-face";
import { RuLimbs } from "./ru-limbs";
import { RuSpeech } from "./ru-speech";
import { pickGreeting, pickIdleLine } from "./messages";

interface Anchor {
  /** % from left edge of viewport. 50 = center. */
  xPct: number;
  /** % from top. */
  yPct: number;
  /** Which side the speech cloud sits on. Auto-flips when Ru is near an edge. */
  tail?: "left" | "right";
}

/**
 * Anchor sets per route. Now covering the entire viewport — left, right,
 * corners, occasional center — so Ru genuinely roams the screen.
 */
const ANCHORS: Record<string, Anchor[]> = {
  today: [
    { xPct: 88, yPct: 22, tail: "right" },
    { xPct: 12, yPct: 38, tail: "left" },
    { xPct: 92, yPct: 58, tail: "right" },
    { xPct: 8, yPct: 72, tail: "left" },
    { xPct: 70, yPct: 86, tail: "right" },
  ],
  sheet: [
    { xPct: 90, yPct: 24, tail: "right" },
    { xPct: 10, yPct: 50, tail: "left" },
    { xPct: 88, yPct: 78, tail: "right" },
  ],
  plans: [
    { xPct: 88, yPct: 26, tail: "right" },
    { xPct: 14, yPct: 54, tail: "left" },
    { xPct: 86, yPct: 80, tail: "right" },
  ],
  planDetail: [
    { xPct: 88, yPct: 30, tail: "right" },
    { xPct: 10, yPct: 56, tail: "left" },
    { xPct: 90, yPct: 76, tail: "right" },
  ],
  // /chat — Ru sits in ONE fixed spot (no rotation). The user explicitly asked
  // her not to roam here since the chat surface is dense and she'd distract.
  chat: [{ xPct: 92, yPct: 20, tail: "right" }],
  fallback: [{ xPct: 88, yPct: 22, tail: "right" }],
};

/**
 * When the AskHud is summoned, Ru flies over to it and stays there until it
 * closes. Positioned just above-left of the HUD so she's "watching the
 * conversation" without overlapping the cloud or the pill.
 */
const ASKHUD_ANCHOR: Anchor = { xPct: 30, yPct: 72, tail: "left" };

function bucketFor(pathname: string): keyof typeof ANCHORS | null {
  if (pathname.startsWith("/settings")) return null;
  if (pathname.startsWith("/onboarding")) return null;
  if (pathname.startsWith("/chat")) return "chat";

  if (/^\/plans\/[0-9a-f-]{36}/i.test(pathname)) return "planDetail";
  if (pathname.startsWith("/plans")) return "plans";
  if (pathname.startsWith("/sheet")) return "sheet";
  if (pathname.startsWith("/today")) return "today";
  return "fallback";
}

// Pop colors Ru cycles through. Skip cobalt/magenta where the dark face
// elements would lose contrast.
const POP_COLORS = [
  "#f4d2bd", // peach (the rest pose)
  "#bef264", // lime
  "#fb923c", // coral
  "#fbbf24", // ochre
  "#5eead4", // mint teal
  "#fda4af", // soft pink
];

// Depth states cycle: default → near → default → far → phasing → ...
type DepthState = "default" | "near" | "far" | "phasing";
const DEPTH_KEYFRAMES = {
  default:  { scale: 1.0,  opacity: 0.95, filter: "blur(0px)" },
  near:     { scale: 1.22, opacity: 1,    filter: "blur(0px)" },
  far:      { scale: 0.62, opacity: 0.55, filter: "blur(1.5px)" },
  phasing:  { scale: 0.92, opacity: 0.25, filter: "blur(2px)" },
} as const;

export function RuGhost() {
  const pathname = usePathname();
  const bucket = useMemo(() => bucketFor(pathname), [pathname]);
  const askHudOpen = useRuCompanion((s) => s.askHudOpen);

  // Anchors are hijacked by the AskHud when it's open: Ru flies to its
  // anchor and stays put until it closes.
  const anchors = useMemo<Anchor[] | null>(() => {
    if (askHudOpen) return [ASKHUD_ANCHOR];
    return bucket ? ANCHORS[bucket] : null;
  }, [askHudOpen, bucket]);

  const [anchorIdx, setAnchorIdx] = useState(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [depth, setDepth] = useState<DepthState>("default");

  useEffect(() => {
    setAnchorIdx(0);
  }, [bucket, askHudOpen]);

  // Anchor rotation — every 16-28s. Skipped when only one anchor (chat, HUD open).
  useEffect(() => {
    if (!anchors || anchors.length <= 1) return;
    const wait = 16_000 + Math.random() * 12_000;
    const t = setTimeout(() => {
      setAnchorIdx((i) => (i + 1) % anchors.length);
    }, wait);
    return () => clearTimeout(t);
  }, [anchorIdx, anchors]);

  // Color rotation — every 24s.
  useEffect(() => {
    const t = setInterval(() => {
      setColorIdx((i) => (i + 1) % POP_COLORS.length);
    }, 24_000);
    return () => clearInterval(t);
  }, []);

  // Depth cycle — default ↔ near ↔ default ↔ far ↔ phasing ↔ default ...
  // Asymmetric timing so it doesn't feel like a loop.
  useEffect(() => {
    const sequence: { state: DepthState; ms: number }[] = [
      { state: "default", ms: 6_000 + Math.random() * 4_000 },
      { state: "near", ms: 2_400 + Math.random() * 1_200 },
      { state: "default", ms: 5_000 + Math.random() * 3_000 },
      { state: "far", ms: 3_000 + Math.random() * 2_000 },
      { state: "default", ms: 4_000 + Math.random() * 3_000 },
      { state: "phasing", ms: 1_400 + Math.random() * 600 },
    ];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const cur = sequence[i % sequence.length];
      setDepth(cur.state);
      timer = setTimeout(step, cur.ms);
      i += 1;
    };
    step();
    return () => clearTimeout(timer);
  }, []);

  const expression = useRuCompanion((s) => s.expression);
  const said = useRuCompanion((s) => s.said);
  const say = useRuCompanion((s) => s.say);
  const setHidden = useRuCompanion((s) => s.setHidden);
  const react = useRuCompanion((s) => s.react);

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

  // Idle observations.
  useEffect(() => {
    if (!bucket) return;
    const wait = 28_000 + Math.random() * 22_000;
    const t = setTimeout(() => {
      const current = useRuCompanion.getState().said;
      if (!current) {
        const line = pickIdleLine(pathname);
        if (line) useRuCompanion.getState().say(line, 3600);
      }
    }, wait);
    return () => clearTimeout(t);
  }, [bucket, pathname, anchorIdx]);

  // ── Chat / voice reactivity ─────────────────────────────────────────
  // Ru reacts when the user sends a message or Ru herself streams a reply.
  const chatStatus = useChatStore((s) => s.status);
  const chatThinking = useChatStore((s) => s.thinking);
  const voiceMode = useChatStore((s) => s.voiceMode);
  const lastStatus = useRef<string>("idle");

  useEffect(() => {
    if (chatStatus === "streaming" && lastStatus.current !== "streaming") {
      // User just sent — Ru reacts.
      react("thinking", 1800);
    }
    if (chatStatus === "idle" && lastStatus.current === "streaming") {
      // Streaming just finished — Ru gives a quick wink.
      react("wink", 900);
    }
    lastStatus.current = chatStatus;
  }, [chatStatus, react]);

  useEffect(() => {
    if (voiceMode) {
      // Subtle: wink when voice mode turns on.
      react("wink", 1100);
    }
  }, [voiceMode, react]);

  useEffect(() => {
    if (chatThinking === "tooling") {
      // Ru is firing a tool — surprised pop.
      react("surprised", 1100);
    }
  }, [chatThinking, react]);

  if (!bucket || !anchors) return null;

  const currentAnchor = anchors[anchorIdx] ?? anchors[0];

  // Auto-flip tail based on horizontal position so the cloud is always on the
  // side that has more room — left position → cloud on right, etc.
  const computedTail: "left" | "right" =
    currentAnchor.xPct > 60 ? "right" : "left";

  const depthState = DEPTH_KEYFRAMES[depth];
  const currentColor = POP_COLORS[colorIdx];

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[5]"
      animate={{
        x: `calc(${currentAnchor.xPct}vw - 50%)`,
        y: `calc(${currentAnchor.yPct}vh - 50%)`,
      }}
      transition={{
        type: "spring",
        stiffness: 32,
        damping: 13,
        mass: 1.2,
      }}
    >
      {/* Depth (scale + opacity + blur) — animates between near/default/far/phasing */}
      <motion.div
        animate={{
          scale: depthState.scale,
          opacity: depthState.opacity,
          filter: depthState.filter,
        }}
        transition={{ duration: depth === "phasing" ? 0.4 : 1.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        {/* Drift — slow ellipse around the anchor. Container is enlarged
            beyond the body so limbs have room to stick out and wave. */}
        <motion.div
          animate={{
            x: [0, 12, -8, 6, 0, -10, 4, 0],
            y: [0, -10, 8, -4, -12, 6, -6, 0],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative h-[110px] w-[110px] md:h-[130px] md:w-[130px] lg:h-[146px] lg:w-[146px]"
        >
          {/* Limbs SVG — sits BEHIND the body so the body's solid fill clips
              the shoulder/hip joints. Only the stubs poke out. */}
          <RuLimbs />

          {/* Body — morphing blob with face. Inset to ~62% of the container
              so there's room around it for limbs to extend visibly. */}
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
              backgroundColor: currentColor,
            }}
            transition={{
              borderRadius: { duration: 9, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: 9, repeat: Infinity, ease: "easeInOut" },
              backgroundColor: { duration: 2.6, ease: "easeInOut" },
            }}
            className="absolute left-1/2 top-1/2 flex h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{
              boxShadow:
                "0 10px 30px -10px rgba(0,0,0,0.25), inset 0 -8px 16px rgba(0,0,0,0.06)",
            }}
          >
            <ResponsiveFace expression={expression} />
          </motion.div>

          {/* Speech cloud — flips side based on Ru's position */}
          {computedTail === "right" ? (
            <div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ right: "calc(100% + 14px)" }}
            >
              <RuSpeech text={said?.text ?? null} tail="right" />
            </div>
          ) : (
            <div
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: "calc(100% + 14px)" }}
            >
              <RuSpeech text={said?.text ?? null} tail="left" />
            </div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Face scales to match the responsive body. We pass a single explicit size so
 * the SVG viewport stays sharp on all screens.
 */
function ResponsiveFace({ expression }: { expression: ReturnType<typeof useRuCompanion.getState>["expression"] }) {
  // The face inherits the container size via 100% scaling — simpler than
  // doing media queries in JS. The viewBox keeps proportions.
  return (
    <div className="h-full w-full">
      <RuFaceFullWidth expression={expression} />
    </div>
  );
}

function RuFaceFullWidth({ expression }: { expression: ReturnType<typeof useRuCompanion.getState>["expression"] }) {
  // We need the face SVG to fill 100% of its container. RuFace takes a size
  // prop in pixels, but we can wrap it with a 100% width svg or just inline.
  // Easiest: pass a large size + CSS scale-down.
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-full w-full">
        <RuFace expression={expression} size={100} />
        <style>{`
          /* Make the inline SVG fill its parent regardless of the size attr */
          div > svg { width: 100% !important; height: 100% !important; }
        `}</style>
      </div>
    </div>
  );
}
