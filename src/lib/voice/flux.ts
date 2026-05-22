"use client";

import {
  createClient,
  LiveTranscriptionEvents,
  type LiveClient,
} from "@deepgram/sdk";

// ---------------------------------------------------------------------------
// Flux API notes (verified against docs, May 2026)
// ---------------------------------------------------------------------------
// • WebSocket endpoint: wss://api.deepgram.com/v2/listen (NOT v1)
// • Model identifier: "flux-general-en" (or flux-general-multi)
// • Server emits messages with `type: "TurnInfo"` and an `event` discriminator:
//     "Update" | "StartOfTurn" | "EagerEndOfTurn" | "TurnResumed" | "EndOfTurn"
// • Confidence field is `end_of_turn_confidence` (not `confidence`)
// • Transcript is at the top level — NOT nested under channel.alternatives[0]
// • Flux does its own VAD + EOT detection — no `vad_events`, `interim_results`,
//   `smart_format`, `punctuate`, or `utterance_end_ms` params apply.
// • SDK 3.13.0 has no first-class Flux client. We override the endpoint string
//   on `listen.live()` to point at `v2/listen`, and read raw TurnInfo messages
//   from the Unhandled event channel.
// ---------------------------------------------------------------------------

export type FluxEvent =
  | { type: "ready" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "eot"; confidence: number; reason: "silence" | "semantic" | "timeout" }
  | { type: "speech_started" }
  // EagerEndOfTurn — Flux thinks the user has likely finished, but the
  // confidence is below the full EOT threshold. We surface it as its own
  // variant so the orchestrator can (a) hand it to the FSM as
  // `eager_eot_detected` for telemetry, and (b) in Phase 5, kick off a
  // speculative LLM call. The transcript is what Flux thinks the turn
  // contained at this moment.
  | { type: "eager_eot"; text: string; confidence: number }
  // User kept talking after an eager EOT (or after a low-confidence EOT
  // that the confirmer was waiting on). The orchestrator uses this to
  // cancel any in-flight speculative LLM call and discard buffered TTS.
  | { type: "turn_resumed"; text: string }
  | { type: "error"; message: string };

export interface FluxHandle {
  stop: () => void;
  /** Snapshot the last ~10s of raw PCM as Float32 for paralinguistic extraction. */
  snapshotPCM: () => Float32Array;
  /**
   * The underlying captured MediaStream. Exposed so callers (e.g., voice
   * conversation orchestrator) can run a local VAD on the SAME stream
   * Flux is consuming, instead of calling `getUserMedia` a second time.
   * Echo cancellation is per-stream, so re-grabbing produces a parallel
   * stream that may not be echo-cancelled relative to the playback path.
   */
  stream: MediaStream;
}

export interface PCMRingBuffer {
  push(chunk: ArrayBuffer): void;
  snapshot(): ArrayBuffer;
  clear(): void;
}

export function createPCMRingBuffer(opts: { maxBytes: number }): PCMRingBuffer {
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    push(chunk) {
      chunks.push(chunk);
      bytes += chunk.byteLength;
      while (bytes > opts.maxBytes && chunks.length > 0) {
        const dropped = chunks.shift();
        if (dropped) bytes -= dropped.byteLength;
      }
    },
    snapshot() {
      const out = new Uint8Array(bytes);
      let cursor = 0;
      for (const c of chunks) {
        out.set(new Uint8Array(c), cursor);
        cursor += c.byteLength;
      }
      return out.buffer;
    },
    clear() {
      chunks.length = 0;
      bytes = 0;
    },
  };
}

export interface FluxCallbacks {
  onEvent: (e: FluxEvent) => void;
}

const PCM_MAX_BYTES = 10 * 16000 * 2; // 10s @ 16kHz @ 16-bit
const FLUX_ENDPOINT = "v2/listen";

/**
 * Shape of a Flux TurnInfo message. We treat unknown fields defensively in
 * case the server adds new ones. The "event" discriminator is the source of
 * truth for what's happening.
 */
interface TurnInfoMessage {
  type?: string;
  event?: string;
  transcript?: string;
  end_of_turn_confidence?: number;
}

