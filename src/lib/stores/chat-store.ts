"use client";

import { create } from "zustand";

export type CardKind = "task" | "routine" | "activity" | "reminder" | "insight" | "tracker";

export interface ChatCard {
  kind: CardKind;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: ChatCard[];
  streaming?: boolean;
}

// Phases the assistant cycles through during a turn — drives the loader UI.
export type ThinkingPhase = "idle" | "thinking" | "tooling" | "speaking";

// Context attached to a send so Ru's reply is relevant to the page the user
// is asking from. Set by the AskHud; cleared on chat page.
export interface PageContext {
  hint: string;
  workspaceId?: string;
}

/**
 * Tool-call signal for voice subscribers (Phase 5 — tool-fill speech).
 *
 * Bumped from the SSE parser whenever a `tool_call` event lands. The `tick`
 * counter exists so back-to-back calls to the same tool still fire the
 * subscriber (Zustand only re-notifies on referential change). Voice
 * subscribes to this in voice-conversation.tsx to speak a tool-appropriate
 * filler ("Adding that now.") while the tool runs.
 */
export interface ToolCallSignal {
  name: string;
  tick: number;
}

interface ChatState {
  messages: ChatMessage[];
  status: "idle" | "streaming" | "error";
  thinking: ThinkingPhase;
  thinkingLabel: string | null;
  errorMessage: string | null;
  voiceMode: boolean;
  continuousVoice: boolean;
  hydrated: boolean;
  chatId: string | null;
  pageContext: PageContext | null;
  lastToolCall: ToolCallSignal | null;

