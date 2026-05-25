"use client";

// Sheet controls — now just the view switcher.
//
// Kind chips have been removed: the unified sheet groups by time bucket
// and the entity strip on each row gives kind at a glance. Filtering by
// kind without leaving /sheet would re-introduce the redundancy with the
// sub-nav above.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Calendar, GanttChart, List } from "lucide-react";
import { cn } from "@/lib/utils";

// SheetFilter is still re-exported for downstream code paths (legacy URL
// params). It's a no-op on the redesigned table view.
export type SheetFilter = "all" | "tasks" | "routines" | "logs" | "reminders";

const VIEWS = [
  { key: "table",    label: "list",     icon: List },
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
  out.delete("filter");
  const s = out.toString();
  return `${pathname}${s ? `?${s}` : ""}`;
}

interface Props {
  totalCount: number;
  activeFilter: SheetFilter;
  activeView: SheetView;
}

export function SheetControls({ activeView }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
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
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.16em] transition-colors",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
          >
            <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">{v.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
