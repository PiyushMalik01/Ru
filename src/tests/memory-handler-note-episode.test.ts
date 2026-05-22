import { describe, it, expect, vi, beforeEach } from "vitest";
import { noteEpisode } from "@/lib/ai/tools/handlers/memory";

// Minimal supabase client mock — only what the handler touches.
function makeSupabase(opts: { insertResult?: { data: { id: string } | null; error: unknown } } = {}) {
  const inserted: unknown[] = [];
  const auditInserted: unknown[] = [];
  return {
    inserted,
    auditInserted,
    client: {
      from(table: string) {
        if (table === "episodes") {
          return {
            insert(row: unknown) {
              inserted.push(row);
              return {
                select() {
                  return {
                    single: async () => opts.insertResult ?? { data: { id: "ep-1" }, error: null },
                  };
                },
              };
            },
          };
        }
        if (table === "memory_audit") {
          return {
            insert: async (row: unknown) => {
              auditInserted.push(row);
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table: " + table);
      },
    },
  };
}

vi.mock("@/lib/ai/embedder", () => ({
  createEmbedder: () => ({
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  }),
}));

describe("noteEpisode handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts an episode row with embedding + writes a learned audit entry", async () => {
    const { client, inserted, auditInserted } = makeSupabase();
    const result = await noteEpisode(
      {
        summary: "Piyush mentioned he is moving to Tokyo.",
        importance: 0.7,
      },
      { supabase: client as never, userId: "u-1", messageId: "msg-1" }
    );

    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    const ep = inserted[0] as Record<string, unknown>;
    expect(ep.user_id).toBe("u-1");
    expect(ep.content).toContain("Tokyo");
    expect(ep.importance).toBe(0.7);
    expect(ep.source_message_ids).toEqual(["msg-1"]);
    expect(ep.embedding).toEqual([0.1, 0.2, 0.3]);

    expect(auditInserted).toHaveLength(1);
    const audit = auditInserted[0] as Record<string, unknown>;
    expect(audit.kind).toBe("learned");
    expect(audit.episode_ids).toEqual(["ep-1"]);
  });

  it("returns ok:false on missing summary", async () => {
    const { client } = makeSupabase();
    const result = await noteEpisode({} as never, { supabase: client as never, userId: "u-1", messageId: null });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/summary/);
  });

  it("clamps importance to [0,1]", async () => {
    const { client, inserted } = makeSupabase();
    await noteEpisode(
      { summary: "x", importance: 5 },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect((inserted[0] as Record<string, unknown>).importance).toBe(1);

    inserted.length = 0;
    await noteEpisode(
      { summary: "x", importance: -1 },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect((inserted[0] as Record<string, unknown>).importance).toBe(0);
  });
});
