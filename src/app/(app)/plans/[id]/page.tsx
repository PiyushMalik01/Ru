import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { fetchWorkspaceDetail, type WorkspaceItem } from "@/lib/queries/workspace";
import { SectionHead } from "@/components/editorial/section-head";
import { SheetRow, type SheetRowData } from "@/components/sheet/sheet-row";
import { PlanTitle } from "@/components/plans/plan-title";

export const dynamic = "force-dynamic";

interface SectionGroup {
  key: "task" | "routine" | "reminder" | "activity";
  label: string;
  sublabel: string;
  accent: string;
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
  const todayLabel = format(new Date(nowMs), "EEE MMM d").toLowerCase();

  const rows: SheetRowData[] = detail.items.map((item, i) =>
    toRow(item, i + 1, detail.workspace.id, detail.workspace.title),
  );

  const itemCount = rows.length;
  const doneCount = rows.filter(
    (r) => r.status === "completed" || r.kind === "activity",
  ).length;
  const pct = itemCount > 0 ? Math.round((doneCount / itemCount) * 100) : 0;

  const groups: SectionGroup[] = [
    {
      key: "task",
      label: "tasks",
      sublabel: "one-off work",
      accent: "var(--entity-task)",
      rows: rows.filter((r) => r.kind === "task"),
    },
    {
      key: "routine",
      label: "routines",
      sublabel: "recurring practice",
      accent: "var(--entity-routine)",
      rows: rows.filter((r) => r.kind === "routine"),
    },
    {
      key: "reminder",
      label: "reminders",
      sublabel: "nudges scheduled",
      accent: "var(--entity-reminder)",
      rows: rows.filter((r) => r.kind === "reminder"),
    },
    {
      key: "activity",
      label: "log",
      sublabel: "what's already happened",
      accent: "var(--entity-activity)",
      rows: rows.filter((r) => r.kind === "activity"),
    },
  ];

  const archived = detail.workspace.archived;
  const description = detail.workspace.description?.trim();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <nav className="mb-6 flex items-baseline gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <Link href="/plans" className="ru-link hover:text-foreground">
          plans
        </Link>
        <span className="text-muted-foreground/30">›</span>
        <span className="truncate text-foreground">
          {detail.workspace.title}
        </span>
      </nav>

      <header className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: "var(--entity-plan)" }}
            aria-hidden
          />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 580, 'wdth' 100" }}
          >
            {`plan · ${todayLabel} · ${itemCount} item${itemCount === 1 ? "" : "s"}${archived ? " · archived" : ""}`}
          </span>
        </div>
        <PlanTitleHero id={detail.workspace.id} initial={detail.workspace.title} />
        <p
          className="max-w-[60ch] text-[14px] leading-[1.45] text-muted-foreground"
          style={{
            fontVariationSettings: "'wght' 460, 'wdth' 96",
            fontStyle: description ? undefined : "italic",
          }}
        >
          {description ||
            "no description yet — ru will fill this in as the plan develops."}
        </p>
      </header>

      {itemCount > 0 && (
        <section className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
          <Ledger label="items" value={itemCount.toString().padStart(2, "0")} />
          <Ledger label="settled" value={doneCount.toString().padStart(2, "0")} />
          <Ledger label="progress" value={`${pct}%`} />
        </section>
      )}

      <div className="mt-12 flex flex-col gap-10">
        {itemCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--hairline)] py-20 text-center">
            <p
              className="text-[18px] leading-[1.2] text-muted-foreground"
              style={{
                fontVariationSettings: "'wght' 500, 'wdth' 96",
                letterSpacing: "-0.015em",
              }}
            >
              this plan has no items yet
            </p>
            <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/60">
              add them from /chat or the sheet
            </p>
          </div>
        ) : (
          groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <section key={g.key}>
                <SectionHead
                  eyebrow={g.label}
                  sublabel={g.sublabel}
                  count={g.rows.length}
                  accent={g.accent}
                />
                <div className="mt-1">
                  {g.rows.map((r) => (
                    <SheetRow
                      key={`${r.kind}-${r.id}`}
                      row={r}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span
        className="font-display leading-[0.9] tabular-nums"
        style={{
          fontSize: "clamp(28px, 4.4vw, 40px)",
          fontVariationSettings: "'wght' 580, 'opsz' 96",
          letterSpacing: "-0.025em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PlanTitleHero({ id, initial }: { id: string; initial: string }) {
  return (
    <div className="[&_h1]:font-display [&_h1]:lowercase [&_h1]:text-[clamp(36px,5.6vw,56px)] [&_h1]:leading-[0.95] [&_h1]:tracking-[-0.03em] [&_input]:font-display [&_input]:lowercase [&_input]:text-[clamp(36px,5.6vw,56px)] [&_input]:leading-[0.95] [&_input]:tracking-[-0.03em]">
      <PlanTitle id={id} initial={initial} />
    </div>
  );
}
