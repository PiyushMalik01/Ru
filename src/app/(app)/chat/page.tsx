import { redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { createClient } from "@/lib/supabase/server";
import {
  fetchChat,
  fetchChatMessages,
  listChats,
  pickLandingChat,
} from "@/lib/queries/chats";
import { extractCardsFromMetadata } from "@/lib/chat-cards";
import type { ChatMessage } from "@/lib/stores/chat-store";

export const dynamic = "force-dynamic";

// /chat is the landing destination after sign-in. It renders the user's
// most-recent chat inline (rather than redirecting to /chat/[id]), so the
// sign-in flow is a single navigation instead of two visible page loads.
export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const landing = await pickLandingChat(supabase, user.id);

  let chatId: string | null = landing?.id ?? null;

  if (!chatId) {
    const { data: created } = await supabase
      .from("chats")
      .insert({ user_id: user.id, title: "New chat" })
      .select("id")
      .single();
    if (created) {
      chatId = created.id;
      void supabase
        .from("profiles")
        .update({ current_chat_id: created.id })
        .eq("id", user.id)
        .then(({ error }) => {
          if (error) console.error("profile.current_chat_id update failed", error);
        });
    }
  }

  if (!chatId) {
    // Creation failed — render an empty shell so the user isn't stuck.
    const chats = await listChats(supabase, user.id);
    return (
      <div className="flex h-[calc(100vh-3rem)] w-full">
        <ChatSidebar chats={chats} activeChatId={null} />
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32">
            <ChatView initialMessages={[]} chatId={null} />
          </div>
        </div>
        <WorkspacePanel />
      </div>
    );
  }

  const [chat, messages, chats] = await Promise.all([
    fetchChat(supabase, user.id, chatId),
    fetchChatMessages(supabase, user.id, chatId),
    listChats(supabase, user.id),
  ]);

  const initialMessages: ChatMessage[] = messages
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      cards: extractCardsFromMetadata(m.metadata),
      created_at: m.created_at,
    }))
    // Keep messages that have prose OR cards — silent tool-only assistant
    // turns are legitimate and should still appear in history.
    .filter((m) => (m.content && m.content.length > 0) || m.cards.length > 0);

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <ChatSidebar chats={chats} activeChatId={chatId} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32">
          <ChatView
            initialMessages={initialMessages}
            chatId={chatId}
            chatTitle={chat?.title}
          />
        </div>
      </div>
      <WorkspacePanel />
    </div>
  );
}
