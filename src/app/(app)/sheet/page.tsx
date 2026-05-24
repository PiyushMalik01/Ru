import { redirect } from "next/navigation";
import { parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTasks,
  fetchRoutinesWithToday,
  fetchSheetTaskStats,
} from "@/lib/queries/dashboard";
import { listWorkspaces } from "@/lib/queries/workspace";
import { fetchCalendarItems } from "@/lib/queries/calendar";
import { fetchTimelinePlans } from "@/lib/queries/timeline";
import {
  SheetControls,
  type SheetFilter,
  type SheetView,
} from "@/components/sheet/sheet-controls";
import { type SheetRowData } from "@/components/sheet/sheet-row";
import {
  SheetStatsStrip,
  type SheetStatusFilter,
} from "@/components/sheet/sheet-stats-strip";
import {
  SheetTable,
  type SortKey,
  type SortDir,
} from "@/components/sheet/sheet-table";
import { CalendarView } from "@/components/sheet/calendar-view";
import { TimelineView } from "@/components/sheet/timeline-view";
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
  if (s === "calendar" || s === "timeline") return s;
  return "table";
}
function parseStatus(v: string | string[] | undefined): SheetStatusFilter {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "open" || s === "today" || s === "overdue" || s === "completed") return s;
  return "all";
}
function parseSort(v: string | string[] | undefined): SortKey {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "title" || s === "status") return s;
  return "due_at"; // natural default
}
function parseDir(v: string | string[] | undefined): SortDir {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "desc" ? "desc" : "asc";
}
function parseRange(v: string | string[] | undefined): "week" | "day" {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "day" ? "day" : "week";
}
function parseAnchor(v: string | string[] | undefined): Date {
  const s = Array.isArray(v) ? v[0] : v;
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      return parseISO(s);
    } catch {
      /* fall through */
    }
  }
  return new Date();
}

