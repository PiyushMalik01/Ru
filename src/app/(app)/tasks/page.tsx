import { redirect } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTasks,
  fetchSheetTaskStats,
  type TaskRow as TaskRowType,
} from "@/lib/queries/dashboard";
import { listWorkspaces } from "@/lib/queries/workspace";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";
import { SheetRow, type SheetRowData } from "@/components/sheet/sheet-row";
import {
  SheetStatsStrip,
  type SheetStatusFilter,
} from "@/components/sheet/sheet-stats-strip";
import type { ItemStatus } from "@/components/app-shell/primitives";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const HERO_TITLES: Record<SheetStatusFilter, { title: string; subtitle: string }> = {
  all: {
    title: "the list.",
    subtitle:
      "everything you've agreed to do — sorted by when it's due, surfaced when it matters. tap a tile to scope the view.",
  },
  open: {
    title: "open list.",
    subtitle:
      "what's actually outstanding. tap a row to mark it done, or scope the view with another tile.",
  },
  today: {
    title: "today's list.",
    subtitle:
      "everything due before the day ends. when this is empty, the day is yours.",
  },
  overdue: {
    title: "catch up.",
    subtitle:
      "past their moment — finish, push, or scratch them. don't let them grow.",
  },
  completed: {
    title: "this week's wins.",
    subtitle: "tasks closed in the last seven days. proof of motion.",
  },
};

function parseStatus(v: string | string[] | undefined): SheetStatusFilter {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "open" || s === "today" || s === "overdue" || s === "completed") return s;
  return "all";
}

export default async function TasksPage({
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
  const status = parseStatus(sp.status);

  const [tasks, stats, workspaces] = await Promise.all([
    fetchTasks(supabase, user.id, {
      statuses: ["pending", "in_progress", "completed", "missed"],
    }),
    fetchSheetTaskStats(supabase, user.id),
    listWorkspaces(supabase, user.id),
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
  const startOfTodayMs = (() => {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const startOfTomorrowMs = startOfTodayMs + 86_400_000;
  const endOfWeekMs = startOfTodayMs + 7 * 86_400_000;
  const weekAgoMs = nowMs - 7 * 86_400_000;

  const isOpen = (t: TaskRowType) =>
    t.status === "pending" || t.status === "in_progress" || t.status === "missed";

  // Status filter narrows what the user sees. Counts are computed off the
  // unfiltered task set so the tiles always tell the truth.
  const scoped = tasks.filter((t) => {
    if (status === "all") return true;
    if (status === "open") return isOpen(t);
    if (status === "today") {
      if (!isOpen(t)) return false;
      if (!t.due_at) return true;
      const ms = new Date(t.due_at).getTime();
      return ms >= startOfTodayMs && ms < startOfTomorrowMs;
    }
    if (status === "overdue") {
      if (!isOpen(t)) return false;
      if (t.due_at) return new Date(t.due_at).getTime() < nowMs;
      return t.status === "missed";
    }
    if (status === "completed") {
      return (
        t.status === "completed" &&
        !!t.completed_at &&
        new Date(t.completed_at).getTime() >= weekAgoMs
      );
    }
    return true;
  });

  const toRow = (t: TaskRowType): SheetRowData => {
    const planId = taskPlanById.get(t.id) ?? null;
    return {
      index: 0,
      kind: "task",
      id: t.id,
      title: t.title,
      status: t.status as ItemStatus,
      whenIso: t.due_at,
      planId,
      planTitle: planId ? planById.get(planId) ?? null : null,
      meta: t.priority !== "medium" ? t.priority : null,
      isToggleable: true,
    };
  };

  const today: SheetRowData[] = [];
  const thisWeek: SheetRowData[] = [];
  const later: SheetRowData[] = [];
  const done: SheetRowData[] = [];

  for (const t of scoped) {
    const row = toRow(t);
    if (t.status === "completed") {
      done.push(row);
      continue;
    }
    if (!isOpen(t)) continue;
    if (!t.due_at) {
      today.push(row);
      continue;
    }
    const ms = new Date(t.due_at).getTime();
    if (ms < startOfTomorrowMs) today.push(row);
    else if (ms < endOfWeekMs) thisWeek.push(row);
    else later.push(row);
  }

  const cmpWhen = (a: SheetRowData, b: SheetRowData) => {
    const av = a.whenIso ? new Date(a.whenIso).getTime() : Infinity;
    const bv = b.whenIso ? new Date(b.whenIso).getTime() : Infinity;
    return av - bv;
  };
  today.sort(cmpWhen);
  thisWeek.sort(cmpWhen);
  later.sort(cmpWhen);
  done.sort((a, b) => {
    // most recently settled first — completed_at lives on the task, not the row,
    // so we approximate by whenIso (due_at) descending as a deterministic order.
    const av = a.whenIso ? new Date(a.whenIso).getTime() : 0;
    const bv = b.whenIso ? new Date(b.whenIso).getTime() : 0;
    return bv - av;
  });

  const totalVisible = today.length + thisWeek.length + later.length + done.length;
  const heroCopy = HERO_TITLES[status];
  const todayLabel = format(new Date(nowMs), "MMM d").toLowerCase();
  const eyebrow = `tasks · ${format(new Date(nowMs), "EEE MMM d").toLowerCase()} · ${totalVisible} item${totalVisible === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={eyebrow}
        title={heroCopy.title}
        subtitle={heroCopy.subtitle}
      />

      <div className="mt-7">
        <SheetStatsStrip
          counts={{
            open: stats.open,
            dueToday: stats.dueToday,
            completedWeek: stats.completedWeek,
            overdue: stats.overdue,
          }}
          active={status}
        />
      </div>

      {totalVisible === 0 ? (
        <div className="mt-10">
          <EmptyState status={status} />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-7">
          <Section
            eyebrow="today"
            sublabel={todayLabel}
            accent="var(--entity-task)"
            rows={today}
            nowMs={nowMs}
            highlightToday
          />
          <Section
            eyebrow="this week"
            sublabel="next 7 days"
            accent="var(--entity-task)"
            rows={thisWeek}
            nowMs={nowMs}
          />
          <Section
            eyebrow="later"
            sublabel="beyond 7 days"
            accent="var(--entity-task)"
            rows={later}
            nowMs={nowMs}
          />
          <Section
            eyebrow="done"
            sublabel="last 7 days"
            accent="var(--muted-foreground)"
            rows={done}
            nowMs={nowMs}
          />
        </div>
      )}
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

function EmptyState({ status }: { status: SheetStatusFilter }) {
  const msg =
    status === "open"
      ? "nothing open. the page is clear"
      : status === "today"
        ? "nothing due today. a rare gift"
        : status === "overdue"
          ? "nothing overdue. right on time"
          : status === "completed"
            ? "no tasks finished in the last seven days"
            : "no tasks yet. tell ru what's on your mind";
  return (
    <div className="rounded-2xl border border-dashed border-[var(--hairline)] py-20 text-center">
      <p
        className="text-[18px] leading-[1.2] text-muted-foreground"
        style={{
          fontVariationSettings: "'wght' 500, 'wdth' 96",
          letterSpacing: "-0.015em",
        }}
      >
        {msg}
      </p>
    </div>
  );
}
