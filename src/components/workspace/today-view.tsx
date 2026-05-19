"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/app-shell/relative-time";
import type { TodayBundle } from "@/lib/queries/workspace";
import { toggleTaskCompleteInWorkspace } from "@/app/(app)/chat/workspace-actions";
import { toggleRoutineToday } from "@/app/(app)/routines/actions";
import { useRouter } from "next/navigation";

interface Props {
  bundle: TodayBundle;
}

function formatDue(due: string | null): string {
  if (!due) return "no date";
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return "no date";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      .toLowerCase()
      .replace(" ", "");
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRoutineTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((x) => Number.parseInt(x, 10));
  if (Number.isNaN(h)) return null;
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${period}`;
}

const priorityDot: Record<string, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-error",
};

export function TodayView({ bundle }: Props) {
  const hasTasks = bundle.tasksDueToday.length > 0;
  const hasRoutines = bundle.activeRoutines.length > 0;
  const hasActivity = bundle.recentActivities.length > 0;

  if (!hasTasks && !hasRoutines && !hasActivity) {
    return (
      <div className="border-t border-border/60 pt-10 pb-6 text-center">
        <div className="mx-auto max-w-[32ch]">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            no items yet
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            As you talk to Ru, tasks, routines, and activity will show up here.
            Try &ldquo;remind me to call mom tonight&rdquo;.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {hasTasks && (
        <Section title="tasks" count={bundle.tasksDueToday.length}>
          {bundle.tasksDueToday.slice(0, 8).map((t) => (
            <TodayTaskRow key={t.id} task={t} />
          ))}
        </Section>
      )}

      {hasRoutines && (
        <Section title="routines" count={bundle.activeRoutines.length}>
          {bundle.activeRoutines.map((r) => (
            <TodayRoutineRow key={r.id} routine={r} />
          ))}
        </Section>
      )}

      {hasActivity && (
        <Section title="recent activity" count={bundle.recentActivities.length}>
          {bundle.recentActivities.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 border-b border-border/60 py-2.5 pl-1 pr-2"
            >
              <span
                className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
                aria-hidden
              />
              <div className="min-w-0 flex-1 truncate text-[13.5px] leading-tight text-foreground">
                {a.activity}
              </div>
              <div className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {a.category} · <RelativeTime iso={a.timestamp} />
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          {count}
        </span>
      </div>
      <div className="border-t border-border/60">{children}</div>
    </section>
  );
}

function TodayTaskRow({
  task,
}: {
  task: TodayBundle["tasksDueToday"][number];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticComplete, setOptimisticComplete] = useState(
    task.status === "completed"
  );

  function handleToggle() {
    setOptimisticComplete((v) => !v);
    startTransition(async () => {
      await toggleTaskCompleteInWorkspace(task.id);
      router.refresh();
    });
  }

  const completed = optimisticComplete;
  const dot = priorityDot[task.priority] ?? "bg-muted-foreground/50";

  return (
    <div
      className={cn(
        "group/row flex items-center gap-3 border-b border-border/60 py-2.5 pl-1 pr-2 transition-colors",
        "hover:bg-[rgba(255,255,255,0.02)]",
        isPending && "opacity-70"
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {completed ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <span
        className={cn(
          "h-1 w-1 shrink-0 rounded-full",
          completed ? "bg-muted-foreground/30" : dot
        )}
        aria-hidden
      />

      <div
        className={cn(
          "min-w-0 flex-1 truncate text-[13.5px] leading-tight transition-colors",
          completed ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {task.title}
      </div>

      <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <Calendar className="h-3 w-3" aria-hidden />
        {formatDue(task.due_at)}
      </div>
    </div>
  );
}

function TodayRoutineRow({
  routine,
}: {
  routine: TodayBundle["activeRoutines"][number];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(routine.todayCompleted);

  function handleToggle() {
    setOptimistic((v) => !v);
    startTransition(async () => {
      await toggleRoutineToday(routine.id);
      router.refresh();
    });
  }

  const time = formatRoutineTime(routine.time_of_day);
  const done = optimistic;

  return (
    <div
      className={cn(
        "group/row flex items-center gap-3 border-b border-border/60 py-2.5 pl-1 pr-2 transition-colors",
        "hover:bg-[rgba(255,255,255,0.02)]",
        isPending && "opacity-70"
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-label={done ? "Undo" : "Mark done"}
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      <div
        className={cn(
          "min-w-0 flex-1 truncate text-[13.5px] leading-tight transition-colors",
          done ? "text-muted-foreground line-through" : "text-foreground"
        )}
      >
        {routine.title}
      </div>

      {time && (
        <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden />
          {time}
        </div>
      )}
    </div>
  );
}
