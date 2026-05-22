import { describe, it, expect } from "vitest";
import { buildVoicePersonaBlock, buildVoiceContextBlock } from "@/lib/ai/engine/voice-persona";

describe("voice persona", () => {
  it("persona block contains spoken-style + prosody tag instructions", () => {
    const b = buildVoicePersonaBlock();
    expect(b).toMatch(/spoken/i);
    expect(b).toContain("[pause]");
    expect(b).toContain("[soft]");
    expect(b).toContain("[emphasized]");
  });

  it("voiceContext block renders all fields", () => {
    const b = buildVoiceContextBlock({
      energy: 0.72,
      pace_wpm: 145,
      pitch_variance: 0.4,
      emotion: "casual",
    });
    expect(b).toContain("energy");
    expect(b).toContain("145");
    expect(b).toContain("casual");
  });

  it("voiceContext block is null-safe", () => {
    expect(buildVoiceContextBlock(null)).toBeNull();
  });
});
