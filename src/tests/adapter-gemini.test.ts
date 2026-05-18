import { describe, it, expect, vi } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { candidates: [{ content: { parts: [{ text: "Sure" }] } }] };
          yield {
            candidates: [{
              content: { parts: [{ functionCall: { name: "create_task", args: { title: "buy milk" } } }] },
              finishReason: "STOP",
            }],
          };
        },
      }),
    };
  },
}));

import { streamGemini } from "@/lib/ai/providers/gemini";

describe("streamGemini", () => {
  it("emits text then tool_call then done", async () => {
    const events: unknown[] = [];
    for await (const e of streamGemini({
      config: { provider: "gemini", apiKey: "test", model: "gemini-2.5-flash" },
      messages: [{ role: "user", content: "buy milk" }],
      tools: [],
    })) events.push(e);
    expect(events[0]).toMatchObject({ type: "text", delta: "Sure" });
    expect(events[1]).toMatchObject({ type: "tool_call", call: { name: "create_task" } });
    expect(events[2]).toMatchObject({ type: "done" });
  });
});
