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
import {
  SheetRow,
  type SheetRowData,
} from "@/components/sheet/sheet-row";
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

  filtered.forEach((r, i) => (r.index = i + 1));

  const counts = {
    tasks:     rows.filter((r) => r.kind === "task").length,
    routines:  rows.filter((r) => r.kind === "routine").length,
    reminders: rows.filter((r) => r.kind === "reminder").length,
    logs:      rows.filter((r) => r.kind === "activity").length,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      <SheetMasthead />

      <div className="mt-10">
        <SheetControls
          totalCount={filtered.length}
          activeFilter={filter}
          activeView={view}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
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

function SheetMasthead() {
  return (
    <header className="flex items-baseline justify-between gap-4">
      <div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
          sheet
        </div>
        <h1 className="mt-3 font-display text-[36px] leading-[1.02] tracking-tight sm:text-[42px]">
          Every thread, in one column.
        </h1>
      </div>
      <div className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50 sm:block">
        tasks · routines · reminders · logs
      </div>
    </header>
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
