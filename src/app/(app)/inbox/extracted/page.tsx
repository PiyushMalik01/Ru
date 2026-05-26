import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HeroBand } from "@/components/editorial/hero-band";
// TODO: Gmail agent — import { acceptExtracted, rejectExtracted, acceptAll } from "./actions";
import { ExtractedItem } from "@/components/inbox/extracted-item";
import { AcceptAllBar } from "@/components/inbox/accept-all-bar";

export const dynamic = "force-dynamic";

type ExtractionKind = "task" | "reminder" | "event" | "activity" | "note";

const KIND_ACCENT: Record<ExtractionKind, string> = {
  task: "var(--entity-task)",
  reminder: "var(--entity-reminder)",
  event: "var(--entity-plan)",
  activity: "var(--entity-activity)",
  note: "var(--entity-insight)",
};

export default async function ExtractedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("extracted_items")
    .select(
      "id, source, suggested_kind, suggested_payload, confidence, preview_from, preview_subject, preview_snippet, created_at",
    )
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);

  const items = rows ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow="inbox / extracted"
        title="from your inbox."
        subtitle="things ru pulled out of your gmail. accept what's useful, reject what isn't — ru learns."
      />

      {items.length === 0 ? (
        <div className="mt-12">
          <p
            className="text-[16px] italic leading-[1.5] text-muted-foreground"
            style={{ fontVariationSettings: "'wght' 460, 'wdth' 96" }}
          >
            nothing waiting. connect gmail in settings or run a manual scan.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-10 flex flex-col gap-3 sm:gap-4">
            {items.map((it) => (
              <ExtractedItem
                key={it.id}
                id={it.id}
                source={it.source}
                kind={it.suggested_kind as ExtractionKind}
                kindAccent={KIND_ACCENT[it.suggested_kind as ExtractionKind] ?? "var(--muted-foreground)"}
                confidence={it.confidence}
                previewFrom={it.preview_from}
                previewSubject={it.preview_subject}
                previewSnippet={it.preview_snippet}
              />
            ))}
          </div>
          {items.length >= 3 && <AcceptAllBar ids={items.map((it) => it.id)} />}
        </>
      )}
    </div>
  );
}
