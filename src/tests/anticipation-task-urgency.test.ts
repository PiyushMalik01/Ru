import { describe, it, expect, vi } from "vitest";
import { taskUrgencyDetector } from "@/lib/ai/anticipation/detectors/task-urgency";
import type { DetectorContext } from "@/lib/ai/anticipation/types";

// ---------------------------------------------------------------------------
// Supabase mock — the detector chains:
//   from("tasks").select(...).eq(...).in(...).not(...).gte(...).lte(...)
// and awaits the final builder. We return a thenable proxy so any chain
// terminates with the configured { data, error } payload.
// ---------------------------------------------------------------------------
function makeSupabase(rows: unknown[] | null, error: { message: string } | null = null) {
  const result = { data: rows, error };
  const builder: any = {};
  const chainMethods = [
    "select",
    "eq",
    "in",
    "not",
    "gte",
    "lte",
    "is",
    "or",
    "order",
    "limit",
  ];
  for (const m of chainMethods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const supabase = {
    from: vi.fn(() => builder),
  };
  return { supabase, builder };
}

const NOW = new Date("2026-05-22T12:00:00.000Z");

function makeCtx(supabase: unknown): DetectorContext {
  return {
    userId: "user-1",
    supabase: supabase as never,
    now: NOW,
    timezone: "America/Los_Angeles",
    memoryProfile: null,
    anticipationLevel: "balanced",
  };
}

// Helpers for constructing relative timestamps.
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    title: "Ship anticipation v1",
    due_at: daysFromNow(1),
    status: "pending",
    priority: "high",
    updated_at: hoursAgo(60),
    workspace_id: "ws-1",
    ...overrides,
  };
}

describe("taskUrgencyDetector", () => {
  it("returns [] when there are no tasks", async () => {
    const { supabase } = makeSupabase([]);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toEqual([]);
  });

  it("returns [] gracefully when the query errors", async () => {
    const { supabase } = makeSupabase(null, { message: "boom" });
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toEqual([]);
  });

  it("emits the urgent flavor for a significant task due tomorrow, quiet 60h", async () => {
    const rows = [taskRow({ due_at: daysFromNow(1), updated_at: hoursAgo(60), priority: "high", workspace_id: "ws-1" })];
    const { supabase } = makeSupabase(rows);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.type).toBe("task_urgency");
    expect(c.priority).toBe("urgent");
    expect(c.dedupKey).toBe("task:t-1:urgent");
    expect(c.phrasingHint.tone).toBe("urgent");
    expect(c.phrasingHint.data.daysUntilDue).toBe(1);
    expect(c.phrasingHint.data.hoursQuiet).toBe(60);
    expect(c.payload.flavor).toBe("urgent");
    expect(c.showAt.getTime()).toBe(NOW.getTime());
    // expiresAt should align with due_at.
    expect(c.expiresAt?.toISOString()).toBe(daysFromNow(1));
  });

  it("emits the neglected flavor for a significant task due in 5 days, quiet 90h", async () => {
    const rows = [taskRow({ id: "t-2", due_at: daysFromNow(5), updated_at: hoursAgo(90), priority: "medium", workspace_id: null })];
    const { supabase } = makeSupabase(rows);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.priority).toBe("soft");
    expect(c.dedupKey).toBe("task:t-2:neglected");
    expect(c.phrasingHint.tone).toBe("gentle");
    expect(c.phrasingHint.data.daysUntilDue).toBe(5);
    expect(c.phrasingHint.data.hoursQuiet).toBe(90);
    expect(c.payload.flavor).toBe("neglected");
  });

  it("skips low-priority unattached tasks (not significant)", async () => {
    const rows = [taskRow({ id: "t-3", priority: "low", workspace_id: null, due_at: daysFromNow(1), updated_at: hoursAgo(60) })];
    const { supabase } = makeSupabase(rows);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toEqual([]);
  });

  it("skips tasks that were touched recently (not quiet enough)", async () => {
    const rows = [
      // Due tomorrow but updated 24h ago — fails urgent quiet gate.
      taskRow({ id: "t-4", due_at: daysFromNow(1), updated_at: hoursAgo(24) }),
      // Due in 5 days but updated 50h ago — fails neglected quiet gate.
      taskRow({ id: "t-5", due_at: daysFromNow(5), updated_at: hoursAgo(50) }),
    ];
    const { supabase } = makeSupabase(rows);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toEqual([]);
  });

  it("skips already-completed tasks", async () => {
    // The detector queries with status IN ('pending','in_progress'); even so,
    // if a completed task slipped through the mock it should still be filtered
    // out by status semantics. We simulate the DB filtering correctly: by
    // returning no rows when status is completed, the detector emits nothing.
    const { supabase, builder } = makeSupabase([]);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toEqual([]);
    // Sanity: the detector did request status IN ['pending','in_progress'].
    const inCalls = (builder.in as ReturnType<typeof vi.fn>).mock.calls;
    const statusCall = inCalls.find((args: unknown[]) => args[0] === "status");
    expect(statusCall).toBeDefined();
    expect(statusCall?.[1]).toEqual(["pending", "in_progress"]);
  });

  it("produces confidences within the documented ranges", async () => {
    const rows = [
      // Urgent: due tomorrow (24h), quiet 60h.
      taskRow({ id: "u1", due_at: daysFromNow(1), updated_at: hoursAgo(60), priority: "high", workspace_id: "ws-1" }),
      // Neglected: due in 5d, quiet 90h.
      taskRow({ id: "n1", due_at: daysFromNow(5), updated_at: hoursAgo(90), priority: "high", workspace_id: "ws-1" }),
      // Neglected on the upper end: quiet 200h.
      taskRow({ id: "n2", due_at: daysFromNow(6), updated_at: hoursAgo(200), priority: "high", workspace_id: "ws-1" }),
    ];
    const { supabase } = makeSupabase(rows);
    const out = await taskUrgencyDetector.run(makeCtx(supabase));
    expect(out).toHaveLength(3);

    const byId = Object.fromEntries(out.map((c) => [c.payload.taskId as string, c]));

    expect(byId["u1"].confidence).toBeGreaterThanOrEqual(0.85);
    expect(byId["u1"].confidence).toBeLessThanOrEqual(0.95);

    expect(byId["n1"].confidence).toBeGreaterThanOrEqual(0.65);
    expect(byId["n1"].confidence).toBeLessThanOrEqual(0.8);

    expect(byId["n2"].confidence).toBeGreaterThanOrEqual(0.65);
    expect(byId["n2"].confidence).toBeLessThanOrEqual(0.8);
    // Longer quiet should not exceed the cap.
    expect(byId["n2"].confidence).toBeLessThanOrEqual(0.8);
  });
});
