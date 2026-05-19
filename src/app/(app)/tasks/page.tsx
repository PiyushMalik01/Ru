import { createClient } from "@/lib/supabase/server";
import {
  fetchTasks,
  fetchSheetTaskStats,
  type TaskRow as TaskRowType,
} from "@/lib/queries/dashboard";
import { TaskRow } from "@/components/dashboard/task-row";
import {
  TaskStatBento,
  type TaskFilter,
} from "@/components/tasks/task-stat-bento";

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfNextWeek(): Date {
  // 7 days from end-of-today
  const d = endOfToday();
  d.setDate(d.getDate() + 7);
  return d;
}

function parseFilter(value: string | string[] | undefined): TaskFilter {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "open" || v === "today" || v === "overdue" || v === "completed") return v;
  return "all";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = await searchParams;
  const filter = parseFilter(sp.status);

  const [all, stats]: [TaskRowType[], Awaited<ReturnType<typeof fetchSheetTaskStats>>] =
    user
      ? await Promise.all([
          fetchTasks(supabase, user.id, {
            statuses: ["pending", "in_progress", "completed", "missed"],
          }),
          fetchSheetTaskStats(supabase, user.id),
        ])
      : [[], { open: 0, dueToday: 0, completedWeek: 0, overdue: 0 }];

  const nowMs = Date.now();
  const eot = endOfToday().getTime();
  const eow = startOfNextWeek().getTime();
  const sevenDaysAgo = nowMs - 7 * 86_400_000;

  const isOpen = (t: TaskRowType) =>
    t.status === "pending" || t.status === "in_progress" || t.status === "missed";

  // First, apply the URL filter — this is what the user sees.
  const scoped: TaskRowType[] = all.filter((t) => {
    switch (filter) {
      case "open":
        return isOpen(t);
      case "today":
        if (!isOpen(t)) return false;
        if (!t.due_at) return true;
        return new Date(t.due_at).getTime() <= eot;
      case "overdue":
        if (!isOpen(t)) return false;
        if (!t.due_at) return false;
        return new Date(t.due_at).getTime() < nowMs;
      case "completed":
        return (
          t.status === "completed" &&
          !!t.completed_at &&
          new Date(t.completed_at).getTime() >= sevenDaysAgo
        );
      case "all":
      default:
        return true;
    }
  });

  // Group the scoped set into Today / This week / Later / Done sections.
  const today: TaskRowType[] = [];
  const thisWeek: TaskRowType[] = [];
  const later: TaskRowType[] = [];
  const done: TaskRowType[] = [];

  for (const t of scoped) {
    if (t.status === "completed") {
      done.push(t);
      continue;
    }
    if (!isOpen(t)) continue;
    if (!t.due_at) {
      today.push(t);
      continue;
    }
    const ms = new Date(t.due_at).getTime();
    if (ms <= eot) today.push(t);
    else if (ms <= eow) thisWeek.push(t);
    else later.push(t);
  }

  const cmpDue = (a: TaskRowType, b: TaskRowType) => {
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ad - bd;
  };
  today.sort(cmpDue);
  thisWeek.sort(cmpDue);
  later.sort(cmpDue);
  done.sort((a, b) => {
    const ad = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bd = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bd - ad;
  });

  const head = (() => {
    const d = new Date();
    return {
      weekday: d.toLocaleDateString([], { weekday: "long" }).toUpperCase(),
      date: d.toLocaleDateString([], { day: "numeric", month: "short" }).toUpperCase(),
    };
  })();

  const totalVisible = today.length + thisWeek.length + later.length + done.length;
  const filterLabel: Record<TaskFilter, string> = {
    all: "all tasks",
    open: "open only",
    today: "due today",
    overdue: "overdue",
    completed: "settled this week",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      {/* Hero band */}
      <header>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          tasks · {head.weekday} {head.date}
        </div>
        <h1 className="mt-4 font-display text-[44px] leading-[0.98] tracking-[-0.02em] sm:text-[56px]">
          The list.
        </h1>
        <p className="mt-4 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
          Everything you&rsquo;ve agreed to do — sorted by when it&rsquo;s due,
          surfaced when it matters. Tap a tile to scope the view.
        </p>
      </header>

      {/* Stat bento — four cobalt tiles, click-to-filter */}
      <div className="mt-10">
        <TaskStatBento
          open={stats.open}
          today={stats.dueToday}
          overdue={stats.overdue}
          completedThisWeek={stats.completedWeek}
          active={filter}
        />
      </div>

      {/* Filter context strip */}
      {filter !== "all" && (
        <div className="mt-6 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-[2px]"
            style={{ background: "var(--entity-task)" }}
            aria-hidden
          />
          <span>scope · {filterLabel[filter]}</span>
          <span className="text-muted-foreground/30">·</span>
          <span className="tabular-nums">
            {totalVisible.toString().padStart(2, "0")} matching
          </span>
          <a
            href="/tasks"
            className="ru-link ml-auto text-foreground hover:text-foreground"
          >
            clear filter
          </a>
        </div>
      )}

      {/* Grouped sections */}
      <div className="mt-12 space-y-12">
        <Section
          eyebrow="today"
          sublabel={new Date()
            .toLocaleDateString([], { month: "short", day: "numeric" })
            .toLowerCase()}
          count={today.length}
        >
          {today.length === 0 ? (
            <EmptyLine>Nothing on for today.</EmptyLine>
          ) : (
            today.map((t) => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status}
                priority={t.priority}
                dueAt={t.due_at}
                tags={t.tags ?? []}
                highlightToday
              />
            ))
          )}
        </Section>

        <Section eyebrow="this week" sublabel="next 7 days" count={thisWeek.length}>
          {thisWeek.length === 0 ? (
            <EmptyLine>The week is clear.</EmptyLine>
          ) : (
            thisWeek.map((t) => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status}
                priority={t.priority}
                dueAt={t.due_at}
                tags={t.tags ?? []}
              />
            ))
          )}
        </Section>

        <Section eyebrow="later" sublabel="beyond 7 days" count={later.length}>
          {later.length === 0 ? (
            <EmptyLine>The horizon is empty.</EmptyLine>
          ) : (
            later.map((t) => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status}
                priority={t.priority}
                dueAt={t.due_at}
                tags={t.tags ?? []}
              />
            ))
          )}
        </Section>

        {done.length > 0 && (
          <Section eyebrow="done" sublabel="recently settled" count={done.length}>
            {done.map((t) => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status}
                priority={t.priority}
                dueAt={t.due_at}
                tags={t.tags ?? []}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  sublabel,
  count,
  children,
}: {
  eyebrow: string;
  sublabel?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-3 border-b border-[var(--hairline)] pb-3">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: "var(--entity-task)" }}
          aria-hidden
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          {eyebrow}
        </span>
        {sublabel && (
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
            {sublabel}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
          {count.toString().padStart(2, "0")}
        </span>
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-5 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/55">
      {children}
    </div>
  );
}