  hydrate: (messages: ChatMessage[], chatId: string | null) => void;
  setChatId: (chatId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setVoiceMode: (v: boolean) => void;
  setContinuousVoice: (v: boolean) => void;
  setPageContext: (ctx: PageContext | null) => void;
  sendText: (text: string, opts?: SendOptions) => Promise<void>;
  /**
   * Append a fully-formed (user, assistant) pair after a successful
   * speculative voice turn. The IDs come from /api/chat/persist and the
   * content is the buffered assistant text from the speculative LLM call.
   * The voice orchestrator calls this once SpeculativeController.commit()
   * returns usedSpeculative=true.
   */
  insertPersistedTurn: (turn: {
    userMessageId: string;
    assistantMessageId: string;
    userText: string;
    assistantText: string;
    chatId: string;
    voice?: boolean;
  }) => void;
  /** Replace a user message's content and re-run from that point. */
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  /** Drop the last assistant reply and re-run against the same prompt. */
  regenerateLast: () => Promise<void>;
  abort: () => void;
  reset: () => void;
}

interface SendOptions {
  mode?: "send" | "edit" | "regenerate";
  editTargetMessageId?: string;
  regenerateTargetMessageId?: string;
  /**
   * Paralinguistic signal extracted from the user's audio for the just-
   * finished turn. Threaded through to /api/chat so the engine can adapt
   * tone (and so the LLM sees a voiceContext system block). Voice-only.
   */
  voiceContext?: import("@/lib/ai/engine/voice-persona").VoiceContext | null;
}

let abortController: AbortController | null = null;

type TTSHandleType = {
  speak: (text: string, opts?: { format?: "ssml" | "plain" }) => void;
  flush: () => void;
  setSpeed: (wpm: number) => void;
  interrupt: () => void;
  stop: () => Promise<void>;
  isPlaying: () => boolean;
};
let ttsHandle: TTSHandleType | null = null;

// Exported for the VoiceConversation orb to know when Ru is still speaking
// (so it can wait before re-opening the mic in continuous mode).
export function isTTSPlaying(): boolean {
  return ttsHandle?.isPlaying() ?? false;
}

/**
 * Rhythm mirroring (Phase 4): set Aura's output speed in WPM. The TTS layer
 * clamps to a sane band and currently treats this as a staged stub because
 * Aura's WS doesn't honor runtime speed control yet — but wiring the call
 * here means callers don't change when it's available. Safe no-op when the
 * TTS handle hasn't been created yet (first turn of the session).
 */
export function setTTSSpeed(wpm: number): void {
  ttsHandle?.setSpeed(wpm);
}

/**
 * Speak a short out-of-band utterance immediately via the shared TTS handle.
 *
 * Used for:
 *   - Tool fillers ("Adding that now.") spoken between tool_call_detected
 *     and the first assistant text delta.
 *   - Predictive openings spoken on voice mode open.
 *
 * Lazily warms the TTS handle on first call so we don't pay an extra
 * handshake at mount when the user isn't actually going to speak. Plain-text
 * format because these utterances are short canned phrases — the prosody
 * parser still translates any embedded [pause:Nms] tags into <break/> SSML
 * regardless of the format flag.
 */
export async function speakImmediate(
  text: string,
  opts?: { format?: "ssml" | "plain" },
): Promise<void> {
  if (!text.trim()) return;
  try {
    const tts = await getTTS();
    tts.speak(text, { format: opts?.format ?? "plain" });
    tts.flush();
  } catch (e) {
    console.error("speakImmediate failed", e);
  }
}
async function getTTS(): Promise<TTSHandleType> {
  if (ttsHandle) return ttsHandle;
  const { startTTS } = await import("@/lib/voice/tts");
  ttsHandle = await startTTS();
  return ttsHandle;
}
/**
 * Exposed for the speculative-reply orchestrator — it needs to speak/flush
 * through the same shared Aura connection that sendText uses, otherwise
 * we'd be opening parallel WS connections. Returns the handle synchronously
 * (lazily warming on first call via getTTS).
 */
export async function getTTSHandleForSpeculative(): Promise<{
  speak: (text: string, opts?: { format?: "ssml" | "plain" }) => void;
  flush: () => void;
}> {
  const tts = await getTTS();
  return {
    speak: (text, opts) => tts.speak(text, opts),
    flush: () => tts.flush(),
  };
}
/** Cut audio mid-turn but KEEP the WS open so the next turn doesn't pay the
 * handshake cost. Used between turns and on barge-in. */
function interruptTTS() {
  try { ttsHandle?.interrupt(); } catch {}
}
async function stopTTS() {
  if (ttsHandle) {
    try { await ttsHandle.stop(); } catch {}
    ttsHandle = null;
  }
}

// ─── Typewriter buffer ────────────────────────────────────────────────────
// Even when the model bursts a paragraph in one chunk, we render at a steady
// pace so reading feels natural — like ChatGPT/Claude — instead of jolting.
const CHARS_PER_FRAME = 3; // ~180 chars/sec at 60fps
let tw: { messageId: string; pending: string } | null = null;
let twRaf = 0;

type Setter = (s: Partial<ChatState>) => void;
type Getter = () => ChatState;

function scheduleType(set: Setter, get: Getter) {
  if (twRaf) return;
  const step = () => {
    twRaf = 0;
    const slot = tw;
    if (!slot || !slot.pending) return;

    const take = Math.min(CHARS_PER_FRAME, slot.pending.length);
    const chunk = slot.pending.slice(0, take);
    slot.pending = slot.pending.slice(take);

    const messages = get().messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.id === slot.messageId) {
      last.content += chunk;
      set({ messages });
    }

    if (slot.pending.length > 0) {
      twRaf = requestAnimationFrame(step);
    } else if (!last?.streaming) {
      tw = null;
    }
  };
  twRaf = requestAnimationFrame(step);
}

function flushType(set: Setter, get: Getter) {
  if (!tw?.pending) {
    if (twRaf) { cancelAnimationFrame(twRaf); twRaf = 0; }
    tw = null;
    return;
  }
  const messages = get().messages.slice();
  const last = messages[messages.length - 1];
  if (last && last.id === tw.messageId) {
    last.content += tw.pending;
    set({ messages });
  }
  tw = null;
  if (twRaf) { cancelAnimationFrame(twRaf); twRaf = 0; }
}

