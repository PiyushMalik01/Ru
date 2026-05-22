import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeAudioBufferSourceNode extends EventTarget {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start(_when?: number) {
    /* noop in test */
  }
  stop() {
    if (this.onended) this.onended();
  }
  connect() {
    /* noop */
  }
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  sampleRate = 24000;
  createBuffer() {
    return { copyToChannel: () => {} } as unknown as AudioBuffer;
  }
  createBufferSource() {
    return new FakeAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
});

describe("AudioPlayer.playing", () => {
  it("is false before any pushPCM", async () => {
    const { AudioPlayer } = await import("@/lib/voice/audio-player");
    const p = new AudioPlayer();
    expect(p.playing).toBe(false);
  });

  it("becomes true after a source starts and false after it ends", async () => {
    const { AudioPlayer } = await import("@/lib/voice/audio-player");
    const p = new AudioPlayer();
    const pcm = new Int16Array(2400).buffer; // ~0.1s
    p.pushPCM(pcm);
    expect(p.playing).toBe(true);
    // Simulate the source ending
    p.interrupt();
    expect(p.playing).toBe(false);
  });
});
