import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { assembleContext } from "@/lib/ai/engine/context";
import { runConversation } from "@/lib/ai/engine/stream";
import type { ProviderConfig } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ message: z.string().min(1).max(4000) });

const MODEL_DEFAULTS: Record<string, string> = {
  openai: process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL_DEFAULT ?? "claude-sonnet-4-6",
  gemini: process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("ai_provider, ai_credentials").eq("id", user.id).single();
  if (!profile?.ai_provider || !profile.ai_credentials) {
    return new Response("AI provider not configured. Add your API key in Settings.", { status: 412 });
  }

  const provider = profile.ai_provider as "openai" | "anthropic" | "gemini";
  const creds = profile.ai_credentials as { apiKey?: string; model?: string };
  if (!creds.apiKey) return new Response("api key missing", { status: 412 });

  let apiKey: string;
  try { apiKey = decrypt(creds.apiKey); } catch { return new Response("api key unreadable", { status: 412 }); }

  const config: ProviderConfig = {
    provider,
    apiKey,
    model: creds.model ?? MODEL_DEFAULTS[provider],
  };

  const { data: userMsg } = await supabase.from("messages").insert({
    user_id: user.id,
    role: "user",
    content: parsed.data.message,
    input_method: "text",
  }).select().single();

  const { data: assistantMsg } = await supabase.from("messages").insert({
    user_id: user.id,
    role: "assistant",
    content: "",
    input_method: "text",
  }).select().single();

  const messages = await assembleContext({ supabase, userId: user.id, newUserMessage: parsed.data.message });

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
          await supabase.from("messages")
            .update({ content: assistantText })
            .eq("id", assistantMsg.id);
        }
        send({ type: "stream_end", userMessageId: userMsg?.id, assistantMessageId: assistantMsg?.id });
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
