import { describe, it, expect } from "vitest";
import { stripSSML } from "@/lib/voice/tts";

/**
 * stripSSML transforms the SSML the prosody parser emits into plain text
 * that Aura's neural TTS speaks naturally. We can't ship real SSML (Aura's
 * WS doesn't accept it), but we CAN encode pauses as punctuation cues —
 * ellipses and commas — that Aura's prosody model picks up on. Net effect:
 * `[pause]` in Ru's reply actually SOUNDS like a pause, not a silent gap.
 */
describe("stripSSML — prosody-via-punctuation encoding", () => {
  it("preserves plain text unchanged", () => {
    expect(stripSSML("Hello there.")).toBe("Hello there.");
  });

  it("encodes default <break/> as a single ellipsis", () => {
    const out = stripSSML('Wait <break time="300ms"/> really?');
    expect(out).toContain("…");
    expect(out).not.toContain("<break");
  });

  it("encodes a 300ms break specifically as a single ellipsis", () => {
    const out = stripSSML('Hmm <break time="300ms"/> okay.');
    // Exactly one ellipsis (not two), matching the 'medium pause' bucket.
    expect((out.match(/…/g) ?? []).length).toBe(1);
  });

  it("encodes a long break (>=500ms) as double ellipsis", () => {
    const out = stripSSML('Right <break time="500ms"/> let me think.');
    expect((out.match(/…/g) ?? []).length).toBe(2);
  });

  it("encodes a very long break (700ms) as double ellipsis too", () => {
    const out = stripSSML('Sure <break time="700ms"/> go on.');
    expect((out.match(/…/g) ?? []).length).toBe(2);
  });

  it("encodes a short break (<=200ms) as a comma", () => {
    const out = stripSSML('Yes <break time="200ms"/> exactly.');
    expect(out).toContain(",");
    expect(out).not.toContain("…");
    expect(out).not.toContain("<break");
  });

  it("encodes break with no time attribute as a single ellipsis", () => {
    const out = stripSSML('Well <break/> alright.');
    expect((out.match(/…/g) ?? []).length).toBe(1);
  });

  it("strips emphasis/prosody tags but keeps inner text", () => {
    expect(stripSSML('really <emphasis level="strong">matters</emphasis>')).toContain(
      "matters",
    );
    expect(stripSSML('<prosody volume="soft">quietly</prosody>')).toContain(
      "quietly",
    );
    expect(stripSSML('<prosody volume="soft">quietly</prosody>')).not.toContain(
      "<",
    );
  });

  it("collapses run-on whitespace introduced by stripping", () => {
    const out = stripSSML('a <break time="200ms"/>  b');
    expect(out).not.toMatch(/\s{3,}/);
  });

  it("handles multiple breaks in one string", () => {
    const out = stripSSML(
      'okay <break time="500ms"/> hmm <break time="300ms"/> yeah',
    );
    // 500ms → 2 ellipses, 300ms → 1 ellipsis = 3 total
    expect((out.match(/…/g) ?? []).length).toBe(3);
  });
});
