import { describe, it, expect } from "vitest";
import { executeTool } from "@/lib/ai/tools/executor";
import { TOOL_DEFINITIONS } from "@/lib/ai/tools/definitions";

describe("executeTool", () => {
  it("rejects unknown tools", async () => {
    const result = await executeTool("nonexistent", {}, {
      supabase: {} as never,
      userId: "u1",
      messageId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unknown tool/);
  });
});

describe("memory tools wired", () => {
  it("includes note_episode, update_memory_profile, forget in TOOL_DEFINITIONS", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toContain("note_episode");
    expect(names).toContain("update_memory_profile");
    expect(names).toContain("forget");
  });
});
