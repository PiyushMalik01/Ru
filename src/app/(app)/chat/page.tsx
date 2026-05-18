import { ChatView } from "@/components/chat/chat-view";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/stores/chat-store";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialMessages: ChatMessage[] = [];
  if (user) {
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);
    initialMessages = (data ?? [])
      .filter((m) => m.content && m.content.length > 0)
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        cards: [],
      }));
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32">
          <ChatView initialMessages={initialMessages} />
        </div>
      </div>
      <WorkspacePanel />
    </div>
  );
}
