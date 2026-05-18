"use client";

// Filter chips (URL-driven) + view switcher for the Sheet header.
// Only the "table" view is implemented in v1; the others render a calm
// "Coming next" empty state that looks intentional, not broken.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all",      label: "all" },
  { key: "tasks",    label: "tasks" },
  { key: "routines", label: "routines" },
  { key: "logs",     label: "logs" },
  { key: "reminders",label: "reminders" },
] as const;
export type SheetFilter = (typeof FILTERS)[number]["key"];

const VIEWS = [
  { key: "table",    label: "table" },
  { key: "calendar", label: "calendar" },
  { key: "timeline", label: "timeline" },
] as const;
export type SheetView = (typeof VIEWS)[number]["key"];

function setParam(params: URLSearchParams, key: string, value: string | null): string {
  const next = new URLSearchParams(params);
  if (value === null || value === "all" || value === "table") next.delete(key);
  else next.set(key, value);
  const s = next.toString();
  return s ? `?${s}` : "";
}

export function SheetControls({
  totalCount,
  activeFilter,
  activeView,
}: {
  totalCount: number;
  activeFilter: SheetFilter;
  activeView: SheetView;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3 pb-3 border-b border-[var(--hairline)]">
      {/* Filter chips — text only, lowercase mono. Active gets underline. */}
      <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter;
          return (
            <Link
              key={f.key}
              href={`${pathname}${setParam(params, "filter", f.key)}`}
              className={cn(
                "transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("relative", isActive && "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-foreground")}>
                {f.label}
              </span>
            </Link>
          );
        })}
        <span className="ml-2 text-muted-foreground/40">
          {totalCount.toString().padStart(3, "0")} rows
        </span>
      </div>

      {/* View switcher — same typographic treatment, on the right. */}
      <div className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.14em]">
        {VIEWS.map((v) => {
          const isActive = v.key === activeView;
          return (
            <Link
              key={v.key}
              href={`${pathname}${setParam(params, "view", v.key)}`}
              className={cn(
                "transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("relative", isActive && "after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:bg-foreground")}>
                {v.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
