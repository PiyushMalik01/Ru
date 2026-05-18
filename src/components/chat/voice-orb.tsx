"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbPhase = "ready" | "listening" | "thinking" | "speaking";

/**
 * Monochrome breathing orb. State is conveyed through breath rate and ring
 * expansion — no rainbow/gradient, no AI cliches. Renderable at any size; the
 * concentric rings scale relative to the size.
 */
export function VoiceOrb({ phase, size = 240 }: { phase: OrbPhase; size?: number }) {
  const coreSize = size / 2;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Ring phase={phase} delay={0} max={size} core={coreSize} />
      <Ring phase={phase} delay={0.7} max={size * 0.875} core={coreSize} />
      <Ring phase={phase} delay={1.4} max={size * 0.75} core={coreSize} />

      <motion.div
        className={cn(
          "relative rounded-full bg-foreground",
          size >= 100 ? "shadow-[0_0_50px_rgba(255,255,255,0.18)]" : "shadow-[0_0_18px_rgba(255,255,255,0.22)]"
        )}
        style={{ width: coreSize, height: coreSize }}
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

function Ring({
  phase,
  delay,
  max,
  core,
}: {
  phase: OrbPhase;
  delay: number;
  max: number;
  core: number;
}) {
  const active = phase !== "ready";
  return (
    <motion.span
      className="absolute rounded-full border border-foreground"
      style={{ width: core, height: core }}
      animate={
        active
          ? {
              width: [core, max],
              height: [core, max],
              opacity: [0.25, 0],
            }
          : { width: core, height: core, opacity: 0.15 }
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
