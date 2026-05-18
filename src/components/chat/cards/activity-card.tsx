"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ActivityCardData {
  id: string;
  activity: string;
  category?: string;
  duration_minutes?: number;
  timestamp?: string;
}

function relative(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

function formatDuration(min?: number): string {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function ActivityCard({ data }: { data: ActivityCardData }) {
  const [open, setOpen] = useState(false);
  const dur = formatDuration(data.duration_minutes);
  const rel = relative(data.timestamp);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      style={{ ["--entity-color" as string]: "var(--entity-activity)" }}
      className={cn(
        "ru-strip block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors",
        "hover:border-[var(--hairline-strong)]"
      )}
    >
      <div className="flex items-center gap-3 pl-5 pr-4 py-3">
        <div className="min-w-0 flex-1 truncate text-[14px] font-medium leading-tight">
          {data.activity}
        </div>
        {data.category && (
          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] lowercase tracking-wide text-muted-foreground">
            {data.category}
          </span>
        )}
        {dur && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {dur}
          </span>
        )}
        {rel && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {rel}
          </span>
        )}
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
            <div className="border-t border-border pl-5 pr-4 py-2.5">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{data.category ?? "uncategorized"}</span>
                <span>{data.timestamp ? new Date(data.timestamp).toLocaleString() : "—"}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
