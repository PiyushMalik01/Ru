"use client";

// One row of the unified Sheet table.
//
// Visual rules:
// - Marginalia row number in the left gutter (small mono numerals, like footnotes).
// - Custom typographic glyph for type/status — never a Lucide icon here.
// - 48px row height, generous left padding, hover tint white/3, no zebra.
// - Title in Geist Sans 14.5px; all other data in Geist Mono.

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  KindGlyph,
  StatusBadge,
  formatWhen,
  ENTITY_COLOR_VAR,
  type ItemKind,
  type ItemStatus,
} from "@/components/app-shell/primitives";
import { toggleTaskComplete } from "@/app/(app)/tasks/actions";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";

export interface SheetRowData {
  index: number;     // marginalia number
  kind: ItemKind;
  id: string;
  title: string;
  status: ItemStatus;
  whenIso: string | null;  // due_at | remind_at | timestamp
  planId: string | null;
  planTitle: string | null;
  meta: string | null;     // streak / priority / category / etc.
  isToggleable: boolean;   // task or routine
  /** routine-only — is it already marked for today? */
  todayCompleted?: boolean;
}

interface Props {
  row: SheetRowData;
  nowMs: number;
}

export function SheetRow({ row, nowMs }: Props) {
  const [done, setDone] = useState(row.status === "completed" || row.todayCompleted === true);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    if (!row.isToggleable) return;
    setDone((v) => !v);
    startTransition(async () => {
      const r =
        row.kind === "task"
          ? await toggleTaskComplete(row.id)
          : row.kind === "routine"
            ? await toggleRoutineToday(row.id)
            : { ok: true };
      if (!r.ok) setDone((v) => !v);
    });
  }

  const when = formatWhen(row.whenIso, nowMs);
  const effectiveStatus: ItemStatus = done
    ? "completed"
    : row.status === "completed"
      ? "pending"
      : row.status;

  return (
    <div
      className={cn(
        "ru-strip group grid items-center gap-4 pl-5 pr-4 transition-colors",
        "border-b border-[var(--hairline-soft)] hover:bg-[var(--tint-hover)]",
      )}
      style={{
        gridTemplateColumns:
          "40px 22px minmax(0,1fr) 138px 128px minmax(0,160px) 112px 72px",
        minHeight: 48,
        ["--entity-color" as string]: ENTITY_COLOR_VAR[row.kind as keyof typeof ENTITY_COLOR_VAR] ?? "transparent",
      }}
    >
      {/* 1. Marginalia row number — like a footnote mark in a printed page. */}
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/35 select-none">
        {row.index.toString().padStart(3, "0")}
      </span>

      {/* 2. Type glyph */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!row.isToggleable || pending}
        aria-label={
          row.isToggleable ? (done ? "Mark not done" : "Mark done") : row.kind
        }
        className={cn(
          "shrink-0 text-left",
          row.isToggleable && "hover:opacity-100 cursor-pointer",
          !row.isToggleable && "cursor-default",
          pending && "opacity-50",
        )}
      >
        {done ? (
          <span className="font-mono text-[14px] leading-none text-success">☑</span>
        ) : (
          <KindGlyph kind={row.kind} done={done} />
        )}
      </button>

      {/* 3. Title */}
      <span
        className={cn(
          "min-w-0 truncate text-[14.5px] leading-tight",
          done && "text-muted-foreground line-through",
        )}
      >
        {row.title}
      </span>

      {/* 4. Status */}
      <StatusBadge status={effectiveStatus} />

      {/* 5. Due / when */}
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          done ? "text-muted-foreground/40" : "text-muted-foreground",
        )}
      >
        {when ?? <span className="text-muted-foreground/30">—</span>}
      </span>

      {/* 6. Plan */}
      <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
        {row.planId && row.planTitle ? (
          <Link href={`/plans/${row.planId}`} className="ru-link hover:text-foreground">
            {row.planTitle}
          </Link>
        ) : (
          <span className="text-muted-foreground/30">—</span>
        )}
      </span>

      {/* 7. Meta (streak / priority / category) */}
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {row.meta ?? <span className="text-muted-foreground/30">—</span>}
      </span>

      {/* 8. Inline actions — appear on hover, text-only mono links. */}
      <span className="flex items-center justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100">
        {/* "edit" links to plan page when available, else null. v1: only edit-plan affordance for plan-linked rows. */}
        {row.planId ? (
          <Link
            href={`/plans/${row.planId}`}
            className="ru-link font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            open
          </Link>
        ) : null}
      </span>
    </div>
  );
}

export function SheetRowSkeleton() {
  return (
    <div
      className="grid items-center gap-4 px-4"
      style={{
        gridTemplateColumns:
          "44px 22px minmax(0,1fr) 138px 128px minmax(0,160px) 112px 72px",
        minHeight: 48,
      }}
    >
      <span className="h-3 w-6 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-3 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-3/4 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-16 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-12 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-20 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span className="h-3 w-10 animate-pulse bg-[rgba(255,255,255,0.05)]" />
      <span />
    </div>
  );
}
