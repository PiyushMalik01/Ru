import { describe, it, expect } from "vitest";
import { isLikelyScattered } from "@/lib/voice/transcript-sanity";

describe("isLikelyScattered", () => {
  describe("passes through legitimate transcripts", () => {
    it.each([
      "remind me to call mom at three",
      "log a 5K run",
      "what did I do this week?",
      "draft my Monday plan, please",
      "Jenkins",
      "yes",
      "no",
      "done",
      "okay sounds good",
      "I went for a run earlier",
      "make a tracker for my reading",
    ])("'%s' is ok", (txt) => {
      expect(isLikelyScattered(txt).ok).toBe(true);
    });
  });

  describe("flags empty / whitespace", () => {
    it.each(["", "   ", "\n\t  "])("'%s' is empty", (txt) => {
      const r = isLikelyScattered(txt);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("empty");
    });
  });

  describe("flags single short tokens (mic noise)", () => {
    it.each(["a", "the", "uh", "um", "huh", "mm"])("'%s' is too short", (txt) => {
      const r = isLikelyScattered(txt);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("single-syllable");
    });
  });

  describe("flags repetition", () => {
    it("catches the the the", () => {
      const r = isLikelyScattered("the the the");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("repetition");
    });
    it("catches uh uh uh thinking", () => {
      const r = isLikelyScattered("uh uh uh thinking");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("repetition");
    });
  });

  describe("flags low-content soup", () => {
    it("catches scattered short tokens", () => {
      const r = isLikelyScattered("a i o u e");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("low-content");
    });
  });

  describe("flags two-word fragments where both are tiny", () => {
    it("'a a' is too short", () => {
      const r = isLikelyScattered("a a");
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("too-short");
    });
  });

  describe("preserves longer noisy-but-plausible utterances", () => {
    // A long messy sentence should still pass — better to send than to gate.
    it("long utterance with filler still passes", () => {
      const r = isLikelyScattered(
        "so I was thinking maybe I could go for a run later today, you know?",
      );
      expect(r.ok).toBe(true);
    });
  });
});
