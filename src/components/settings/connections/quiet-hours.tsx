"use client";

// Quiet hours — two hour selects (start / end). Either select set to "off"
// clears both columns server-side. We round-trip through setQuietHours so
// the server enforces the same null-pair semantics regardless of UI state.

import * as React from "react";
import { setQuietHours } from "@/app/(app)/settings/connections/actions";
import { cn } from "@/lib/utils";

interface Props {
  start: number | null;
  end: number | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function QuietHours({ start, end }: Props) {
  const [s, setStart] = React.useState<number | null>(start);
  const [e, setEnd] = React.useState<number | null>(end);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const commit = (nextStart: number | null, nextEnd: number | null) => {
    const prevStart = s;
    const prevEnd = e;
    setStart(nextStart);
    setEnd(nextEnd);
    setError(null);
    startTransition(async () => {
      try {
        // If either side is null, server clears both — mirror that locally.
        if (nextStart === null || nextEnd === null) {
          setStart(null);
          setEnd(null);
          await setQuietHours(null, null);
        } else {
          await setQuietHours(nextStart, nextEnd);
        }
      } catch {
        setStart(prevStart);
        setEnd(prevEnd);
        setError("couldn't save");
      }
    });
  };

  const onChange = (which: "start" | "end") => (event: React.ChangeEvent<HTMLSelectElement>) => {
    const raw = event.target.value;
    const next = raw === "off" ? null : Number(raw);
    if (which === "start") commit(next, next === null ? null : e);
    else commit(next === null ? null : s, next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <HourSelect label="from" value={s} onChange={onChange("start")} />
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">to</span>
        <HourSelect label="until" value={e} onChange={onChange("end")} />
      </div>
      <p className="text-[12.5px] text-muted-foreground" style={{ fontVariationSettings: "'wght' 460" }}>
        ru will hold push and email during this range. in-app still works.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--error, #a3341a)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function HourSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        value={value === null ? "off" : String(value)}
        onChange={onChange}
        className={cn(
          "h-9 rounded-full border border-[var(--hairline)] bg-[var(--card)] px-3.5",
          "font-mono text-[12.5px] tabular-nums text-foreground",
          "transition-colors hover:border-[var(--entity-task)] focus:outline-none focus:border-[var(--entity-task)]",
        )}
      >
        <option value="off">off</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {formatHour(h)}
          </option>
        ))}
      </select>
    </label>
  );
}
