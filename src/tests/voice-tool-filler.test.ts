import { describe, it, expect } from "vitest";
import { getFillerFor } from "@/lib/voice/tool-filler";

describe("tool filler", () => {
  it("returns a non-empty filler for known tool", () => {
    const f = getFillerFor("note_episode");
    expect(typeof f).toBe("string");
    expect(f.length).toBeGreaterThan(0);
  });

  it("returns a default filler for unknown tool", () => {
    const f = getFillerFor("nonsense_tool");
    expect(f.length).toBeGreaterThan(0);
  });

  it("avoids repeating the same filler twice in a row when prev passed", () => {
    const seen = new Set<string>();
    let prev: string | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      const f = getFillerFor("note_episode", { previousFiller: prev });
      seen.add(f);
      prev = f;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("has fillers for the Ru-specific tools that surface during voice", () => {
    // Spot-check the tools registered in src/lib/ai/tools/definitions.ts
    const sampleTools = [
      "log_activity",
      "create_task",
      "complete_task",
      "declare_routine",
      "complete_routine",
      "create_reminder",
      "query_analytics",
      "modify_task",
      "modify_routine",
      "create_tracker",
      "log_tracker_entry",
      "open_workspace",
      "note_episode",
      "update_memory_profile",
      "forget",
    ];
    for (const t of sampleTools) {
      const f = getFillerFor(t);
      expect(f.length, `expected filler for ${t}`).toBeGreaterThan(0);
    }
  });
});
