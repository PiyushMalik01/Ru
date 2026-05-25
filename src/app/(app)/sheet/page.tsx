import { redirect } from "next/navigation";
import { parseISO, format } from "date-fns";
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
import { SheetRow, type SheetRowData } from "@/components/sheet/sheet-row";
import {
  SheetStatsStrip,
  type SheetStatusFilter,
} from "@/components/sheet/sheet-stats-strip";
import { HeroBand } from "@/components/sheet/hero-band";
import { SectionHead } from "@/components/sheet/section-head";
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

const HERO_TITLES: Record<SheetStatusFilter, { title: string; subtitle: string }> = {
  all:       { title: "the list.",        subtitle: "tasks, routines, reminders, and logs — everything ru is holding for you, grouped by when it matters." },
  open:      { title: "open list.",       subtitle: "what's actually outstanding. tap a row to mark it done, or scope the view with another tile." },
  today:     { title: "today's list.",    subtitle: "everything due before the day ends. when this is empty, the day is yours." },
  overdue:   { title: "catch up.",        subtitle: "past their moment — finish, push, or scratch them. don't let them grow." },
  completed: { title: "this week's wins.", subtitle: "tasks closed in the last seven days. proof of motion." },
};

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
  const filter = parseFilter(sp.filter);
  const status: SheetStatusFilter =
    view === "table" ? parseStatus(sp.status) : "all";

  if (view === "calendar") {
    const from = range === "day" ? new Date(anchor) : startOfWeekMon(anchor);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + (range === "day" ? 1 : 7));

    const items = await fetchCalendarItems(supabase, user.id, from, to);
    const nowMs = Date.now();

    return (
      <PageShell view="calendar">
        <HeroBand
          eyebrow={`sheet · ${format(new Date(nowMs), "EEE MMM d").toLowerCase()} · ${items.length} items`}
          title="this week, by hour."
          subtitle="every scheduled thing laid out across the days — tap a block to act."
          trailing={<SheetControls totalCount={items.length} activeFilter={filter} activeView={view} />}
        />
        <CalendarView items={items} anchor={from} mode={range} nowMs={nowMs} />
      </PageShell>
    );
  }

  if (view === "timeline") {
    const plans = await fetchTimelinePlans(supabase, user.id);
    const visible = plans.filter((p) => p.itemCount > 0);
    const nowMs = Date.now();
    return (
      <PageShell view="timeline">
        <HeroBand
          eyebrow={`sheet · ${visible.length} plan${visible.length === 1 ? "" : "s"}`}
          title="plans across time."
          subtitle="every multi-step thing ru helped you set up, laid out as a horizon."
          trailing={<SheetControls totalCount={visible.length} activeFilter={filter} activeView={view} />}
        />
        <TimelineView plans={visible} nowMs={nowMs} />
      </PageShell>
    );
  }

  // ── TABLE view (the canonical lens) ──────────────────────────────────
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

  // Dedup identical reminders (5 "Go to gym 6am" → 1 row with ×5).
  const dedupedRows = dedupRows(rows);

  // Status filter narrows the entire set to tasks satisfying the lifecycle.
  const startOfTodayMs = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const startOfTomorrowMs = startOfTodayMs + 86400_000;
  const weekAgoMs = nowMs - 7 * 86400_000;

  let working = dedupedRows;
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

  // ── Time-bucket grouping (mobile-inspired).
  const buckets = groupByTime(working, nowMs);
  const taskCounts = computeTaskCounts(
    tasks,
    nowMs,
    startOfTodayMs,
    startOfTomorrowMs,
    weekAgoMs,
  );

  const heroCopy = HERO_TITLES[status];
  const todayLabel = format(new Date(nowMs), "MMM d").toLowerCase();

  return (
    <PageShell view="table">
      <HeroBand
        eyebrow={`sheet · ${format(new Date(nowMs), "EEE MMM d").toLowerCase()} · ${working.length} item${working.length === 1 ? "" : "s"}`}
        title={heroCopy.title}
        subtitle={heroCopy.subtitle}
        trailing={<SheetControls totalCount={working.length} activeFilter={filter} activeView={view} />}
      />

      <div className="mt-7">
        <SheetStatsStrip counts={taskCounts} active={status} />
      </div>

      {working.length === 0 ? (
        <div className="mt-10">
          <EmptyState filter={filter} status={status} />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-7">
          <Section
            eyebrow="today"
            sublabel={todayLabel}
            accent="var(--entity-task)"
            rows={buckets.today}
            nowMs={nowMs}
            highlightToday
          />
          <Section
            eyebrow="this week"
            sublabel="next 7 days"
            accent="var(--entity-task)"
            rows={buckets.thisWeek}
            nowMs={nowMs}
          />
          <Section
            eyebrow="later"
            sublabel="beyond 7 days"
            accent="var(--entity-task)"
            rows={buckets.later}
            nowMs={nowMs}
          />
          <Section
            eyebrow="routines"
            sublabel="recurring practice"
            accent="var(--entity-routine)"
            rows={buckets.routines}
            nowMs={nowMs}
          />
          <Section
            eyebrow="recent activity"
            sublabel="last 30 days"
            accent="var(--entity-activity)"
            rows={buckets.activity}
            nowMs={nowMs}
          />
          <Section
            eyebrow="done"
            sublabel="last 7 days"
            accent="var(--muted-foreground)"
            rows={buckets.done}
            nowMs={nowMs}
          />
        </div>
      )}
    </PageShell>
  );
}

