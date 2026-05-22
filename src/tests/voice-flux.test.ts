import { describe, it, expect } from "vitest";
import type { FluxEvent } from "@/lib/voice/flux";

describe("flux event shape", () => {
  it("FluxEvent union has the expected variants", () => {
    const samples: FluxEvent[] = [
      { type: "ready" },
      { type: "interim", text: "hello" },
      { type: "final", text: "hello world" },
      { type: "eot", confidence: 0.8, reason: "semantic" },
      { type: "speech_started" },
      { type: "eager_eot", text: "hello", confidence: 0.4 },
      { type: "error", message: "boom" },
    ];
    expect(samples).toHaveLength(7);
  });

  it("ringBuffer collects PCM frames bounded by maxBytes", async () => {
    const { createPCMRingBuffer } = await import("@/lib/voice/flux");
    const buf = createPCMRingBuffer({ maxBytes: 100 });
    buf.push(new ArrayBuffer(40));
    buf.push(new ArrayBuffer(40));
    buf.push(new ArrayBuffer(40)); // overflows; oldest drops
    const snap = buf.snapshot();
    expect(snap.byteLength).toBeLessThanOrEqual(100);
    expect(snap.byteLength).toBeGreaterThan(0);
  });
});
