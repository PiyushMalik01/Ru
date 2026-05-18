"use client";

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
    const start = Math.max(this.next, this.ctx.currentTime);
    src.start(start);
    this.next = start + audio.duration;
    this.sources.push(src);
  }

  async stop() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources = [];
    if (this.ctx.state !== "closed") {
      try { await this.ctx.close(); } catch {}
    }
  }

  get playing(): boolean {
    return this.ctx.state === "running" && this.ctx.currentTime < this.next;
  }
}
