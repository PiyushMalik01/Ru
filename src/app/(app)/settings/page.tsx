import { ChatGPTConnection } from "@/components/settings/chatgpt-connection";
import { BYOKForm } from "@/components/settings/byok-form";
import { getCurrentProvider } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { getChatGPTStatus } from "@/lib/ai/openai-connection";

export default async function SettingsPage() {
  const currentProvider = await getCurrentProvider();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const chatgptStatus = user
    ? await getChatGPTStatus(supabase, user.id)
    : { connected: false as const };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 px-4 pt-6 pb-24">
      <header className="max-w-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          settings · ai connection
        </div>
        <h1 className="mt-4 text-[32px] font-medium leading-tight tracking-tight">
          Connect Ru to an AI.
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
    </div>
  );
}
