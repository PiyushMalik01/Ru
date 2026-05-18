"use client";

import { AudioPlayer } from "./audio-player";

export interface TTSHandle {
  speak: (text: string) => void;
  flush: () => void;
  stop: () => Promise<void>;
}

export async function startTTS(): Promise<TTSHandle> {
  const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
  if (!tokenRes.ok) throw new Error("could not mint deepgram key");
  const { key } = await tokenRes.json();

  const url = `wss://api.deepgram.com/v1/speak?model=aura-2-asteria-en&encoding=linear16&sample_rate=24000`;
  const ws = new WebSocket(url, ["token", key]);
  ws.binaryType = "arraybuffer";
  const player = new AudioPlayer();

  ws.onmessage = (e) => {
    if (typeof e.data === "string") return;
    player.pushPCM(e.data as ArrayBuffer);
  };

  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("tts socket failed"));
  });

  return {
    speak: (text: string) => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "Speak", text }));
    },
    flush: () => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "Flush" }));
    },
    stop: async () => {
      try { ws.close(); } catch {}
      await player.stop();
    },
  };
}