export async function startFlux(callbacks: FluxCallbacks): Promise<FluxHandle> {
  // Mint scoped key + get mic in parallel
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
  // Flux model: semantic end-of-turn detection in-model.
  //
  // We pass `v2/listen` as the endpoint override (default is `:version/listen`,
  // which resolves to v1). The SDK type for transcription options doesn't yet
  // know about Flux-specific fields (eot_threshold, eager_eot_threshold,
  // eot_timeout_ms), so we cast through `never` to keep TS happy without
  // disabling strict mode.
  const live: LiveClient = dg.listen.live(
    {
      model: "flux-general-en",
      encoding: "linear16",
      sample_rate: 16000,
      eot_threshold: 0.7,
      eager_eot_threshold: 0.3,
      eot_timeout_ms: 5000,
    } as never,
    FLUX_ENDPOINT,
  );

  const AudioContextClass: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);

  const preReady: ArrayBuffer[] = [];
  let ready = false;
  const ring = createPCMRingBuffer({ maxBytes: PCM_MAX_BYTES });

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const chunk = pcm.buffer;
    ring.push(chunk);
    if (ready && live.getReadyState() === 1) {
      live.send(chunk);
    } else {
      preReady.push(chunk);
    }
  };

  live.on(LiveTranscriptionEvents.Open, () => {
    ready = true;
    while (preReady.length > 0) {
      const c = preReady.shift();
      if (c) live.send(c);
    }
    callbacks.onEvent({ type: "ready" });
  });

  // Flux emits `type: "TurnInfo"` messages, which the SDK doesn't recognize as
  // standard Transcript events. They land in the Unhandled channel — we parse
  // the `event` discriminator there and map to our FluxEvent union.
  live.on(LiveTranscriptionEvents.Unhandled, (msg: unknown) => {
    const m = msg as TurnInfoMessage;
    if (m?.type !== "TurnInfo") return;

    const transcript = typeof m.transcript === "string" ? m.transcript : "";
    const conf =
      typeof m.end_of_turn_confidence === "number"
        ? m.end_of_turn_confidence
        : 0;

    switch (m.event) {
      case "StartOfTurn":
        callbacks.onEvent({ type: "speech_started" });
        if (transcript) callbacks.onEvent({ type: "interim", text: transcript });
        return;
      case "Update":
        if (transcript) callbacks.onEvent({ type: "interim", text: transcript });
        return;
      case "EagerEndOfTurn":
        // Surface as its own variant so the orchestrator can fire
        // `eager_eot_detected` to the FSM (Phase 5 will use this for
        // speculative LLM calls). Also emit `interim` so the UI keeps
        // showing the latest transcript without committing yet — Flux
        // might still send TurnResumed.
        if (transcript) callbacks.onEvent({ type: "interim", text: transcript });
        callbacks.onEvent({ type: "eager_eot", text: transcript, confidence: conf });
        return;
      case "TurnResumed":
        // User kept talking after an eager EOT. Emit interim so the UI keeps
        // updating, and a distinct turn_resumed event so the orchestrator
        // can cancel any speculative LLM call + clear the confirmer's
        // pending EOT.
        if (transcript) callbacks.onEvent({ type: "interim", text: transcript });
        callbacks.onEvent({ type: "turn_resumed", text: transcript });
        return;
      case "EndOfTurn": {
        if (transcript) callbacks.onEvent({ type: "final", text: transcript });
        // If we never saw an explicit confidence value, treat it as timeout.
        const reason: "silence" | "semantic" | "timeout" =
          conf >= 0.7 ? "semantic" : conf > 0 ? "silence" : "timeout";
        callbacks.onEvent({ type: "eot", confidence: conf, reason });
        return;
      }
      default:
        return;
    }
  });

  live.on(LiveTranscriptionEvents.Error, (e: Error) => {
    callbacks.onEvent({ type: "error", message: e.message });
  });

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
      ring.clear();
    },
    snapshotPCM: () => {
      const buf = ring.snapshot();
      const int16 = new Int16Array(buf);
      const float = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;
      return float;
    },
    stream,
  };
}
