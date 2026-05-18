import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTasks,
  fetchRoutinesWithToday,
} from "@/lib/queries/dashboard";
import { listWorkspaces } from "@/lib/queries/workspace";
import {
  SheetControls,
  type SheetFilter,
  type SheetView,
} from "@/components/sheet/sheet-controls";
import {
  SheetRow,
  type SheetRowData,
} from "@/components/sheet/sheet-row";
import type { ItemKind, ItemStatus } from "@/components/app-shell/primitives";

export const dynamic = "force-dynamic";

// Next.js 16 — searchParams is async.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseFilter(v: string | string[] | undefined): SheetFilter {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "tasks" || s === "routines" || s === "logs" || s === "reminders") return s;
  return "all";
}
function parseView(v: string | string[] | undefined): SheetView {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "board" || s === "calendar" || s === "timeline") return s;
  return "table";
}

export default async function SheetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const filter = parseFilter(sp.filter);
  const view = parseView(sp.view);

  // Always fetch everything — the filter is client-side over a single list,
  // so the bottom counts still feel honest ("123 rows · 4 of them logs").
  const [tasks, routines, workspaces, activitiesRes, remindersRes] = await Promise.all([
    fetchTasks(supabase, user.id, { statuses: ["pending", "in_progress", "missed"] }),
    fetchRoutinesWithToday(supabase, user.id),
    listWorkspaces(supabase, user.id),
    supabase
      .from("activity_log")
      .select("id, activity, category, timestamp, workspace_id")
      .eq("user_id", user.id)
      .gte("timestamp", new Date(Date.now() - 30 * 86400_000).toISOString())
      .order("timestamp", { ascending: false })
      .limit(50),
    supabase
      .from("reminders")
      .select("id, title, remind_at, is_recurring, status, workspace_id")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("remind_at", { ascending: true })
      .limit(50),
  ]);

  // Plan lookup table for the "plan" column.
  const planById = new Map(workspaces.map((w) => [w.id, w.title]));

  // We also want plan-back-references on tasks. Fetch them separately.
  const { data: taskWorkspaceLinks } = await supabase
    .from("workspace_item_order")
    .select("workspace_id, item_kind, item_id")
    .eq("item_kind", "task");
  const taskPlanById = new Map<string, string>();
  for (const link of taskWorkspaceLinks ?? []) {
    taskPlanById.set(link.item_id, link.workspace_id);
  }

  const nowMs = Date.now();

  // Compose a single unified row list. Order: pending tasks → routines → reminders → activity log.
  const rows: SheetRowData[] = [];

  for (const t of tasks) {
    const planId = taskPlanById.get(t.id) ?? null;
    const planTitle = planId ? (planById.get(planId) ?? null) : null;
    rows.push({
      index: 0,
      kind: "task" as ItemKind,
      id: t.id,
      title: t.title,
      status: t.status as ItemStatus,
      whenIso: t.due_at,
      planId,
      planTitle,
      meta: t.priority !== "medium" ? t.priority : null,
      isToggleable: true,
    });
  }

  for (const r of routines) {
    rows.push({
      index: 0,
      kind: "routine",
      id: r.id,
      title: r.title,
      status: r.todayCompleted ? "completed" : "recurring",
      whenIso: null,
      planId: null,
      planTitle: null,
      meta: r.streak > 0 ? `streak ${r.streak}` : r.frequency,
      isToggleable: true,
      todayCompleted: r.todayCompleted,
    });
  }

  for (const rem of remindersRes.data ?? []) {
    rows.push({
      index: 0,
      kind: "reminder",
      id: rem.id,
      title: rem.title,
      status: "pending",
      whenIso: rem.remind_at,
      planId: rem.workspace_id ?? null,
      planTitle: rem.workspace_id ? (planById.get(rem.workspace_id) ?? null) : null,
      meta: rem.is_recurring ? "recurring" : null,
      isToggleable: false,
    });
  }

  for (const a of activitiesRes.data ?? []) {
    rows.push({
      index: 0,
      kind: "activity",
      id: a.id,
      title: a.activity,
      status: "logged",
      whenIso: a.timestamp,
      planId: a.workspace_id ?? null,
      planTitle: a.workspace_id ? (planById.get(a.workspace_id) ?? null) : null,
      meta: a.category || null,
      isToggleable: false,
    });
  }

  // Apply filter.
  const filtered =
    filter === "all"
      ? rows
      : rows.filter((r) => {
          if (filter === "tasks")     return r.kind === "task";
          if (filter === "routines")  return r.kind === "routine";
          if (filter === "logs")      return r.kind === "activity";
          if (filter === "reminders") return r.kind === "reminder";
          return true;
        });

  // Re-index visible rows for the marginalia gutter (so the numbering
  // matches what the user actually sees, not what's hidden).
  filtered.forEach((r, i) => (r.index = i + 1));

  // Counts for the footer summary.
  const counts = {
    tasks:     rows.filter((r) => r.kind === "task").length,
    routines:  rows.filter((r) => r.kind === "routine").length,
    reminders: rows.filter((r) => r.kind === "reminder").length,
    logs:      rows.filter((r) => r.kind === "activity").length,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      {/* Sheet masthead — printed-page header, no decoration. */}
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            sheet
          </div>
          <h1 className="mt-3 text-[26px] font-light leading-tight tracking-[-0.018em]">
            Every thread, in one column.
          </h1>
        </div>
        <div className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 sm:block">
          tasks · routines · reminders · logs
        </div>
      </header>

      <div className="mt-10">
        <SheetControls
          totalCount={filtered.length}
          activeFilter={filter}
          activeView={view}
        />
      </div>

      {view !== "table" ? (
        <ComingNext view={view} />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          {/* Sticky header */}
          <div
            className="sticky top-12 z-20 grid items-center gap-4 bg-background pl-5 pr-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 border-b border-[var(--hairline)]"
            style={{
              gridTemplateColumns:
                "40px 22px minmax(0,1fr) 138px 128px minmax(0,160px) 112px 72px",
            }}
          >
            <span className="text-muted-foreground/30">№</span>
            <span />
            <span>title</span>
            <span>status</span>
            <span>due · when</span>
            <span>plan</span>
            <span>meta</span>
            <span />
          </div>

          <div>
            {filtered.map((r) => (
              <SheetRow key={`${r.kind}-${r.id}`} row={r} nowMs={nowMs} />
            ))}
          </div>

          {/* Footer summary — count by kind in mono. */}
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
            <span>{filtered.length.toString().padStart(3, "0")} visible</span>
            <span className="text-muted-foreground/30">·</span>
            <span>○ {counts.tasks} tasks</span>
            <span>⟳ {counts.routines} routines</span>
            <span>△ {counts.reminders} reminders</span>
            <span>⊕ {counts.logs} logs</span>
          </div>
        </>
      )}
    </div>
  );
}

