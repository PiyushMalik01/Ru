"use client";

// SheetRow — modeled on the Flutter `_TaskRow` / `_ReminderRow` layout:
//
//   ▎  ○  •  Prepare for Science exam              WED 1:30PM
//            high  · overdue
//
// Each row sits inside a SectionHead-grouped list, so the chrome can be
// quieter — just a bottom hairline rule, a 3px entity strip, the toggle,
// a priority dot, and the title with chips. Reminder rows get an inline
// snooze quick-pick row beneath the title, matching the Flutter design.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
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
  duplicateCount?: number;
}

interface Props {
  row: SheetRowData;
  nowMs: number;
  highlightToday?: boolean;
}

export function SheetRow({ row, nowMs, highlightToday }: Props) {
  const router = useRouter();
  const [done, setDone] = useState(
    row.status === "completed" || row.todayCompleted === true,
  );
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  function refresh() {
    try { router.refresh(); } catch { /* noop in tests */ }
  }

  function toggleDone() {
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

  const overdue =
    !done &&
    row.kind === "task" &&
    !!row.whenIso &&
    new Date(row.whenIso).getTime() < nowMs;
  const missed = row.status === "missed" && !done;
  const stale = overdue || missed;
  const muted = done || dismissed;

  const due = formatDueShort(row.whenIso, nowMs);
  const entityColor =
    ENTITY_COLOR_VAR[row.kind as keyof typeof ENTITY_COLOR_VAR] ?? "transparent";
  const isReminder = row.kind === "reminder";
  const isActivity = row.kind === "activity";

  return (
    <div
      className={cn(
        "group relative border-b border-[var(--hairline-soft)] last:border-b-0",
        "transition-colors duration-200",
        "hover:bg-[var(--tint-hover)]",
        highlightToday && !muted && "bg-[color-mix(in_srgb,var(--entity-task)_4%,transparent)]",
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        {/* Entity strip */}
        <span
          aria-hidden
          className="mt-1 inline-block shrink-0 rounded-[2px]"
          style={{
            width: 3,
            height: 32,
            background: muted ? "transparent" : entityColor,
          }}
        />

        {/* Toggle (radio-circle) — inert for non-toggleable kinds */}
        {row.isToggleable ? (
          <button
            type="button"
            onClick={toggleDone}
            disabled={pending}
            aria-label={done ? "Mark not done" : "Mark done"}
            className={cn(
              "mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
              done
                ? "border-success bg-success text-white"
                : "border-foreground/40 hover:border-foreground/70",
              pending && "opacity-50",
            )}
          >
            {done && (
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d="M5 10.5l3.5 3.5L15 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        ) : (
          <span
            aria-hidden
            className={cn(
              "mt-[3px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              isReminder && "border border-[var(--entity-reminder)]/45",
              isActivity && "border border-[var(--entity-activity)]/45",
            )}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: entityColor }}
            />
          </span>
        )}

        {/* Main column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "min-w-0 flex-1 text-[15px] leading-snug tracking-[-0.005em] text-foreground",
                muted && "text-muted-foreground line-through",
              )}
              style={{ fontVariationSettings: "'wght' 540, 'wdth' 96" }}
            >
              {row.title}
              {row.duplicateCount && row.duplicateCount > 1 && (
                <span
                  className="ml-2 inline-flex items-center rounded-full bg-foreground/8 px-1.5 py-[1px] font-mono text-[10px] tabular-nums text-muted-foreground align-middle"
                  title={`${row.duplicateCount} identical entries grouped`}
                  style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
                >
                  ×{row.duplicateCount}
                </span>
              )}
            </span>

            {/* Right-side due label */}
            {due && (
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums",
                  stale ? "text-[var(--entity-reminder)]" : "text-muted-foreground/85",
                )}
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
              >
                {due}
              </span>
            )}
          </div>

          {/* Chip row — only renders if there's anything to show */}
          {(row.meta || stale || row.planTitle) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.meta && <MetaChip>{row.meta}</MetaChip>}
              {stale && (
                <span
                  className="inline-flex items-center rounded-[3px] px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--entity-reminder)]"
                  style={{ fontVariationSettings: "'wght' 700, 'wdth' 100" }}
                >
                  {missed ? "missed" : "overdue"}
                </span>
              )}
              {row.planTitle && row.planId && (
                <Link
                  href={`/plans/${row.planId}`}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/85 transition-colors hover:text-foreground"
                  style={{ fontVariationSettings: "'wght' 540, 'wdth' 96" }}
                >
                  <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d="M8.5 11.5L4 11.5a3 3 0 010-6h3M11.5 8.5L16 8.5a3 3 0 010 6h-3M7 8.5h6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {row.planTitle}
                </Link>
              )}
            </div>
          )}

          {/* Reminder snooze quick-picks — the killer mobile detail */}
          {isReminder && !dismissed && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70"
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
              >
                snooze
              </span>
              {SNOOZE_OPTIONS.map((opt) => (
                <SnoozeChip
                  key={opt.label}
                  label={opt.label}
                  pending={pending}
                  onClick={() => snoozeReminder(opt.minutes)}
                />
              ))}
              <button
                type="button"
                onClick={dismissReminder}
                disabled={pending}
                className="ml-1 inline-flex h-6 items-center gap-1 rounded-full bg-foreground px-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-background transition-colors hover:bg-foreground/85 disabled:opacity-50"
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
                title="Dismiss"
              >
                {pending ? "…" : "done"}
              </button>
            </div>
          )}

          {/* Activity undo affordance — quiet, visible on hover */}
          {isActivity && !dismissed && (
            <button
              type="button"
              onClick={undoActivity}
              disabled={pending}
              className="mt-1.5 inline-flex h-6 items-center gap-1 rounded-full bg-foreground/8 px-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-foreground opacity-0 transition-opacity hover:bg-foreground/15 group-hover:opacity-100 group-focus-within:opacity-100"
              style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
            >
              {pending ? "…" : "undo log"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-[3px] bg-foreground/6 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
      style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
    >
      {children}
    </span>
  );
}

function SnoozeChip({
  label,
  onClick,
  pending,
}: {
  label: string;
  onClick: () => void;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex h-6 items-center rounded-full bg-foreground/6 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground transition-colors hover:bg-foreground/12 disabled:opacity-50"
      style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
    >
      {label}
    </button>
  );
}

const SNOOZE_OPTIONS = [
  { label: "15m", minutes: 15 },
  { label: "1h",  minutes: 60 },
  { label: "3h",  minutes: 180 },
  { label: "1d",  minutes: 60 * 24 },
  { label: "1w",  minutes: 60 * 24 * 7 },
] as const;

/**
 * "TODAY · 1:30PM" / "TOMORROW · 9AM" / "IN 3D" / "2D AGO" / "MAR 12"
 * — uppercase mono shape borrowed directly from the Flutter task row.
 */
function formatDueShort(iso: string | null, nowMs: number): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const minute = d.getMinutes() === 0 ? "" : `:${d.getMinutes().toString().padStart(2, "0")}`;
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const time = `${hour12}${minute}${ampm}`;
  const hasTime = !(d.getHours() === 0 && d.getMinutes() === 0);

  if (dayDiff === 0) return hasTime ? `TODAY · ${time}` : "TODAY";
  if (dayDiff === 1) return hasTime ? `TOMORROW · ${time}` : "TOMORROW";
  if (dayDiff === -1) return hasTime ? `YESTERDAY · ${time}` : "YESTERDAY";
  if (dayDiff > 1 && dayDiff <= 7) return `IN ${dayDiff}D`;
  if (dayDiff < -1 && dayDiff >= -7) return `${Math.abs(dayDiff)}D AGO`;
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function SheetRowSkeleton() {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--hairline-soft)] px-4 py-3.5">
      <span className="mt-1 h-7 w-[3px] animate-pulse rounded-[2px] bg-foreground/8" />
      <span className="mt-[3px] h-5 w-5 animate-pulse rounded-full border border-foreground/10" />
      <div className="flex-1 space-y-2">
        <span className="block h-3.5 w-3/4 animate-pulse rounded bg-foreground/5" />
        <span className="block h-2.5 w-1/3 animate-pulse rounded bg-foreground/5" />
      </div>
    </div>
  );
}
