// Section delimiter — mirrors the Flutter `_SectionHead` widget. Small
// accent square + uppercase eyebrow + low-contrast sublabel + zero-padded
// count, all sitting on a single hairline rule.

import { cn } from "@/lib/utils";

interface Props {
  eyebrow: string;
  sublabel?: string;
  count: number;
  accent?: string; // CSS color value (defaults to muted foreground)
}

export function SectionHead({ eyebrow, sublabel, count, accent }: Props) {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--hairline-soft)] pb-2 pt-1">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-[2px]"
        style={{ background: accent ?? "var(--muted-foreground)" }}
      />
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.2em] text-foreground",
        )}
        style={{ fontVariationSettings: "'wght' 640, 'wdth' 100" }}
      >
        {eyebrow}
      </span>
      {sublabel && (
        <span
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70"
          style={{ fontVariationSettings: "'wght' 500, 'wdth' 96" }}
        >
          {sublabel}
        </span>
      )}
      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/70">
        {count.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
