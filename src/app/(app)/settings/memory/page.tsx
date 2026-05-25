import { createClient } from "@/lib/supabase/server";
import { loadMemoryProfile } from "@/lib/queries/memory";
import { HeroBand } from "@/components/editorial/hero-band";
import { MemoryTabs } from "./memory-tabs";
import { OnboardingModal } from "./onboarding-modal";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await loadMemoryProfile(supabase, user.id);
  const { data: onboardingRow } = await supabase
    .from("profiles")
    .select("memory_onboarded_at")
    .eq("id", user.id)
    .single();

  const sectionsFilled = Object.values(profile?.profile_doc ?? {}).filter(
    (s) => s?.content?.trim(),
  ).length;

  const [{ count: episodeCount }, { count: auditCount }] = await Promise.all([
    supabase
      .from("episodes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .is("archived_at", null),
    supabase
      .from("memory_audit")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const eps = episodeCount ?? 0;
  const audit = auditCount ?? 0;
  const noteCount = sectionsFilled + eps;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-8 pb-32 sm:px-6 sm:pt-10">
      <HeroBand
        eyebrow={`settings · memory · ${noteCount} note${noteCount === 1 ? "" : "s"}`}
        title="ru's memory."
        subtitle="everything ru remembers about you, laid open. edit anything that's off — ru learns from the correction. read-only mirror on mobile."
      />

      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
        <Ledger label="sections" value={sectionsFilled} />
        <Ledger label="episodes" value={eps} />
        <Ledger label="audit entries" value={audit} />
      </div>

      <div className="mt-10">
        <MemoryTabs profile={profile} userId={user.id} />
      </div>

      {!onboardingRow?.memory_onboarded_at && <OnboardingModal />}
    </div>
  );
}

function Ledger({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hairline)] bg-[var(--card)] px-4 py-3 sm:px-5 sm:py-4">
      <span
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        style={{ fontVariationSettings: "'wght' 600, 'wdth' 100" }}
      >
        {label}
      </span>
      <span
        className="font-display leading-[0.9] tabular-nums text-foreground"
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
