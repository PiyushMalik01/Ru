import { describe, it, expect } from "vitest";
import {
  buildProfileBlock,
  buildBehavioralBlock,
  buildEpisodicBlock,
  injectMemoryBlocks,
} from "@/lib/ai/engine/memory-blocks";

describe("memory-blocks", () => {
  it("returns null for empty profile", () => {
    expect(buildProfileBlock({})).toBeNull();
  });

  it("renders profile sections in fixed order", () => {
    const block = buildProfileBlock({
      preferences: { content: "evening workouts", sources: [], updated_at: "" },
      identity:    { content: "lives in tokyo", sources: [], updated_at: "" },
    });
    expect(block).not.toBeNull();
    expect(block!.indexOf("Identity")).toBeLessThan(block!.indexOf("Preferences"));
  });

  it("buildEpisodicBlock returns null when no episodes", () => {
    expect(buildEpisodicBlock([])).toBeNull();
  });

  it("injectMemoryBlocks places blocks between system head and first user msg", () => {
    const messages = [
      { role: "system" as const, content: "system 1" },
      { role: "system" as const, content: "system 2" },
      { role: "user" as const,   content: "hi" },
    ];
    const out = injectMemoryBlocks(messages, {
      profile: {
        profile_doc: { identity: { content: "x", sources: [], updated_at: "" } },
        behavioral_model: {},
        profile_version: 0,
        memory_enabled: true,
      },
      episodes: [],
      enrichment: null,
    });
    expect(out).toHaveLength(4);
    expect(out[0].role).toBe("system");
    expect(out[1].role).toBe("system");
    expect(out[2].content).toContain("Identity");
    expect(out[3].role).toBe("user");
  });

  it("buildBehavioralBlock surfaces low-completion days", () => {
    const block = buildBehavioralBlock({
      routine_completion_by_dow: { mon: 0.8, tue: 0.2 },
    });
    expect(block).toContain("tue");
  });
});
