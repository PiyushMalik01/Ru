import { cn } from "@/lib/utils";

interface StreakStripProps {
  days: { date: string; completed: boolean }[];
  size?: "sm" | "md";
}

/**
 * Seven thin vertical bars representing the last 7 days.
 * Today is the rightmost bar. Filled = completed.
 */
export function StreakStrip({ days, size = "md" }: StreakStripProps) {
  const height = size === "sm" ? "h-3" : "h-4";
  return (
    <div className="flex shrink-0 items-end gap-[3px]" aria-hidden>
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        return (
          <span
            key={d.date}
            className={cn(
              "w-[3px] rounded-full transition-colors",
              height,
              d.completed
                ? "bg-success"
                : isToday
                  ? "bg-[rgba(255,255,255,0.18)]"
                  : "bg-[rgba(255,255,255,0.08)]"
            )}
          />
        );
      })}
    </div>
  );
}
