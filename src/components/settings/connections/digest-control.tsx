"use client";

// Daily digest control — single toggle + hour select. The hour select is
// always enabled; flipping the toggle off doesn't reset the hour, so the
// user's preferred time persists across on/off cycles.

import * as React from "react";
import { Toggle } from "./toggle";
import { setDigest } from "@/app/(app)/settings/connections/actions";
import { cn } from "@/lib/utils";

interface Props {
  enabled: boolean;
  hour: number;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  return `${h.toString().padStart(2, "0")}:00`;
}

export function DigestControl({ enabled, hour }: Props) {
  const [on, setOn] = React.useState(enabled);
  const [h, setHour] = React.useState(hour);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const commit = (nextOn: boolean, nextHour: number) => {
    const prevOn = on;
    const prevHour = h;
    setOn(nextOn);
    setHour(nextHour);
    setError(null);
    startTransition(async () => {
      try {
        await setDigest(nextOn, nextHour);
      } catch {
        setOn(prevOn);
        setHour(prevHour);
        setError("couldn't save");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--hairline-soft)] px-3.5 py-2.5">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground"
            style={{ fontVariationSettings: "'wght' 600" }}
          >
            digest
          </span>
          <Toggle checked={on} onChange={(next) => commit(next, h)} label="daily digest" />
        </div>
        <label className="inline-flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">at</span>
          <select
            value={String(h)}
            onChange={(ev) => commit(on, Number(ev.target.value))}
            className={cn(
              "h-9 rounded-full border border-[var(--hairline)] bg-[var(--card)] px-3.5",
              "font-mono text-[12.5px] tabular-nums text-foreground",
              "transition-colors hover:border-[var(--entity-task)] focus:outline-none focus:border-[var(--entity-task)]",
            )}
          >
            {HOURS.map((opt) => (
              <option key={opt} value={opt}>
                {formatHour(opt)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[12.5px] text-muted-foreground" style={{ fontVariationSettings: "'wght' 460" }}>
        a single morning email with what's due, who you owe a follow-up, and what's been pulled from your inbox.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--error, #a3341a)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
