import Anthropic from "@anthropic-ai/sdk";
import type { StreamCompletionInput, StreamEvent, NormalizedMessage } from "../types";

function splitSystem(messages: NormalizedMessage[]): { system: string; rest: NormalizedMessage[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  return { system, rest };
}

function toAnthropic(messages: NormalizedMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [{ type: "tool_result" as const, tool_use_id: m.toolCallId!, content: m.content }],
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const blocks: object[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
      }
      return { role: "assistant" as const, content: blocks };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });
}

export async function* streamAnthropic(input: StreamCompletionInput): AsyncGenerator<StreamEvent> {
  const client = new Anthropic({ apiKey: input.config.apiKey });
  const { system, rest } = splitSystem(input.messages);

  const stream = client.messages.stream(
    {
      model: input.config.model,
      max_tokens: 4096,
      system: system
        ? [
            {
              type: "text",
              text: system,
              cache_control: { type: "ephemeral" } as never,
            },
          ]
        : undefined,
      messages: toAnthropic(rest) as never,
      tools: input.tools.length
        ? input.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as never,
          }))
        : undefined,
    },
    { signal: input.signal as never }
  );

  const toolBuf = new Map<number, { id: string; name: string; jsonBuf: string }>();
  let finishReason = "end_turn";

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "tool_use") {
        toolBuf.set(event.index, { id: block.id, name: block.name, jsonBuf: "" });
      }
    } else if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "text_delta") {
        yield { type: "text", delta: delta.text };
      } else if (delta.type === "input_json_delta") {
        const pending = toolBuf.get(event.index);
        if (pending) pending.jsonBuf += delta.partial_json;
      }
    } else if (event.type === "message_delta") {
      if (event.delta.stop_reason) finishReason = event.delta.stop_reason;
    }
  }

  for (const pc of toolBuf.values()) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(pc.jsonBuf || "{}"); } catch { args = {}; }
    yield { type: "tool_call", call: { id: pc.id, name: pc.name, arguments: args } };
  }

  yield { type: "done", finishReason };
}
