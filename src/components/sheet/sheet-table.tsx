"use client";

// Sheet table — header row with sortable columns + the existing flat rows.
//
// Sort state is URL-driven (`?sort=title|due_at|status&dir=asc|desc`) so the
// active state and table order survive reloads and copy-paste. Header cells
// are typographic links, not buttons: the arrow lives in mono next to the
// column name so the table reads as a printed index, not a spreadsheet.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SheetRow, type SheetRowData } from "./sheet-row";

export type SortKey = "title" | "due_at" | "status";
export type SortDir = "asc" | "desc";

const GRID_TEMPLATE =
  "40px 22px minmax(0,1fr) 138px 128px minmax(0,160px) 112px 72px";

function nextSortHref(
  pathname: string,
  params: URLSearchParams,
  key: SortKey,
  current: { key: SortKey; dir: SortDir }
): string {
  const out = new URLSearchParams(params);
  // Clicking the active column toggles direction. Clicking another column
  // resets direction to the column's natural default (asc for title/due,
  // desc for status so "done" doesn't surface first).
  let dir: SortDir;
  if (current.key === key) {
    dir = current.dir === "asc" ? "desc" : "asc";
  } else {
    dir = key === "status" ? "desc" : "asc";
  }
  out.set("sort", key);
  if (dir === "asc") out.delete("dir");
  else out.set("dir", dir);
  const s = out.toString();
  return `${pathname}${s ? `?${s}` : ""}`;
}

function SortHeader({
  label,
  k,
  current,
}: {
  label: string;
  k: SortKey;
  current: { key: SortKey; dir: SortDir };
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const isActive = current.key === k;
  const arrow = isActive ? (current.dir === "asc" ? "↑" : "↓") : "·";

  return (
    <Link
      href={nextSortHref(pathname, params, k, current)}
      className={cn(
        "inline-flex items-center gap-1.5 transition-colors",
        isActive ? "text-foreground" : "hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          isActive ? "opacity-100" : "opacity-30",
        )}
        aria-hidden
      >
        {arrow}
      </span>
    </Link>
  );
}

interface Props {
  rows: SheetRowData[];
  nowMs: number;
  sort: { key: SortKey; dir: SortDir };
}

export function SheetTable({ rows, nowMs, sort }: Props) {
  return (
    <>
      <div
        className="sticky top-12 z-20 grid items-center gap-4 bg-background pl-5 pr-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 border-b border-[var(--hairline)]"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <span className="text-muted-foreground/30">№</span>
        <span />
        <SortHeader label="title" k="title" current={sort} />
        <SortHeader label="status" k="status" current={sort} />
        <SortHeader label="due · when" k="due_at" current={sort} />
        <span>plan</span>
        <span>meta</span>
        <span />
      </div>

      <div>
        {rows.map((r) => (
          <SheetRow key={`${r.kind}-${r.id}`} row={r} nowMs={nowMs} />
        ))}
      </div>
    </>
  );
}
