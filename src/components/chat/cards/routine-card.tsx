"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface RoutineCardData {
  id: string;
  title: string;
  frequency?: string;
  time_of_day?: string | null;
  streak?: number;
}

// Full lime tile, BLACK type. Streak as the hero number in Fraunces.
export function RoutineCard({ data }: { data: RoutineCardData }) {
  const [open, setOpen] = useState(false);
  const streak = Math.max(0, data.streak ?? 0);
  const weekFilled = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full overflow-hidden rounded-2xl text-left transition-transform",
        "hover:-translate-y-0.5"
      )}
      style={{
        background: "var(--entity-routine)",
        color: "var(--entity-routine-fg)",
      }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          routine
        </span>
        {data.frequency && (
          <>
            <span className="opacity-40">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
              {data.frequency}
            </span>
          </>
        )}
        {data.time_of_day && (
          <span className="ml-auto font-mono text-[11px] tabular-nums opacity-85">
            {data.time_of_day}
          </span>
        )}
      </div>

      <div className="flex items-end gap-4 px-5 pb-4 pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[44px] leading-none tracking-tight tabular-nums">
              {streak}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-75">
              day streak
            </span>
          </div>
          <div className="mt-2 truncate text-[15px] font-medium leading-tight">
            {data.title}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < weekFilled;
            return (
              <span
                key={i}
                className={cn(
                  "h-5 w-[3px] rounded-full",
                  filled ? "bg-black" : "bg-black/20"
                )}
              />
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/15 px-5 py-3 font-mono text-[11px] uppercase tracking-wide opacity-75">
              <span>this week · {weekFilled}/7</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
