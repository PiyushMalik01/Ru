"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbPhase = "ready" | "listening" | "thinking" | "speaking";

/**
 * The big conversational orb. Monochrome, restrained — no gradient/rainbow.
 * State is conveyed through breath-rate and ring expansion, not color.
 */
export function VoiceOrb({ phase }: { phase: OrbPhase }) {
  return (
    <div className="relative flex h-[240px] w-[240px] items-center justify-center">
      {/* Outer rings — slower the more idle, faster the more active */}
      <Ring phase={phase} delay={0} max={240} />
      <Ring phase={phase} delay={0.7} max={210} />
      <Ring phase={phase} delay={1.4} max={180} />

      {/* Core orb */}
      <motion.div
        className={cn(
          "relative h-[120px] w-[120px] rounded-full",
          "bg-foreground shadow-[0_0_50px_rgba(255,255,255,0.18)]"
        )}
        animate={
          phase === "listening"
            ? { scale: [1, 1.07, 1] }
            : phase === "thinking"
              ? { scale: [1, 1.02, 1] }
              : phase === "speaking"
                ? { scale: [1, 1.12, 0.98, 1.08, 1] }
                : { scale: 1 }
        }
        transition={{
          duration:
            phase === "listening" ? 1.2 : phase === "speaking" ? 0.85 : phase === "thinking" ? 2.4 : 0,
          repeat: phase === "ready" ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}

function Ring({ phase, delay, max }: { phase: OrbPhase; delay: number; max: number }) {
  // Each ring grows from the core outward and fades. Cadence matches the orb.
  const active = phase !== "ready";
  return (
    <motion.span
      className="absolute rounded-full border border-foreground"
      style={{ width: 0, height: 0 }}
      animate={
        active
          ? {
              width: [120, max],
              height: [120, max],
              opacity: [0.25, 0],
            }
          : { width: 120, height: 120, opacity: 0.15 }
      }
      transition={{
        duration: phase === "listening" ? 1.8 : phase === "speaking" ? 1.2 : 2.6,
        repeat: active ? Infinity : 0,
        ease: "easeOut",
        delay,
      }}
    />
  );
}