function PageShell({
  view,
  children,
}: {
  view: SheetView;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      {children}
    </div>
  );
}

function Section({
  eyebrow,
  sublabel,
  accent,
  rows,
  nowMs,
  highlightToday,
}: {
  eyebrow: string;
  sublabel: string;
  accent: string;
  rows: SheetRowData[];
  nowMs: number;
  highlightToday?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHead
        eyebrow={eyebrow}
        sublabel={sublabel}
        count={rows.length}
        accent={accent}
      />
      <div className="mt-1">
        {rows.map((r) => (
          <SheetRow
            key={`${r.kind}-${r.id}`}
            row={r}
            nowMs={nowMs}
            highlightToday={highlightToday}
          />
        ))}
      </div>
    </section>
  );
}

interface Buckets {
  today: SheetRowData[];
  thisWeek: SheetRowData[];
  later: SheetRowData[];
  routines: SheetRowData[];
  activity: SheetRowData[];
  done: SheetRowData[];
}

/**
 * Split the unified row set into time-based buckets. Routines and
 * activities get their own buckets (they don't have a natural due date).
 * Done tasks go to the "done" bucket if completed within the last week.
 */
function groupByTime(rows: SheetRowData[], nowMs: number): Buckets {
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400_000;
  const endOfWeek = startOfToday + 7 * 86400_000;

  const out: Buckets = {
    today: [],
    thisWeek: [],
    later: [],
    routines: [],
    activity: [],
    done: [],
  };

  for (const r of rows) {
    if (r.kind === "routine") {
      out.routines.push(r);
      continue;
    }
    if (r.kind === "activity") {
      out.activity.push(r);
      continue;
    }
    if (r.status === "completed") {
      out.done.push(r);
      continue;
    }
    // task or reminder with a due date
    if (!r.whenIso) {
      out.today.push(r); // no due date → "today" bucket (act on it now)
      continue;
    }
    const t = new Date(r.whenIso).getTime();
    if (t < endOfToday) {
      out.today.push(r);
    } else if (t < endOfWeek) {
      out.thisWeek.push(r);
    } else {
      out.later.push(r);
    }
  }

  const cmpWhen = (a: SheetRowData, b: SheetRowData) => {
    const av = a.whenIso ? new Date(a.whenIso).getTime() : 0;
    const bv = b.whenIso ? new Date(b.whenIso).getTime() : 0;
    return av - bv;
  };
  out.today.sort(cmpWhen);
  out.thisWeek.sort(cmpWhen);
  out.later.sort(cmpWhen);
  out.activity.sort((a, b) => {
    const av = a.whenIso ? new Date(a.whenIso).getTime() : 0;
    const bv = b.whenIso ? new Date(b.whenIso).getTime() : 0;
    return bv - av; // recent first
  });

  return out;
}

function dedupRows(rows: SheetRowData[]): SheetRowData[] {
  const out: SheetRowData[] = [];
  const seen = new Map<string, SheetRowData>();
  for (const r of rows) {
    if (r.kind !== "reminder") {
      out.push(r);
      continue;
    }
    const hourBucket = r.whenIso
      ? new Date(r.whenIso).toISOString().slice(0, 13)
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

function EmptyState({
  filter,
  status,
}: {
  filter: SheetFilter;
  status: SheetStatusFilter;
}) {
  const msg =
    status === "open"
      ? "nothing open. the page is clear."
      : status === "today"
        ? "nothing due today. a rare gift."
        : status === "overdue"
          ? "nothing overdue. right on time."
          : status === "completed"
            ? "no tasks finished in the last seven days."
            : filter === "tasks"
              ? "no tasks yet. tell ru what's on your mind."
              : filter === "routines"
                ? "no active routines. ru picks them up from your patterns."
                : filter === "logs"
                  ? "the log is empty. ru fills this in as you live the day."
                  : filter === "reminders"
                    ? "no pending reminders."
                    : "the sheet is empty.";
  return (
    <div className="rounded-2xl border border-dashed border-[var(--hairline)] py-20 text-center">
      <p
        className="text-[18px] leading-[1.2] text-muted-foreground"
        style={{
          fontVariationSettings: "'wght' 500, 'wdth' 96",
          letterSpacing: "-0.015em",
        }}
      >
        {msg.replace(/\.$/, "")}
      </p>
    </div>
  );
}
