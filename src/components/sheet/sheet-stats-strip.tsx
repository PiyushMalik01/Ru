"use client";

// Stat tiles — 2×2 grid mirrored from the Flutter tasks_screen.
// Each tile flips to a saturated entity color when active (no second hue,
// no ring); inactive empty tiles dim to a creamy card-soft background so
// they stop shouting "00".

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type SheetStatusFilter = "all" | "open" | "today" | "overdue" | "completed";

interface Tile {
  key: Exclude<SheetStatusFilter, "all">;
  label: string;
  bg: string; // active bg
  fg: string; // active fg
}

const TILES: Tile[] = [
  { key: "open",      label: "open",      bg: "var(--entity-task)",     fg: "var(--entity-task-fg)" },
  { key: "today",     label: "today",     bg: "var(--entity-routine)",  fg: "var(--entity-routine-fg)" },
  { key: "overdue",   label: "overdue",   bg: "var(--entity-reminder)", fg: "var(--entity-reminder-fg)" },
  { key: "completed", label: "done · 7d", bg: "var(--entity-insight)",  fg: "var(--entity-insight-fg)" },
];

interface Props {
  counts: { open: number; dueToday: number; completedWeek: number; overdue: number };
  active: SheetStatusFilter;
}

function statusHref(
  params: URLSearchParams,
  next: Exclude<SheetStatusFilter, "all">,
  active: SheetStatusFilter,
): string {
  const out = new URLSearchParams(params);
  if (active === next) out.delete("status");
  else {
    out.set("status", next);
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
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
      {TILES.map((t) => {
        const value = countFor(t.key, counts);
        const isActive = active === t.key;
        const isEmpty = value === 0;

        return (
          <Link
            key={t.key}
            href={`${pathname}${statusHref(params, t.key, active)}`}
            aria-pressed={isActive}
            aria-label={`Filter: ${t.label}, ${value}`}
            className={cn(
              "ru-bento group relative block min-h-[108px]",
              "transition-[transform,opacity,box-shadow] duration-200",
              "hover:-translate-y-px",
              isEmpty && !isActive && "opacity-80",
            )}
            style={{
              background: isActive
                ? t.bg
                : isEmpty
                  ? "var(--card)"
                  : "var(--card)",
              color: isActive ? t.fg : "var(--foreground)",
              borderRadius: 24,
              boxShadow: isActive
                ? "0 4px 18px -8px rgba(0,0,0,0.18)"
                : "inset 0 0 0 1px var(--hairline)",
            }}
          >
            <div className="flex h-full flex-col justify-between p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.22em]",
                    isActive ? "opacity-85" : "text-muted-foreground",
                  )}
                  style={{ fontVariationSettings: "'wght' 640, 'wdth' 100" }}
                >
                  {t.label}
                </span>
                {isActive && (
                  <span
                    aria-hidden
                    className="font-mono text-[9.5px] uppercase tracking-[0.18em] opacity-75"
                    style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                  >
                    × clear
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "font-display leading-[0.9] tracking-[-0.025em] tabular-nums",
                  isEmpty && !isActive && "text-muted-foreground/60",
                )}
                style={{
                  fontSize: "clamp(44px, 6.2vw, 64px)",
                  fontVariationSettings: "'wght' 580, 'opsz' 144",
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
