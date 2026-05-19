import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchWorkspaceDetail, type WorkspaceItem } from "@/lib/queries/workspace";
import {
  ENTITY_COLOR_VAR,
  type EntityKind,
} from "@/components/app-shell/primitives";
import { SheetRow, type SheetRowData } from "@/components/sheet/sheet-row";
import { PlanTitle } from "@/components/plans/plan-title";
import { PlanStatStrip } from "@/components/plans/plan-stat-strip";

export const dynamic = "force-dynamic";

interface SectionGroup {
  kind: "task" | "routine" | "reminder" | "activity";
  label: string;
  rows: SheetRowData[];
}

function toRow(
  item: WorkspaceItem,
  index: number,
  planId: string,
  planTitle: string,
): SheetRowData {
  if (item.kind === "task") {
    return {
      index,
      kind: "task",
      id: item.id,
      title: item.title,
      status: item.status,
      whenIso: item.due_at,
      planId,
      planTitle,
      meta: item.priority !== "medium" ? item.priority : null,
      isToggleable: true,
    };
  }
  if (item.kind === "routine") {
    return {
      index,
      kind: "routine",
      id: item.id,
      title: item.title,
      status: "recurring",
      whenIso: null,
      planId,
      planTitle,
      meta: item.frequency,
      isToggleable: true,
    };
  }
  if (item.kind === "reminder") {
    return {
      index,
      kind: "reminder",
      id: item.id,
      title: item.title,
      status: "pending",
      whenIso: item.remind_at,
      planId,
      planTitle,
      meta: item.is_recurring ? "recurring" : null,
      isToggleable: false,
    };
  }
  return {
    index,
    kind: "activity",
    id: item.id,
    title: item.activity,
    status: "logged",
    whenIso: item.timestamp,
    planId,
    planTitle,
    meta: item.category || null,
    isToggleable: false,
  };
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchWorkspaceDetail(supabase, user.id, id);
  if (!detail) notFound();

  const nowMs = Date.now();

  const rows: SheetRowData[] = detail.items.map((item, i) =>
    toRow(item, i + 1, detail.workspace.id, detail.workspace.title),
  );

  // Settled: completed tasks + activities (v1 approximation)
  const doneCount = rows.filter(
    (r) => r.status === "completed" || r.kind === "activity",
  ).length;

  // Group by kind, preserving order within each group.
  const groups: SectionGroup[] = [
    { kind: "task", label: "tasks", rows: rows.filter((r) => r.kind === "task") },
    { kind: "routine", label: "routines", rows: rows.filter((r) => r.kind === "routine") },
    { kind: "reminder", label: "reminders", rows: rows.filter((r) => r.kind === "reminder") },
    { kind: "activity", label: "log", rows: rows.filter((r) => r.kind === "activity") },
  ];

  // Compute "last touched" from rows' whenIso or fall back to updated_at.
  const lastTouchedMs = Math.max(
    new Date(detail.workspace.updated_at).getTime(),
    ...rows
      .map((r) => (r.whenIso ? new Date(r.whenIso).getTime() : 0))
      .filter((t) => Number.isFinite(t)),
  );
  const lastTouchedIso = new Date(lastTouchedMs).toISOString();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pt-10 pb-32">
      {/* Breadcrumb */}
      <nav className="flex items-baseline gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <Link href="/plans" className="ru-link hover:text-foreground">
          plans
        </Link>
        <span className="text-muted-foreground/30">›</span>
        <span className="truncate text-foreground">{detail.workspace.title}</span>
      </nav>

      {/* Hero — plan tone bar, big Fraunces title, description */}
      <header className="mt-8">
        {/* Tone bar above the title */}
        <div
          className="h-1 w-24 rounded-full"
          style={{ background: "var(--entity-plan)" }}
          aria-hidden
        />
        <div className="mt-5">
          <PlanTitleHero
            id={detail.workspace.id}
            initial={detail.workspace.title}
          />
        </div>
        {detail.workspace.description ? (
          <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-muted-foreground">
            {detail.workspace.description}
          </p>
        ) : (
          <p className="mt-5 max-w-2xl text-[14px] italic leading-relaxed text-muted-foreground/45">
            no description yet — ru will fill this in as the plan develops.
          </p>
        )}
        <div className="mt-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: "var(--entity-plan)" }}
            aria-hidden
          />
          <span>plan</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{detail.workspace.archived ? "archived" : "active"}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>
            {rows.length.toString().padStart(2, "0")}{" "}
            <span className="text-muted-foreground/50">items</span>
          </span>
        </div>
      </header>

      {/* Stat strip — 3 ochre mini bentos */}
      <div className="mt-8">
        <PlanStatStrip
          itemCount={rows.length}
          doneCount={doneCount}
          lastTouchedIso={lastTouchedIso}
          nowMs={nowMs}
        />
      </div>

      {/* Sectioned content */}
      <div className="mt-12 space-y-12">
        {rows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-[var(--hairline)] py-20 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/60">
            this plan has no items yet. add them from /chat or the sheet.
          </div>
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <SectionGroup key={g.kind} group={g} nowMs={nowMs} />
            ))
        )}
      </div>
    </div>
  );
}

function SectionGroup({
  group,
  nowMs,
}: {
  group: SectionGroup;
  nowMs: number;
}) {
  const tint = ENTITY_COLOR_VAR[group.kind as EntityKind];
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-3 border-b border-[var(--hairline)] pb-3">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: tint }}
          aria-hidden
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          {group.label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
          {group.rows.length.toString().padStart(2, "0")}
        </span>
      </div>

      {/* Column header (compact) */}
      <div
        className="grid items-center gap-4 pl-5 pr-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55 border-b border-[var(--hairline-soft)]"
        style={{
          gridTemplateColumns:
            "40px 22px minmax(0,1fr) 138px 128px minmax(0,160px) 112px 72px",
        }}
      >
        <span className="text-muted-foreground/30">№</span>
        <span />
        <span>title</span>
        <span>status</span>
        <span>when</span>
        <span>plan</span>
        <span>meta</span>
        <span />
      </div>

      <div>
        {group.rows.map((r) => (
          <SheetRow key={`${r.kind}-${r.id}`} row={r} nowMs={nowMs} />
        ))}
      </div>
    </section>
  );
}

/**
 * Wraps PlanTitle and scales it up for the detail hero.
 * PlanTitle's input uses 40px Fraunces by default; we render a larger H1
 * outside that affordance when not editing to hit 48-56px.
 */
function PlanTitleHero({ id, initial }: { id: string; initial: string }) {
  // We reuse PlanTitle to preserve the inline-rename UX. The component
  // renders its own 40px headline; we wrap it with size overrides via CSS.
  return (
    <div className="[&_h1]:text-[44px] [&_h1]:sm:text-[56px] [&_h1]:leading-[1.02] [&_input]:text-[44px] [&_input]:sm:text-[56px] [&_input]:leading-[1.02]">
      <PlanTitle id={id} initial={initial} />
    </div>
  );
}
