import { describe, it, expect, vi } from "vitest";
import { enrichTurn } from "@/lib/ai/engine/enrich";

const baseCatalog = {
  tasks: [{ id: "t-1", title: "Buy groceries" }],
  routines: [{ id: "r-1", title: "Morning run" }],
  trackers: [{ id: "tr-1", name: "Running" }],
  workspaces: [{ id: "w-1", title: "OChem study plan" }],
};

describe("enrichTurn", () => {
  it("falls back to substring matching for chatgpt_oauth provider", async () => {
    const result = await enrichTurn({
      userMessage: "skip my morning run today",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "chatgpt_oauth", apiKey: "k", model: "m" },
    });
    expect(result).not.toBeNull();
    expect(result!.resolvedEntities.routines).toHaveLength(1);
    expect(result!.resolvedEntities.routines[0].title).toBe("Morning run");
  });

  it("returns fallback enrichment when the LLM call throws", async () => {
    // Force the dynamic import to throw by passing a provider with an invalid config —
    // anthropic with a bogus key will fail; we catch and fall back.
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: () => { throw new Error("network"); },
        };
        constructor() {}
      },
    }));
    const result = await enrichTurn({
      userMessage: "buy groceries tomorrow",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "anthropic", apiKey: "k", model: "m" },
    });
    expect(result).not.toBeNull();
    // Fallback matched the task by substring.
    expect(result!.resolvedEntities.tasks[0]?.id).toBe("t-1");
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("matches case-insensitively in fallback", async () => {
    const result = await enrichTurn({
      userMessage: "MORNING RUN was tough today",
      recentTurns: [],
      entityCatalog: baseCatalog,
      voice: false,
      nowIso: new Date().toISOString(),
      timezone: "UTC",
      config: { provider: "chatgpt_oauth", apiKey: "k", model: "m" },
    });
    expect(result!.resolvedEntities.routines[0]?.id).toBe("r-1");
  });
});
