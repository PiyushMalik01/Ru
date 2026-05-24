"use client";

import { motion } from "framer-motion";
import type { ChatMessage } from "@/lib/stores/chat-store";
import { MessageBubble } from "./message-bubble";

/**
 * Returns a day label ("today", "yesterday", "thursday", "may 20") for an
 * ISO timestamp. Lowercase by design — matches the v2 type system's
 * lowercase poster register.
 */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const start = (date: Date) => {
    const x = new Date(date);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const day = start(d);
  const today = start(now);
  const yesterday = today - 86_400_000;
  if (day === today) return "today";
  if (day === yesterday) return "yesterday";
  // Within the last week → use weekday name
  if (today - day < 7 * 86_400_000) {
    return d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  }
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  // Pre-compute which messages start a new day so we can render a sticky
  // day separator above them. Keeps the JSX clean.
  const items: Array<{ msg: ChatMessage; daySep: string | null }> = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const label = dayLabel(m.created_at);
    const daySep = label && label !== lastDay ? label : null;
    if (daySep) lastDay = label;
    items.push({ msg: m, daySep });
  }

  return (
    <div className="flex flex-col gap-6">
      {items.map(({ msg, daySep }, i) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col gap-4"
        >
          {daySep && (
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--hairline-strong)]" />
              <span
                className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground"
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
              >
                {daySep}
              </span>
              <span className="h-px flex-1 bg-[var(--hairline-strong)]" />
            </div>
          )}
          <MessageBubble message={msg} isLast={i === items.length - 1} />
        </motion.div>
      ))}
    </div>
  );
}
