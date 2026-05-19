"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReminderCardData {
  id: string;
  title: string;
  remind_at?: string | null;
  is_recurring?: boolean;
}

function formatRemind(t?: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

// Full coral tile, dark type. Bell glyph anchored top-left.
export function ReminderCard({ data }: { data: ReminderCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "group block w-full overflow-hidden rounded-2xl transition-transform",
        "hover:-translate-y-0.5"
      )}
      style={{
        background: "var(--entity-reminder)",
        color: "var(--entity-reminder-fg)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
          reminder
        </span>
        <div className="min-w-0 flex-1 truncate text-[14.5px] font-medium leading-tight">
          {data.title}
        </div>
        {data.is_recurring && (
          <Repeat className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden />
        )}
        {data.remind_at && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums opacity-85">
            {formatRemind(data.remind_at)}
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 border-t border-black/15 px-5 py-3 font-mono text-[11px] uppercase tracking-wide opacity-80">
              <span>{data.is_recurring ? "recurring" : "one-time"}</span>
              <span className="opacity-50">·</span>
              <span>{data.remind_at ? new Date(data.remind_at).toLocaleString() : "—"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
