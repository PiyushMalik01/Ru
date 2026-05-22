import { describe, it, expect, vi } from "vitest";
import { updateProfile } from "@/lib/ai/tools/handlers/memory";

function makeSupabase(initialDoc: Record<string, unknown> = {}, initialVersion = 0) {
  const writes: { table: string; op: string; row?: unknown }[] = [];
  return {
    writes,
    client: {
      from(table: string) {
        if (table === "memory_corrections") {
          return {
            insert: async (row: unknown) => {
              writes.push({ table, op: "insert", row });
              return { error: null };
            },
          };
        }
        if (table === "profiles") {
          return {
            select() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: { profile_doc: initialDoc, profile_version: initialVersion },
                      error: null,
                    }),
                  };
                },
              };
            },
            update(row: unknown) {
              writes.push({ table, op: "update", row });
              return { eq: async () => ({ error: null }) };
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

describe("updateProfile handler", () => {
  it("rejects unknown section", async () => {
    const { client } = makeSupabase();
    const result = await updateProfile(
      { section: "not_a_section", update: "x" },
      { supabase: client as never, userId: "u-1", messageId: "m-1" }
    );
    expect(result.ok).toBe(false);
  });

  it("appends to existing section + bumps version", async () => {
    const initial = {
      preferences: { content: "Prefers evening workouts.", sources: [], updated_at: "..." },
    };
    const { client, writes } = makeSupabase(initial, 3);

    const result = await updateProfile(
      { section: "preferences", update: "Hates 'active' nudges." },
      { supabase: client as never, userId: "u-1", messageId: "m-2" }
    );

    expect(result.ok).toBe(true);
    const profileUpdate = writes.find((w) => w.table === "profiles" && w.op === "update");
    expect(profileUpdate).toBeDefined();
    const updatePayload = profileUpdate!.row as Record<string, unknown>;
    expect(updatePayload.profile_version).toBe(4);
    const doc = updatePayload.profile_doc as Record<string, { content: string }>;
    expect(doc.preferences.content).toContain("Prefers evening workouts");
    expect(doc.preferences.content).toContain("Hates 'active' nudges");
  });

  it("creates a section if it didn't exist", async () => {
    const { client, writes } = makeSupabase({});
    await updateProfile(
      { section: "identity", update: "Lives in Tokyo." },
      { supabase: client as never, userId: "u-1", messageId: "m-3" }
    );
    const profileUpdate = writes.find((w) => w.table === "profiles" && w.op === "update");
    const doc = (profileUpdate!.row as Record<string, unknown>).profile_doc as Record<string, { content: string }>;
    expect(doc.identity.content).toBe("Lives in Tokyo.");
  });
});