function humanizeToolName(name: string | undefined): string {
  if (!name) return "Cooking";
  const map: Record<string, string> = {
    log_activity: "Logging",
    create_task: "Creating task",
    complete_task: "Completing task",
    delete_task: "Deleting task",
    declare_routine: "Saving routine",
    complete_routine: "Marking routine done",
    delete_routine: "Deleting routine",
    skip_routine_today: "Skipping today",
    create_reminder: "Setting reminder",
    complete_reminder: "Dismissing reminder",
    snooze_reminder: "Snoozing reminder",
    modify_reminder: "Updating reminder",
    delete_reminder: "Deleting reminder",
    query_analytics: "Looking up your data",
    modify_task: "Updating task",
    modify_routine: "Updating routine",
    modify_activity: "Updating activity",
    delete_activity: "Removing activity",
    get_routine_history: "Looking up history",
    create_tracker: "Building tracker",
    log_tracker_entry: "Logging entry",
    update_tracker: "Updating tracker",
    delete_tracker_entry: "Removing entry",
    open_workspace: "Opening workspace",
    close_workspace: "Closing workspace",
    rename_workspace: "Renaming plan",
    archive_workspace: "Archiving plan",
    update_profile: "Updating profile",
    rename_chat: "Renaming chat",
    archive_chat: "Archiving chat",
  };
  return map[name] ?? "Cooking";
}

