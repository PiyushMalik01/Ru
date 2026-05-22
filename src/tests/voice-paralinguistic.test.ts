import { describe, it, expect } from "vitest";
import {
  extractFeaturesSync,
  type VoiceContext,
} from "@/lib/voice/paralinguistic";

describe("paralinguistic extraction (sync, RMS-based fallback)", () => {
  it("returns sane defaults for silence", () => {
    const pcm = new Float32Array(16000); // 1s of silence
    const ctx: VoiceContext = extractFeaturesSync(pcm, "");
    expect(ctx.energy).toBeLessThan(0.1);
    expect(ctx.pace_wpm).toBe(0);
    expect(ctx.emotion).toBe("calm");
  });

  it("computes pace from transcript + duration", () => {
    const pcm = new Float32Array(16000 * 4); // 4s
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 40) * 0.5;
    const ctx = extractFeaturesSync(
      pcm,
      "this is a test sentence with about ten words here",
    );
    expect(ctx.pace_wpm).toBeGreaterThan(100);
    expect(ctx.pace_wpm).toBeLessThan(250);
  });

  it("higher energy -> excited bucket", () => {
    const pcm = new Float32Array(16000);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 20) * 0.9;
    const ctx = extractFeaturesSync(pcm, "yes that's amazing");
    expect(ctx.energy).toBeGreaterThan(0.5);
  });
});
