import { ChatView } from "@/components/chat/chat-view";
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

  return <ChatView initialMessages={initialMessages} />;
}
