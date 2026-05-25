"use client";

// Stats strip — four bento mini-cards above the Sheet table.
//
// Visual rules (post-redesign):
// - Real numerals (no `00` zero-padding — looked like an error code).
// - Tiles with `0` go quiet: muted ink, no saturated bg, so they stop
//   shouting "empty bucket" at you.
// - Active filter: a 4px inset strip in the tile's own foreground color +
//   a tiny inline "× clear" affordance. No second hue.
// - Smaller min-height so the strip earns its place on long lists.

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

const TILES: Tile[] = [
  { key: "open",      label: "open tasks", bg: "var(--entity-task)",     fg: "var(--entity-task-fg)" },
  { key: "today",     label: "due today",  bg: "var(--entity-routine)",  fg: "var(--entity-routine-fg)" },
  { key: "completed", label: "done · 7d",  bg: "var(--entity-insight)",  fg: "var(--entity-insight-fg)" },
  { key: "overdue",   label: "overdue",    bg: "var(--entity-reminder)", fg: "var(--entity-reminder-fg)" },
];

interface Props {
  counts: { open: number; dueToday: number; completedWeek: number; overdue: number };
  active: SheetStatusFilter;
}

function setStatusParam(
  params: URLSearchParams,
  next: Exclude<SheetStatusFilter, "all">,
  active: SheetStatusFilter,
): string {
  const out = new URLSearchParams(params);
  if (active === next) {
    out.delete("status");
  } else {
    out.set("status", next);
    // Status implies tasks — clear conflicting kind filter so the user
    // doesn't land on an empty page they didn't ask for.
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
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {TILES.map((t) => {
        const value = countFor(t.key, counts);
        const isActive = active === t.key;
        const isEmpty = value === 0;

        return (
          <Link
            key={t.key}
            href={`${pathname}${setStatusParam(params, t.key, active)}`}
            aria-pressed={isActive}
            aria-label={`Filter: ${t.label}, ${value}`}
            className={cn(
              "ru-bento group relative block min-h-[104px]",
              "transition-[transform,opacity] duration-200 hover:-translate-y-px",
              isEmpty && !isActive && "opacity-65",
            )}
            style={{
              ["--bento-bg" as string]: isEmpty ? "var(--card)" : t.bg,
              ["--bento-fg" as string]: isEmpty ? "var(--muted-foreground)" : t.fg,
              background: isEmpty ? "var(--card)" : t.bg,
              color: isEmpty ? "var(--muted-foreground)" : t.fg,
              borderRadius: 24,
              boxShadow: isActive
                ? "inset 4px 0 0 0 currentColor, 0 1px 0 var(--hairline-soft)"
                : isEmpty
                  ? "inset 0 0 0 1px var(--hairline)"
                  : undefined,
            }}
          >
            <div className="flex h-full flex-col justify-between p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.18em]",
                    isEmpty ? "opacity-60" : "opacity-80",
                  )}
                  style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                >
                  {t.label}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.18em] opacity-70"
                  >
                    × clear
                  </span>
                )}
              </div>
              <div
                className="font-display leading-[0.9] tracking-[-0.03em] tabular-nums"
                style={{
                  fontSize: "clamp(40px, 5.6vw, 60px)",
                  fontVariationSettings: "'wght' 600, 'opsz' 144",
                }}
              >
                {value}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
