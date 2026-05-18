// ChatGPT Codex provider — calls chatgpt.com/backend-api/codex/responses with the user's
// OAuth access token + account id. Model is forced to gpt-5.4 per product direction.
//
// This is the OpenAI Responses API tunneled through ChatGPT's own auth. Tool definitions and
// tool calls use the Responses API shape (different from chat.completions): tools are flat
// `{ type: "function", name, description, parameters }`; tool calls come back as output items
// of `type: "function_call"`; tool results go back as input items of `type: "function_call_output"`.

import type { StreamCompletionInput, StreamEvent, NormalizedMessage } from "../types";
import { OPENAI_OAUTH } from "../openai-oauth";

export const CODEX_MODEL = "gpt-5.4";

function sanitizeToAscii(text: string): string {
  return text.replace(/[^\x20-\x7E\n\r\t]/g, "").replace(/\{\{.*?\}\}/g, "");
}

function buildInput(messages: NormalizedMessage[]) {
  // Responses API expects an array of items mixing role-messages, function_calls, and function_call_outputs.
  // System messages are hoisted into top-level `instructions`.
  const items: object[] = [];
  for (const m of messages) {
    if (m.role === "system") continue; // handled separately
    if (m.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: m.toolCallId,
        output: m.content,
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      if (m.content) {
        items.push({ role: "assistant", content: m.content });
      }
      for (const tc of m.toolCalls) {
        items.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        });
      }
      continue;
    }
    items.push({ role: m.role, content: m.content });
  }
  return items;
}

interface PendingToolCall {
  id: string;
  name: string;
  argsBuf: string;
}

export async function* streamCodex(input: StreamCompletionInput): AsyncGenerator<StreamEvent> {
  // The accountId is required by the codex endpoint; we encode it in `apiKey` field as
  // `<accessToken>::<accountId>` so the adapter can keep the same ProviderConfig shape.
  const [accessToken, accountId] = input.config.apiKey.split("::");
  if (!accessToken) {
    yield { type: "error", message: "Missing ChatGPT access token" };
    return;
  }
  if (!accountId) {
    yield { type: "error", message: "Missing ChatGPT account ID — reconnect ChatGPT in Settings" };
    return;
  }

  const systemText = input.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const body: Record<string, unknown> = {
    model: CODEX_MODEL, // gpt-5.4
    instructions: sanitizeToAscii(systemText),
    input: buildInput(input.messages),
    store: false,
    stream: true,
  };

  if (input.tools.length) {
    body.tools = input.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  const res = await fetch(OPENAI_OAUTH.CODEX_API_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      authorization: `Bearer ${accessToken}`,
      "chatgpt-account-id": accountId,
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    yield {
      type: "error",
      message: `Codex API ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const pending = new Map<string, PendingToolCall>();
  let finishReason = "completed";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      const type = String(event.type ?? "");

      // Text token deltas
      if (type === "response.output_text.delta") {
        const delta = String(event.delta ?? "");
        if (delta) yield { type: "text", delta };
        continue;
      }

      // A new function_call output item starts — capture its id + name
      if (type === "response.output_item.added") {
        const item = event.item as { type?: string; id?: string; call_id?: string; name?: string } | undefined;
        if (item?.type === "function_call") {
          const id = item.call_id ?? item.id ?? `codex_${Math.random().toString(36).slice(2)}`;
          pending.set(id, { id, name: item.name ?? "", argsBuf: "" });
        }
        continue;
      }

      // Streaming JSON args for a function_call
      if (type === "response.function_call_arguments.delta") {
        const id = String(event.call_id ?? event.item_id ?? "");
        const delta = String(event.delta ?? "");
        const slot = pending.get(id);
        if (slot && delta) slot.argsBuf += delta;
        continue;
      }

      // function_call args complete — emit the tool_call
      if (type === "response.function_call_arguments.done") {
        const id = String(event.call_id ?? event.item_id ?? "");
        const slot = pending.get(id);
        if (slot) {
          let args: Record<string, unknown> = {};
          const buffered = String(event.arguments ?? slot.argsBuf ?? "");
          try { args = JSON.parse(buffered || "{}"); } catch { args = {}; }
          yield { type: "tool_call", call: { id: slot.id, name: slot.name, arguments: args } };
          pending.delete(id);
        }
        continue;
      }

      // Some Responses API streams emit complete output_item.done for function_call directly
      if (type === "response.output_item.done") {
        const item = event.item as { type?: string; call_id?: string; id?: string; name?: string; arguments?: string } | undefined;
        if (item?.type === "function_call") {
          const id = item.call_id ?? item.id ?? "";
          const slot = pending.get(id);
          let args: Record<string, unknown> = {};
          const rawArgs = item.arguments ?? slot?.argsBuf ?? "";
          try { args = JSON.parse(rawArgs || "{}"); } catch { args = {}; }
          yield { type: "tool_call", call: { id, name: item.name ?? slot?.name ?? "", arguments: args } };
          pending.delete(id);
        }
        continue;
      }

      if (type === "response.completed" || type === "response.done") {
        const response = event.response as { status?: string; incomplete_details?: { reason?: string } } | undefined;
        finishReason = response?.status ?? "completed";
        continue;
      }

      if (type === "response.error" || type === "error") {
        const err = (event.error as { message?: string } | undefined)?.message ?? "codex stream error";
        yield { type: "error", message: err };
        return;
      }
    }
  }

  // Flush any pending tool calls without an explicit done event
  for (const slot of pending.values()) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(slot.argsBuf || "{}"); } catch { args = {}; }
    yield { type: "tool_call", call: { id: slot.id, name: slot.name, arguments: args } };
  }

  yield { type: "done", finishReason };
}
