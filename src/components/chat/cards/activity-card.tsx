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

// Full magenta tile, white type. Compact since activity is the most frequent.
export function ActivityCard({ data }: { data: ActivityCardData }) {
  const [open, setOpen] = useState(false);
  const dur = formatDuration(data.duration_minutes);
  const rel = relative(data.timestamp);

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "block w-full overflow-hidden rounded-2xl text-left transition-transform",
        "hover:-translate-y-0.5"
      )}
      style={{
        background: "var(--entity-activity)",
        color: "var(--entity-activity-fg)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
          logged
        </span>
        <div className="min-w-0 flex-1 truncate text-[14.5px] font-medium leading-tight">
          {data.activity}
        </div>
        {data.category && (
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[10px] lowercase tracking-wide">
            {data.category}
          </span>
        )}
        {dur && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums opacity-90">
            {dur}
          </span>
        )}
        {rel && (
          <span className="shrink-0 font-mono text-[11px] opacity-85">
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
            <div className="border-t border-white/20 px-5 py-3 font-mono text-[11px] uppercase tracking-wide opacity-80">
              {data.timestamp ? new Date(data.timestamp).toLocaleString() : "—"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
