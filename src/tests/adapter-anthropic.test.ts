import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
          yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } };
          yield { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_1", name: "create_task", input: {} } };
          yield { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"title\":\"buy milk\"}" } };
          yield { type: "message_delta", delta: { stop_reason: "tool_use" } };
        },
      }),
    };
  },
}));

import { streamAnthropic } from "@/lib/ai/providers/anthropic";

describe("streamAnthropic", () => {
  it("emits text, then tool_call, then done", async () => {
    const events: unknown[] = [];
    for await (const e of streamAnthropic({
      config: { provider: "anthropic", apiKey: "test", model: "claude-sonnet-4-6" },
      messages: [{ role: "user", content: "buy milk" }],
      tools: [],
    })) events.push(e);

    expect(events[0]).toMatchObject({ type: "text", delta: "Hi" });
    expect(events[1]).toMatchObject({ type: "tool_call", call: { name: "create_task", arguments: { title: "buy milk" } } });
    expect(events[2]).toMatchObject({ type: "done", finishReason: "tool_use" });
  });
});
