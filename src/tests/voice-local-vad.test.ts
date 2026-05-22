import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeRMS, isSpeech } from "@/lib/voice/local-vad";

describe("local VAD math", () => {
  it("RMS of silence is ~0", () => {
    const buf = new Float32Array(1024); // all zeros
    expect(computeRMS(buf)).toBeLessThan(0.001);
  });

  it("RMS of full-volume sine is ~0.707", () => {
    const n = 1024;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * i) / 64);
    expect(computeRMS(buf)).toBeGreaterThan(0.6);
    expect(computeRMS(buf)).toBeLessThan(0.75);
  });

  it("isSpeech respects threshold + hysteresis", () => {
    expect(
      isSpeech(0.05, {
        lastState: false,
        threshold: 0.04,
        hysteresis: 0.01,
      }),
    ).toBe(true);
    // hysteresis: once active, doesn't release until below threshold - hysteresis
    expect(
      isSpeech(0.035, {
        lastState: true,
        threshold: 0.04,
        hysteresis: 0.01,
      }),
    ).toBe(true);
    expect(
      isSpeech(0.025, {
        lastState: true,
        threshold: 0.04,
        hysteresis: 0.01,
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startLocalVAD smoke test — Vitest runs in node env, so we stub the DOM
// surfaces we touch: AudioContext, requestAnimationFrame, cancelAnimationFrame,
// and `window`. We don't actually fire frames — we just want to verify the
// handle wires up + stop() doesn't throw.
// ---------------------------------------------------------------------------

class FakeAnalyser {
  fftSize = 1024;
  connect() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
  getFloatTimeDomainData(_buf: Float32Array) {
    /* noop — leave buffer at zeros (silence) */
  }
}

class FakeSource {
  connect() {
    /* noop */
  }
  disconnect() {
    /* noop */
  }
}

class FakeAudioContext {
  state = "running";
  createMediaStreamSource() {
    return new FakeSource();
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("window", { AudioContext: FakeAudioContext });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    // Return a token but do NOT actually schedule — keeps the test
    // deterministic. The tick loop body runs once synchronously via the
    // initial call inside startLocalVAD, then waits for this rAF that
    // never fires.
    void cb;
    return 1 as unknown as number;
  });
  vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
    /* noop */
  });
  vi.stubGlobal("performance", { now: () => 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startLocalVAD", () => {
  it("returns a handle whose stop() is safe to call", async () => {
    const { startLocalVAD } = await import("@/lib/voice/local-vad");
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const onSpeech = vi.fn();
    const handle = startLocalVAD(stream, onSpeech);
    expect(typeof handle.stop).toBe("function");
    expect(() => handle.stop()).not.toThrow();
  });

  it("does not fire onSpeech for silence", async () => {
    const { startLocalVAD } = await import("@/lib/voice/local-vad");
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const onSpeech = vi.fn();
    const handle = startLocalVAD(stream, onSpeech);
    // FakeAnalyser leaves the buffer at zeros → RMS = 0 → not speech.
    expect(onSpeech).not.toHaveBeenCalled();
    handle.stop();
  });
});
