// Four cobalt bento tiles for the /tasks header. Each tile is a real
// link that drives the ?status=... URL filter. The active filter renders
// inverted (cream tile with cobalt foreground) so the current scope is
// always legible in the page header.

import Link from "next/link";
import { cn } from "@/lib/utils";

export type TaskFilter = "all" | "open" | "today" | "overdue" | "completed";

interface TileProps {
  href: string;
  label: string;
  value: number;
  active?: boolean;
  /** When true, an open task tile becomes coral instead of cobalt. */
  alert?: boolean;
  caption?: string;
}

function Tile({ href, label, value, active, alert, caption }: TileProps) {
  // Color decisions:
  //   default: cobalt bg, white fg
  //   alert (overdue): coral bg, dark fg
  //   active: cream bg, foreground type (the selected filter)
  const bg = active
    ? "var(--card)"
    : alert
      ? "var(--entity-reminder)"
      : "var(--entity-task)";
  const fg = active
    ? "var(--card-foreground)"
    : alert
      ? "var(--entity-reminder-fg)"
      : "var(--entity-task-fg)";

  return (
    <Link
      href={href}
      className={cn(
        "ru-bento group block min-h-[124px]",
        active && "ring-2 ring-[var(--entity-task)] ring-offset-2 ring-offset-[var(--background)]",
      )}
      style={{
        ["--bento-bg" as string]: bg,
        ["--bento-fg" as string]: fg,
      }}
    >
      <div className="flex h-full flex-col p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">
          {label}
        </div>
        <div className="mt-auto flex items-baseline gap-1">
          <span
            className="font-display tabular-nums leading-[0.85]"
            style={{ fontSize: "clamp(36px, 4.2vw, 48px)" }}
          >
            {value.toString().padStart(2, "0")}
          </span>
        </div>
        {caption && (
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] opacity-65">
            {caption}
          </div>
        )}
      </div>
    </Link>
  );
}

interface Props {
  open: number;
  today: number;
  overdue: number;
  completedThisWeek: number;
  active: TaskFilter;
}

export function TaskStatBento({
  open,
  today,
  overdue,
  completedThisWeek,
  active,
}: Props) {
  function href(filter: TaskFilter): string {
    return filter === "all" ? "/tasks" : `/tasks?status=${filter}`;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <Tile
        href={href("open")}
        label="open"
        value={open}
        caption="all pending"
        active={active === "open"}
      />
      <Tile
        href={href("today")}
        label="due today"
        value={today}
        caption="on the clock"
        active={active === "today"}
      />
      <Tile
        href={href("overdue")}
        label="overdue"
        value={overdue}
        caption="needs a nudge"
        active={active === "overdue"}
        alert={overdue > 0 && active !== "overdue"}
      />
      <Tile
        href={href("completed")}
        label="settled · 7d"
        value={completedThisWeek}
        caption="done this week"
        active={active === "completed"}
      />
    </div>
  );
}