function ComingNext({ view }: { view: SheetView }) {
  const labels: Record<SheetView, { title: string; sub: string }> = {
    table:    { title: "Table",    sub: "" },
    board:    { title: "Board",    sub: "kanban columns by status" },
    calendar: { title: "Calendar", sub: "monthly grid, dense mono dates" },
    timeline: { title: "Timeline", sub: "gantt-style across weeks" },
  };
  const l = labels[view];
  return (
    <div className="mt-24 flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/60">
        coming next
      </div>
      <h2 className="text-[24px] font-light tracking-tight">{l.title} view</h2>
      <p className="max-w-xs font-mono text-[11.5px] tracking-tight text-muted-foreground">
        {l.sub}. for now, the table holds everything — it&rsquo;s the canonical view.
      </p>
    </div>
  );
}

function EmptyState({ filter }: { filter: SheetFilter }) {
  const msg =
    filter === "tasks"
      ? "no tasks yet. tell ru what's on your mind."
      : filter === "routines"
        ? "no active routines. ru picks them up from your patterns."
        : filter === "logs"
          ? "the log is empty. ru fills this in as you live the day."
          : filter === "reminders"
            ? "no pending reminders."
            : "the sheet is empty.";
  return (
    <div className="mt-20 py-20 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
      {msg}
    </div>
  );
}
