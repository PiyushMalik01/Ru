import OpenAI from "openai";
import type { StreamCompletionInput, StreamEvent, NormalizedMessage } from "../types";

function toOpenAIMessages(messages: NormalizedMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool" as const, tool_call_id: m.toolCallId!, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role as "system" | "user" | "assistant", content: m.content };
  });
}

export async function* streamOpenAI(input: StreamCompletionInput): AsyncGenerator<StreamEvent> {
  const client = new OpenAI({ apiKey: input.config.apiKey });
  const stream = await client.chat.completions.create(
    {
      model: input.config.model,
      messages: toOpenAIMessages(input.messages) as never,
      tools: input.tools.length
        ? input.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          }))
        : undefined,
      stream: true,
    },
    { signal: input.signal }
  );

  const pendingCalls = new Map<number, { id: string; name: string; argsBuf: string }>();
  let finishReason = "stop";

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    const delta = choice.delta;
    if (delta.content) {
      yield { type: "text", delta: delta.content };
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        let pending = pendingCalls.get(idx);
        if (!pending) {
          pending = { id: tc.id ?? "", name: tc.function?.name ?? "", argsBuf: "" };
          pendingCalls.set(idx, pending);
        }
        if (tc.id) pending.id = tc.id;
        if (tc.function?.name) pending.name = tc.function.name;
        if (tc.function?.arguments) pending.argsBuf += tc.function.arguments;
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  for (const pc of pendingCalls.values()) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(pc.argsBuf || "{}"); } catch { args = {}; }
    yield { type: "tool_call", call: { id: pc.id, name: pc.name, arguments: args } };
  }

  yield { type: "done", finishReason };
}
