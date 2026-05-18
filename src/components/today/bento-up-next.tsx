// UP NEXT tile — a list of the next 3–4 items today, each carrying its own
// entity color via a small inline marker. Sits across two columns under the
// hero, completing the F-pattern's bottom bar.

import Link from "next/link";
import { BentoCard } from "./bento-card";
import {
  EntityMark,
  formatWhen,
} from "@/components/app-shell/primitives";
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

export function BentoUpNext({ items, className, nowMs }: Props) {
  const shown = items.slice(0, 5);

  return (
    <BentoCard
      tint="task"
      eyebrow="up next"
      caption={items.length.toString().padStart(2, "0")}
      className={cn("min-h-[180px]", className)}
      staticTile
    >
      {shown.length === 0 ? (
        <p className="py-8 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
          the rest of the day is clear.
        </p>
      ) : (
        <ul className="flex flex-col">
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
                  i !== 0 && "border-t border-[var(--hairline-soft)]",
                )}
              >
                <EntityMark kind={it.kind} />
                <Link
                  href="/sheet"
                  className="min-w-0 flex-1 truncate text-[13.5px] leading-tight hover:text-foreground"
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
    </BentoCard>
  );
}
