// NOW tile — the hero of the bento. Biggest type, top-left position (F-pattern).
//
// Shows the single most-relevant thing happening in the next hour. If there's
// a task, that's the headline; if not, the next routine; if neither, a
// kind, restful placeholder. The entity-color strip matches whatever's
// being shown — cobalt for a task, lime for a routine.

import Link from "next/link";
import { cn } from "@/lib/utils";
import { BentoCard } from "./bento-card";
import {
  EntityMark,
  formatWhen,
  type EntityKind,
} from "@/components/app-shell/primitives";

interface NowItem {
  kind: "task" | "routine";
  id: string;
  title: string;
  whenIso: string | null;
  timeOfDay?: string | null;
}

interface Props {
  items: NowItem[];
  nowMs: number;
  className?: string;
}

function routineWhen(t: string | null): string {
  if (!t) return "anytime";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr ?? "", 10);
  if (Number.isNaN(h)) return "anytime";
  const m = parseInt(mStr ?? "0", 10) || 0;
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${m.toString().padStart(2, "0")}${ampm}`;
}

export function BentoNow({ items, nowMs, className }: Props) {
  const headline = items[0] ?? null;
  const rest = items.slice(1, 3);

  // The strip color and tint follow whatever's primary.
  const tint: EntityKind = headline?.kind === "routine" ? "routine" : "task";

  if (!headline) {
    return (
      <BentoCard
        tint="task"
        eyebrow="now"
        caption="00"
        className={cn("min-h-[280px]", className)}
        staticTile
      >
        <div className="flex h-full flex-col justify-end">
          <div className="font-display text-[44px] leading-[0.96] text-foreground sm:text-[56px]">
            Nothing on the clock.
          </div>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            The next hour is yours. Take a breath, or open the sheet and pick something up.
          </p>
        </div>
      </BentoCard>
    );
  }

  const whenLabel =
    headline.kind === "task"
      ? formatWhen(headline.whenIso, nowMs) ?? "soon"
      : routineWhen(headline.timeOfDay ?? null);

  const href =
    headline.kind === "task" ? "/sheet" : "/sheet";

  return (
    <BentoCard
      tint={tint}
      eyebrow="now"
      caption={items.length.toString().padStart(2, "0")}
      className={cn("min-h-[280px]", className)}
      href={href}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {headline.kind === "task" ? "task" : "routine"}
          </span>
          <span className="font-display text-[18px] leading-none text-foreground sm:text-[20px]">
            {whenLabel}
          </span>
        </div>

        <h2 className="mt-4 font-display text-[36px] leading-[1.02] text-foreground sm:text-[48px]">
          {headline.title}
        </h2>

        {rest.length > 0 && (
          <ul className="mt-auto pt-6">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/60">
              and after
            </div>
            {rest.map((r) => (
              <li
                key={`${r.kind}-${r.id}`}
                className="flex items-baseline gap-3 border-t border-[var(--hairline-soft)] py-2.5"
              >
                <EntityMark kind={r.kind} />
                <span className="min-w-0 flex-1 truncate text-[13.5px]">{r.title}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {r.kind === "task"
                    ? formatWhen(r.whenIso, nowMs) ?? "—"
                    : routineWhen(r.timeOfDay ?? null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BentoCard>
  );
}
