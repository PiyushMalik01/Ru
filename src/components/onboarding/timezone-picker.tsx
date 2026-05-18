"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// IANA timezone list — built from the standard set; pulls live from the runtime
// if the browser supports `Intl.supportedValuesOf`, otherwise falls back to a
// curated short list covering the major regions.
function loadAllZones(): string[] {
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "UTC",
    "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
    "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Moscow",
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Toronto", "America/Mexico_City", "America/Sao_Paulo",
    "Australia/Sydney", "Australia/Perth", "Pacific/Auckland", "Africa/Johannesburg",
  ];
}

function offsetLabel(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
    const parts = fmt.formatToParts(new Date());
    const off = parts.find((p) => p.type === "timeZoneName")?.value;
    return off ?? "";
  } catch {
    return "";
  }
}

export function TimezonePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const all = useMemo(() => loadAllZones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Surface the user's detected zone + a small popular set
      const detected = (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
      })();
      const popular = [detected, "UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Asia/Singapore", "Australia/Sydney"];
      const seen = new Set<string>();
      return popular.filter((tz) => all.includes(tz) && !seen.has(tz) && (seen.add(tz), true));
    }
    return all
      .filter((tz) => tz.toLowerCase().includes(q) || tz.toLowerCase().replace(/_/g, " ").includes(q))
      .slice(0, 24);
  }, [all, query]);

  function pick(tz: string) {
    onChange(tz);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-border bg-transparent px-3 py-2 text-left transition-colors",
          "hover:bg-secondary",
          open && "bg-secondary"
        )}
      >
        <span className="font-mono text-[15px] text-foreground">{value || "Select timezone"}</span>
        <span className="flex items-center gap-2 text-muted-foreground">
          {value && (
            <span className="font-mono text-[11px] uppercase tracking-wide">
              {offsetLabel(value)}
            </span>
          )}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-[320px] overflow-hidden rounded-md border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. Kolkata, London, Sydney"
              className="w-full bg-transparent px-2 py-1 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[13px] text-muted-foreground">
                No matches. Try a city like &ldquo;Kolkata&rdquo;.
              </div>
            ) : (
              filtered.map((tz) => (
                <button
                  key={tz}
                  type="button"
                  onClick={() => pick(tz)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-secondary",
                    tz === value && "bg-secondary"
                  )}
                >
                  <span className="font-mono text-[13px] text-foreground">{tz}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {offsetLabel(tz)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
