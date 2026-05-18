"use client";

// A self-updating mono clock that re-ticks each minute and emits the
// current local time as a small mono numeral. Used as the "now" anchor
// on Today's timeline — the moment the user is reading the page.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function formatNow(d: Date): string {
  return d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" ", "");
}

export function NowMarker({ className }: { className?: string }) {
  // Hydrate-safe: render an empty placeholder on the server, fill on mount,
  // then tick every 30s so the clock catches a minute change within ~half a minute.
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    setNow(formatNow(new Date()));
    const id = setInterval(() => setNow(formatNow(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-foreground",
        className,
      )}
    >
      <span className="ru-now-mark inline-block h-1 w-1 rounded-full bg-foreground" aria-hidden />
      <span suppressHydrationWarning>{now ?? "—"}</span>
    </span>
  );
}
