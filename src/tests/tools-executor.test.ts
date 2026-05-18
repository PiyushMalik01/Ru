import { describe, it, expect } from "vitest";
import { executeTool } from "@/lib/ai/tools/executor";

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
