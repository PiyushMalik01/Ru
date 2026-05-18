"use client";

import { createClient, LiveTranscriptionEvents, type LiveSchema, type LiveClient } from "@deepgram/sdk";

export interface STTHandle {
  stop: () => void;
}

export interface STTCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (msg: string) => void;
}

export async function startSTT(callbacks: STTCallbacks): Promise<STTHandle> {
  const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
  if (!tokenRes.ok) throw new Error("could not mint deepgram key");
  const { key } = await tokenRes.json();

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const dg = createClient(key);
  const live: LiveClient = dg.listen.live({
    model: "nova-3",
    language: "en",
    smart_format: true,
    punctuate: true,
    interim_results: true,
    endpointing: 300,
    sample_rate: 16000,
    encoding: "linear16",
    channels: 1,
  } satisfies LiveSchema);

  const AudioContextClass: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    if (live.getReadyState() === 1) live.send(pcm.buffer);
  };

  live.on(LiveTranscriptionEvents.Transcript, (data: { channel?: { alternatives?: { transcript?: string }[] }; is_final?: boolean }) => {
    const t = data?.channel?.alternatives?.[0]?.transcript ?? "";
    if (!t) return;
    if (data.is_final) callbacks.onFinal(t);
    else callbacks.onInterim(t);
  });
  live.on(LiveTranscriptionEvents.Error, (e: Error) => callbacks.onError(e.message));

  return {
    stop: () => {
      try { live.requestClose(); } catch {}
      processor.disconnect();
      source.disconnect();
      audioCtx.close();
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
