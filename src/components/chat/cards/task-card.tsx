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

function formatDue(due?: string | null): string {
  if (!due) return "";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today, ${time}`;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

// Full saturated cobalt tile. White type. Chunky rounded. The card IS the color.
export function TaskCard({ data }: { data: TaskCardData }) {
  const [open, setOpen] = useState(false);
  const completed = data.status === "completed";

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "group block w-full overflow-hidden rounded-2xl text-left transition-transform",
        "hover:-translate-y-0.5"
      )}
      style={{
        background: "var(--entity-task)",
        color: "var(--entity-task-fg)",
      }}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
          task
        </span>
        <span className="opacity-40">·</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-80">
          {data.priority ?? "no priority"}
        </span>
        {data.due_at && (
          <span className="ml-auto font-mono text-[11px] tabular-nums opacity-85">
            {formatDue(data.due_at)}
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 px-5 pb-4">
        <div
          className={cn(
            "flex-1 text-[15px] font-medium leading-snug",
            completed && "line-through opacity-60"
          )}
        >
          {data.title}
        </div>
        {completed && <Check className="h-4 w-4 shrink-0 opacity-80" aria-hidden />}
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
            <div className="border-t border-white/15 px-5 py-3 font-mono text-[11px] uppercase tracking-wide opacity-75">
              {completed ? "completed" : "open"} · click to {open ? "close" : "expand"}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
