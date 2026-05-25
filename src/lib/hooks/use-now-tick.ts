"use client";

import { useEffect, useState } from "react";

/**
 * Forces a re-render of the calling component every `intervalMs`. Used by
 * time-aware cards so "overdue" / "missed" treatment turns on as the
 * clock advances without per-second timers or imperative updates.
 *
 * Default 60s — fine for minute-resolution staleness decisions
 * (overdue tasks, missed reminders, routines past their morning slot).
 */
export function useNowTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

/**
 * Parses a routine `time_of_day` string ("7:00 AM", "07:00", "7am", "19:30")
 * into hours+minutes and returns true if that point of today is in the
 * past. Returns false when the string can't be parsed or no time is set —
 * routines without a specific time can't "miss their window."
 */
export function timeOfDayHasPassedToday(t?: string | null): boolean {
  if (!t) return false;
  // Accept HH:MM:SS (Postgres TIME column), HH:MM, "7am", "7:00 AM", "07:30".
  const m = t
    .trim()
    .match(/^(\d{1,2}):?(\d{2})?(?::\d{2})?\s*(am|pm)?\s*$/i);
  if (!m) return false;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? "0");
  const ampm = m[3]?.toLowerCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return false;
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return false;
  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  return now > target;
}
