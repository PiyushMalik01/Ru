import { GoogleGenAI } from "@google/genai";
import type { StreamCompletionInput, StreamEvent, NormalizedMessage } from "../types";

function toGemini(messages: NormalizedMessage[]) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool") {
        return {
          role: "user" as const,
          parts: [{ functionResponse: { name: m.toolCallId!, response: { result: m.content } } }],
        };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "model" as const,
          parts: m.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.arguments } })),
        };
      }
      return {
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      };
    });
}

export async function* streamGemini(input: StreamCompletionInput): AsyncGenerator<StreamEvent> {
  const client = new GoogleGenAI({ apiKey: input.config.apiKey });
  const system = input.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");

  const response = await client.models.generateContentStream({
    model: input.config.model,
    contents: toGemini(input.messages),
    config: {
      systemInstruction: system || undefined,
      tools: input.tools.length
        ? [{
            functionDeclarations: input.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as never,
            })),
          }]
        : undefined,
    },
  });

  let finishReason = "STOP";
  for await (const chunk of response) {
    const candidate = chunk.candidates?.[0];
    if (!candidate) continue;
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) {
        yield { type: "text", delta: part.text };
      }
      if (part.functionCall) {
        yield {
          type: "tool_call",
          call: {
            id: `gemini_${crypto.randomUUID()}`,
            name: part.functionCall.name ?? "",
            arguments: (part.functionCall.args as Record<string, unknown>) ?? {},
          },
        };
      }
    }
    if (candidate.finishReason) finishReason = candidate.finishReason;
  }

  yield { type: "done", finishReason };
}
