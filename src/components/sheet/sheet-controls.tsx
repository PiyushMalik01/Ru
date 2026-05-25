"use client";

// Sheet controls — the lens row.
//
// Visual idiom DELIBERATELY different from the sub-nav above it:
//   - Kind filter: small COLORED pills (entity-color when active) — looks
//     like a row of stamped tickets, not text links.
//   - View switcher: a single segmented capsule — looks like an iOS-style
//     segmented control, not a row of links.
//
// The previous version used the same lowercase mono underline-on-active
// treatment as the sub-nav, which is why the two felt redundant.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Table2, Calendar, GanttChart } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all",       label: "all",       color: null,                        fg: null },
  { key: "tasks",     label: "tasks",     color: "var(--entity-task)",        fg: "var(--entity-task-fg)" },
  { key: "routines",  label: "routines",  color: "var(--entity-routine)",     fg: "var(--entity-routine-fg)" },
  { key: "reminders", label: "reminders", color: "var(--entity-reminder)",    fg: "var(--entity-reminder-fg)" },
  { key: "logs",      label: "logs",      color: "var(--entity-activity)",    fg: "var(--entity-activity-fg)" },
] as const;
export type SheetFilter = (typeof FILTERS)[number]["key"];

const VIEWS = [
  { key: "table",    label: "list",     icon: Table2 },
  { key: "calendar", label: "calendar", icon: Calendar },
  { key: "timeline", label: "timeline", icon: GanttChart },
] as const;
export type SheetView = (typeof VIEWS)[number]["key"];

function viewHref(
  pathname: string,
  params: URLSearchParams,
  nextView: SheetView,
): string {
  const out = new URLSearchParams(params);
  if (nextView === "table") out.delete("view");
  else out.set("view", nextView);
  if (nextView !== "table") {
    out.delete("sort");
    out.delete("dir");
    out.delete("status");
  }
  const s = out.toString();
  return `${pathname}${s ? `?${s}` : ""}`;
}

function filterHref(
  pathname: string,
  params: URLSearchParams,
  nextFilter: SheetFilter,
): string {
  const out = new URLSearchParams(params);
  if (nextFilter === "all") out.delete("filter");
  else out.set("filter", nextFilter);
  if (nextFilter !== "all" && nextFilter !== "tasks") {
    out.delete("status");
  }
  const s = out.toString();
  return `${pathname}${s ? `?${s}` : ""}`;
}

interface Props {
  totalCount: number;
  activeFilter: SheetFilter;
  activeView: SheetView;
}

export function SheetControls({ activeFilter, activeView }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
      {/* KIND FILTER — colored pills. Inactive = ghost, active = entity bg.
          The visual contrast with the text-link sub-nav above is the whole
          point: same word ("tasks") but a totally different control shape. */}
      <div
        role="group"
        aria-label="Filter by kind"
        className="flex flex-wrap items-center gap-1.5"
      >
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter;
          return (
            <Link
              key={f.key}
              href={filterHref(pathname, params, f.key)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "inline-flex h-7 items-center rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-[background-color,color,transform] duration-150",
                "hover:-translate-y-[0.5px]",
                isActive
                  ? "shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/6 ring-1 ring-inset ring-[var(--hairline)]",
              )}
              style={{
                fontVariationSettings: "'wght' 580, 'wdth' 100",
                ...(isActive
                  ? {
                      background: f.color ?? "var(--foreground)",
                      color: f.fg ?? "var(--background)",
                    }
                  : {}),
              }}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* VIEW SWITCHER — a single segmented capsule. */}
      <div
        role="tablist"
        aria-label="View"
        className="inline-flex items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-[var(--card)] p-0.5"
      >
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const isActive = v.key === activeView;
          return (
            <Link
              key={v.key}
              href={viewHref(pathname, params, v.key)}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors",
                isActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
            >
              <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              <span className="hidden sm:inline">{v.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
