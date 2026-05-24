import { ChatGPTConnection } from "@/components/settings/chatgpt-connection";
import { BYOKForm } from "@/components/settings/byok-form";
import { AnticipationControl } from "@/components/settings/anticipation-control";
import { getCurrentProvider } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { getChatGPTStatus } from "@/lib/ai/openai-connection";
import type { Database } from "@/types/database";

type AnticipationLevel = Database["public"]["Enums"]["anticipation_level_type"];

export default async function SettingsPage() {
  const currentProvider = await getCurrentProvider();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const chatgptStatus = user
    ? await getChatGPTStatus(supabase, user.id)
    : { connected: false as const };

  let anticipationLevel: AnticipationLevel = "balanced";
  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("anticipation_level")
      .eq("id", user.id)
      .single();
    if (profileRow?.anticipation_level) {
      anticipationLevel = profileRow.anticipation_level;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 pt-6 pb-24">
      <header className="max-w-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          settings · ai connection
        </div>
        <h1 className="h-page-sm mt-4 lowercase">
          connect ru to an ai
        </h1>
        <p
          className="mt-3 text-[15px] text-muted-foreground"
          style={{ lineHeight: 1.65 }}
        >
          Sign in with your ChatGPT account to run on{" "}
          <span className="font-mono text-foreground">gpt-5.4</span>, or bring your own
          API key for OpenAI, Anthropic, or Google.
        </p>
      </header>

      <ChatGPTConnection initialStatus={chatgptStatus} />

      <section className="space-y-4 pt-2">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            or bring your own key
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <BYOKForm currentProvider={currentProvider} />
      </section>

      {user && (
        <>
          <div className="flex items-center gap-3 pt-2">
            <span className="h-px flex-1 bg-border" />
          </div>
          <AnticipationControl userId={user.id} initialLevel={anticipationLevel} />
        </>
      )}
    </div>
  );
}
