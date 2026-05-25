"use client";

// SheetRow — a true mini-card per item. Borrowed from the chat-card
// language but tuned for list density: light card background, strong
// entity-color stripe on the left, mono labels, action chips.
//
// Layout (one card):
//
//   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
//   ┃▎▎  Prepare for Science exam        WED 1:30 PM  [done] ┃
//   ┃▎▎  TASK · HIGH · OVERDUE                                ┃
//   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
//
// Rules:
// - Each card is a standalone rounded-2xl block; cards never share a
//   border. A small gap between them gives the list rhythm.
// - The leading "stripe" is 5px of entity color. It runs the full card
//   height so the eye locks onto a kind at a glance.
// - Time/due is rendered in Fraunces tabular numerals when present — the
//   single typographic moment that ties a row to the chat-card style.
// - Inline actions ALWAYS visible on touch; hover-only on md+.
// - Non-toggleable kinds render an inert glyph (not a disabled button).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Clock, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  KindGlyph,
  formatWhen,
  statusMeta,
  ENTITY_COLOR_VAR,
  type ItemKind,
  type ItemStatus,
} from "@/components/app-shell/primitives";
import { toggleTaskComplete } from "@/app/(app)/tasks/actions";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";
import {
  dismissReminderInline,
  snoozeReminderInline,
  deleteActivityInline,
} from "@/app/(app)/chat/card-actions";

export interface SheetRowData {
  index: number;
  kind: ItemKind;
  id: string;
  title: string;
  status: ItemStatus;
  whenIso: string | null;
  planId: string | null;
  planTitle: string | null;
  meta: string | null;
  isToggleable: boolean;
  todayCompleted?: boolean;
  /** When > 1, this row represents a visual group of identical entries. */
  duplicateCount?: number;
}

interface Props {
  row: SheetRowData;
  nowMs: number;
}

