import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchWorkspaceDetail } from "@/lib/queries/workspace";
import { SectionMark } from "@/components/app-shell/primitives";
import { SheetRow, type SheetRowData } from "@/components/sheet/sheet-row";
import { PlanTitle } from "@/components/plans/plan-title";
import { PlanProperties } from "@/components/plans/plan-properties";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await fetchWorkspaceDetail(supabase, user.id, id);
  if (!detail) notFound();

  const nowMs = Date.now();

  // Compose rows in the same shape as the Sheet table.
  const rows: SheetRowData[] = detail.items.map((item, i) => {
    if (item.kind === "task") {
      return {
        index: i + 1,
        kind: "task",
        id: item.id,
        title: item.title,
        status: item.status,
        whenIso: item.due_at,
        planId: detail.workspace.id,
        planTitle: detail.workspace.title,
        meta: item.priority !== "medium" ? item.priority : null,
        isToggleable: true,
      };
    }
    if (item.kind === "routine") {
      return {
        index: i + 1,
        kind: "routine",
        id: item.id,
        title: item.title,
        status: "recurring",
        whenIso: null,
        planId: detail.workspace.id,
        planTitle: detail.workspace.title,
        meta: item.frequency,
        isToggleable: true,
      };
    }
    if (item.kind === "reminder") {
      return {
        index: i + 1,
        kind: "reminder",
        id: item.id,
        title: item.title,
        status: "pending",
        whenIso: item.remind_at,
        planId: detail.workspace.id,
        planTitle: detail.workspace.title,
        meta: item.is_recurring ? "recurring" : null,
        isToggleable: false,
      };
    }
    // activity
    return {
      index: i + 1,
      kind: "activity",
      id: item.id,
      title: item.activity,
      status: "logged",
      whenIso: item.timestamp,
      planId: detail.workspace.id,
      planTitle: detail.workspace.title,
      meta: item.category || null,
      isToggleable: false,
    };
  });

  // For done-count we treat finished tasks + completed routines + logged activities
  // as "settled". Reminders/pending tasks remain open. v1 approximation.
  const doneCount = rows.filter(
    (r) => r.status === "completed" || r.kind === "activity",
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32">
      {/* Breadcrumb */}
      <nav className="flex items-baseline gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <Link href="/plans" className="ru-link hover:text-foreground">plans</Link>
        <span className="text-muted-foreground/30">›</span>
        <span className="truncate text-foreground">{detail.workspace.title}</span>
      </nav>

      <div className="ru-rule mt-3" />

      {/* Asymmetric layout: narrow rail, wide column. Properties left, body right. */}
      <div
        className="mt-10 grid gap-x-12 gap-y-8"
        style={{ gridTemplateColumns: "minmax(220px,260px) minmax(0,1fr)" }}
      >
        {/* Left rail */}
        <div className="md:sticky md:top-20 md:self-start">
          <PlanProperties
            status={detail.workspace.archived ? "archived" : "active"}
            createdIso={detail.workspace.created_at}
            updatedIso={detail.workspace.updated_at}
            itemCount={rows.length}
            doneCount={doneCount}
            nowMs={nowMs}
          />
        </div>

        {/* Right column — body */}
        <article className="min-w-0">
          <PlanTitle id={detail.workspace.id} initial={detail.workspace.title} />
          {detail.workspace.description ? (
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              {detail.workspace.description}
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground/40 italic">
              no description yet — ru will fill this in as the plan develops.
            </p>
          )}

          <SectionMark glyph="§" />

          {/* Embedded sub-database — same table treatment as Sheet. */}
          <div>
            <div className="mb-1 flex items-baseline gap-3 border-b border-[var(--hairline)] pb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                items
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground/60">
                {rows.length.toString().padStart(2, "0")}
              </span>
            </div>

            {rows.length === 0 ? (
              <div className="py-12 text-center font-mono text-[12px] lowercase tracking-wide text-muted-foreground/70">
                this plan has no items yet. add them from /chat or the sheet.
              </div>
            ) : (
              <div className="-mx-4">
                <div
                  className="sticky top-12 z-10 grid items-center gap-4 bg-background pl-5 pr-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 border-b border-[var(--hairline)]"
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
                  {rows.map((r) => (
                    <SheetRow key={`${r.kind}-${r.id}`} row={r} nowMs={nowMs} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <SectionMark glyph="¶" />

          {/* Notes block — placeholder for now. */}
          <div>
            <div className="mb-1 flex items-baseline gap-3 border-b border-[var(--hairline)] pb-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                notes
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground/50 italic">
              notes coming later. ru will surface key passages from your chats here.
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
