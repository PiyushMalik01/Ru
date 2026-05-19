// Three saturated ochre mini bento cards beneath the plan detail hero.
// Same rounded-[28px] tile + Fraunces hero number language as the
// /today bento, but scaled down so they sit as a horizontal stat band.

import { formatAgo } from "@/components/app-shell/primitives";

interface Props {
  itemCount: number;
  doneCount: number;
  lastTouchedIso: string;
  nowMs: number;
}

function Tile({
  label,
  value,
  suffix,
  caption,
}: {
  label: string;
  value: string;
  suffix?: string;
  caption?: string;
}) {
  return (
    <div
      className="ru-bento min-h-[136px]"
      data-static="true"
      style={{
        ["--bento-bg" as string]: "var(--entity-plan)",
        ["--bento-fg" as string]: "var(--entity-plan-fg)",
      }}
    >
      <div className="flex h-full flex-col p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-65">
          {label}
        </div>
        <div className="mt-auto flex items-baseline gap-1">
          <span
            className="font-display tabular-nums leading-[0.85]"
            style={{ fontSize: "clamp(38px, 4.4vw, 52px)" }}
          >
            {value}
          </span>
          {suffix && (
            <span className="font-display text-[18px] leading-none opacity-60">
              {suffix}
            </span>
          )}
        </div>
        {caption && (
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] opacity-65">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}

export function PlanStatStrip({
  itemCount,
  doneCount,
  lastTouchedIso,
  nowMs,
}: Props) {
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <Tile
        label="items"
        value={itemCount.toString().padStart(2, "0")}
        caption={`${doneCount} settled`}
      />
      <Tile
        label="progress"
        value={pct.toString()}
        suffix="%"
        caption={`${doneCount}/${itemCount} done`}
      />
      <Tile
        label="last touched"
        value={formatAgo(lastTouchedIso, nowMs) || "just now"}
        caption="latest movement"
      />
    </div>
  );
}
