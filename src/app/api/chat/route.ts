import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import { assembleContext } from "@/lib/ai/engine/context";
import { runConversation } from "@/lib/ai/engine/stream";
import { toolsForMode } from "@/lib/ai/tools/definitions";
import { getValidChatGPTToken } from "@/lib/ai/openai-connection";
import { CODEX_MODEL } from "@/lib/ai/providers/codex";
import type { Provider, ProviderConfig } from "@/lib/ai/types";
import { enrichTurn } from "@/lib/ai/engine/enrich";
import { retrieveEpisodes, topUpEpisodesByEntity } from "@/lib/ai/engine/retrieve";
import { injectMemoryBlocks } from "@/lib/ai/engine/memory-blocks";
import { loadEntityCatalog } from "@/lib/queries/memory";

export const dynamic = "force-dynamic";

const VoiceContextSchema = z
  .object({
    energy: z.number().min(0).max(1),
    pace_wpm: z.number().int().min(0).max(400),
    pitch_variance: z.number().min(0).max(1),
    emotion: z.enum(["calm", "excited", "tired", "tense", "sad", "casual"]),
  })
  .nullable()
  .optional();

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  voice: z.boolean().optional(),
  voiceContext: VoiceContextSchema,
  chatId: z.string().uuid().optional(),
  /**
   * mode controls how this turn is recorded:
   *   - send (default): insert a new user message, then stream assistant reply
   *   - edit: REPLACE editTargetMessageId's content with `message`, delete every
   *     subsequent message in the chat, then stream a fresh assistant reply
   *   - regenerate: delete regenerateTargetMessageId (an assistant message),
   *     don't insert anything new on the user side, stream a fresh assistant
   *     reply against the existing history
   */
  mode: z.enum(["send", "edit", "regenerate"]).optional(),
  editTargetMessageId: z.string().uuid().optional(),
  regenerateTargetMessageId: z.string().uuid().optional(),
  /**
   * Speculative voice turn — run the LLM but DON'T persist any messages,
   * DON'T update chat metadata. Used by voice-conversation to dispatch a
   * reply on Flux's eager_eot signal so the LLM is already streaming by
   * the time the user's full EOT confirms. If the user keeps talking
   * (turn_resumed), the client aborts this request and nothing is saved.
   * If the user truly stopped, the client calls /api/chat/persist with
   * the buffered assistant text to save both messages atomically.
   *
   * Side effects from tool calls are NOT reverted on cancel — speculative
   * cancellations can leak a created task / logged activity / etc.
   * Acceptable trade-off: the smart EOT confirmer makes turn_resumed-
   * after-tool-call rare in practice, and the latency win is large.
   */
  speculative: z.boolean().optional(),
});

const MODEL_DEFAULTS: Record<Provider, string> = {
  chatgpt_oauth: CODEX_MODEL,
  openai: process.env.OPENAI_MODEL_DEFAULT ?? "gpt-4o-mini",
  anthropic: process.env.ANTHROPIC_MODEL_DEFAULT ?? "claude-sonnet-4-6",
  gemini: process.env.GEMINI_MODEL_DEFAULT ?? "gemini-2.5-flash",
};

/**
 * When the turn is voice, swap to a fast variant per provider. Conversational
 * voice replies are 1-3 sentences and live or die on TTFT — the heavyweights
 * (GPT-5, Opus 4.7) add 400-1000ms of time-to-first-token over their fast
 * siblings without adding meaningful quality on short turns. The full
 * persona + tools + memory pipeline are unchanged; only the model id is.
 *
 *   - openai      → gpt-5-mini   (vs gpt-5)
 *   - anthropic   → claude-haiku-4-5  (vs Opus / Sonnet)
 *   - gemini      → gemini-2.5-flash  (already fast — no change vs default)
 *   - chatgpt_oauth → codex (no fast variant on the Codex backend)
 */
