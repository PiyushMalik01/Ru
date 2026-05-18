import { notFound, redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { createClient } from "@/lib/supabase/server";
import { fetchChat, fetchChatMessages, listChats } from "@/lib/queries/chats";
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

  const chat = await fetchChat(supabase, user.id, id);
  if (!chat) notFound();

  // Make this the user's current chat so /chat lands here next time.
  await supabase.from("profiles").update({ current_chat_id: id }).eq("id", user.id);

  const [messages, chats] = await Promise.all([
    fetchChatMessages(supabase, user.id, id),
    listChats(supabase, user.id),
  ]);

  const initialMessages: ChatMessage[] = messages
    .filter((m) => m.content && m.content.length > 0)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: [],
    }));

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
