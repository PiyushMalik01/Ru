import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { assembleContext } from "@/lib/ai/engine/context";
import { runConversation } from "@/lib/ai/engine/stream";
import { getValidChatGPTToken } from "@/lib/ai/openai-connection";
import { CODEX_MODEL } from "@/lib/ai/providers/codex";
import type { Provider, ProviderConfig } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  voice: z.boolean().optional(),
  chatId: z.string().uuid().optional(),
});

const MODEL_DEFAULTS: Record<Provider, string> = {
  chatgpt_oauth: CODEX_MODEL,
  openai: process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL_DEFAULT ?? "claude-sonnet-4-6",
  gemini: process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash",
};

/** Pick a friendly chat title from the first user message. */
function deriveTitleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  // Cut at the last word boundary within the first 57 chars
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_provider, ai_credentials")
    .eq("id", user.id)
    .single();
  if (!profile?.ai_provider || !profile.ai_credentials) {
    return new Response("AI provider not configured. Connect ChatGPT or add an API key in Settings.", { status: 412 });
  }

  const provider = profile.ai_provider as Provider;
  let config: ProviderConfig;

  if (provider === "chatgpt_oauth") {
    const tokenInfo = await getValidChatGPTToken(supabase, user.id);
    if (!tokenInfo) {
      return new Response("ChatGPT session expired. Reconnect ChatGPT in Settings.", { status: 412 });
    }
    config = {
      provider,
      apiKey: `${tokenInfo.accessToken}::${tokenInfo.accountId}`,
      model: CODEX_MODEL,
    };
  } else {
    const creds = profile.ai_credentials as { apiKey?: string; model?: string };
    if (!creds.apiKey) return new Response("api key missing", { status: 412 });
    let apiKey: string;
    try { apiKey = decrypt(creds.apiKey); } catch { return new Response("api key unreadable", { status: 412 }); }
    config = {
      provider,
      apiKey,
      model: creds.model ?? MODEL_DEFAULTS[provider],
    };
  }

  // Resolve which chat this message belongs to. If the client didn't pass one,
  // either reuse the user's pinned current chat or create a new one.
  let chatId = parsed.data.chatId ?? null;
  if (chatId) {
    const { data: existing } = await supabase
      .from("chats")
      .select("id, title")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single();
    if (!existing) return new Response("chat not found", { status: 404 });
  } else {
    const { data: prof } = await supabase
      .from("profiles")
      .select("current_chat_id")
      .eq("id", user.id)
      .single();
    chatId = prof?.current_chat_id ?? null;
    if (!chatId) {
      const { data: created, error } = await supabase
        .from("chats")
        .insert({ user_id: user.id, title: "New chat" })
        .select("id")
        .single();
      if (error || !created) return new Response("could not create chat", { status: 500 });
      chatId = created.id;
      await supabase.from("profiles").update({ current_chat_id: chatId }).eq("id", user.id);
    }
  }

  const { data: userMsg } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      chat_id: chatId,
      role: "user",
      content: parsed.data.message,
      input_method: parsed.data.voice ? "voice" : "text",
    })
    .select()
    .single();

  const { data: assistantMsg } = await supabase
    .from("messages")
    .insert({
      user_id: user.id,
      chat_id: chatId,
      role: "assistant",
      content: "",
      input_method: "text",
    })
    .select()
    .single();

  // Auto-title: if the chat is still "New chat", derive a title from this first user message.
  const { data: chatRow } = await supabase
    .from("chats")
    .select("title")
    .eq("id", chatId)
    .single();
  if (chatRow && (chatRow.title === "New chat" || chatRow.title.trim() === "")) {
    await supabase
      .from("chats")
      .update({ title: deriveTitleFromMessage(parsed.data.message) })
      .eq("id", chatId);
  } else {
    // Bump updated_at so the chat sorts to the top of the sidebar.
    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", chatId);
  }

  const messages = await assembleContext({
    supabase,
    userId: user.id,
    chatId,
    newUserMessage: parsed.data.message,
    voice: parsed.data.voice ?? false,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      let assistantText = "";
      try {
        for await (const event of runConversation({
          supabase,
          userId: user.id,
          assistantMessageId: assistantMsg!.id,
          config,
          initialMessages: messages,
          signal: req.signal,
        })) {
          if (event.type === "text") assistantText += event.delta;
          send(event);
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "stream failed" });
      } finally {
        if (assistantMsg) {
          await supabase.from("messages").update({ content: assistantText }).eq("id", assistantMsg.id);
        }
        // Touch chat.updated_at again after the assistant message lands.
        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);
        send({
          type: "stream_end",
          userMessageId: userMsg?.id,
          assistantMessageId: assistantMsg?.id,
          chatId,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