function startOfWeekMon(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay();
  const delta = dow === 0 ? -6 : 1 - dow; // shift to Monday
  out.setDate(out.getDate() + delta);
  return out;
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
  const range = parseRange(sp.range);
  const anchor = parseAnchor(sp.date);
  const status = parseStatus(sp.status);
  const sortKey = parseSort(sp.sort);
  const sortDir = parseDir(sp.dir);

  // ── CALENDAR view branches off early. It needs a different data shape and
  // doesn't share the row-list logic at all.
  if (view === "calendar") {
    const from = range === "day" ? new Date(anchor) : startOfWeekMon(anchor);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + (range === "day" ? 1 : 7));

    const items = await fetchCalendarItems(supabase, user.id, from, to);
    const nowMs = Date.now();

    return (
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
        <SheetMasthead />
        <div className="mt-10">
          <SheetControls
            totalCount={items.length}
            activeFilter={filter}
            activeView={view}
          />
        </div>
        <CalendarView items={items} anchor={from} mode={range} nowMs={nowMs} />
      </div>
    );
  }

  // ── TIMELINE view: plans across dates.
  if (view === "timeline") {
    const plans = await fetchTimelinePlans(supabase, user.id);
    const nowMs = Date.now();
    return (
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
        <SheetMasthead />
        <div className="mt-10">
          <SheetControls
            totalCount={plans.length}
            activeFilter={filter}
            activeView={view}
          />
        </div>
        <TimelineView plans={plans} nowMs={nowMs} />
      </div>
    );
  }

  // ── Default: TABLE view (the canonical lens).
  // When the user has selected "completed" from the stats strip we also need
  // completed tasks in the row set; otherwise the table can show only the
  // open lifecycle states (matching the previous behaviour).
  const taskStatuses =
    status === "completed"
      ? (["pending", "in_progress", "missed", "completed"] as const)
      : (["pending", "in_progress", "missed"] as const);

  const [tasks, routines, workspaces, activitiesRes, remindersRes, taskStats] = await Promise.all([
    fetchTasks(supabase, user.id, { statuses: [...taskStatuses] }),
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
    fetchSheetTaskStats(supabase, user.id),
  ]);

  const planById = new Map(workspaces.map((w) => [w.id, w.title]));

  const { data: taskWorkspaceLinks } = await supabase
    .from("workspace_item_order")
    .select("workspace_id, item_kind, item_id")
    .eq("item_kind", "task");
  const taskPlanById = new Map<string, string>();
  for (const link of taskWorkspaceLinks ?? []) {
    taskPlanById.set(link.item_id, link.workspace_id);
  }

  const nowMs = Date.now();
  const rows: SheetRowData[] = [];

  for (const t of tasks) {
    const planId = taskPlanById.get(t.id) ?? null;
    const planTitle = planId ? planById.get(planId) ?? null : null;
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
      planTitle: rem.workspace_id ? planById.get(rem.workspace_id) ?? null : null,
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
      planTitle: a.workspace_id ? planById.get(a.workspace_id) ?? null : null,
      meta: a.category || null,
      isToggleable: false,
    });
  }

  // ── Filter pipeline.
  // 1. kind filter (from SheetControls) — narrows by entity type.
  // 2. status filter (from SheetStatsStrip) — narrows by task lifecycle.
  //    Status only refers to tasks; selecting any task-status implicitly
  //    restricts the table to task rows.
  const startOfTodayMs = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const startOfTomorrowMs = startOfTodayMs + 86400_000;
  const weekAgoMs = nowMs - 7 * 86400_000;

  let working = rows;
  if (filter !== "all") {
    working = working.filter((r) => {
      if (filter === "tasks")     return r.kind === "task";
      if (filter === "routines")  return r.kind === "routine";
      if (filter === "logs")      return r.kind === "activity";
      if (filter === "reminders") return r.kind === "reminder";
      return true;
    });
  }
  if (status !== "all") {
    // Find the underlying task row for status logic — we need due_at and
    // completed_at, which we have on `tasks` but not on SheetRowData.
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    working = working.filter((r) => {
      if (r.kind !== "task") return false;
      const t = taskById.get(r.id);
      if (!t) return false;
      if (status === "open") return t.status === "pending" || t.status === "in_progress";
      if (status === "completed") {
        if (t.status !== "completed" || !t.completed_at) return false;
        return new Date(t.completed_at).getTime() >= weekAgoMs;
      }
      if (status === "today") {
        if (!t.due_at) return false;
        const d = new Date(t.due_at).getTime();
        return d >= startOfTodayMs && d < startOfTomorrowMs && t.status !== "completed";
      }
      if (status === "overdue") {
        if (t.status === "completed") return false;
        if (t.due_at) return new Date(t.due_at).getTime() < nowMs;
        return t.status === "missed";
      }
      return true;
    });
  }

  // ── Sort. Stable order: secondary key is the original row order so equal
  //    keys (e.g. two tasks with no due_at) keep the upstream ordering.
  const decorated = working.map((r, i) => ({ r, i }));
  decorated.sort((a, b) => {
    const cmp = compareRows(a.r, b.r, sortKey);
    if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
    return a.i - b.i;
  });
  const sorted = decorated.map((x) => x.r);
  sorted.forEach((r, i) => (r.index = i + 1));

  const counts = {
    tasks:     rows.filter((r) => r.kind === "task").length,
    routines:  rows.filter((r) => r.kind === "routine").length,
    reminders: rows.filter((r) => r.kind === "reminder").length,
    logs:      rows.filter((r) => r.kind === "activity").length,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      <SheetMasthead />

      <div className="mt-8">
        <SheetStatsStrip
          counts={{
            open: taskStats.open,
            dueToday: taskStats.dueToday,
            completedWeek: taskStats.completedWeek,
            overdue: taskStats.overdue,
          }}
          active={status}
        />
      </div>

      <div className="mt-10">
        <SheetControls
          totalCount={sorted.length}
          activeFilter={filter}
          activeView={view}
        />
      </div>

      {sorted.length === 0 ? (
        <EmptyState filter={filter} status={status} />
      ) : (
        <>
          <SheetTable
            rows={sorted}
            nowMs={nowMs}
            sort={{ key: sortKey, dir: sortDir }}
          />

          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/60">
            <span>{sorted.length.toString().padStart(3, "0")} visible</span>
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

// ── Row comparator. Null-aware: rows without a sort value sink to the bottom
//    regardless of direction (a printed index reads better that way).
function compareRows(a: SheetRowData, b: SheetRowData, key: SortKey): number {
  if (key === "title") {
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }
  if (key === "due_at") {
    const av = a.whenIso ? new Date(a.whenIso).getTime() : null;
    const bv = b.whenIso ? new Date(b.whenIso).getTime() : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  }
  // status: ordinal so the comparator is stable across kinds.
  const order: Record<string, number> = {
    in_progress: 0,
    missed: 1,
    pending: 2,
    recurring: 3,
    logged: 4,
    completed: 5,
  };
  return (order[a.status] ?? 99) - (order[b.status] ?? 99);
}

function SheetMasthead() {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          sheet
        </div>
        <h1 className="h-page-sm mt-3 lowercase">
          every thread, in one column
        </h1>
      </div>
      <div className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 sm:block">
        tasks · routines · reminders · logs
      </div>
    </header>
  );
}

function EmptyState({
  filter,
  status,
}: {
  filter: SheetFilter;
  status: SheetStatusFilter;
}) {
  // Status filter takes precedence because the user just clicked it — the
  // message should answer "why is this empty?" in the user's own framing.
  const msg =
    status === "open"
      ? "Nothing open. The page is clear."
      : status === "today"
        ? "Nothing due today. A rare gift."
        : status === "overdue"
          ? "Nothing overdue. Right on time."
          : status === "completed"
            ? "No tasks finished in the last seven days."
            : filter === "tasks"
              ? "No tasks yet. Tell Ru what's on your mind."
              : filter === "routines"
                ? "No active routines. Ru picks them up from your patterns."
                : filter === "logs"
                  ? "The log is empty. Ru fills this in as you live the day."
                  : filter === "reminders"
                    ? "No pending reminders."
                    : "The sheet is empty.";
  return (
    <div className="mt-20 py-20 text-center">
      <p
        className="lowercase text-[22px] leading-[1.15] text-muted-foreground"
        style={{
          fontVariationSettings: "'wght' 540, 'wdth' 96",
          letterSpacing: "-0.015em",
        }}
      >
        {msg.replace(/\.$/, "").toLowerCase()}
      </p>
    </div>
  );
}