const VOICE_FAST_MODEL: Record<Provider, string | null> = {
  chatgpt_oauth: null,
  openai: "gpt-5-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
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
    .select("ai_provider, ai_credentials, timezone")
    .eq("id", user.id)
    .single();
  if (!profile?.ai_provider || !profile.ai_credentials) {
    return new Response("AI provider not configured. Connect ChatGPT or add an API key in Settings.", { status: 412 });
  }

  const profileTimezone = profile?.timezone ?? "UTC";

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
    // Voice mode forces the fast variant per provider — short voice replies
    // don't benefit from the heavyweight model and the latency saving is
    // 400-1000ms of TTFT.
    const voiceFast = parsed.data.voice === true ? VOICE_FAST_MODEL[provider] : null;
    config = {
      provider,
      apiKey,
      model: voiceFast ?? creds.model ?? MODEL_DEFAULTS[provider],
    };
  }

  const isSpeculative = parsed.data.speculative === true;

  // Resolve which chat this message belongs to. If the client didn't pass one,
  // either reuse the user's pinned current chat or create a new one.
  //
  // Speculative turns MUST pass an existing chatId — we don't want to create
  // a chat we might later have to clean up if the speculative is cancelled.
  // In practice the predictive-opening flow guarantees a chat exists before
  // the user's first eager_eot.
  let chatId = parsed.data.chatId ?? null;
  if (chatId) {
    const { data: existing } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .single();
    if (!existing) return new Response("chat not found", { status: 404 });
  } else if (isSpeculative) {
    return new Response("speculative requires chatId", { status: 400 });
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
      // Fire-and-forget — the response render doesn't depend on this.
      void supabase
        .from("profiles")
        .update({ current_chat_id: chatId })
        .eq("id", user.id)
        .then(({ error: e }) => { if (e) console.error("current_chat_id update failed", e); });
    }
  }

  // Time-to-first-token used to wait for ~6 sequential Supabase round-trips:
  // user-msg insert, assistant-msg insert, chats select, chats update,
  // then assembleContext, then the model call. That added 600-1500ms of
  // perceived latency before Ru started speaking — the worst part of the
  // voice UX. Refactor: pre-generate UUIDs client-side and fan out everything
  // in parallel. Only the things runConversation actually needs are awaited:
  //
  //   - assistant insert (so tool calls can attribute messageId to a real row)
  //   - assembleContext (the actual model context)
  //
  // The user-msg insert and chat title/bump fire in parallel and are awaited
  // in the stream's `finally` block — never on the hot path.
  const mode = parsed.data.mode ?? "send";
  const userMsgId =
    mode === "edit" ? parsed.data.editTargetMessageId ?? crypto.randomUUID() : crypto.randomUUID();
  const assistantMsgId = crypto.randomUUID();

  // Edit / regenerate housekeeping. These run BEFORE assembleContext so the
  // history fetched there reflects the truncated/replaced state.
  if (mode === "edit") {
    if (!parsed.data.editTargetMessageId) {
      return new Response("editTargetMessageId required for mode=edit", { status: 400 });
    }
    // Look up the target's created_at so we know where to truncate.
    const { data: target } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", parsed.data.editTargetMessageId)
      .eq("user_id", user.id)
      .eq("chat_id", chatId)
      .single();
    if (!target) {
      return new Response("edit target not found", { status: 404 });
    }
    // Replace the user message's content in place + reset its timestamp so
    // it sorts as "now" — the edit is, in effect, a fresh send of a new
    // version of that prompt.
    const nowIso = new Date().toISOString();
    await supabase
      .from("messages")
      .update({ content: parsed.data.message, created_at: nowIso })
      .eq("id", parsed.data.editTargetMessageId)
      .eq("user_id", user.id);
    // Delete everything that came AFTER the edited message in the same chat.
    await supabase
      .from("messages")
      .delete()
      .eq("chat_id", chatId)
      .eq("user_id", user.id)
      .gt("created_at", target.created_at);
  } else if (mode === "regenerate") {
    if (!parsed.data.regenerateTargetMessageId) {
      return new Response("regenerateTargetMessageId required for mode=regenerate", { status: 400 });
    }
    // Drop the old assistant reply. assembleContext naturally re-uses the
    // prior user message as the latest turn since no new user msg is inserted.
    await supabase
      .from("messages")
      .delete()
      .eq("id", parsed.data.regenerateTargetMessageId)
      .eq("user_id", user.id);
  }

  // User-msg insert — skipped on edit (we updated in place), regenerate
  // (the prior user msg is already there), and speculative (the whole point
  // of speculative is that we DON'T persist until commit). Wrapped via
  // Promise.resolve so the type collapses to a real Promise (the Supabase
  // builder is a PromiseLike that TS narrows in a way Promise.all flags).
  const userInsertP: Promise<unknown> =
    !isSpeculative && mode === "send"
      ? Promise.resolve(
          supabase
            .from("messages")
            .insert({
              id: userMsgId,
              user_id: user.id,
              chat_id: chatId,
              role: "user",
              content: parsed.data.message,
              input_method: parsed.data.voice ? "voice" : "text",
            })
            .then(({ error }) => { if (error) console.error("user msg insert failed", error); }),
        )
      : Promise.resolve();

  // Same for the assistant row — speculative gets a UUID for tool attribution
  // (some tool handlers reference it) but we never insert.
  const assistantInsertP: Promise<unknown> = isSpeculative
    ? Promise.resolve()
    : Promise.resolve(
        supabase
          .from("messages")
          .insert({
            id: assistantMsgId,
            user_id: user.id,
            chat_id: chatId,
            role: "assistant",
            content: "",
            input_method: "text",
          })
          .then(({ error }) => { if (error) console.error("assistant msg insert failed", error); }),
      );

  // Chat title / updated_at — purely sidebar metadata. Defer until end of
  // stream. Skip entirely on speculative — the persist endpoint handles it.
  const chatMetaP: Promise<unknown> = isSpeculative
    ? Promise.resolve()
    : (async () => {
        const { data: chatRow } = await supabase
          .from("chats")
          .select("title")
          .eq("id", chatId!)
          .single();
        if (chatRow && (chatRow.title === "New chat" || chatRow.title.trim() === "")) {
          return supabase
            .from("chats")
            .update({ title: deriveTitleFromMessage(parsed.data.message) })
            .eq("id", chatId!);
        }
        return supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId!);
      })();

  // Pull last 10 messages of this chat for enrichment recent-turn context.
  const recentTurnsForEnrichment = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("chat_id", chatId!)
    .order("created_at", { ascending: false })
    .limit(10)
    .then((r) =>
      ((r.data ?? []) as Array<{ role: "user" | "assistant"; content: string }>)
        .reverse()
    );

  // One catalog fetch shared with enrichment (only enrichment needs it).
  const entityCatalogP = loadEntityCatalog(supabase, user.id);

  // Wait only for what's strictly needed: the model's context, enrichment,
  // episodes, and the assistant row existing so tools can attribute to it.
  const [{ messages, memoryProfile }, enrichment, fastEpisodes] = await Promise.all([
    assembleContext({
      supabase,
      userId: user.id,
      chatId,
      newUserMessage: parsed.data.message,
      voice: parsed.data.voice ?? false,
      voiceContext: parsed.data.voiceContext ?? null,
    }),
    entityCatalogP.then((catalog) =>
      enrichTurn({
        userMessage: parsed.data.message,
        recentTurns: recentTurnsForEnrichment.map((m) => ({ role: m.role, content: m.content })),
        entityCatalog: catalog,
        voice: parsed.data.voice ?? false,
        nowIso: new Date().toISOString(),
        timezone: profileTimezone,
        config,
        signal: req.signal,
        // Fire-and-forget promise extraction. Speculative turns skip persistence
        // entirely (the user msg isn't saved either, so source_message_id would
        // dangle). Non-speculative turns may have userMsgId = null only on
        // regenerate; in that case the promise still gets recorded without a
        // source link.
        persistPromises: isSpeculative
          ? undefined
          : {
              supabase,
              userId: user.id,
              sourceMessageId: mode === "send" ? userMsgId : null,
            },
      })
    ),
    retrieveEpisodes({
      supabase,
      userId: user.id,
      userMessage: parsed.data.message,
      recentTurns: recentTurnsForEnrichment.map((m) => ({ role: m.role, content: m.content })),
      signal: req.signal,
    }),
    assistantInsertP,
  ]);

  // Entity top-up: if enrichment surfaced entity ids we didn't recall, fetch their episodes.
  let episodes = fastEpisodes;
  if (enrichment && memoryProfile?.memory_enabled !== false) {
    const entityIds = {
      tasks:      enrichment.resolvedEntities.tasks.map((t) => t.id),
      routines:   enrichment.resolvedEntities.routines.map((r) => r.id),
      trackers:   enrichment.resolvedEntities.trackers.map((t) => t.id),
      workspaces: enrichment.resolvedEntities.workspaces.map((w) => w.id),
    };
    episodes = await topUpEpisodesByEntity({
      supabase,
      userId: user.id,
      fastEpisodes,
      entityIds,
    });
  }

  // Inject memory blocks; if memory is disabled for this user, skip injection.
  const finalMessages = memoryProfile?.memory_enabled === false
    ? messages
    : injectMemoryBlocks(messages, { profile: memoryProfile, episodes, enrichment });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      let assistantText = "";
      // Collect cards as they fly past so we can persist them on the
      // assistant message's metadata.cards at finalize. Without this, cards
      // are visible during the turn but vanish on next chat load — the
      // user reported logged trackers / routine check-ins disappearing.
      const cardsForMessage: Array<{ kind: string; data: unknown }> = [];
      try {
        for await (const event of runConversation({
          supabase,
          userId: user.id,
          assistantMessageId: assistantMsgId,
          config,
          initialMessages: finalMessages,
          // Voice mode unlocks `end_voice_session` so the LLM can detect
          // semantic stop intent. Text turns get the standard tool list.
          tools: toolsForMode({ voice: parsed.data.voice === true }),
          signal: req.signal,
        })) {
          if (event.type === "text") assistantText += event.delta;
          if (
            event.type === "tool_result" &&
            typeof event.cardKind === "string" &&
            event.card !== undefined &&
            event.card !== null
          ) {
            cardsForMessage.push({ kind: event.cardKind, data: event.card });
          }
          send(event);
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "stream failed" });
      } finally {
        // Finalize all writes — user msg insert, assistant content save, chat
        // metadata update — in parallel. None of these gate the user-visible
        // stream_end event, but we await them so the route doesn't return
        // before they settle (Vercel kills pending fetches otherwise).
        //
        // Speculative skips all writes: the persist endpoint owns them on
        // commit. assistantText is still tracked through this loop so the
        // stream_end can echo it back to the client, which will pass it to
        // /api/chat/persist verbatim.
        if (!isSpeculative) {
          try {
            await Promise.all([
              userInsertP,
              supabase
                .from("messages")
                .update({
                  content: assistantText,
                  // Empty object when there were no cards so we don't clobber
                  // any other metadata fields someone might add later. Cards
                  // are the only consumer today.
                  metadata:
                    cardsForMessage.length > 0
                      ? { cards: cardsForMessage }
                      : {},
                })
                .eq("id", assistantMsgId),
              chatMetaP,
              // After the assistant content lands, bump updated_at once more so
              // the sidebar shows the freshest order.
              supabase
                .from("chats")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", chatId),
            ]);
          } catch (e) {
            console.error("post-stream finalize failed", e);
          }
        }
        send({
          type: "stream_end",
          userMessageId: isSpeculative ? null : userMsgId,
          assistantMessageId: isSpeculative ? null : assistantMsgId,
          chatId,
          speculative: isSpeculative,
          assistantText: isSpeculative ? assistantText : undefined,
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
