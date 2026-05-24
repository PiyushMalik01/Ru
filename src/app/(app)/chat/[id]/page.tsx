import { notFound, redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { createClient } from "@/lib/supabase/server";
import { fetchChat, fetchChatMessages, listChats } from "@/lib/queries/chats";
import { extractCardsFromMetadata } from "@/lib/chat-cards";
import type { ChatMessage } from "@/lib/stores/chat-store";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch chat metadata, messages, and the sidebar list in a single round
  // trip. The previous version awaited fetchChat sequentially, then awaited
  // a profile.update, then awaited messages + chats — three serialized
  // network round-trips per chat navigation. Now all three queries fly in
  // parallel and the profile-update is fire-and-forget.
  const [chat, messages, chats] = await Promise.all([
    fetchChat(supabase, user.id, id),
    fetchChatMessages(supabase, user.id, id),
    listChats(supabase, user.id),
  ]);
  if (!chat) notFound();

  // Mark this as the user's current chat so /chat lands here next time.
  // Doesn't affect render, so don't block on it.
  void supabase
    .from("profiles")
    .update({ current_chat_id: id })
    .eq("id", user.id)
    .then(({ error }) => {
      if (error) console.error("profile.current_chat_id update failed", error);
    });

  const initialMessages: ChatMessage[] = messages
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: extractCardsFromMetadata(m.metadata),
      created_at: m.created_at,
    }))
    // Keep messages that have prose OR cards — silent tool-only assistant
    // turns are legitimate (e.g. "log this water" produces a tracker card
    // with no prose) and should still appear in history.
    .filter((m) => (m.content && m.content.length > 0) || m.cards.length > 0);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <ChatSidebar chats={chats} activeChatId={id} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32">
          <ChatView initialMessages={initialMessages} chatId={id} chatTitle={chat.title} />
        </div>
      </div>
      <WorkspacePanel />
    </div>
  );
}
