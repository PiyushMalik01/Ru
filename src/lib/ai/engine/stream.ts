import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProviderConfig, StreamEvent, NormalizedMessage, NormalizedToolCall } from "../types";
import { streamCompletion } from "../adapter";
import { TOOL_DEFINITIONS } from "../tools/definitions";
import { executeTool } from "../tools/executor";

const MAX_TOOL_ROUNDS = 4;

export async function* runConversation(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  assistantMessageId: string;
  config: ProviderConfig;
  initialMessages: NormalizedMessage[];
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const messages = [...opts.initialMessages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let fullText = "";
    const toolCalls: NormalizedToolCall[] = [];

    for await (const event of streamCompletion({
      config: opts.config,
      messages,
      tools: TOOL_DEFINITIONS,
      signal: opts.signal,
    })) {
      if (event.type === "text") {
        fullText += event.delta;
        yield event;
      } else if (event.type === "tool_call") {
        toolCalls.push(event.call);
        yield event;
      } else if (event.type === "error") {
        yield event;
        return;
      }
      // Suppress "done" from inner stream — outer loop manages termination
    }

    if (toolCalls.length === 0) {
      yield { type: "done", finishReason: "stop" };
      return;
    }

    messages.push({ role: "assistant", content: fullText, toolCalls });

    for (const call of toolCalls) {
      const outcome = await executeTool(call.name, call.arguments, {
        supabase: opts.supabase,
        userId: opts.userId,
        messageId: opts.assistantMessageId,
      });

      yield {
        type: "tool_result",
        toolCallId: call.id,
        result: outcome.message,
        cardKind: outcome.cardKind,
        card: outcome.card,
      };

      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify({ ok: outcome.ok, message: outcome.message }),
      });
    }
  }

  yield { type: "done", finishReason: "max_tool_rounds" };
}
