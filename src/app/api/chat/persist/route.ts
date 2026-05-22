import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Persist a speculative voice turn.
 *
 * The voice flow speculatively dispatches /api/chat?speculative=true on Flux's
 * eager_eot signal so the LLM has a head start on the reply. /api/chat in
 * that mode skips all DB writes — it just runs the LLM and streams back.
 * When the smart EOT confirmer fires, the client calls this endpoint with
 * the buffered transcript + buffered assistant text, and we atomically
 * insert both messages and update chat metadata.
 *
 * If the speculative was cancelled (turn_resumed), the client simply doesn't
 * call this endpoint — nothing was saved, no cleanup needed.
 *
 * Cards from speculative tool calls are NOT round-tripped here; tool handlers
 * already persisted their domain rows (tasks, episodes, etc.) during the
 * /api/chat run. The cards in the chat UI are rendered from the message's
 * children rows on next load.
 */

const BodySchema = z.object({
  chatId: z.string().uuid(),
  userMessage: z.string().min(1).max(4000),
  assistantText: z.string().min(0).max(40_000),
  voice: z.boolean().optional(),
});

function deriveTitleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const cut = cleaned.slice(0, 57);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut) + "…";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  const { chatId, userMessage, assistantText, voice } = parsed.data;

  // Verify chat ownership before any writes.
  const { data: existing } = await supabase
    .from("chats")
    .select("id, title")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .single();
  if (!existing) return new Response("chat not found", { status: 404 });

  const userMsgId = crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();

  const userInsertP = supabase
    .from("messages")
    .insert({
      id: userMsgId,
      user_id: user.id,
      chat_id: chatId,
      role: "user",
      content: userMessage,
      input_method: voice ? "voice" : "text",
    });

  const assistantInsertP = supabase
    .from("messages")
    .insert({
      id: assistantMsgId,
      user_id: user.id,
      chat_id: chatId,
      role: "assistant",
      content: assistantText,
      input_method: "text",
    });

  const chatMetaP =
    existing.title === "New chat" || existing.title.trim() === ""
      ? supabase
          .from("chats")
          .update({
            title: deriveTitleFromMessage(userMessage),
            updated_at: new Date().toISOString(),
          })
          .eq("id", chatId)
      : supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);

  const [u, a, c] = await Promise.all([userInsertP, assistantInsertP, chatMetaP]);
  if (u.error || a.error || c.error) {
    console.error("persist failed", { u: u.error, a: a.error, c: c.error });
    return new Response("persist failed", { status: 500 });
  }

  return new Response(
    JSON.stringify({ userMessageId: userMsgId, assistantMessageId: assistantMsgId, chatId }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
