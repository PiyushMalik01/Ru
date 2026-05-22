"use client";

/**
 * Aura streaming TTS client.
 *
 * Aura compatibility notes (verified against Deepgram docs 2026-05):
 * - The Aura WebSocket Speak message accepts PLAIN TEXT only. There is no
 *   documented `format: "ssml"` parameter and the upstream guide explicitly
 *   notes that voice / media settings cannot be changed after connection.
 *   We therefore accept `format: "ssml"` from callers (so the prosody
 *   pipeline can produce SSML cleanly) but strip all `<...>` tags before
 *   sending. The translated SSML fragments still serve their main purpose:
 *   removing the literal `[pause]` / `[soft]` markers so Aura never reads
 *   them aloud.
 * - Runtime speed control is not officially supported either. We keep
 *   `setSpeed(wpm)` as a no-op-with-state stub: it stores the desired
 *   speed (Phase 4 rhythm-mirroring still wants to call it) and logs a
 *   warning the first time it's used, so the wiring upstream stays the
 *   same when/if Aura ships per-Speak speed control. If a future Aura
 *   version exposes a Configure message or per-Speak `speed` field, this
 *   is the one place to wire it.
 */

import { AudioPlayer } from "./audio-player";

export interface TTSHandle {
  /**
   * Queue text for synthesis. `format` is accepted for forward-compatibility
   * with SSML pipelines; today the implementation strips tags before sending
   * because Aura's WS doesn't accept SSML.
   */
  speak: (text: string, opts?: { format?: "ssml" | "plain" }) => void;
  flush: () => void;
  /**
   * Set the spoken speed in WPM (Phase 4 rhythm mirroring). Currently a
   * stub — Aura's WS protocol doesn't yet expose runtime speed control,
   * so this only stores the value. Wiring callers now means we don't
   * have to thread the call later.
   */
  setSpeed: (wpm: number) => void;
  /**
   * Cut off currently-buffered synthesis and playback but keep the WebSocket
   * open so the next turn doesn't pay the handshake cost. Used between turns
   * and on user barge-in.
   */
  interrupt: () => void;
  /** Full teardown — close the WS and AudioContext. */
  stop: () => Promise<void>;
  isPlaying: () => boolean;
}

// aura-2-thalia-en is Aura-2's warmest, most conversational voice.
// Other natural choices: aura-2-andromeda-en (rich female), aura-2-orion-en (male).
// Asteria (Aura-1) is fastest but more robotic — avoid for conversational UX.
const TTS_MODEL = "aura-2-thalia-en";
const TTS_SAMPLE_RATE = 24000;

/** Strip SSML markup, leaving only the speakable text. */
function stripSSML(ssml: string): string {
  // Replace `<break .../>` with a space so adjacent words don't fuse.
  let out = ssml.replace(/<break\b[^>]*\/>/gi, " ");
  // Drop all remaining tags but keep their inner text.
  out = out.replace(/<[^>]+>/g, "");
  // Collapse any whitespace runs the strip created.
  out = out.replace(/\s+/g, " ");
  return out;
}

export async function startTTS(): Promise<TTSHandle> {
  const tokenRes = await fetch("/api/deepgram/token", { method: "POST" });
  if (!tokenRes.ok) throw new Error("could not mint deepgram key");
  const { key } = await tokenRes.json();

  const url = `wss://api.deepgram.com/v1/speak?model=${TTS_MODEL}&encoding=linear16&sample_rate=${TTS_SAMPLE_RATE}`;
  const ws = new WebSocket(url, ["token", key]);
  ws.binaryType = "arraybuffer";
  const player = new AudioPlayer();

  let desiredSpeed = 1.0;
  let speedWarned = false;

  ws.onmessage = (e) => {
    if (typeof e.data === "string") return;
    player.pushPCM(e.data as ArrayBuffer);
  };

  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("tts socket failed"));
  });

  return {
    speak: (text: string, opts) => {
      if (ws.readyState !== 1) return;
      const payload =
        opts?.format === "ssml" ? stripSSML(text) : text;
      if (!payload.trim()) return;
      ws.send(JSON.stringify({ type: "Speak", text: payload }));
    },
    flush: () => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: "Flush" }));
    },
    setSpeed: (wpm: number) => {
      // Clamp to a reasonable band so Phase 4 rhythm mirroring can't push
      // Aura into an audibly unnatural rate even if a future Aura version
      // honors the call.
      const speed = Math.max(0.85, Math.min(1.15, wpm / 150));
      if (Math.abs(speed - desiredSpeed) < 0.02) return;
      desiredSpeed = speed;
      if (!speedWarned) {
        // Log once so dev knows the rhythm mirroring is staged but not
        // taking effect upstream yet.
        console.info("[tts] setSpeed staged at", speed, "(Aura WS doesn't yet honor runtime speed)");
        speedWarned = true;
      }
    },
    interrupt: () => {
      // Clear Aura's server-side buffer so the next Speak starts cleanly.
      // Then drop any audio still scheduled in the local player. The
      // AudioContext stays alive — next turn can pushPCM immediately.
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: "Clear" })); } catch {}
      }
      try { player.interrupt(); } catch {}
    },
    stop: async () => {
      try { ws.close(); } catch {}
      await player.stop();
    },
    isPlaying: () => player.playing,
  };
}