// ─── Store ────────────────────────────────────────────────────────────────
export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: "idle",
  thinking: "idle",
  thinkingLabel: null,
  errorMessage: null,
  voiceMode: false,
  continuousVoice: false,
  hydrated: false,
  chatId: null,
  pageContext: null,
  lastToolCall: null,

  setPageContext: (ctx) => set({ pageContext: ctx }),

  hydrate: (messages, chatId) => {
    // Re-hydrate when chat id changes (navigation between chats).
    if (get().hydrated && get().chatId === chatId) return;
    abortController?.abort();
    abortController = null;
    flushType(set as Setter, get);
    set({
      messages,
      chatId,
      hydrated: true,
      status: "idle",
      thinking: "idle",
      thinkingLabel: null,
      errorMessage: null,
    });
  },

  setChatId: (chatId) => set({ chatId }),
  setMessages: (messages) => set({ messages }),

  insertPersistedTurn: (turn) => {
    const existing = get().messages;
    const userMsg: ChatMessage = {
      id: turn.userMessageId,
      role: "user",
      content: turn.userText,
      cards: [],
    };
    const assistantMsg: ChatMessage = {
      id: turn.assistantMessageId,
      role: "assistant",
      content: turn.assistantText,
      cards: [],
      streaming: false,
    };
    set({
      messages: [...existing, userMsg, assistantMsg],
      chatId: get().chatId ?? turn.chatId,
      status: "idle",
      thinking: "idle",
      thinkingLabel: null,
      errorMessage: null,
    });
  },

  setVoiceMode: (v) => {
    if (v) {
      getTTS().catch((e) => console.error("tts pre-warm failed", e));
    } else {
      stopTTS();
      set({ continuousVoice: false });
    }
    set({ voiceMode: v });
  },

  setContinuousVoice: (v) => set({ continuousVoice: v }),

  reset: () => {
    abortController?.abort();
    abortController = null;
    stopTTS();
    flushType(set as Setter, get);
    set({
      messages: [],
      status: "idle",
      thinking: "idle",
      thinkingLabel: null,
      errorMessage: null,
    });
  },

  abort: () => {
    abortController?.abort();
    abortController = null;
    // Interrupt audio but keep TTS connected — user might immediately speak
    // again (barge-in) and we don't want to pay another WS handshake.
    interruptTTS();
    flushType(set as Setter, get);
    const messages = get().messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.streaming) {
      last.streaming = false;
      set({ messages });
    }
    set({ status: "idle", thinking: "idle", thinkingLabel: null });
  },

  editMessage: async (messageId: string, newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    // Refuse to edit messages that haven't been persisted yet — we need the
    // DB id so the server can locate the row and truncate the chat properly.
    if (messageId.startsWith("local-")) return;
    await get().sendText(trimmed, {
      mode: "edit",
      editTargetMessageId: messageId,
    });
  },

  regenerateLast: async () => {
    const msgs = get().messages;
    // Find the last non-streaming assistant message with a persisted id.
    let target: ChatMessage | null = null;
    let lastUserText: string | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!target && m.role === "assistant" && !m.streaming && !m.id.startsWith("local-")) {
        target = m;
      }
      if (target && m.role === "user") {
        lastUserText = m.content;
        break;
      }
    }
    if (!target || !lastUserText) return;
    await get().sendText(lastUserText, {
      mode: "regenerate",
      regenerateTargetMessageId: target.id,
    });
  },

  sendText: async (text: string, opts: SendOptions = {}) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const mode = opts.mode ?? "send";

    // Compose the local messages array per mode:
    //   - send       → append user + assistant
    //   - edit       → truncate to and including the edited message,
    //                  rewrite its content, append a fresh assistant
    //   - regenerate → truncate at the target assistant (drop it and any
    //                  trailing), append a fresh assistant
    let base = get().messages;
    if (mode === "edit" && opts.editTargetMessageId) {
      const idx = base.findIndex((m) => m.id === opts.editTargetMessageId);
      if (idx === -1) return; // edit target missing — bail rather than break the view
      base = base.slice(0, idx + 1).map((m, i) =>
        i === idx ? { ...m, content: trimmed } : m,
      );
    } else if (mode === "regenerate" && opts.regenerateTargetMessageId) {
      const idx = base.findIndex((m) => m.id === opts.regenerateTargetMessageId);
      if (idx === -1) return;
      base = base.slice(0, idx);
    }

    const userMsg: ChatMessage | null =
      mode === "send"
        ? {
            id: `local-${crypto.randomUUID()}`,
            role: "user",
            content: trimmed,
            cards: [],
          }
        : null;
    const assistantMsg: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "assistant",
      content: "",
      cards: [],
      streaming: true,
    };
    set({
      messages: userMsg ? [...base, userMsg, assistantMsg] : [...base, assistantMsg],
      status: "streaming",
      thinking: "thinking",
      thinkingLabel: null,
      errorMessage: null,
    });

    tw = { messageId: assistantMsg.id, pending: "" };

    // Interrupt previous TTS audio without closing the WebSocket — keeps
    // turn-to-turn latency low. Aura's "Clear" message resets the server-side
    // buffer; the AudioContext stays alive.
    interruptTTS();
    abortController = new AbortController();
    let charsSinceFlush = 0;
    // Flush ONLY on true sentence boundaries. Commas/colons cause audible
    // segment breaks in Aura's stream — each Flush is a new synthesis chunk
    // with its own prosody, so flushing mid-sentence makes Ru sound stuttery.
    const flushBoundary = /[.!?\n]/;

    // Pipe each delta through the prosody parser. Markdown gets stripped and
    // any inline prosody tags like [pause] / [soft]…[/soft] become SSML
    // fragments. Aura doesn't formally accept SSML, but the TTS layer
    // gracefully strips tags before send — meaning the prosody tags never
    // get read literally, which is what we want either way. When Aura ships
    // SSML support these chunks flow through unchanged.
    const { createProsodyStream } = await import("@/lib/voice/prosody");
    const prosody = createProsodyStream();

    const speakIfVoice = async (chunk: string, force: boolean = false) => {
      if (!get().voiceMode) return;
      try {
        const tts = await getTTS();
        const ssmlChunks = chunk ? prosody.push(chunk) : (force ? prosody.flush() : []);
        let hitPunct = false;
        for (const c of ssmlChunks) {
          if (!c.ssml.trim()) continue;
          tts.speak(c.ssml, { format: "ssml" });
          // Track speakable (post-tag-translation) character count for the
          // flush heuristic. SSML markup doesn't count toward the cap.
          const spokenLen = c.ssml.replace(/<[^>]+>/g, "").length;
          charsSinceFlush += spokenLen;
          if (c.sentenceComplete) hitPunct = true;
          if (flushBoundary.test(c.ssml)) hitPunct = true;
        }
        // Char-cap is a fallback for run-on text with no punctuation. Raised
        // from 40 → 180 so we don't force-flush mid-sentence on average prose.
        if (force || hitPunct || charsSinceFlush >= 180) {
          tts.flush();
          charsSinceFlush = 0;
        }
      } catch (e) {
        console.error("tts failed", e);
      }
    };

    try {
      const currentChatId = get().chatId;
      const ctx = get().pageContext;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          voice: get().voiceMode,
          chatId: currentChatId ?? undefined,
          pageContext: ctx ?? undefined,
          mode,
          editTargetMessageId: opts.editTargetMessageId,
          regenerateTargetMessageId: opts.regenerateTargetMessageId,
          voiceContext: opts.voiceContext ?? undefined,
        }),
        signal: abortController.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        set({
          status: "error",
          errorMessage: err || "request failed",
          thinking: "idle",
          thinkingLabel: null,
        });
        const msgs = get().messages.slice();
        const last = msgs[msgs.length - 1];
        if (last) last.streaming = false;
        set({ messages: msgs });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: { type: string; [key: string]: unknown };
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "text") {
            const delta = String(event.delta ?? "");
            if (get().thinking !== "speaking") {
              set({ thinking: "speaking", thinkingLabel: null });
            }
            if (tw) tw.pending += delta;
            scheduleType(set as Setter, get);
            await speakIfVoice(delta);
          } else if (event.type === "tool_call") {
            const call = event.call as { name?: string } | undefined;
            const toolName = call?.name ?? "";
            const prevTick = get().lastToolCall?.tick ?? 0;
            set({
              thinking: "tooling",
              thinkingLabel: humanizeToolName(toolName),
              // Tick-bumped signal so voice subscribers can speak a filler
              // even when the same tool fires back-to-back. Empty name still
              // bumps so the subscriber can decide what to do (default bank).
              lastToolCall: { name: toolName, tick: prevTick + 1 },
            });
          } else if (event.type === "tool_result" && event.cardKind) {
            const msgs = get().messages.slice();
            const last = msgs[msgs.length - 1];
            if (last) {
              last.cards = [
                ...last.cards,
                {
                  kind: event.cardKind as CardKind,
                  data: (event.card as Record<string, unknown>) ?? {},
                },
              ];
              set({ messages: msgs });
            }
          } else if (event.type === "stream_end") {
            flushType(set as Setter, get);
            const msgs = get().messages.slice();
            const last = msgs[msgs.length - 1];
            if (last) {
              last.streaming = false;
              if (event.assistantMessageId) last.id = String(event.assistantMessageId);
              set({ messages: msgs });
            }
            // If the server created/resolved a chat id, adopt it so subsequent
            // turns continue in the same thread.
            if (event.chatId && !get().chatId) {
              set({ chatId: String(event.chatId) });
            }
            await speakIfVoice("", true);
          } else if (event.type === "error") {
            set({ status: "error", errorMessage: String(event.message ?? "stream error") });
          }
        }
      }
      flushType(set as Setter, get);
      set({ status: "idle", thinking: "idle", thinkingLabel: null });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      set({
        status: "error",
        errorMessage: (e as Error).message,
        thinking: "idle",
        thinkingLabel: null,
      });
      flushType(set as Setter, get);
      const msgs = get().messages.slice();
      const last = msgs[msgs.length - 1];
      if (last) last.streaming = false;
      set({ messages: msgs });
    }
  },
}));
