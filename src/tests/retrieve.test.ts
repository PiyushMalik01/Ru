import { describe, it, expect, vi } from "vitest";
import { retrieveEpisodes } from "@/lib/ai/engine/retrieve";

vi.mock("@/lib/ai/embedder", () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  }),
}));

function makeSupabase(rpcRows: unknown[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcRows, error: null }),
    from() {
      return {
        update() {
          return { in: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe("retrieveEpisodes", () => {
  it("returns ranked episodes from the match_episodes RPC", async () => {
    const rows = [
      { id: "e1", content: "A", importance: 0.6, entity_refs: {}, created_at: new Date().toISOString(), similarity: 0.9 },
      { id: "e2", content: "B", importance: 0.3, entity_refs: {}, created_at: new Date(Date.now() - 30 * 86400000).toISOString(), similarity: 0.95 },
    ];
    const supabase = makeSupabase(rows);
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "anything",
      recentTurns: [],
    });
    expect(result.length).toBeGreaterThan(0);
    // Higher importance + recency should beat slightly higher similarity.
    expect(result[0].id).toBe("e1");
  });

  it("returns empty array when RPC errors", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
      from() { return { update() { return { in: async () => ({}) }; } }; },
    };
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "x",
      recentTurns: [],
    });
    expect(result).toEqual([]);
  });

  it("caps results at 6", async () => {
    const rows = Array.from({ length: 12 }).map((_, i) => ({
      id: `e${i}`,
      content: `c${i}`,
      importance: 0.5,
      entity_refs: {},
      created_at: new Date().toISOString(),
      similarity: 0.9 - i * 0.01,
    }));
    const supabase = makeSupabase(rows);
    const result = await retrieveEpisodes({
      supabase: supabase as never,
      userId: "u",
      userMessage: "x",
      recentTurns: [],
    });
    expect(result.length).toBe(6);
  });
});
