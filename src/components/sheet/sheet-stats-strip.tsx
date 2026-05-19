"use client";

// Stats strip — 4 bento mini-cards above the Sheet table.
//
// Each tile is a clickable filter: the URL `?status=` param drives both which
// rows render in the table and which tile reads as "active". An active tile
// gets a thicker inset ring so the page reads at a glance: "you are looking
// at <X>". Tiles inherit the bento aesthetic (28px radius, saturated bg,
// Fraunces hero number, mono uppercase label) — see today/bento-card.tsx.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type SheetStatusFilter = "all" | "open" | "today" | "overdue" | "completed";

interface Tile {
  key: Exclude<SheetStatusFilter, "all">;
  label: string;
  bg: string;
  fg: string;
}

// The four tiles, in reading order. Each picks one entity color so the strip
// itself feels like a colour palette, not a row of identical cards.
const TILES: Tile[] = [
  {
    key: "open",
    label: "open tasks",
    bg: "var(--entity-task)",
    fg: "var(--entity-task-fg)",
  },
  {
    key: "today",
    label: "due today",
    bg: "var(--entity-routine)",
    fg: "var(--entity-routine-fg)",
  },
  {
    key: "completed",
    label: "done · 7d",
    bg: "var(--entity-insight)",
    fg: "var(--entity-insight-fg)",
  },
  {
    key: "overdue",
    label: "overdue",
    bg: "var(--entity-reminder)",
    fg: "var(--entity-reminder-fg)",
  },
];

interface Props {
  counts: {
    open: number;
    dueToday: number;
    completedWeek: number;
    overdue: number;
  };
  active: SheetStatusFilter;
}

function setStatusParam(
  params: URLSearchParams,
  next: Exclude<SheetStatusFilter, "all">,
  active: SheetStatusFilter
): string {
  // Click an active tile to clear the filter; click another to switch.
  const out = new URLSearchParams(params);
  if (active === next) {
    out.delete("status");
  } else {
    out.set("status", next);
    // Clearing the kind filter avoids the confusing "tasks/routines + status"
    // combination — status only refers to tasks.
    out.delete("filter");
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

function countFor(key: Tile["key"], c: Props["counts"]): number {
  if (key === "open") return c.open;
  if (key === "today") return c.dueToday;
  if (key === "completed") return c.completedWeek;
  return c.overdue;
}

export function SheetStatsStrip({ counts, active }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {TILES.map((t) => {
        const value = countFor(t.key, counts);
        const isActive = active === t.key;
        return (
          <Link
            key={t.key}
            href={`${pathname}${setStatusParam(params, t.key, active)}`}
            aria-pressed={isActive}
            aria-label={`Filter: ${t.label}, ${value}`}
            className={cn(
              "ru-bento group relative block min-h-[128px]",
              "transition-transform",
            )}
            style={{
              ["--bento-bg" as string]: t.bg,
              ["--bento-fg" as string]: t.fg,
              background: t.bg,
              color: t.fg,
              borderRadius: 28,
              // Active state: an inset ring drawn in the tile's own foreground
              // colour. No external border, no second hue — the chrome stays
              // inside the palette.
              boxShadow: isActive
                ? "inset 0 0 0 2px currentColor, 0 1px 0 var(--hairline-soft)"
                : undefined,
            }}
          >
            <div className="flex h-full flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
                  {t.label}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-70"
                  >
                    ✕ clear
                  </span>
                )}
              </div>
              <div
                className="font-display leading-[0.85] tracking-[-0.03em]"
                style={{ fontSize: "clamp(48px, 6.4vw, 72px)" }}
              >
                {value.toString().padStart(2, "0")}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
