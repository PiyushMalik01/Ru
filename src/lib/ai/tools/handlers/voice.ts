import type { ToolContext, ToolOutcome } from "../executor";

/**
 * `end_voice_session` handler.
 *
 * Intentionally trivial. The semantic close happens client-side: the
 * client (voice-conversation.tsx) subscribes to the chat-store's
 * `lastToolCall` signal, recognizes the tool name, waits for Ru's
 * spoken goodbye to finish playing, then tears down the voice loop.
 *
 * We return `acknowledged: true` so the LLM gets a clean tool result
 * back in the same SSE stream — it can then emit the goodbye reply
 * with full confidence the session-end was registered.
 */
export async function endVoiceSession(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<ToolOutcome> {
  const reason = typeof args.reason === "string" ? args.reason : "unspecified";
  return {
    ok: true,
    message: JSON.stringify({ acknowledged: true, reason }),
  };
}
