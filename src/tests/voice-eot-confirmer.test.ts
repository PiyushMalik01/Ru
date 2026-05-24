import { describe, it, expect, vi } from "vitest";
import {
  createEOTConfirmer,
  FLUX_TRUST_FALLBACK_MS,
  HIGH_CONFIDENCE_FAST_PATH,
  MIN_CONFIDENCE,
  REQUIRED_SILENCE_MS,
  TURN_RESUMED_LOCKOUT_MS,
  type ConfirmedTurn,
} from "@/lib/voice/eot-confirmer";

/**
 * Manual clock for deterministic time control. The confirmer takes a `now`
 * option so we don't need vi.useFakeTimers + the polling interval.
 *
 * NOTE: we still set pollMs to a small value because the watch timer fires
 * on setInterval. For tests that care about elapsed time, we drive the
 * confirmer via push() events (which all call tryConfirm) rather than
 * waiting for the poll.
 */
function makeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe("EOT confirmer composite gate", () => {
  it("does not fire on flux_eot alone (must agree with VAD silence)", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "hello" });
    expect(fired).not.toHaveBeenCalled();

    confirmer.dispose();
  });

  it("fires when all three signals agree", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "what's on my plate today" });
    expect(fired).not.toHaveBeenCalled();

    // VAD reports sustained silence
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).toHaveBeenCalledTimes(1);
    const turn = fired.mock.calls[0][0] as ConfirmedTurn;
    expect(turn.text).toBe("what's on my plate today");
    expect(turn.reason).toBe("composite");

    confirmer.dispose();
  });

  it("high-confidence fast path bypasses VAD silence requirement", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({
      type: "flux_eot",
      confidence: HIGH_CONFIDENCE_FAST_PATH + 0.01,
      text: "thanks bye",
    });
    expect(fired).toHaveBeenCalledTimes(1);
    expect((fired.mock.calls[0][0] as ConfirmedTurn).reason).toBe("fast_path");

    confirmer.dispose();
  });

  it("does NOT fire if confidence is below the minimum", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: MIN_CONFIDENCE - 0.1, text: "..." });
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).not.toHaveBeenCalled();

    confirmer.dispose();
  });

  it("turn_resumed cancels a pending EOT", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    const resumed = vi.fn();
    confirmer.onConfirmed(fired);
    confirmer.onTurnResumed(resumed);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "i was about to say" });
    confirmer.push({ type: "turn_resumed" });
    expect(resumed).toHaveBeenCalledTimes(1);

    // VAD silence arriving now should NOT fire — pending was cleared.
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).not.toHaveBeenCalled();

    confirmer.dispose();
  });

  it("locks out for TURN_RESUMED_LOCKOUT_MS after a turn_resumed", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "turn_resumed" });
    // Half a lockout later, Flux fires EOT + VAD silence
    clock.advance(TURN_RESUMED_LOCKOUT_MS / 2);
    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "ok done" });
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).not.toHaveBeenCalled();

    // Lockout expires — VAD silence update re-triggers tryConfirm
    clock.advance(TURN_RESUMED_LOCKOUT_MS);
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).toHaveBeenCalledTimes(1);
    expect((fired.mock.calls[0][0] as ConfirmedTurn).reason).toBe("composite");

    confirmer.dispose();
  });

  it("vad_speech resets the silence counter", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "..." });
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS - 50 });
    confirmer.push({ type: "vad_speech" }); // user kept talking
    // Even pushing silence again at the threshold doesn't fire — but only
    // because we'd need a fresh accumulation. Here we test that vad_speech
    // resets to 0; a subsequent silence push at threshold WILL fire (because
    // pending is still alive and confidence still ≥ MIN).
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).toHaveBeenCalledTimes(1);

    confirmer.dispose();
  });

  it("Flux trust fallback fires after FLUX_TRUST_FALLBACK_MS", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "i think that's it" });
    // No VAD signals at all — local VAD is wonky.
    expect(fired).not.toHaveBeenCalled();

    clock.advance(FLUX_TRUST_FALLBACK_MS + 1);
    // Need any push() to trigger tryConfirm (we're not running the watch
    // interval in tests). Use a redundant vad_silence_ms = 0.
    confirmer.push({ type: "vad_silence_ms", ms: 0 });
    expect(fired).toHaveBeenCalledTimes(1);
    expect((fired.mock.calls[0][0] as ConfirmedTurn).reason).toBe("fallback");

    confirmer.dispose();
  });

  it("regression: a short breath pause (< REQUIRED_SILENCE_MS) does NOT commit", () => {
    // User report: "I'm in the flow of speaking and it couldn't read properly
    // whether I have stopped or not." Repro: Flux fires EOT at medium
    // confidence, the user takes a 250ms breath, silence reading lands at
    // 250ms — must NOT commit. (Old threshold of 200ms WOULD commit here.)
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({
      type: "flux_eot",
      confidence: 0.7,
      text: "remind me to call my friend",
    });
    confirmer.push({ type: "vad_silence_ms", ms: 250 });
    expect(fired).not.toHaveBeenCalled();

    // User keeps talking — vad_speech should clear pending entirely on the
    // next vad_speech tick, but for this test we just confirm the breath
    // alone didn't commit.

    confirmer.dispose();
  });

  it("regression: 0.9 Flux confidence (between old and new fast-path) waits for VAD", () => {
    // 0.9 used to fast-path (old threshold 0.85). Now it shouldn't — must
    // wait for either composite silence or fallback timeout.
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({
      type: "flux_eot",
      confidence: 0.9,
      text: "ok so today i want to",
    });
    expect(fired).not.toHaveBeenCalled();

    // Composite still works at the new silence threshold.
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).toHaveBeenCalledTimes(1);
    expect((fired.mock.calls[0][0] as ConfirmedTurn).reason).toBe("composite");

    confirmer.dispose();
  });

  it("reset clears all pending state", () => {
    const clock = makeClock();
    const confirmer = createEOTConfirmer({ now: clock.now, pollMs: 10_000 });
    const fired = vi.fn();
    confirmer.onConfirmed(fired);

    confirmer.push({ type: "flux_eot", confidence: 0.7, text: "..." });
    confirmer.reset();
    confirmer.push({ type: "vad_silence_ms", ms: REQUIRED_SILENCE_MS });
    expect(fired).not.toHaveBeenCalled();

    confirmer.dispose();
  });
});
