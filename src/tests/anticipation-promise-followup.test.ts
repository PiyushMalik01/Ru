import { describe, it, expect, vi } from "vitest";
import { promiseFollowupDetector } from "@/lib/ai/anticipation/detectors/promise-followup";
import type { DetectorContext } from "@/lib/ai/anticipation/types";

// ---------------------------------------------------------------------------
// Supabase mock harness
// ---------------------------------------------------------------------------
// The detector reads from three tables ("promises", "activity_log", "tasks")
// and may UPDATE "promises" when a resolve match is found. We hand back a
// per-table builder that supports the exact chains the detector uses:
//
//   .from("promises").select(...).eq("user_id", ...).eq("resolved", false)
//   .from("activity_log").select(...).eq("user_id", ...).gte("timestamp", ...)
//   .from("tasks").select(...).eq("user_id", ...).gte("created_at", ...)
//   .from("promises").update(...).eq("id", ...).eq("user_id", ...)
//
// The chain methods return the same builder; the terminal awaitable resolves
// with { data, error } captured from the per-table fixture.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface MockFixture {
  promises: Row[];
  activity_log?: Row[];
  tasks?: Row[];
  selectErrors?: Partial<Record<"promises" | "activity_log" | "tasks", { message: string }>>;
}

function makeSupabase(fx: MockFixture) {
  const updates: Array<{ table: string; patch: Row; whereId?: string }> = [];

  function builder(table: string) {
    let mode: "select" | "update" = "select";
    let patch: Row | null = null;
    let whereId: string | undefined;

    const chain = {
      select() { mode = "select"; return chain; },
      update(p: Row) { mode = "update"; patch = p; return chain; },
      eq(col: string, val: unknown) {
        if (mode === "update" && col === "id") whereId = String(val);
        return chain;
      },
      gte() { return chain; },
      in() { return chain; },
      // Make the builder a thenable so `await` works.
      then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
        if (mode === "update") {
          updates.push({ table, patch: patch ?? {}, whereId });
          return resolve({ data: null, error: null });
        }
        const err = fx.selectErrors?.[table as keyof NonNullable<MockFixture["selectErrors"]>];
        if (err) return resolve({ data: null, error: err });
        const data =
          table === "promises" ? fx.promises :
          table === "activity_log" ? (fx.activity_log ?? []) :
          table === "tasks" ? (fx.tasks ?? []) :
          [];
        return resolve({ data, error: null });
      },
    };
    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => builder(table)),
  };
  return { supabase, updates };
}

function makeCtx(now: Date, supabase: unknown): DetectorContext {
  return {
    userId: "user-1",
    supabase: supabase as never,
    now,
    timezone: "UTC",
    memoryProfile: null,
    anticipationLevel: "balanced",
  };
}

const NOW = new Date("2026-05-22T12:00:00Z");
const D = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

describe("promiseFollowupDetector", () => {
  it("returns [] when no unresolved promises", async () => {
    const { supabase } = makeSupabase({ promises: [] });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toEqual([]);
  });

  it("emits a candidate for an overdue promise (due_by passed)", async () => {
    const { supabase } = makeSupabase({
      promises: [
        {
          id: "p1",
          subject: "call mom about the vacation plans",
          promised_at: D(-5),
          due_by: D(-2),
          resolved: false,
          resolved_at: null,
        },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("promise_followup");
    expect(out[0].dedupKey).toBe("promise:p1");
    expect((out[0].payload as { promiseId: string }).promiseId).toBe("p1");
    expect((out[0].payload as { daysOverdue: number }).daysOverdue).toBe(2);
    expect(out[0].phrasingHint.tone).toBe("gentle");
  });

  it("marks promise resolved when matching activity_log exists since promised_at", async () => {
    const { supabase, updates } = makeSupabase({
      promises: [
        {
          id: "p2",
          subject: "finish ochem essay tonight",
          promised_at: D(-5),
          due_by: D(-2),
          resolved: false,
          resolved_at: null,
        },
      ],
      activity_log: [
        {
          activity: "Worked on the ochem essay for two hours",
          timestamp: D(-1),
        },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("promises");
    expect(updates[0].whereId).toBe("p2");
    expect((updates[0].patch as { resolved: boolean }).resolved).toBe(true);
    expect(typeof (updates[0].patch as { resolved_at: string }).resolved_at).toBe("string");
  });

  it("does NOT emit when due_by is null and promise is <3 days old", async () => {
    const { supabase } = makeSupabase({
      promises: [
        {
          id: "p3",
          subject: "buy a birthday gift",
          promised_at: D(-1.5),
          due_by: null,
          resolved: false,
          resolved_at: null,
        },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toEqual([]);
  });

  it("emits when due_by is null and promise is 4+ days old", async () => {
    const { supabase } = makeSupabase({
      promises: [
        {
          id: "p4",
          subject: "draft the cover letter",
          promised_at: D(-4),
          due_by: null,
          resolved: false,
          resolved_at: null,
        },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toHaveLength(1);
    expect((out[0].payload as { daysOverdue: number }).daysOverdue).toBe(1);
  });

  it("confidence rises with days overdue, capped at 0.9", async () => {
    const { supabase } = makeSupabase({
      promises: [
        {
          id: "p5a", subject: "send invoice",
          promised_at: D(-2), due_by: D(-1), // 1 day overdue
          resolved: false, resolved_at: null,
        },
        {
          id: "p5b", subject: "send proposal",
          promised_at: D(-10), due_by: D(-8), // 8 days overdue
          resolved: false, resolved_at: null,
        },
        {
          id: "p5c", subject: "send agreement",
          promised_at: D(-30), due_by: D(-20), // 20 days overdue — should cap
          resolved: false, resolved_at: null,
        },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toHaveLength(3);
    const byId = new Map(out.map((c) => [(c.payload as { promiseId: string }).promiseId, c]));
    const c1 = byId.get("p5a")!;
    const c2 = byId.get("p5b")!;
    const c3 = byId.get("p5c")!;
    expect(c1.confidence).toBeCloseTo(0.75, 5);
    expect(c2.confidence).toBeCloseTo(0.9, 5);
    expect(c3.confidence).toBe(0.9);
    // Priority escalates to urgent once daysOverdue >= 3.
    expect(c1.priority).toBe("soft");
    expect(c2.priority).toBe("urgent");
    expect(c3.priority).toBe("urgent");
  });

  it("returns [] when the promises select errors", async () => {
    const { supabase } = makeSupabase({
      promises: [],
      selectErrors: { promises: { message: "boom" } },
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(out).toEqual([]);
  });

  it("does not resolve when subject shares fewer than 2 tokens with activity", async () => {
    const { supabase, updates } = makeSupabase({
      promises: [
        {
          id: "p6",
          subject: "draft the quarterly partnership memo",
          promised_at: D(-5),
          due_by: D(-2),
          resolved: false,
          resolved_at: null,
        },
      ],
      activity_log: [
        // Only "memo" matches — and "the" is too short to count. Single shared
        // token shouldn't be enough to mark resolved.
        { activity: "wrote a memo", timestamp: D(-1) },
      ],
    });
    const out = await promiseFollowupDetector.run(makeCtx(NOW, supabase));
    expect(updates).toHaveLength(0);
    expect(out).toHaveLength(1);
  });
});
