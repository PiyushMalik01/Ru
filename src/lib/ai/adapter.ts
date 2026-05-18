import type { StreamCompletionInput, StreamEvent } from "./types";
import { streamCodex } from "./providers/codex";
import { streamOpenAI } from "./providers/openai";
import { streamAnthropic } from "./providers/anthropic";
import { streamGemini } from "./providers/gemini";

export async function* streamCompletion(
  input: StreamCompletionInput
): AsyncGenerator<StreamEvent> {
  switch (input.config.provider) {
    case "chatgpt_oauth":
      yield* streamCodex(input);
      return;
    case "openai":
      yield* streamOpenAI(input);
      return;
    case "anthropic":
      yield* streamAnthropic(input);
      return;
    case "gemini":
      yield* streamGemini(input);
      return;
  }
}
