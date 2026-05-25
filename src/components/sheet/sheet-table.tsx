"use client";

// Sheet "table" — actually a vertical stack of standalone cards now.
// Header is a single calm row with the sort affordance.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SheetRow, type SheetRowData } from "./sheet-row";

export type SortKey = "title" | "due_at" | "status";
export type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  due_at: "due / when",
  title: "title",
  status: "status",
};

function setParam(params: URLSearchParams, key: string, value: string | null): string {
  const out = new URLSearchParams(params);
  if (value === null) out.delete(key);
  else out.set(key, value);
  const s = out.toString();
  return s ? `?${s}` : "";
}

function nextDirHref(
  pathname: string,
  params: URLSearchParams,
  current: { key: SortKey; dir: SortDir },
): string {
  const out = new URLSearchParams(params);
  out.set("sort", current.key);
  if (current.dir === "asc") out.set("dir", "desc");
  else out.delete("dir");
  const s = out.toString();
  return `${pathname}${s ? `?${s}` : ""}`;
}

interface Props {
  rows: SheetRowData[];
  nowMs: number;
  sort: { key: SortKey; dir: SortDir };
}

export function SheetTable({ rows, nowMs, sort }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const dirArrow = sort.dir === "asc" ? "↑" : "↓";

  return (
    <div className="flex flex-col gap-2">
      {/* Sort affordance — discreet, single line */}
      <div className="flex items-center justify-between gap-3 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
        <div className="flex items-center gap-2">
          <span className="opacity-60">sort</span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k, i) => {
            const isActive = sort.key === k;
            return (
              <span key={k} className="flex items-center gap-2">
                {i > 0 && <span className="opacity-30">·</span>}
                <Link
                  href={`${pathname}${setParam(params, "sort", k === "due_at" ? null : k)}`}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "transition-colors hover:text-foreground",
                    isActive && "text-foreground",
                  )}
                  style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                >
                  {SORT_LABELS[k]}
                </Link>
              </span>
            );
          })}
          <Link
            href={nextDirHref(pathname, params, sort)}
            aria-label={`Reverse sort direction (currently ${sort.dir})`}
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-foreground/10"
          >
            {dirArrow}
          </Link>
        </div>
      </div>

      {/* The card stack */}
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <SheetRow key={`${r.kind}-${r.id}`} row={r} nowMs={nowMs} />
        ))}
      </div>
    </div>
  );
}
