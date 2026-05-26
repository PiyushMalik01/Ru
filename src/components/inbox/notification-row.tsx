"use client";

// NotificationRow — one item in the inbox ledger.
//
// Layout:
//   ▎  •  Title in serif.                       3M AGO
//          short body in muted 14px.            PUSH · EMAIL    [×]
//
// The left strip is the entity-kind color. A small cobalt unread dot sits
// to the right of the strip when read_at is null. Clicking the body
// submits a mark-read form action and navigates to row.url; the trailing
// [×] is its own form so we don't nest forms.
//
// Channels are rendered as compact uppercase mono chips, e.g. "PUSH · EMAIL".

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { markRead, archive } from "@/app/(app)/inbox/actions";

export type NotificationKind =
  | "reminder_due"
  | "task_due_soon"
  | "task_overdue"
  | "routine_missed"
  | "streak_milestone"
  | "plan_deadline"
  | "daily_digest"
  | "suggestion_urgent"
  | "gmail_extracted"
  | "calendar_event_soon"
  | "system";

export interface NotificationRowData {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  url: string | null;
  channels: string[];
  unread: boolean;
  archived: boolean;
  createdAtIso: string;
}

interface Props {
  row: NotificationRowData;
  nowMs: number;
}

// Mapping notification kinds → entity color. These are the strip / accent
// colors. Kinds that don't map to a specific entity fall back to muted.
export const KIND_ACCENT: Record<NotificationKind, string> = {
  reminder_due: "var(--entity-reminder)",
  task_due_soon: "var(--entity-task)",
  task_overdue: "var(--entity-task)",
  routine_missed: "var(--entity-routine)",
  streak_milestone: "var(--muted-foreground)",
  plan_deadline: "var(--entity-plan)",
  daily_digest: "var(--entity-routine)",
  suggestion_urgent: "var(--entity-activity)",
  gmail_extracted: "var(--entity-insight)",
  calendar_event_soon: "var(--entity-plan)",
  system: "var(--muted-foreground)",
};

export function NotificationRow({ row, nowMs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const accent = KIND_ACCENT[row.kind] ?? "var(--muted-foreground)";
  const stamp = formatStampShort(row.createdAtIso, nowMs);

  function handleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    startTransition(async () => {
      if (row.unread) {
        await markRead(row.id);
      }
      if (row.url) {
        router.push(row.url);
      } else {
        router.refresh();
      }
    });
  }

  function handleArchive(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await archive(row.id);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "group relative border-b border-[var(--hairline-soft)] last:border-b-0 transition-colors",
        "hover:bg-[var(--tint-hover)]",
        row.unread && "bg-[color-mix(in_srgb,var(--entity-task)_3%,transparent)]",
        pending && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={handleOpen}
        disabled={pending}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        {/* Entity strip */}
        <span
          aria-hidden
          className="mt-1 inline-block shrink-0 rounded-[2px]"
          style={{ width: 3, height: 32, background: accent }}
        />

        {/* Unread dot (cobalt) — far left, indicates state without color
            relying on the strip alone. */}
        <span
          aria-hidden
          className={cn(
            "mt-[6px] inline-block h-2 w-2 shrink-0 rounded-full",
            row.unread
              ? "bg-[var(--entity-task)]"
              : "bg-transparent",
          )}
        />

        {/* Main column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "min-w-0 flex-1 text-[15px] leading-snug tracking-[-0.005em]",
                row.unread ? "text-foreground" : "text-muted-foreground",
              )}
              style={{
                fontFamily: "var(--font-fraunces), Georgia, serif",
                fontVariationSettings: row.unread
                  ? "'wght' 580, 'opsz' 24"
                  : "'wght' 460, 'opsz' 24",
                letterSpacing: "-0.005em",
              }}
            >
              {row.title}
            </span>

            {stamp && (
              <span
                className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-muted-foreground/85"
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
              >
                {stamp}
              </span>
            )}
          </div>

          {row.body && (
            <p
              className="mt-1 line-clamp-2 text-[14px] leading-[1.45] text-muted-foreground"
              style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
            >
              {row.body}
            </p>
          )}

          {row.channels.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70"
                style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
              >
                {row.channels.map((c) => c.replace("_", " ")).join(" · ")}
              </span>
            </div>
          )}
        </div>

        {/* Dismiss — kept inside the same button visually but as a nested
            element. We render it as a div with role=button so it can capture
            its own click without a nested <button> (invalid HTML). */}
      </button>

      {/* Archive affordance — absolutely positioned so it's outside the
          main click target. Visible on hover / focus-within. */}
      <button
        type="button"
        onClick={handleArchive}
        disabled={pending}
        aria-label="Archive"
        title="Archive"
        className={cn(
          "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full",
          "text-muted-foreground transition-opacity",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          "hover:bg-foreground/8 hover:text-foreground",
          "disabled:opacity-30",
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * "JUST NOW" / "3M AGO" / "TODAY · 9:15AM" / "YESTERDAY" / "MAR 12"
 * — same uppercase mono idiom as the sheet row.
 */
function formatStampShort(iso: string, nowMs: number): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = nowMs - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.round(mins / 60);

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfStamp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfStamp.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
  );

  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const minute = d.getMinutes() === 0 ? "" : `:${d.getMinutes().toString().padStart(2, "0")}`;
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const time = `${hour12}${minute}${ampm}`;

  if (dayDiff === 0) {
    if (hours < 6) return `${hours}H AGO`;
    return `TODAY · ${time}`;
  }
  if (dayDiff === -1) return `YESTERDAY · ${time}`;
  if (dayDiff < -1 && dayDiff >= -7) return `${Math.abs(dayDiff)}D AGO`;
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
