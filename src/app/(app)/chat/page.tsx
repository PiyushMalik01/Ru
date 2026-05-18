import { redirect } from "next/navigation";
import { ChatView } from "@/components/chat/chat-view";
import { WorkspacePanel } from "@/components/workspace/workspace-panel";
import { ChatSidebar } from "@/components/chat/chat-sidebar";
import { createClient } from "@/lib/supabase/server";
import { listChats, pickLandingChat } from "@/lib/queries/chats";
import type { ChatMessage } from "@/lib/stores/chat-store";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Land on the most-recently-active chat. If the user has no chats yet,
  // create a fresh one so they always have a destination.
  const landing = await pickLandingChat(supabase, user.id);
  if (landing) {
    redirect(`/chat/${landing.id}`);
  }

  const { data: created } = await supabase
    .from("chats")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id")
    .single();
  if (created) {
    await supabase.from("profiles").update({ current_chat_id: created.id }).eq("id", user.id);
    redirect(`/chat/${created.id}`);
  }

  // Fallback: render empty if creation somehow failed
  const chats = await listChats(supabase, user.id);
  const initialMessages: ChatMessage[] = [];

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full">
      <ChatSidebar chats={chats} activeChatId={null} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32">
          <ChatView initialMessages={initialMessages} chatId={null} />
        </div>
      </div>
      <WorkspacePanel />
    </div>
  );
}
