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
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";

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
    .toLowerCase();
  const endStr = end
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toLowerCase();
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
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`insights · last 30 days · ${rangeLabel}`}
        title="the shape of a month."
        subtitle="patterns and pace, calculated quietly in the background. no scoring, no judgement — just what showed up."
      />

      {/* Stat bento grid — 2×2 on phones, 1×4 on desktop */}
      <section className="mt-7 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <BentoCompletion
          rate={data.taskRate.rate}
          completed={data.taskRate.completed}
          total={data.taskRate.total}
        />
        <BentoBestStreak
          title={bestRoutine?.title ?? null}
          days={bestRoutine?.streak ?? 0}
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
        />
        <BentoTopCategory
          category={topCategory?.category ?? null}
          count={topCategory?.count ?? 0}
          total={totalActivities}
        />
      </section>

      <div className="mt-12 flex flex-col gap-10">
        <section>
          <SectionHead
            eyebrow="activity"
            sublabel="every day, in a grid"
            count={totalActivities}
            accent="var(--entity-activity)"
          />
          <div className="mt-5 overflow-x-auto">
            <ActivityHeatmap days={data.weeklyHeatmap} />
          </div>
          {totalActivities > 0 && <HeatmapLegend />}
        </section>

        <section>
          <SectionHead
            eyebrow="routines"
            sublabel="the streak board"
            count={sortedRoutines.length}
            accent="var(--entity-routine)"
          />
          <div className="mt-5">
            <RoutineLeaderboard routines={sortedRoutines} />
          </div>
        </section>

        <section>
          <SectionHead
            eyebrow="by category"
            sublabel="what you logged"
            count={data.activityByCategory.length}
            accent="var(--entity-activity)"
          />
          <div className="mt-5">
            <CategoryBreakdown items={data.activityByCategory} />
          </div>
        </section>

        <section>
          <SectionHead
            eyebrow="vs prior 30 days"
            sublabel="what changed"
            count={4}
            accent="var(--entity-insight)"
          />
          <div className="mt-5">
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
      </div>
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
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
