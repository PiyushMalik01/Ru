import { describe, it, expect, vi } from "vitest";
import { routineAdherenceDetector } from "@/lib/ai/anticipation/detectors/routine-adherence";
import type { DetectorContext } from "@/lib/ai/anticipation/types";
import type { MemoryProfile } from "@/lib/queries/memory";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
// The detector touches two tables: `routines` and `routine_logs`. We mock
// `supabase.from(table)` to return a thenable chain whose final result depends
// on the table requested. Each `.eq/.in()` returns the same chain object so
// chaining works regardless of order.
// ---------------------------------------------------------------------------

interface RoutineRow {
  id: string;
  title: string;
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  custom_days: number[] | null;
  time_of_day: string | null;
  nudge_level: string;
  is_active: boolean;
}

interface LogRow {
  routine_id: string;
  completed: boolean;
}

interface MockData {
  routines: RoutineRow[];
  logs: LogRow[];
  routinesError?: { message: string } | null;
  logsError?: { message: string } | null;
}

function makeSupabaseMock(data: MockData) {
  const fromFn = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const result =
      table === "routines"
        ? { data: data.routines, error: data.routinesError ?? null }
        : { data: data.logs, error: data.logsError ?? null };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    });
    chain.in = vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    });
    // The detector awaits the chain directly (no `.single()`/`.maybeSingle()`),
    // so make the chain a thenable that resolves to the table result.
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  });

  return { from: fromFn } as unknown as SupabaseClient<Database>;
}

function makeCtx(overrides: {
  supabase: SupabaseClient<Database>;
  now: Date;
  timezone?: string;
  memoryProfile?: MemoryProfile | null;
}): DetectorContext {
  return {
    userId: "user-1",
    supabase: overrides.supabase,
    now: overrides.now,
    timezone: overrides.timezone ?? "UTC",
    memoryProfile: overrides.memoryProfile ?? null,
    anticipationLevel: "balanced",
  };
}

// 2026-05-22 is a Friday (DOW=5).
const FRIDAY_NOON_UTC = new Date("2026-05-22T12:00:00.000Z");

describe("routine-adherence detector", () => {
  it("returns [] when user has no routines", async () => {
    const supabase = makeSupabaseMock({ routines: [], logs: [] });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("skips routines already completed today", async () => {
    // Anchor at 13:00 UTC — 60min ahead of noon, inside the lookahead window.
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Morning pages",
          frequency: "daily",
          custom_days: null,
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [{ routine_id: "r1", completed: true }],
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("skips routines not scheduled for today's DOW (custom)", async () => {
    // Custom frequency with only Monday (DOW=1); today is Friday (DOW=5).
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Weekly review",
          frequency: "custom",
          custom_days: [1],
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("skips weekdays-only routine on a weekend", async () => {
    // Saturday DOW=6
    const saturday = new Date("2026-05-23T12:00:00.000Z");
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Standup",
          frequency: "weekdays",
          custom_days: null,
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({ supabase, now: saturday });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("emits a candidate at the right showAt for an upcoming routine", async () => {
    // 13:00 UTC, now is 12:00 UTC -> 60min ahead; showAt = 12:30 UTC.
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Morning pages",
          frequency: "daily",
          custom_days: null,
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.type).toBe("routine_adherence");
    expect(c.priority).toBe("soft");
    expect(c.dedupKey).toBe("routine:r1:2026-05-22");
    expect(c.payload.routineId).toBe("r1");
    expect(c.payload.typicalTime).toBe("13:00");
    expect(c.showAt.toISOString()).toBe("2026-05-22T12:30:00.000Z");
    expect(c.phrasingHint.tone).toBe("gentle");
    expect(c.phrasingHint.situation).toContain("Morning pages");
    expect(c.phrasingHint.situation).toContain("13:00");
    expect(c.phrasingHint.examples?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("skips when behavioral adherence < 0.5", async () => {
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Morning pages",
          frequency: "daily",
          custom_days: null,
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const memoryProfile: MemoryProfile = {
      profile_doc: {},
      behavioral_model: {
        routine_completion_by_dow: { r1: 0.2 },
      },
      profile_version: 1,
      memory_enabled: true,
    };
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC, memoryProfile });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("uses behavioral adherence to set confidence (clamped to [0.55, 0.95])", async () => {
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Morning pages",
          frequency: "daily",
          custom_days: null,
          time_of_day: "13:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const memoryProfile: MemoryProfile = {
      profile_doc: {},
      behavioral_model: {
        routine_completion_by_dow: { r1: 0.99 }, // above MAX -> clamped to 0.95
      },
      profile_version: 1,
      memory_enabled: true,
    };
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC, memoryProfile });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBeCloseTo(0.95, 5);
    expect(out[0].payload.adherenceRate).toBeCloseTo(0.99, 5);
  });

  it("skips routines too far in the future (>90 min)", async () => {
    // 15:00 UTC anchor while now=12:00 UTC -> 180min out, beyond LOOKAHEAD_MIN.
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Afternoon walk",
          frequency: "daily",
          custom_days: null,
          time_of_day: "15:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("skips routines too far in the past (>60 min)", async () => {
    // 10:00 UTC anchor while now=12:00 UTC -> -120min, beyond GRACE_PAST_MIN.
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Morning pages",
          frequency: "daily",
          custom_days: null,
          time_of_day: "10:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });

  it("respects user timezone when computing today's DOW and anchor", async () => {
    // now = Saturday 02:00 UTC; in America/Los_Angeles that's Friday 19:00.
    // Friday DOW=5 -> weekdays frequency matches. Anchor at 20:00 local LA
    // is 03:00 UTC -> 60min ahead of now (02:00 UTC).
    const nowUtc = new Date("2026-05-23T02:00:00.000Z");
    const supabase = makeSupabaseMock({
      routines: [
        {
          id: "r1",
          title: "Wind down",
          frequency: "weekdays",
          custom_days: null,
          time_of_day: "20:00:00",
          nudge_level: "gentle",
          is_active: true,
        },
      ],
      logs: [],
    });
    const ctx = makeCtx({
      supabase,
      now: nowUtc,
      timezone: "America/Los_Angeles",
    });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toHaveLength(1);
    expect(out[0].dedupKey).toBe("routine:r1:2026-05-22");
    expect(out[0].showAt.toISOString()).toBe("2026-05-23T02:30:00.000Z");
  });

  it("returns [] gracefully if routines query errors", async () => {
    const supabase = makeSupabaseMock({
      routines: [],
      logs: [],
      routinesError: { message: "boom" },
    });
    const ctx = makeCtx({ supabase, now: FRIDAY_NOON_UTC });
    const out = await routineAdherenceDetector.run(ctx);
    expect(out).toEqual([]);
  });
});
