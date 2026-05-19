import { createClient } from "@/lib/supabase/server";
import { fetchInsights, type InsightsBundle } from "@/lib/queries/dashboard";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { BentoCompletion } from "@/components/insights/bento-completion";
import { BentoBestStreak } from "@/components/insights/bento-best-streak";
import { BentoActivityTotal } from "@/components/insights/bento-activity-total";
import { BentoTopCategory } from "@/components/insights/bento-top-category";
import { RoutineLeaderboard } from "@/components/insights/routine-leaderboard";
import { CategoryBreakdown } from "@/components/insights/category-breakdown";
import { MonthDeltas } from "@/components/insights/month-deltas";

export const dynamic = "force-dynamic";

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    })
    .toUpperCase();
  const endStr = end
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
  return `${startStr} — ${endStr}`;
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const todayIso = new Date().toISOString().slice(0, 10);
  const startSeed = new Date();
  startSeed.setDate(startSeed.getDate() - 29);
  const startSeedIso = startSeed.toISOString().slice(0, 10);

  const empty: InsightsBundle = {
    routineStats: [],
    taskRate: { total: 0, completed: 0, rate: 0 },
    activityByCategory: [],
    weeklyHeatmap: [],
    range: { startIso: startSeedIso, endIso: todayIso, days: 30 },
    prior: { tasksCreated: 0, tasksCompleted: 0, activitiesLogged: 0 },
  };

  const data: InsightsBundle = user ? await fetchInsights(supabase, user.id, 30) : empty;

  const totalActivities = data.activityByCategory.reduce((s, x) => s + x.count, 0);
  const sortedRoutines = [...data.routineStats].sort(
    (a, b) => b.streak - a.streak || b.rate30 - a.rate30,
  );
  const bestRoutine = sortedRoutines[0] ?? null;
  const topCategory = data.activityByCategory[0] ?? null;

  const rangeLabel = formatRange(data.range.startIso, data.range.endIso);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32">
      {/* Hero band */}
      <header className="flex flex-col gap-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Insights · last 30 days
        </div>
        <h1 className="font-display text-[44px] leading-[1.02] tracking-tight text-foreground sm:text-[68px]">
          The shape of a month.
        </h1>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <p
            className="max-w-xl text-[15px] text-muted-foreground"
            style={{ lineHeight: 1.6 }}
          >
            Patterns and pace, calculated quietly in the background. No scoring, no
            judgement — just what showed up.
          </p>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] tabular-nums text-muted-foreground/80">
            {rangeLabel}
          </div>
        </div>
      </header>

      {/* Stat bento grid — asymmetric, four headline tiles */}
      <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-4">
        <BentoCompletion
          rate={data.taskRate.rate}
          completed={data.taskRate.completed}
          total={data.taskRate.total}
          className="lg:col-span-1"
        />
        <BentoBestStreak
          title={bestRoutine?.title ?? null}
          days={bestRoutine?.streak ?? 0}
          className="lg:col-span-1"
        />
        <BentoActivityTotal
          total={totalActivities}
          series={data.weeklyHeatmap}
          delta={
            data.prior.activitiesLogged === 0
              ? totalActivities > 0
                ? 100
                : null
              : ((totalActivities - data.prior.activitiesLogged) /
                  data.prior.activitiesLogged) *
                100
          }
          className="lg:col-span-1"
        />
        <BentoTopCategory
          category={topCategory?.category ?? null}
          count={topCategory?.count ?? 0}
          total={totalActivities}
          className="lg:col-span-1"
        />
      </section>

      {/* Activity heatmap — centerpiece */}
      <section className="mt-20">
        <SectionHead
          eyebrow="Activity"
          title="Every day, in a grid."
          meta={`${totalActivities.toString().padStart(3, "0")} entries`}
        />
        <div className="mt-8 overflow-x-auto">
          <ActivityHeatmap days={data.weeklyHeatmap} />
        </div>
        {totalActivities > 0 && <HeatmapLegend />}
      </section>

      {/* Routine leaderboard */}
      <section className="mt-20">
        <SectionHead
          eyebrow="Routines"
          title="The streak board."
          meta={`${sortedRoutines.length.toString().padStart(2, "0")} active`}
        />
        <div className="mt-6">
          <RoutineLeaderboard routines={sortedRoutines} />
        </div>
      </section>

      {/* Category breakdown */}
      <section className="mt-20">
        <SectionHead
          eyebrow="By category"
          title="What you logged."
          meta={`${data.activityByCategory.length
            .toString()
            .padStart(2, "0")} categories`}
        />
        <div className="mt-6">
          <CategoryBreakdown items={data.activityByCategory} />
        </div>
      </section>

      {/* Month-over-month deltas */}
      <section className="mt-20">
        <SectionHead
          eyebrow="Vs prior 30 days"
          title="What changed."
          meta="month over month"
        />
        <div className="mt-6">
          <MonthDeltas
            items={[
              {
                label: "Tasks completed",
                current: data.taskRate.completed,
                prior: data.prior.tasksCompleted,
                entityColor: "var(--entity-task)",
              },
              {
                label: "Tasks created",
                current: data.taskRate.total,
                prior: data.prior.tasksCreated,
                entityColor: "var(--entity-task)",
              },
              {
                label: "Activities logged",
                current: totalActivities,
                prior: data.prior.activitiesLogged,
                entityColor: "var(--entity-activity)",
              },
              {
                label: "Active routines",
                current: sortedRoutines.length,
                prior: sortedRoutines.length,
                entityColor: "var(--entity-routine)",
              },
            ]}
          />
        </div>
      </section>

      {/* Colophon */}
      <footer className="mt-24 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        <span>ru. — insights</span>
        <span>vol · {data.range.endIso}</span>
      </footer>
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  meta,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
}) {
  return (
    <div
      className="flex flex-wrap items-end justify-between gap-3 border-b pb-4"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className="mt-2 font-display text-[28px] leading-[1.05] tracking-tight sm:text-[36px]">
          {title}
        </h2>
      </div>
      {meta && (
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums text-muted-foreground/70">
          {meta}
        </div>
      )}
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="mt-6 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
      <span>less</span>
      <span
        className="h-[10px] w-[10px] rounded-[2px]"
        style={{ background: "var(--hairline-soft)" }}
      />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/10" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/30" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/55" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/85" />
      <span>more</span>
    </div>
  );
}
