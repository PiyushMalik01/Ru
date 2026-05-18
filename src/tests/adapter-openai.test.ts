import { describe, it, expect, vi } from "vitest";

vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: async () => ({
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "Hel" } }] };
              yield { choices: [{ delta: { content: "lo!" } }] };
              yield {
                choices: [{
                  delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "log_activity", arguments: "{\"activity\":\"ran 5k\"}" } }] },
                  finish_reason: "tool_calls",
                }],
              };
            },
          }),
        },
      };
    },
  };
});

import { streamOpenAI } from "@/lib/ai/providers/openai";

describe("streamOpenAI", () => {
  it("emits text deltas then tool_call then done", async () => {
    const events: unknown[] = [];
    for await (const e of streamOpenAI({
      config: { provider: "openai", apiKey: "test", model: "gpt-4o-mini" },
      messages: [{ role: "user", content: "ran 5k" }],
      tools: [],
    })) {
      events.push(e);
    }
    expect(events[0]).toEqual({ type: "text", delta: "Hel" });
    expect(events[1]).toEqual({ type: "text", delta: "lo!" });
    expect(events[2]).toMatchObject({ type: "tool_call", call: { name: "log_activity" } });
    expect(events[3]).toMatchObject({ type: "done", finishReason: "tool_calls" });
  });
});
