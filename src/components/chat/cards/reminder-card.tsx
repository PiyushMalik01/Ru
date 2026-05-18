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
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const day = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

export function ReminderCard({ data }: { data: ReminderCardData }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{ ["--entity-color" as string]: "var(--entity-reminder)" }}
      className={cn(
        "ru-strip group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors",
        "hover:border-[var(--hairline-strong)]"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 pl-5 pr-4 py-3.5 text-left"
      >
        <Bell className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--entity-reminder)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium leading-tight">{data.title}</div>
        </div>
        {data.is_recurring && (
          <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {data.remind_at && (
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {formatRemind(data.remind_at)}
          </span>
        )}
      </button>

      {/* Hover action row */}
      <div className="hidden border-t border-border pl-5 pr-4 py-2 group-hover:flex">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wide">
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            dismiss
          </button>
          <span className="text-[rgba(255,255,255,0.12)]">·</span>
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            snooze 1h
          </button>
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
            <div className="border-t border-border pl-5 pr-4 py-2.5">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{data.is_recurring ? "recurring" : "one-time"}</span>
                <span>{data.remind_at ? new Date(data.remind_at).toLocaleString() : "—"}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
