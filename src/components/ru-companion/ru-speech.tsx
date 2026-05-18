"use client";

// Speech bubble that appears beside Ru. Comes in with a small pop, lingers,
// fades out. Pointer-events: none so it never blocks a click.

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  text: string | null;
  /** Whether to render the tail on the left (Ru on the right) or right (Ru on the left). */
  tail?: "left" | "right";
  className?: string;
}

export function RuSpeech({ text, tail = "left", className }: Props) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "pointer-events-none relative",
            "rounded-2xl border border-[var(--hairline)] bg-card px-3.5 py-2",
            "shadow-[0_6px_18px_-4px_rgba(0,0,0,0.18)]",
            "dark:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.55)]",
            className
          )}
        >
          <span className="block max-w-[200px] whitespace-pre-wrap text-[12.5px] leading-snug text-foreground">
            {text}
          </span>

          {/* Tail — small triangle pointing toward Ru */}
          <span
            aria-hidden
            className={cn(
              "absolute h-2 w-2 rotate-45 border bg-card",
              "border-[var(--hairline)]",
              tail === "left"
                ? "-left-1 top-1/2 -translate-y-1/2 border-r-0 border-t-0"
                : "-right-1 top-1/2 -translate-y-1/2 border-l-0 border-b-0"
            )}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
