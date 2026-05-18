"use client";

// Streaming PCM audio player for Aura's WebSocket output.
//
// Two important behaviors:
//
// 1. Jitter buffer — when the first PCM chunk of a new utterance arrives we
//    schedule playback ~120ms in the future, not at currentTime. That gives a
//    cushion for the next few chunks to land before the first one finishes,
//    so network jitter doesn't cause audible gaps in the middle of a sentence.
//
// 2. Interrupt vs dispose — `interrupt()` stops scheduled sources but keeps
//    the AudioContext alive so the same player can be reused for the next
//    utterance. `stop()` is the full teardown for when voice mode is leaving.
//    Previously every turn paid a fresh AudioContext setup cost.

const JITTER_LEAD_S = 0.12;

export class AudioPlayer {
  private ctx: AudioContext;
  private next = 0;
  private sources: AudioBufferSourceNode[] = [];

  constructor() {
    const AudioContextClass: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioContextClass({ sampleRate: 24000 });
    this.next = this.ctx.currentTime;
  }

  pushPCM(buf: ArrayBuffer) {
    if (this.ctx.state === "closed") return;
    const samples = new Int16Array(buf);
    if (samples.length === 0) return;
    const float = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) float[i] = samples[i] / 0x8000;
    const audio = this.ctx.createBuffer(1, float.length, 24000);
    audio.copyToChannel(float, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.ctx.destination);

    // If we're starting fresh (next is in the past), schedule slightly ahead
    // of currentTime so subsequent chunks land in continuous playback.
    const now = this.ctx.currentTime;
    const start =
      this.next > now ? this.next : now + JITTER_LEAD_S;
    src.start(start);
    src.onended = () => {
      const i = this.sources.indexOf(src);
      if (i >= 0) this.sources.splice(i, 1);
    };
    this.next = start + audio.duration;
    this.sources.push(src);
  }

  /**
   * Cut off any currently-scheduled playback but keep the context alive for
   * the next utterance. Use this when the user barges in or starts a new turn.
   */
  interrupt() {
    for (const s of this.sources) {
      try { s.stop(); } catch {}
    }
    this.sources = [];
    this.next = this.ctx.state === "closed" ? 0 : this.ctx.currentTime;
  }

  async stop() {
    this.interrupt();
    if (this.ctx.state !== "closed") {
      try { await this.ctx.close(); } catch {}
    }
  }

  get playing(): boolean {
    return this.ctx.state === "running" && this.ctx.currentTime < this.next;
  }
}
