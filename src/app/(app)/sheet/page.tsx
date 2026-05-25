import { redirect } from "next/navigation";
import { parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTasks,
  fetchRoutinesWithToday,
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
  return "due_at";
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
    try { return parseISO(s); } catch { /* fall through */ }
  }
  return new Date();
}

function startOfWeekMon(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const dow = out.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
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
  const view = parseView(sp.view);
  const range = parseRange(sp.range);
  const anchor = parseAnchor(sp.date);

  // Sort + status only mean anything in the table view. Don't read them
  // from the URL on calendar/timeline — the route handler can still receive
  // them (e.g. from old bookmarks), but they're ignored, just as the views
  // ignore them. The view-switcher links also strip them on click.
  const filter = parseFilter(sp.filter);
  let status: SheetStatusFilter =
    view === "table" ? parseStatus(sp.status) : "all";
  const sortKey = parseSort(sp.sort);
  const sortDir = parseDir(sp.dir);

  // Status implies tasks. If the URL carries both `filter=routines` and
  // `status=open`, the previous behaviour silently showed an empty page.
  // Now we coerce to a sensible state instead.
  const effectiveFilter: SheetFilter =
    status !== "all" && filter !== "all" && filter !== "tasks" ? "tasks" : filter;

  if (view === "calendar") {
    const from = range === "day" ? new Date(anchor) : startOfWeekMon(anchor);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + (range === "day" ? 1 : 7));

    const items = await fetchCalendarItems(supabase, user.id, from, to);
    const nowMs = Date.now();

    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
        <SheetMasthead />
        <div className="mt-6 sm:mt-8">
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

  if (view === "timeline") {
    const plans = await fetchTimelinePlans(supabase, user.id);
    // Hide zero-item plans — they're noise on the gantt; the user can still
    // see them on /plans.
    const visible = plans.filter((p) => p.itemCount > 0);
    const nowMs = Date.now();
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
        <SheetMasthead />
        <div className="mt-6 sm:mt-8">
          <SheetControls
            totalCount={visible.length}
            activeFilter={filter}
            activeView={view}
          />
        </div>
        <TimelineView plans={visible} nowMs={nowMs} />
      </div>
    );
  }

  // ── TABLE view ──────────────────────────────────────────────────────
  // When the user has selected "completed" we also need completed tasks
  // in the row set; otherwise the table can show only the open lifecycle
  // states.
  const taskStatuses =
    status === "completed"
      ? (["pending", "in_progress", "missed", "completed"] as const)
      : (["pending", "in_progress", "missed"] as const);

  const [tasks, routines, workspaces, activitiesRes, remindersRes] = await Promise.all([
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

  // ── Group identical reminders by (kind, title, hour-bucket) so the
  // user sees one row with a ×N badge instead of five rows of "Go to gym
  // 6:00 am". Tasks/routines/activities never dedup — only reminders, which
  // are the only entity that frequently gets seeded multiple times by
  // recurrence + manual recreation.
  const dedupedRows = dedupRows(rows);

  // ── Filter pipeline.
  // 1. kind filter (effectiveFilter — already reconciled with status)
  // 2. status filter (only applies to tasks)
  const startOfTodayMs = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const startOfTomorrowMs = startOfTodayMs + 86400_000;
  const weekAgoMs = nowMs - 7 * 86400_000;

  let working = dedupedRows;
  if (effectiveFilter !== "all") {
    working = working.filter((r) => {
      if (effectiveFilter === "tasks")     return r.kind === "task";
      if (effectiveFilter === "routines")  return r.kind === "routine";
      if (effectiveFilter === "logs")      return r.kind === "activity";
      if (effectiveFilter === "reminders") return r.kind === "reminder";
      return true;
    });
  }
  if (status !== "all") {
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

  // ── Sort. Stable secondary key = original order.
  const decorated = working.map((r, i) => ({ r, i }));
  decorated.sort((a, b) => {
    const cmp = compareRows(a.r, b.r, sortKey);
    if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
    return a.i - b.i;
  });
  const sorted = decorated.map((x) => x.r);
  sorted.forEach((r, i) => (r.index = i + 1));

  // ── Stats counts.
  // Derived from the SAME task data the table uses so the strip never
  // contradicts the table ("done · 7d: 01" but zero visible rows).
  const taskCounts = computeTaskCounts(
    tasks,
    nowMs,
    startOfTodayMs,
    startOfTomorrowMs,
    weekAgoMs,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <SheetMasthead totalCount={sorted.length} />

      <div className="mt-6 sm:mt-8">
        <SheetStatsStrip counts={taskCounts} active={status} />
      </div>

      <div className="mt-8 sm:mt-10">
        <SheetControls
          totalCount={sorted.length}
          activeFilter={effectiveFilter}
          activeView={view}
        />
      </div>

      <div className="mt-4">
        {sorted.length === 0 ? (
          <EmptyState filter={effectiveFilter} status={status} />
        ) : (
          <SheetTable
            rows={sorted}
            nowMs={nowMs}
            sort={{ key: sortKey, dir: sortDir }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Visually collapse duplicate reminders into a single row with a ×N badge.
 * Only reminders dedup — they're the only entity that gets seeded by
 * recurrence into many DB rows the user thinks of as "one thing".
 */
function dedupRows(rows: SheetRowData[]): SheetRowData[] {
  const out: SheetRowData[] = [];
  const seen = new Map<string, SheetRowData>();
  for (const r of rows) {
    if (r.kind !== "reminder") {
      out.push(r);
      continue;
    }
    const hourBucket = r.whenIso
      ? new Date(r.whenIso).toISOString().slice(0, 13) // YYYY-MM-DDTHH
      : "no-time";
    const key = `${r.title.trim().toLowerCase()}|${hourBucket}`;
    const prev = seen.get(key);
    if (prev) {
      prev.duplicateCount = (prev.duplicateCount ?? 1) + 1;
    } else {
      const copy = { ...r, duplicateCount: 1 };
      seen.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

function computeTaskCounts(
  tasks: { status: string; due_at: string | null; completed_at: string | null }[],
  nowMs: number,
  startOfTodayMs: number,
  startOfTomorrowMs: number,
  weekAgoMs: number,
) {
  let open = 0;
  let dueToday = 0;
  let completedWeek = 0;
  let overdue = 0;
  for (const t of tasks) {
    const isOpen = t.status === "pending" || t.status === "in_progress";
    if (isOpen) open++;
    if (t.status === "completed" && t.completed_at) {
      if (new Date(t.completed_at).getTime() >= weekAgoMs) completedWeek++;
    }
    if (t.due_at && t.status !== "completed") {
      const d = new Date(t.due_at).getTime();
      if (d >= startOfTodayMs && d < startOfTomorrowMs) dueToday++;
      if (d < nowMs) overdue++;
    } else if (t.status === "missed") {
      overdue++;
    }
  }
  return { open, dueToday, completedWeek, overdue };
}

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

function SheetMasthead({ totalCount }: { totalCount?: number } = {}) {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="h-page-sm lowercase">sheet</h1>
        {typeof totalCount === "number" && (
          <span
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70 tabular-nums"
            aria-label={`${totalCount} items`}
          >
            · {totalCount} item{totalCount === 1 ? "" : "s"}
          </span>
        )}
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
    <div className="rounded-2xl border border-dashed border-[var(--hairline)] py-20 text-center">
      <p
        className="lowercase text-[20px] leading-[1.15] text-muted-foreground"
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
