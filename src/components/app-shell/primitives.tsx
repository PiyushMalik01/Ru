// Shared editorial primitives for the Today / Sheet / Plans surfaces.
//
// The visual idea is a printed-newspaper tracker: monospace numerals as a
// data language, hairline rules, custom typographic status glyphs rather
// than Lucide icons inside the data layer. Use Lucide elsewhere (nav, chat),
// but in lists/tables/properties, prefer these symbols.

import { cn } from "@/lib/utils";

// -- Status glyphs ----------------------------------------------------------
// These are typographic, not icons. They live in Geist Mono and read as
// part of the data, the same way a footnote mark does in print.

export type ItemKind = "task" | "routine" | "reminder" | "activity";
export type ItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "missed"
  | "recurring"
  | "logged";

interface GlyphMeta {
  symbol: string;
  label: string;
  /** semantic tint, applied to the symbol only */
  tone: "muted" | "fg" | "success" | "warning" | "error";
}

const STATUS_META: Record<ItemStatus, GlyphMeta> = {
  pending:     { symbol: "○", label: "open",       tone: "muted" },
  in_progress: { symbol: "◐", label: "in flight",  tone: "fg" },
  completed:   { symbol: "☑", label: "done",       tone: "success" },
  missed:      { symbol: "△", label: "overdue",    tone: "error" },
  recurring:   { symbol: "⟳", label: "recurring",  tone: "muted" },
  logged:      { symbol: "⊕", label: "logged",     tone: "muted" },
};

function toneClass(tone: GlyphMeta["tone"]): string {
  switch (tone) {
    case "muted":   return "text-muted-foreground/70";
    case "fg":      return "text-foreground";
    case "success": return "text-success";
    case "warning": return "text-warning";
    case "error":   return "text-error";
  }
}

/** A small mono glyph used inline (table cells, lists). */
export function StatusGlyph({
  status,
  className,
}: { status: ItemStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn("font-mono text-[14px] leading-none select-none", toneClass(meta.tone), className)}
      aria-hidden
    >
      {meta.symbol}
    </span>
  );
}

/** Glyph + lowercase mono label, e.g. "◐ in flight". */
export function StatusBadge({
  status,
  className,
}: { status: ItemStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <StatusGlyph status={status} />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
        {meta.label}
      </span>
    </span>
  );
}

/** Status meta accessor, for components that need only the label/symbol. */
export function statusMeta(status: ItemStatus): GlyphMeta {
  return STATUS_META[status];
}

// -- Item-kind glyph (column 1 of the Sheet) --------------------------------

export function KindGlyph({
  kind,
  done = false,
  className,
}: { kind: ItemKind; done?: boolean; className?: string }) {
  let symbol = "○";
  let tone: GlyphMeta["tone"] = "muted";
  if (kind === "task")     { symbol = done ? "☑" : "○"; tone = done ? "success" : "muted"; }
  if (kind === "routine")  { symbol = "⟳"; tone = "fg"; }
  if (kind === "reminder") { symbol = "△"; tone = "warning"; }
  if (kind === "activity") { symbol = "⊕"; tone = "muted"; }
  return (
    <span
      className={cn("font-mono text-[14px] leading-none select-none", toneClass(tone), className)}
      aria-hidden
    >
      {symbol}
    </span>
  );
}

// -- Section marks ----------------------------------------------------------
// Use these instead of plain <hr>. They suggest the typography of a printed
// page: a small typographic mark, centered, framed by hairlines.

export function SectionMark({
  glyph = "§",
  className,
}: { glyph?: "§" | "¶" | "※" | "·"; className?: string }) {
  return (
    <div
      className={cn(
        "my-10 flex items-center gap-4 text-muted-foreground/40 select-none",
        className,
      )}
      aria-hidden
    >
      <span className="ru-rule flex-1" />
      <span className="font-mono text-[11px] leading-none">{glyph}</span>
      <span className="ru-rule flex-1" />
    </div>
  );
}

/** A tighter section eyebrow with a hairline underneath. */
export function Eyebrow({
  children,
  count,
  trailing,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3",
        className,
      )}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
        {children}
      </span>
      {typeof count === "number" && (
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
          {count.toString().padStart(2, "0")}
        </span>
      )}
      {trailing}
    </div>
  );
}

// -- Date formatting --------------------------------------------------------

/** "today 7pm", "tomorrow 9am", "tue 18:00", or absolute "may 24" for far-away. */
export function formatWhen(iso: string | null, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date(nowMs);
  const msDay = 1000 * 60 * 60 * 24;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / msDay);

  const hasTime =
    d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  const time = hasTime
    ? d
        .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        .toLowerCase()
        .replace(" ", "")
    : "";

  if (dayDiff === 0)  return hasTime ? `today ${time}` : "today";
  if (dayDiff === 1)  return hasTime ? `tomorrow ${time}` : "tomorrow";
  if (dayDiff === -1) return hasTime ? `yesterday ${time}` : "yesterday";
  if (dayDiff > 1 && dayDiff <= 6) {
    const wd = d.toLocaleDateString([], { weekday: "short" }).toLowerCase();
    return hasTime ? `${wd} ${time}` : wd;
  }
  if (dayDiff < -1 && dayDiff >= -6) {
    return `${Math.abs(dayDiff)}d ago`;
  }
  return d
    .toLocaleDateString([], { month: "short", day: "numeric" })
    .toLowerCase();
}

/** "5h ago", "3d ago" — short, mono-friendly. */
export function formatAgo(iso: string, nowMs: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = nowMs - d.getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

// -- Progress hairline ------------------------------------------------------

export function HairlineProgress({
  value,
  className,
}: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-px w-full bg-[rgba(255,255,255,0.06)] overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <div
        className="h-full bg-foreground/70"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
