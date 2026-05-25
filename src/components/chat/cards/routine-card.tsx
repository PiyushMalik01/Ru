"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNowTick,
  timeOfDayHasPassedToday,
} from "@/lib/hooks/use-now-tick";
import {
  completeRoutineInline,
  skipRoutineInline,
} from "@/app/(app)/chat/card-actions";
import {
  CardActions,
  CardLabel,
  CardMeta,
  PrimaryAction,
  SecondaryAction,
  ActionError,
  StaleMark,
} from "./task-card";

export interface RoutineCardData {
  id: string;
  title: string;
  frequency?: string;
  time_of_day?: string | null;
  streak?: number;
  /** Card-event variants: "done" / "skipped_today" / undefined (just a declaration). */
  status?: "done" | "skipped_today" | string;
}

/**
 * Normalize a `time_of_day` value into a friendly display string.
 * Handles Postgres TIME ("07:00:00"), HH:MM ("07:00"), and already-
 * formatted strings ("7am", "7:00 AM") — returns the input untouched
 * when it doesn't parse as a time.
 */
function formatTimeOfDay(t?: string | null): string {
  if (!t) return "";
  // HH:MM[:SS] from Postgres TIME column — convert to 12h with AM/PM.
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return t;
  let hours = Number(m[1]);
  const minutes = m[2];
  if (Number.isNaN(hours)) return t;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return minutes === "00" ? `${hours} ${ampm}` : `${hours}:${minutes} ${ampm}`;
}

// Full lime tile, black type. Streak as the hero number in Fraunces.
export function RoutineCard({ data }: { data: RoutineCardData }) {
  const [today, setToday] = useState<"done" | "skipped" | "none">(
    data.status === "done"
      ? "done"
      : data.status === "skipped_today"
        ? "skipped"
        : "none",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useNowTick();

  const streak = Math.max(0, data.streak ?? 0);
  const weekFilled = streak % 7 === 0 && streak > 0 ? 7 : streak % 7;

  // Missed window: a scheduled time has passed today AND the user hasn't
  // logged anything (done or skip) for it yet. The action buttons stay
  // primary so the user can mark it done late or skip without re-typing.
  const missedWindow =
    today === "none" &&
    timeOfDayHasPassedToday(data.time_of_day ?? null);
  const friendlyTime = formatTimeOfDay(data.time_of_day);

  function doDone() {
    setError(null);
    startTransition(async () => {
      const res = await completeRoutineInline(data.id);
      if (res.ok) {
        setToday("done");
        router.refresh();
      } else setError(res.error ?? "Couldn't mark done.");
    });
  }
  function doSkip() {
    setError(null);
    startTransition(async () => {
      const res = await skipRoutineInline(data.id);
      if (res.ok) {
        setToday("skipped");
        router.refresh();
      } else setError(res.error ?? "Couldn't skip.");
    });
  }

  return (
    <div
      className={cn(
        "block w-full overflow-hidden rounded-2xl transition-[filter] duration-300 hover:-translate-y-0.5",
        missedWindow && "saturate-[0.78]",
      )}
      style={{
        background: "var(--entity-routine)",
        color: "var(--entity-routine-fg)",
      }}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-5 pt-4 transition-opacity",
          missedWindow && "opacity-80",
        )}
      >
        <CardLabel>routine</CardLabel>
        {data.frequency && (
          <>
            <span className="opacity-40">·</span>
            <CardMeta>{data.frequency}</CardMeta>
          </>
        )}
        {missedWindow && <StaleMark>missed today</StaleMark>}
        {friendlyTime && (
          <span
            className="ml-auto text-[11px] tabular-nums opacity-85"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {friendlyTime}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex items-end gap-4 px-5 pb-3 pt-2 transition-opacity",
          missedWindow && "opacity-80",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-[44px] leading-none tracking-tight tabular-nums"
              style={{ fontVariationSettings: "'wght' 620, 'opsz' 144" }}
            >
              {streak}
            </span>
            <CardLabel>day streak</CardLabel>
          </div>
          <div
            className={cn(
              "mt-2 truncate text-[15px] leading-tight",
              today === "skipped" && "opacity-70",
            )}
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            {data.title}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => {
            const filled = i < weekFilled;
            return (
              <span
                key={i}
                className={cn(
                  "h-5 w-[3px] rounded-full",
                  filled ? "bg-black" : "bg-black/20",
                )}
              />
            );
          })}
        </div>
      </div>

      <CardActions>
        {today === "none" && (
          <>
            <PrimaryAction onClick={doDone} pending={pending}>
              <Check className="h-3 w-3" strokeWidth={3} />
              done today
            </PrimaryAction>
            <SecondaryAction onClick={doSkip} pending={pending}>
              <X className="h-3 w-3" strokeWidth={2.5} />
              skip today
            </SecondaryAction>
          </>
        )}
        {today === "done" && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-black/85 px-3 py-1.5 text-[11.5px] text-white"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
            done · streak {streak + 1}
          </span>
        )}
        {today === "skipped" && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-black/12 px-3 py-1.5 text-[11.5px]"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 96" }}
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
            skipped today
          </span>
        )}
      </CardActions>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}
