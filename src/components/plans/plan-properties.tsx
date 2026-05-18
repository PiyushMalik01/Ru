// Read-only properties rail for a plan. Sits on the left of an asymmetric
// layout, the same way Notion shows database properties — but typeset like
// a magazine sidebar.

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
    <div className="border-b border-[rgba(255,255,255,0.05)] pb-3 last:border-b-0">
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
      <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-muted-foreground/50">
        properties
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
          <span className="ml-auto tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="mt-2">
          <HairlineProgress value={pct} />
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
