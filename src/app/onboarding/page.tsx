import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, onboarding_completed, ai_provider")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) redirect("/chat");

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <OnboardingForm
          initialName={profile?.display_name ?? ""}
          initialTimezone={profile?.timezone ?? ""}
          hasAiProvider={Boolean(profile?.ai_provider)}
        />
      </main>
    </div>
  );
}
