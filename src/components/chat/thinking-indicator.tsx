"use client";

import { motion } from "framer-motion";
import type { ThinkingPhase } from "@/lib/stores/chat-store";

const DOTS = [0, 1, 2];

export function ThinkingIndicator({
  phase,
  label,
}: {
  phase: ThinkingPhase;
  label?: string | null;
}) {
  const text =
    phase === "tooling"
      ? (label ?? "Cooking")
      : "Thinking";

  return (
    <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
      <div className="flex items-center gap-1">
        {DOTS.map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em]">{text}</span>
    </div>
  );
}