export function SheetRow({ row, nowMs }: Props) {
  const router = useRouter();
  const [done, setDone] = useState(
    row.status === "completed" || row.todayCompleted === true,
  );
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  function refresh() {
    try { router.refresh(); } catch { /* noop in tests */ }
  }

  function toggleTaskOrRoutine() {
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
      else refresh();
    });
  }

  function dismissReminder() {
    setDismissed(true);
    startTransition(async () => {
      const r = await dismissReminderInline(row.id);
      if (!r.ok) setDismissed(false);
      else refresh();
    });
  }

  function snoozeReminder(minutes: number) {
    startTransition(async () => {
      const r = await snoozeReminderInline(row.id, minutes);
      if (r.ok) refresh();
    });
  }

  function undoActivity() {
    setDismissed(true);
    startTransition(async () => {
      const r = await deleteActivityInline(row.id);
      if (!r.ok) setDismissed(false);
      else refresh();
    });
  }

  const when = formatWhen(row.whenIso, nowMs);
  const effectiveStatus: ItemStatus = done
    ? "completed"
    : row.status === "completed"
      ? "pending"
      : row.status;

  const stale =
    (effectiveStatus === "missed" ||
      (row.kind === "task" &&
        !done &&
        !!row.whenIso &&
        new Date(row.whenIso).getTime() < nowMs)) &&
    !dismissed;

  const muted = done || dismissed;
  const entityColor =
    ENTITY_COLOR_VAR[row.kind as keyof typeof ENTITY_COLOR_VAR] ?? "transparent";

  return (
    <article
      className={cn(
        "group relative flex items-stretch overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--card)]",
        "transition-[transform,box-shadow,opacity,filter] duration-200",
        "hover:-translate-y-[1px] hover:border-[var(--hairline-strong)] hover:shadow-[0_4px_14px_-6px_rgba(0,0,0,0.12)]",
        stale && "saturate-[0.85]",
        muted && "opacity-65",
      )}
    >
      {/* Entity stripe — 5px ribbon spanning full card height. The whole
          eye-grab for "what kind is this". */}
      <div
        aria-hidden
        className="shrink-0"
        style={{ width: 5, background: entityColor }}
      />

      <div className="flex flex-1 items-start gap-3 px-4 py-3 sm:py-3.5">
        {/* Leading glyph — inert for non-toggleable kinds. */}
        <div className="flex shrink-0 items-center pt-[3px]">
          {row.isToggleable ? (
            <button
              type="button"
              onClick={toggleTaskOrRoutine}
              disabled={pending}
              aria-label={done ? "Mark not done" : "Mark done"}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full",
                "transition-colors hover:bg-foreground/8",
                pending && "opacity-50",
              )}
            >
              {done ? (
                <span className="font-mono text-[15px] leading-none text-success">
                  ☑
                </span>
              ) : (
                <KindGlyph kind={row.kind} done={false} />
              )}
            </button>
          ) : (
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center"
            >
              <KindGlyph kind={row.kind} done={false} />
            </span>
          )}
        </div>

        {/* Main column — title + mono meta line. */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[15px] leading-snug tracking-[-0.005em]",
                muted && "line-through",
              )}
              style={{ fontVariationSettings: "'wght' 560, 'wdth' 96" }}
            >
              {row.title}
            </span>
            {row.duplicateCount && row.duplicateCount > 1 && (
              <span
                className="shrink-0 rounded-full bg-foreground/8 px-1.5 py-[1px] font-mono text-[10px] tabular-nums text-muted-foreground"
                title={`${row.duplicateCount} identical entries grouped`}
                style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
              >
                ×{row.duplicateCount}
              </span>
            )}
            {/* When — Fraunces tabular numerals on the right of the title
                line. Single typographic moment per card. */}
            {when && (
              <span
                className={cn(
                  "hidden shrink-0 font-display text-[12px] tabular-nums sm:inline-block",
                  stale ? "text-foreground/85" : "text-muted-foreground/85",
                )}
                style={{
                  fontVariationSettings: "'wght' 560, 'opsz' 24",
                  letterSpacing: "-0.01em",
                }}
              >
                {when}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85">
            <span style={{ color: entityColorTint(entityColor) }}>
              {row.kind}
            </span>
            <Sep />
            <span className={cn(stale && "text-foreground/85")}>
              {statusMeta(effectiveStatus)?.label ?? effectiveStatus}
            </span>
            {row.meta && (
              <>
                <Sep />
                <span>{row.meta}</span>
              </>
            )}
            {/* On mobile the when is shown here instead (no room on title row). */}
            {when && (
              <span className="inline-flex items-center gap-2 sm:hidden">
                <Sep />
                <span className={cn("tabular-nums", stale && "text-foreground/85")}>
                  {when}
                </span>
              </span>
            )}
            {row.planTitle && row.planId && (
              <>
                <Sep />
                <Link
                  href={`/plans/${row.planId}`}
                  className="ru-link normal-case tracking-normal hover:text-foreground"
                >
                  {row.planTitle}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Inline actions */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 self-center",
            "opacity-100 transition-opacity",
            "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
          )}
        >
          {row.kind === "reminder" && !dismissed && (
            <>
              <ActionChip onClick={() => snoozeReminder(60)} pending={pending} title="Snooze 1h">
                <Clock className="h-3 w-3" strokeWidth={2.5} />
                <span className="hidden sm:inline">+1h</span>
              </ActionChip>
              <ActionChip primary onClick={dismissReminder} pending={pending} title="Dismiss">
                <Check className="h-3 w-3" strokeWidth={3} />
                <span className="hidden sm:inline">done</span>
              </ActionChip>
            </>
          )}
          {row.kind === "activity" && !dismissed && (
            <ActionChip onClick={undoActivity} pending={pending} title="Undo log">
              <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
              <span className="hidden sm:inline">undo</span>
            </ActionChip>
          )}
          {row.planId && (
            <Link
              href={`/plans/${row.planId}`}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
              aria-label="Open plan"
            >
              <span className="hidden sm:inline">open</span>
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
            </Link>
          )}
          {dismissed && (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              done
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Sep() {
  return <span aria-hidden className="opacity-40">·</span>;
}

/**
 * Use the entity color directly for the kind label in the meta row so the
 * row's identity reinforces itself in two places: the stripe AND the word.
 * Kept subtle — we don't paint the whole row.
 */
function entityColorTint(cssVar: string): string {
  // The label sits on a card background; the entity colors are all
  // saturated enough to read at full opacity in tiny mono.
  return cssVar === "transparent" ? "var(--muted-foreground)" : cssVar;
}

function ActionChip({
  children,
  onClick,
  pending,
  primary,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[10.5px] uppercase tracking-[0.14em] transition-colors disabled:opacity-50",
        primary
          ? "bg-foreground text-background hover:bg-foreground/85"
          : "bg-foreground/8 text-foreground hover:bg-foreground/15",
      )}
      style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
    >
      {pending ? "…" : children}
    </button>
  );
}

export function SheetRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3.5">
      <span className="mt-1 h-4 w-4 animate-pulse rounded-full bg-foreground/5" />
      <div className="flex-1 space-y-2">
        <span className="block h-3.5 w-3/4 animate-pulse rounded bg-foreground/5" />
        <span className="block h-2.5 w-1/2 animate-pulse rounded bg-foreground/5" />
      </div>
    </div>
  );
}
