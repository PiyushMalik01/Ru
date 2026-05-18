"use client";

import { create } from "zustand";

export type CardKind = "task" | "routine" | "activity" | "reminder" | "insight";

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

  hydrate: (messages: ChatMessage[], chatId: string | null) => void;
  setChatId: (chatId: string | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setVoiceMode: (v: boolean) => void;
  setContinuousVoice: (v: boolean) => void;
  setPageContext: (ctx: PageContext | null) => void;
  sendText: (text: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

let abortController: AbortController | null = null;

type TTSHandleType = { speak: (text: string) => void; flush: () => void; stop: () => Promise<void>; isPlaying: () => boolean };
let ttsHandle: TTSHandleType | null = null;

// Exported for the VoiceConversation orb to know when Ru is still speaking
// (so it can wait before re-opening the mic in continuous mode).
export function isTTSPlaying(): boolean {
  return ttsHandle?.isPlaying() ?? false;
}
async function getTTS(): Promise<TTSHandleType> {
  if (ttsHandle) return ttsHandle;
  const { startTTS } = await import("@/lib/voice/tts");
  ttsHandle = await startTTS();
  return ttsHandle;
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
    declare_routine: "Saving routine",
    complete_routine: "Marking routine done",
    create_reminder: "Setting reminder",
    query_analytics: "Looking up your data",
    modify_task: "Updating task",
    modify_routine: "Updating routine",
    get_routine_history: "Looking up history",
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
    stopTTS();
    flushType(set as Setter, get);
    const messages = get().messages.slice();
    const last = messages[messages.length - 1];
    if (last && last.streaming) {
      last.streaming = false;
      set({ messages });
    }
    set({ status: "idle", thinking: "idle", thinkingLabel: null });
  },

  sendText: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "user",
      content: trimmed,
      cards: [],
    };
    const assistantMsg: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "assistant",
      content: "",
      cards: [],
      streaming: true,
    };
    set({
      messages: [...get().messages, userMsg, assistantMsg],
      status: "streaming",
      thinking: "thinking",
      thinkingLabel: null,
      errorMessage: null,
    });

    tw = { messageId: assistantMsg.id, pending: "" };

    await stopTTS();
    abortController = new AbortController();
    let charsSinceFlush = 0;
    // Flush ONLY on true sentence boundaries. Commas/colons cause audible
    // segment breaks in Aura's stream — each Flush is a new synthesis chunk
    // with its own prosody, so flushing mid-sentence makes Ru sound stuttery.
    const flushBoundary = /[.!?\n]/;

    // Strip markdown from each delta before Aura speaks — otherwise it reads
    // "dot", "star", "hash" literally. Visual display still uses raw md.
    const { createSpeakableStream } = await import("@/lib/voice/speakable");
    const speakable = createSpeakableStream();

    const speakIfVoice = async (chunk: string, force: boolean = false) => {
      if (!get().voiceMode) return;
      try {
        const tts = await getTTS();
        const spoken = chunk ? speakable.push(chunk) : (force ? speakable.flush() : "");
        if (spoken) {
          tts.speak(spoken);
          charsSinceFlush += spoken.length;
        }
        const hitPunct = spoken ? flushBoundary.test(spoken) : false;
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
            set({ thinking: "tooling", thinkingLabel: humanizeToolName(call?.name) });
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
