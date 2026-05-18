export type Provider = "openai" | "anthropic" | "gemini";

export interface NormalizedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: NormalizedToolCall[];
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface NormalizedTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: NormalizedToolCall }
  | { type: "tool_result"; toolCallId: string; result: unknown; cardKind?: string; card?: unknown }
  | { type: "done"; finishReason: string }
  | { type: "error"; message: string }
  | { type: "stream_end"; userMessageId?: string; assistantMessageId?: string };

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

export interface StreamCompletionInput {
  config: ProviderConfig;
  messages: NormalizedMessage[];
  tools: NormalizedTool[];
  signal?: AbortSignal;
}
