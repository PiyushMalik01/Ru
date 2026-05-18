// UP NEXT tile — cream/white tile, list of items each carrying a colored
// square marker for its entity type. Sits across the bottom row.

import Link from "next/link";
import { BentoCard } from "./bento-card";
import { Sticker } from "@/components/app-shell/sticker";
import { formatWhen } from "@/components/app-shell/primitives";
import { cn } from "@/lib/utils";

interface UpNextItem {
  kind: "task" | "routine" | "reminder";
  id: string;
  title: string;
  whenIso: string | null;
  timeOfDay?: string | null;
}

interface Props {
  items: UpNextItem[];
  className?: string;
  nowMs: number;
}

function routineWhen(t: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr ?? "", 10);
  if (Number.isNaN(h)) return "";
  const m = parseInt(mStr ?? "0", 10) || 0;
  const ampm = h < 12 ? "am" : "pm";
  const hour12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${hour12}${ampm}` : `${hour12}:${m.toString().padStart(2, "0")}${ampm}`;
}

const KIND_BG: Record<"task" | "routine" | "reminder", string> = {
  task: "var(--entity-task)",
  routine: "var(--entity-routine)",
  reminder: "var(--entity-reminder)",
};

export function BentoUpNext({ items, className, nowMs }: Props) {
  const shown = items.slice(0, 6);

  return (
    <BentoCard variant="cream" className={cn("min-h-[200px]", className)} staticTile>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <Sticker tilt={-2}>Up next</Sticker>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {items.length.toString().padStart(2, "0")} more
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="my-auto text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground">
            the rest of the day is clear.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col">
            {shown.map((it, i) => {
              const when =
                it.kind === "routine"
                  ? routineWhen(it.timeOfDay ?? null)
                  : formatWhen(it.whenIso, nowMs) ?? "";
              return (
                <li
                  key={`${it.kind}-${it.id}`}
                  className={cn(
                    "flex items-center gap-3 py-2.5",
                    i !== 0 && "border-t border-[var(--hairline-soft)]"
                  )}
                >
                  {/* Colored chunky square — entity identity */}
                  <span
                    className="h-3 w-3 shrink-0 rounded-[3px]"
                    style={{ background: KIND_BG[it.kind] }}
                    aria-hidden
                  />
                  <Link
                    href="/sheet"
                    className="min-w-0 flex-1 truncate text-[14px] leading-tight"
                  >
                    {it.title}
                  </Link>
                  {when && (
                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {when}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BentoCard>
  );
}
