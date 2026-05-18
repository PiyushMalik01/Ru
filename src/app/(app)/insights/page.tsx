import { createClient } from "@/lib/supabase/server";
import { fetchInsights, type InsightsBundle } from "@/lib/queries/dashboard";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: InsightsBundle = {
    routineStats: [],
    taskRate: { total: 0, completed: 0, rate: 0 },
    activityByCategory: [],
    weeklyHeatmap: [],
  };

  const data: InsightsBundle = user ? await fetchInsights(supabase, user.id, 30) : empty;

  const totalActivities = data.activityByCategory.reduce((s, x) => s + x.count, 0);
  const sortedRoutines = [...data.routineStats].sort((a, b) => b.streak - a.streak);

  return (
    <div className="space-y-16 py-2">
      {/* Header */}
      <header className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          insights · 30 days
        </div>
        <h1 className="mt-4 text-[36px] font-medium leading-[1.05] tracking-tight">
          The shape of a month.
        </h1>
        <p
          className="mt-4 text-[15px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          Patterns and pace, calculated quietly in the background. No scoring, no
          judgement — just what showed up.
        </p>
      </header>

      {/* Hero strip — three big mono numbers */}
      <section className="grid grid-cols-3 gap-x-8 border-y border-[rgba(255,255,255,0.08)] py-8">
        <HeroNumber value={data.routineStats.length} label="active routines" />
        <HeroNumber
          value={`${data.taskRate.rate}%`}
          label="tasks completed · 30d"
          dim={data.taskRate.total === 0}
        />
        <HeroNumber
          value={totalActivities}
          label="activities logged · 30d"
          dim={totalActivities === 0}
        />
      </section>

      {/* Routines table */}
      <section>
        <div className="mb-1 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
            routines
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
            streak · 7d · 30d
          </span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {sortedRoutines.length.toString().padStart(2, "0")}
          </span>
        </div>
        {sortedRoutines.length === 0 ? (
          <EmptyLine>No routines tracked. Tell Ru about a habit to start one.</EmptyLine>
        ) : (
          <div>
            {sortedRoutines.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-4 border-b border-[rgba(255,255,255,0.05)] py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium leading-tight">
                    {r.title}
                  </div>
                  <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${Math.min(100, r.rate30)}%` }}
                    />
                  </div>
                </div>
                <Stat label="streak">{r.streak}</Stat>
                <Stat label="7d">{r.rate7}<span className="text-muted-foreground/60">%</span></Stat>
                <Stat label="30d">{r.rate30}<span className="text-muted-foreground/60">%</span></Stat>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Heatmap */}
      <section>
        <div className="mb-5 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
            activity
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
            last 30 days
          </span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {totalActivities.toString().padStart(3, "0")} entries
          </span>
        </div>
        <ActivityHeatmap days={data.weeklyHeatmap} />
        {totalActivities > 0 && <HeatmapLegend />}
      </section>

      {/* By category */}
      <section>
        <div className="mb-1 flex items-baseline gap-3 border-b border-[rgba(255,255,255,0.08)] pb-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
            by category
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/60">
            what you logged
          </span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {data.activityByCategory.length.toString().padStart(2, "0")}
          </span>
        </div>
        {data.activityByCategory.length === 0 ? (
          <EmptyLine>Nothing categorised yet — start logging via chat.</EmptyLine>
        ) : (
          <CategoryBars items={data.activityByCategory} />
        )}
      </section>
    </div>
  );
}

function HeroNumber({
  value,
  label,
  dim = false,
}: {
  value: number | string;
  label: string;
  dim?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-mono text-[52px] font-extralight leading-none tracking-tight tabular-nums ${
          dim ? "text-muted-foreground/40" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-end">
      <span className="font-mono text-[18px] font-light leading-none tabular-nums">
        {children}
      </span>
      <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}

function CategoryBars({ items }: { items: { category: string; count: number }[] }) {
  const max = items.reduce((m, x) => (x.count > m ? x.count : m), 0);
  return (
    <div>
      {items.map((it) => (
        <div
          key={it.category}
          className="flex items-center gap-4 border-b border-[rgba(255,255,255,0.05)] py-3.5 last:border-b-0"
        >
          <div className="w-32 shrink-0 truncate font-mono text-[12px] lowercase tracking-wide text-foreground">
            {it.category}
          </div>
          <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <div
              className="h-full bg-foreground/70"
              style={{ width: max ? `${(it.count / max) * 100}%` : "0%" }}
            />
          </div>
          <div className="w-12 shrink-0 text-right font-mono text-[14px] font-light tabular-nums">
            {it.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
      <span>less</span>
      <span className="h-[10px] w-[10px] rounded-[2px] bg-[rgba(255,255,255,0.04)]" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/10" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/30" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/55" />
      <span className="h-[10px] w-[10px] rounded-[2px] bg-foreground/85" />
      <span>more</span>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-5 font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}
