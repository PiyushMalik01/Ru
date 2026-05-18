import { createClient } from "@/lib/supabase/server";
import { fetchTasks, type TaskRow as TaskRowType } from "@/lib/queries/dashboard";
import { TaskRow } from "@/components/dashboard/task-row";

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

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const all: TaskRowType[] = user
    ? await fetchTasks(supabase, user.id, {
        statuses: ["pending", "in_progress", "completed", "missed"],
      })
    : [];

  const sot = startOfToday();
  const eot = endOfToday();
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const isOpen = (t: TaskRowType) =>
    t.status === "pending" || t.status === "in_progress" || t.status === "missed";

  const today = all.filter((t) => {
    if (!isOpen(t)) return false;
    if (!t.due_at) return true; // no due date → bucketed into today
    const d = new Date(t.due_at);
    return d <= eot;
  });

  const upcoming = all.filter((t) => {
    if (!isOpen(t)) return false;
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    return d > eot;
  });

  const done = all.filter(
    (t) =>
      t.status === "completed" &&
      t.completed_at &&
      new Date(t.completed_at) >= fourteenDaysAgo
  );

  // Sort today: overdue first, then by due time, no-due last
  today.sort((a, b) => {
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ad - bd;
  });
  upcoming.sort((a, b) => {
    const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ad - bd;
  });
  done.sort((a, b) => {
    const ad = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const bd = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return bd - ad;
  });

  // Stats for header
  const openCount = today.length + upcoming.length;
  void sot; // sot computed for symmetry; tasks already filtered by query.

  return (
    <div className="space-y-12 py-2">
      {/* Header */}
      <header className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          tasks · {new Date().toLocaleDateString([], { weekday: "long" }).toLowerCase()}
        </div>
        <h1 className="mt-4 text-[36px] font-medium leading-[1.05] tracking-tight">
          {openCount === 0 && all.length === 0
            ? "A clear board."
            : openCount === 0
              ? "All caught up."
              : openCount === 1
                ? "One open thread."
                : "What's on."}
        </h1>
        <p
          className="mt-4 text-[15px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          {openCount === 0 && all.length === 0 ? (
            <>Nothing tracked yet. Tasks Ru picks up from your chats land here.</>
          ) : (
            <>
              <span className="font-mono tabular-nums text-foreground">
                {today.length}
              </span>
              <span className="font-mono"> today · </span>
              <span className="font-mono tabular-nums text-foreground">
                {upcoming.length}
              </span>
              <span className="font-mono"> upcoming · </span>
              <span className="font-mono tabular-nums text-foreground">
                {done.length}
              </span>
              <span className="font-mono"> done in the last two weeks.</span>
            </>
          )}
        </p>
      </header>

      {/* Today */}
      <Section
        eyebrow="today"
        sublabel={new Date()
          .toLocaleDateString([], { month: "short", day: "numeric" })
          .toLowerCase()}
        count={today.length}
      >
        {today.length === 0 ? (
          <EmptyLine>Nothing on for today. Talk to Ru if something&rsquo;s on your mind.</EmptyLine>
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
            />
          ))
        )}
      </Section>

      {/* Upcoming */}
      <Section eyebrow="upcoming" sublabel="from tomorrow" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <EmptyLine>The horizon is clear.</EmptyLine>
        ) : (
          upcoming.map((t) => (
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

      {/* Done (collapsible via <details>) */}
      {done.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors group-hover:text-foreground">
              done
            </span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
              last 14 days
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60 transition-colors group-hover:text-muted-foreground">
              {done.length.toString().padStart(2, "0")} · expand
            </span>
          </summary>
          <div className="mt-1">
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
          </div>
        </details>
      )}
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
      <div className="mb-1 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
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
    <div className="py-5 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}
