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

interface ChatState {
  messages: ChatMessage[];
  status: "idle" | "streaming" | "error";
  errorMessage: string | null;
  voiceMode: boolean;
  setMessages: (messages: ChatMessage[]) => void;
  setVoiceMode: (v: boolean) => void;
  sendText: (text: string) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

let abortController: AbortController | null = null;

// Voice TTS handle, lazy-loaded
let ttsHandle: { speak: (text: string) => void; flush: () => void; stop: () => Promise<void> } | null = null;
async function getTTS() {
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

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: "idle",
  errorMessage: null,
  voiceMode: false,

  setMessages: (messages) => set({ messages }),
  setVoiceMode: (v) => {
    if (v) {
      // Pre-warm the Aura WebSocket so the first response audio comes back
      // ~1s sooner instead of waiting for handshake + token mint after generation starts.
      getTTS().catch((e) => console.error("tts pre-warm failed", e));
    } else {
      stopTTS();
    }
    set({ voiceMode: v });
  },

  reset: () => {
    abortController?.abort();
    abortController = null;
    stopTTS();
    set({ messages: [], status: "idle", errorMessage: null });
  },

  abort: () => {
    abortController?.abort();
    abortController = null;
    stopTTS();
    set({ status: "idle" });
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
      errorMessage: null,
    });

    // Stop any in-flight TTS before starting a new turn
    await stopTTS();

    abortController = new AbortController();
    // Stream every token directly to Aura — flush on punctuation (Aura uses these to
    // pace prosody) or every ~40 chars to keep latency low without choking the queue.
    // This is what makes Ru feel like a live conversation instead of a synth that
    // waits for a full sentence before speaking.
    let charsSinceFlush = 0;
    const flushBoundary = /[,.!?;:\n]/;

    const speakIfVoice = async (chunk: string, force: boolean = false) => {
      if (!get().voiceMode) return;
      try {
        const tts = await getTTS();
        if (chunk) {
          tts.speak(chunk);
          charsSinceFlush += chunk.length;
        }
        const hitPunct = chunk ? flushBoundary.test(chunk) : false;
        if (force || hitPunct || charsSinceFlush >= 40) {
          tts.flush();
          charsSinceFlush = 0;
        }
      } catch (e) {
        console.error("tts failed", e);
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
        signal: abortController.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        set({ status: "error", errorMessage: err || "request failed" });
        const msgs = [...get().messages];
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
          const msgs = [...get().messages];
          const last = msgs[msgs.length - 1];
          if (!last) continue;
          if (event.type === "text") {
            const delta = String(event.delta ?? "");
            last.content += delta;
            await speakIfVoice(delta);
          } else if (event.type === "tool_result" && event.cardKind) {
            last.cards = [...last.cards, { kind: event.cardKind as CardKind, data: (event.card as Record<string, unknown>) ?? {} }];
          } else if (event.type === "stream_end") {
            last.streaming = false;
            if (event.assistantMessageId) last.id = String(event.assistantMessageId);
            await speakIfVoice("", true); // force flush remaining
          } else if (event.type === "error") {
            set({ status: "error", errorMessage: String(event.message ?? "stream error") });
          }
          set({ messages: msgs });
        }
      }
      set({ status: "idle" });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      set({ status: "error", errorMessage: (e as Error).message });
      const msgs = [...get().messages];
      const last = msgs[msgs.length - 1];
      if (last) last.streaming = false;
      set({ messages: msgs });
    }
  },
}));
