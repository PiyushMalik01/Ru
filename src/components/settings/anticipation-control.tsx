"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type AnticipationLevel = Database["public"]["Enums"]["anticipation_level_type"];

const LEVELS: Array<{
  value: AnticipationLevel;
  label: string;
  description: string;
}> = [
  { value: "off",       label: "Off",       description: "Ru never speaks first." },
  { value: "minimal",   label: "Minimal",   description: "Only when something's urgent." },
  { value: "balanced",  label: "Balanced",  description: "Routine reminders and important nudges." },
  { value: "proactive", label: "Proactive", description: "Pattern observations and gentle suggestions." },
];

const TYPE_LABELS: Record<string, string> = {
  routine_adherence: "routine reminders",
  task_urgency:      "task urgency nudges",
  routine_candidate: "new routine suggestions",
  promise_followup:  "follow-up reminders",
  cross_thread:      "cross-thread observations",
};

export function AnticipationControl({
  userId,
  initialLevel,
}: {
  userId: string;
  initialLevel: AnticipationLevel;
}) {
  const [level, setLevel] = useState<AnticipationLevel>(initialLevel);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [suppression, setSuppression] = useState<{ type: string; count: number } | null>(null);

  // Fetch dismissal stats from the last 7 days, browser-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: queryError } = await supabase
        .from("suggestion_actions")
        .select("action, suggestion:suggestions(type)")
        .eq("user_id", userId)
        .eq("action", "dismissed")
        .gte("created_at", since);
      if (cancelled || queryError || !data) return;
      const counts = new Map<string, number>();
      for (const row of data as Array<{ suggestion: { type: string } | null }>) {
        const t = row.suggestion?.type;
        if (!t) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      // Pick the type with the highest count, if any has >= 2
      let top: { type: string; count: number } | null = null;
      for (const [type, count] of counts) {
        if (count >= 2 && (!top || count > top.count)) {
          top = { type, count };
        }
      }
      if (!cancelled) setSuppression(top);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function selectLevel(next: AnticipationLevel) {
    if (next === level) return;
    const previous = level;
    setLevel(next); // optimistic
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ anticipation_level: next })
        .eq("id", userId);
      if (updateError) {
        setLevel(previous);
        setError("Couldn't save — try again.");
        return;
      }
      setSavedAt(Date.now());
    });
  }

  // Auto-dismiss the "saved" affirmation
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 1000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const currentDescription = LEVELS.find((l) => l.value === level)?.description;

  return (
    <section className="space-y-5">
      <div className="max-w-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          anticipation
        </div>
        <h2 className="mt-3 font-display text-[26px] leading-[1.1] tracking-tight sm:text-[30px]">
          What Ru notices for you.
        </h2>
        <p
          className="mt-2 text-[14.5px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          How often Ru should reach out without being asked.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Anticipation level"
        className="inline-flex flex-wrap items-stretch gap-1 rounded-full p-1"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
      >
        {LEVELS.map((opt) => {
          const selected = opt.value === level;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={selected}
              onClick={() => selectLevel(opt.value)}
              className="rounded-full px-5 py-2 text-[13.5px] transition-colors"
              style={{
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--foreground)" : "var(--muted-foreground)",
                fontWeight: selected ? 500 : 400,
                border: selected ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[20px] items-center gap-3">
        <p className="text-[14px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          {currentDescription}
        </p>
        {savedAt && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--foreground)", opacity: 0.7 }}
          >
            saved
          </span>
        )}
        {error && (
          <span className="text-[12.5px]" style={{ color: "#a3341a" }}>
            {error}
          </span>
        )}
      </div>

      {suppression && (
        <p
          className="max-w-xl text-[13px] italic"
          style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-serif)", lineHeight: 1.55 }}
        >
          Ru is being quieter about {TYPE_LABELS[suppression.type] ?? suppression.type.replace(/_/g, " ")} (dismissed {suppression.count}× in the last week).
        </p>
      )}
    </section>
  );
}
