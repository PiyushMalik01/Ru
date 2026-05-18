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

export function RoutineCard({ data }: { data: RoutineCardData }) {
  const [open, setOpen] = useState(false);
  const streak = Math.max(0, data.streak ?? 0);
  const weekFilled = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full rounded-xl border border-border bg-card text-left transition-colors",
        "hover:border-[rgba(255,255,255,0.16)]"
      )}
    >
      <div className="px-4 py-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[34px] font-light leading-none tracking-tight tabular-nums">
                {streak}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {streak === 1 ? "day streak" : "day streak"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="truncate text-[14px] font-medium leading-tight">
                {data.title}
              </span>
              {data.frequency && (
                <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] lowercase tracking-wide text-muted-foreground">
                  {data.frequency}
                </span>
              )}
            </div>
            {data.time_of_day && (
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {data.time_of_day}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-[3px]" aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => {
              const filled = i < weekFilled;
              return (
                <span
                  key={i}
                  className={cn(
                    "h-4 w-[3px] rounded-full",
                    filled ? "bg-success" : "bg-[rgba(255,255,255,0.1)]"
                  )}
                />
              );
            })}
          </div>
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
            <div className="border-t border-border px-4 py-2.5">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{data.frequency ?? "—"}</span>
                <span>this week · {weekFilled}/7</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
