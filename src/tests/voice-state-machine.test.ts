import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createVoiceMachine,
  type VoicePhase,
} from "@/lib/voice/state-machine";

describe("voice state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in warming", () => {
    const m = createVoiceMachine();
    expect(m.current()).toBe<VoicePhase>("warming");
  });

  it("warming → listening on ready event", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("listening → thinking on commit", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hello" });
    expect(m.current()).toBe<VoicePhase>("thinking");
  });

  it("thinking → tts_speaking on first_audio", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    expect(m.current()).toBe<VoicePhase>("tts_speaking");
  });

  it("tts_speaking → cooldown → listening", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    m.send({ type: "audio_done" });
    expect(m.current()).toBe<VoicePhase>("cooldown");
    vi.advanceTimersByTime(600);
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("watchdog: thinking longer than 15s force-returns to listening", () => {
    const seen: VoicePhase[] = [];
    const watchdogs: VoicePhase[] = [];
    const m = createVoiceMachine();
    m.onPhaseChange((p) => seen.push(p));
    m.onWatchdog((p) => watchdogs.push(p));
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    vi.advanceTimersByTime(15_000);
    expect(watchdogs).toContain("thinking");
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("barge_in transitions tts_speaking → listening immediately", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    m.send({ type: "barge_in" });
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("close transitions any phase → closing", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "close" });
    expect(m.current()).toBe<VoicePhase>("closing");
  });

  it("eager_eot_detected is a no-op transition (FSM phase unchanged)", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    expect(m.current()).toBe<VoicePhase>("listening");
    m.send({ type: "eager_eot_detected", text: "hello", confidence: 0.4 });
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("eager_eot_cancelled is a no-op transition (FSM phase unchanged)", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "eager_eot_detected", text: "hello", confidence: 0.4 });
    m.send({ type: "eager_eot_cancelled" });
    expect(m.current()).toBe<VoicePhase>("listening");
  });
});
