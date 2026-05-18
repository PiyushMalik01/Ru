// Read-only properties rail for a plan. Sits on the left of an asymmetric
// layout, the same way Notion shows database properties — but typeset like
// a magazine sidebar with ochre as the plan identity.

import { HairlineProgress, formatAgo } from "@/components/app-shell/primitives";

interface Props {
  status: "active" | "archived";
  createdIso: string;
  updatedIso: string;
  itemCount: number;
  doneCount: number;
  nowMs: number;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--hairline-soft)] pb-3 last:border-b-0">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground/60">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[12px] text-foreground">{children}</div>
    </div>
  );
}

export function PlanProperties({
  status,
  createdIso,
  updatedIso,
  itemCount,
  doneCount,
  nowMs,
}: Props) {
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;
  const glyph = status === "archived" ? "□" : "◐";

  return (
    <aside className="flex flex-col gap-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: "var(--entity-plan)" }}
          aria-hidden
        />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/60">
          plan · properties
        </span>
      </div>

      <Field label="status">
        <span className="inline-flex items-center gap-2">
          <span className="text-foreground/80">{glyph}</span>
          <span className="lowercase text-foreground">{status}</span>
        </span>
      </Field>

      <Field label="progress">
        <div className="flex items-baseline gap-2">
          <span className="tabular-nums text-foreground">
            {doneCount.toString().padStart(2, "0")}
            <span className="text-muted-foreground/40"> / </span>
            {itemCount.toString().padStart(2, "0")}
          </span>
          <span className="ml-auto font-display text-[22px] leading-none tabular-nums text-foreground">
            {pct}
            <span className="text-[12px] text-muted-foreground">%</span>
          </span>
        </div>
        <div className="mt-2">
          <HairlineProgress value={pct} tint="plan" />
        </div>
      </Field>

      <Field label="started">
        <span className="tabular-nums">{formatAgo(createdIso, nowMs)}</span>
      </Field>

      <Field label="updated">
        <span className="tabular-nums">{formatAgo(updatedIso, nowMs)}</span>
      </Field>

      <Field label="items">
        <span className="tabular-nums text-foreground">
          {itemCount.toString().padStart(2, "0")}
        </span>
      </Field>
    </aside>
  );
}
