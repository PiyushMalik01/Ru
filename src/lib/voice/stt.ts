"use client";

import {
  createClient,
  LiveTranscriptionEvents,
  type LiveSchema,
  type LiveClient,
} from "@deepgram/sdk";

export interface STTHandle {
  stop: () => void;
}

export interface STTCallbacks {
  onInterim: (text: string) => void;
  /** Per-segment finalization (Deepgram fires on ~800ms pause). May fire multiple times in one utterance. */
  onFinal: (text: string) => void;
  /** Fires when the user truly stops speaking (utterance_end_ms of silence). Use this to commit, not onFinal. */
  onUtteranceEnd?: () => void;
  /** Fires when voice activity is detected. Use this to interrupt Ru if she's still talking. */
  onSpeechStarted?: () => void;
  onError: (msg: string) => void;
  /** Optional — fires the moment the socket is actually accepting audio. */
  onReady?: () => void;
}

export async function startSTT(callbacks: STTCallbacks): Promise<STTHandle> {
  // Kick off the slow async fetches in parallel — token mint and mic permission
  // typically each take 100-400ms. Doing them sequentially adds up; together
  // they only cost the slower of the two.
  //
  // Explicit echoCancellation/noiseSuppression matter when Ru's TTS is coming
  // out of the speakers — without them the mic catches Ru's own voice and
  // either submits her words as user input or barge-in interrupts itself.
  const [tokenRes, stream] = await Promise.all([
    fetch("/api/deepgram/token", { method: "POST" }),
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    }),
  ]);

  if (!tokenRes.ok) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("could not mint deepgram key");
  }
  const { key } = await tokenRes.json();

  const dg = createClient(key);
  const live: LiveClient = dg.listen.live({
    model: "nova-3",
    language: "en",
    smart_format: true,
    punctuate: true,
    interim_results: true,
    // Segment endpoint after ~600ms silence (snappy interim → final transition),
    // but DON'T submit on every final — wait for UtteranceEnd which only fires
    // after a longer continuous silence. This lets the user pause mid-sentence
    // without the system thinking they're done talking.
    endpointing: 600,
    utterance_end_ms: 1500,
    vad_events: true,
    sample_rate: 16000,
    encoding: "linear16",
    channels: 1,
    filler_words: false,
  } satisfies LiveSchema);

  const AudioContextClass: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);

  // Buffer audio captured BEFORE the Deepgram WebSocket finishes its handshake.
  // The previous build silently dropped chunks whose readyState !== 1, which
  // ate the first 500–800ms of every utterance. We now hold them in memory and
  // flush as soon as the socket opens.
  const preReadyBuffer: ArrayBuffer[] = [];
  let socketReady = false;
  // Cap the buffer in case the socket never opens (network/proxy issue):
  // 4 seconds * 16000 Hz * 2 bytes/sample = 128 KB. Plenty headroom.
  const MAX_BUFFERED_BYTES = 256 * 1024;
  let bufferedBytes = 0;

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const chunk = pcm.buffer;

    if (socketReady && live.getReadyState() === 1) {
      live.send(chunk);
      return;
    }

    // Socket not ready — buffer the chunk so we don't lose the user's first
    // word. Drop oldest chunks if we somehow blow past the cap.
    bufferedBytes += chunk.byteLength;
    while (bufferedBytes > MAX_BUFFERED_BYTES && preReadyBuffer.length > 0) {
      const dropped = preReadyBuffer.shift();
      if (dropped) bufferedBytes -= dropped.byteLength;
    }
    preReadyBuffer.push(chunk);
  };

  live.on(LiveTranscriptionEvents.Open, () => {
    socketReady = true;
    // Flush everything captured during the handshake. Without this, the
    // first ~half-second of speech disappears every time.
    while (preReadyBuffer.length > 0) {
      const chunk = preReadyBuffer.shift();
      if (chunk) live.send(chunk);
    }
    bufferedBytes = 0;
    callbacks.onReady?.();
  });

  live.on(
    LiveTranscriptionEvents.Transcript,
    (data: {
      channel?: { alternatives?: { transcript?: string }[] };
      is_final?: boolean;
    }) => {
      const t = data?.channel?.alternatives?.[0]?.transcript ?? "";
      if (!t) return;
      if (data.is_final) callbacks.onFinal(t);
      else callbacks.onInterim(t);
    }
  );

  live.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    callbacks.onUtteranceEnd?.();
  });

  live.on(LiveTranscriptionEvents.SpeechStarted, () => {
    callbacks.onSpeechStarted?.();
  });

  live.on(LiveTranscriptionEvents.Error, (e: Error) => callbacks.onError(e.message));

  return {
    stop: () => {
      try {
        live.requestClose();
      } catch {}
      try {
        processor.disconnect();
        source.disconnect();
        audioCtx.close();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
