import { describe, it, expect, vi } from "vitest";
import { forget } from "@/lib/ai/tools/handlers/memory";

vi.mock("@/lib/ai/tools/fuzzy", () => ({
  matchEpisodeByText: vi.fn(),
}));

import { matchEpisodeByText } from "@/lib/ai/tools/fuzzy";

function makeSupabase() {
  const writes: { table: string; op: string; row?: unknown }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        if (table === "episodes") {
          return {
            update(row: unknown) {
              writes.push({ table, op: "update", row });
              return {
                eq() {
                  return { eq: async () => ({ error: null }) };
                },
              };
            },
          };
        }
        if (table === "memory_audit") {
          return {
            insert: async (row: unknown) => {
              writes.push({ table, op: "insert", row });
              return { error: null };
            },
          };
        }
        throw new Error("unexpected table: " + table);
      },
    },
  };
}

describe("forget handler", () => {
  it("returns ok:false when no episode matches", async () => {
    (matchEpisodeByText as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { client } = makeSupabase();
    const result = await forget(
      { target_description: "something" },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no memory matched/);
  });

  it("archives matched episode + writes audit row", async () => {
    (matchEpisodeByText as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ep-9",
      content: "Piyush is cutting carbs.",
    });
    const { client, writes } = makeSupabase();
    const result = await forget(
      { target_description: "cutting carbs", reason: "not doing that anymore" },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(true);
    const episodeUpdate = writes.find((w) => w.table === "episodes" && w.op === "update");
    expect(episodeUpdate).toBeDefined();
    expect((episodeUpdate!.row as Record<string, unknown>).archived_at).toBeTruthy();
    const audit = writes.find((w) => w.table === "memory_audit");
    expect((audit!.row as Record<string, unknown>).kind).toBe("forgot");
  });

  it("rejects empty target_description", async () => {
    const { client } = makeSupabase();
    const result = await forget(
      { target_description: "   " },
      { supabase: client as never, userId: "u-1", messageId: null }
    );
    expect(result.ok).toBe(false);
  });
});
