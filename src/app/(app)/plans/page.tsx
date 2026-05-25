import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces } from "@/lib/queries/workspace";
import { PlanCard } from "@/components/plans/plan-card";
import { NewPlanTile } from "@/components/plans/new-plan-tile";
import { HeroBand } from "@/components/editorial/hero-band";
import { SectionHead } from "@/components/editorial/section-head";

export const dynamic = "force-dynamic";

async function createPlan() {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase
    .from("workspaces")
    .insert({ user_id: user.id, title: "Untitled plan", kind: "plan" })
    .select("id")
    .single();
  revalidatePath("/plans");
  if (data?.id) {
    redirect(`/plans/${data.id}`);
  }
}

export default async function PlansPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces(supabase, user.id);
  const nowMs = Date.now();
  const todayLabel = format(new Date(nowMs), "EEE MMM d").toLowerCase();

  const totalItems = workspaces.reduce((s, w) => s + w.itemCount, 0);
  const totalDone = workspaces.reduce((s, w) => s + (w.doneCount ?? 0), 0);

  // Split: plans with work still open vs plans fully settled. Lets the user
  // tell at a glance what's pulling on attention vs what's just history.
  const inMotion = workspaces.filter((w) => (w.doneCount ?? 0) < w.itemCount || w.itemCount === 0);
  const settled = workspaces.filter((w) => w.itemCount > 0 && (w.doneCount ?? 0) >= w.itemCount);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`plans · ${todayLabel} · ${workspaces.length} plan${workspaces.length === 1 ? "" : "s"}`}
        title={
          workspaces.length === 0
            ? "no plans yet."
            : "arcs in motion."
        }
        subtitle="long-running threads — study plans, projects, recoveries. each plan is a page ru keeps current as you talk to it."
      />

      {/* Tight ledger across the top — 3 small stat tiles */}
      {workspaces.length > 0 && (
        <section className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
          <Ledger label="plans"   value={workspaces.length} />
          <Ledger label="items"   value={totalItems} />
          <Ledger label="settled" value={totalDone} />
        </section>
      )}

      <div className="mt-12 flex flex-col gap-10">
        <section>
          <SectionHead
            eyebrow="in motion"
            sublabel={
              inMotion.length === 0
                ? "no active plans"
                : inMotion.length === 1
                  ? "one arc in progress"
                  : `${inMotion.length} arcs in progress`
            }
            count={inMotion.length}
            accent="var(--entity-plan)"
          />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {inMotion.map((w, i) => (
              <PlanCard
                key={w.id}
                index={i}
                id={w.id}
                title={w.title}
                description={w.description}
                itemCount={w.itemCount}
                doneCount={w.doneCount ?? 0}
                lastActivityIso={w.lastActivityIso ?? w.updated_at ?? w.created_at}
                nowMs={nowMs}
              />
            ))}
            <NewPlanTile action={createPlan} />
          </div>
        </section>

        {settled.length > 0 && (
          <section>
            <SectionHead
              eyebrow="settled"
              sublabel={
                settled.length === 1
                  ? "one arc complete"
                  : `${settled.length} arcs complete`
              }
              count={settled.length}
              accent="var(--muted-foreground)"
            />
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              {settled.map((w, i) => (
                <PlanCard
                  key={w.id}
                  index={inMotion.length + i}
                  id={w.id}
                  title={w.title}
                  description={w.description}
                  itemCount={w.itemCount}
                  doneCount={w.doneCount ?? 0}
                  lastActivityIso={w.lastActivityIso ?? w.updated_at ?? w.created_at}
                  nowMs={nowMs}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4"
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span
        className="font-display leading-[0.9] tabular-nums"
        style={{
          fontSize: "clamp(28px, 4.4vw, 40px)",
          fontVariationSettings: "'wght' 580, 'opsz' 96",
          letterSpacing: "-0.025em",
        }}
      >
        {value}
      </span>
    </div>
  );
}
