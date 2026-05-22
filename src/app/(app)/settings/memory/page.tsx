import { createClient } from "@/lib/supabase/server";
import { loadMemoryProfile } from "@/lib/queries/memory";
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

  return (
    <div className="min-h-screen" style={{ background: "#f4ecf2", color: "#2d2a26", fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: "#8a847b" }}>
            / settings · memory
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "44px",
              lineHeight: 1.05,
              color: "#0d1f15",
              letterSpacing: "-0.015em",
            }}
          >
            What Ru knows<span style={{ color: "#1a5632" }}>.</span>
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "#4a5547" }}>
            Edit anything that&apos;s off. Ru learns from your corrections.
          </p>
        </header>
        <MemoryTabs profile={profile} userId={user.id} />
      </div>
      {!onboardingRow?.memory_onboarded_at && <OnboardingModal />}
    </div>
  );
}
