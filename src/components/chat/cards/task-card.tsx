"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskCardData {
  id: string;
  title: string;
  priority?: "low" | "medium" | "high";
  due_at?: string | null;
  status?: "pending" | "completed" | string;
}

const priorityDot: Record<string, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-error",
};

function formatDue(due?: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  const day = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

export function TaskCard({ data }: { data: TaskCardData }) {
  const [open, setOpen] = useState(false);
  const completed = data.status === "completed";
  const dot = priorityDot[data.priority ?? "low"] ?? "bg-muted-foreground/50";

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      style={{ ["--entity-color" as string]: "var(--entity-task)" }}
      className={cn(
        "ru-strip group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors",
        "hover:border-[var(--hairline-strong)]"
      )}
    >
      <div className="flex items-center gap-3 pl-5 pr-4 py-3.5">
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            completed ? "bg-muted-foreground/40" : dot
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[14px] font-medium leading-tight",
              completed && "text-muted-foreground line-through"
            )}
          >
            {data.title}
          </div>
        </div>
        {data.due_at && (
          <div className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            {formatDue(data.due_at)}
          </div>
        )}
        {completed && (
          <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
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
                <span>{data.priority ?? "no priority"}</span>
                <span>{completed ? "done" : "open"}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
