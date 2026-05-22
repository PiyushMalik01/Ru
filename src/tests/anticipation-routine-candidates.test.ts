import { describe, it, expect, vi } from "vitest";
import { routineCandidatesDetector } from "@/lib/ai/anticipation/detectors/routine-candidates";
import type { DetectorContext } from "@/lib/ai/anticipation/types";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
// We mock just the two Supabase surfaces the detector touches:
//   - .from("activity_log").select(...).eq(...).gte(...).order(...).limit(...)
//   - .rpc("match_active_routine", args)
// Anything else is unused.
// ---------------------------------------------------------------------------

interface ActivityRow {
  id: string;
  activity: string;
  category: string;
  timestamp: string;
}

interface RoutineMatchRow {
  id: string;
  title: string;
  score: number;
}

function makeSupabase(opts: {
  activityRows: ActivityRow[];
  routineMatches?: RoutineMatchRow[];
}) {
  const builder = {
    _rows: opts.activityRows,
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    order() { return this; },
    limit() {
      return Promise.resolve({ data: this._rows, error: null });
    },
    // Allow `await builder` to resolve at any chain stop (defensive).
    then(onFulfilled: (v: { data: ActivityRow[]; error: null }) => unknown) {
      return Promise.resolve({ data: this._rows, error: null }).then(onFulfilled);
    },
  };
  return {
    from: vi.fn(() => builder),
    rpc: vi.fn(async (name: string) => {
      if (name === "match_active_routine") {
        return { data: opts.routineMatches ?? [], error: null };
      }
      return { data: null, error: { message: "unknown rpc" } };
    }),
  };
}

const TZ = "America/Los_Angeles";
// Fixed "now" so the lookback window is deterministic.
// 2026-05-20 16:00 UTC = 2026-05-20 09:00 America/Los_Angeles (PDT, UTC-7).
const NOW = new Date("2026-05-20T16:00:00.000Z");

function makeCtx(supabase: ReturnType<typeof makeSupabase>): DetectorContext {
  return {
    userId: "user-1",
    supabase: supabase as never,
    now: NOW,
    timezone: TZ,
    memoryProfile: null,
    anticipationLevel: "balanced",
  };
}

/**
 * Build an ISO timestamp for the given local-PDT date/hour, returned as UTC.
 * PDT is UTC-7; days within May 2026 are all DST.
 */
function pdtLog(dateYmd: string, hour: number, minute = 0): string {
  // pdtLog("2026-05-15", 7, 30) -> 2026-05-15 07:30 PDT -> 14:30 UTC
  const [y, m, d] = dateYmd.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d, hour + 7, minute)).toISOString();
}

function row(id: string, activity: string, ts: string, category = "fitness"): ActivityRow {
  return { id, activity, category, timestamp: ts };
}

describe("routineCandidatesDetector", () => {
  it("returns [] when there are no activities", async () => {
    const supabase = makeSupabase({ activityRows: [] });
    const result = await routineCandidatesDetector.run(makeCtx(supabase));
    expect(result).toEqual([]);
  });

  it("skips groups with fewer than 4 occurrences", async () => {
    const rows = [
      row("a1", "gym", pdtLog("2026-05-15", 7)),
      row("a2", "gym", pdtLog("2026-05-16", 7)),
      row("a3", "gym", pdtLog("2026-05-17", 7)),
    ];
    const supabase = makeSupabase({ activityRows: rows });
    const result = await routineCandidatesDetector.run(makeCtx(supabase));
    expect(result).toEqual([]);
  });

  it("skips when 5 occurrences span only 2 distinct days (regularity fail)", async () => {
    const rows = [
      row("a1", "gym", pdtLog("2026-05-18", 7, 0)),
      row("a2", "gym", pdtLog("2026-05-18", 7, 30)),
      row("a3", "gym", pdtLog("2026-05-18", 8, 0)),
      row("a4", "gym", pdtLog("2026-05-19", 7, 15)),
      row("a5", "gym", pdtLog("2026-05-19", 7, 45)),
    ];
    const supabase = makeSupabase({ activityRows: rows });
    const result = await routineCandidatesDetector.run(makeCtx(supabase));
    expect(result).toEqual([]);
  });

  it("emits a candidate for 5 occurrences across 5 distinct days at similar hour", async () => {
    const rows = [
      row("a1", "went to the gym", pdtLog("2026-05-12", 7, 5)),
      row("a2", "gym", pdtLog("2026-05-13", 7, 20)),
      row("a3", "did gym", pdtLog("2026-05-14", 7, 45)),
      row("a4", "gym", pdtLog("2026-05-15", 8, 10)),
      row("a5", "the gym", pdtLog("2026-05-18", 7, 30)),
    ];
    const supabase = makeSupabase({ activityRows: rows, routineMatches: [] });
    const result = await routineCandidatesDetector.run(makeCtx(supabase));
    expect(result.length).toBe(1);
    const c = result[0];
    expect(c.type).toBe("routine_candidate");
    expect(c.priority).toBe("soft");
    expect(c.phrasingHint.tone).toBe("curious");
    const payload = c.payload as Record<string, unknown>;
    expect(payload.pattern).toBe("gym");
    expect(payload.occurrencesCount).toBe(5);
    expect(payload.distinctDays).toBe(5);
    // Typical hour should be in the morning, near 7-8 local.
    expect(payload.typicalHour as number).toBeGreaterThanOrEqual(6.5);
    expect(payload.typicalHour as number).toBeLessThanOrEqual(8.5);
    // dedupKey shape
    expect(c.dedupKey).toMatch(/^candidate:gym:\d+$/);
    // showAt should be in the future (next 9am local).
    expect(c.showAt.getTime()).toBeGreaterThan(NOW.getTime());
    // Examples populated
    expect(c.phrasingHint.examples?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("skips when match_active_routine returns a hit (existing routine)", async () => {
    const rows = [
      row("a1", "gym", pdtLog("2026-05-12", 7, 5)),
      row("a2", "gym", pdtLog("2026-05-13", 7, 20)),
      row("a3", "gym", pdtLog("2026-05-14", 7, 45)),
      row("a4", "gym", pdtLog("2026-05-15", 8, 10)),
      row("a5", "gym", pdtLog("2026-05-18", 7, 30)),
    ];
    const supabase = makeSupabase({
      activityRows: rows,
      routineMatches: [{ id: "r1", title: "Morning gym", score: 0.72 }],
    });
    const result = await routineCandidatesDetector.run(makeCtx(supabase));
    expect(result).toEqual([]);
  });

  it("confidence increases with higher count and more distinct days", async () => {
    // Baseline: 5 occurrences, 5 distinct days.
    const baselineRows = [
      row("a1", "gym", pdtLog("2026-05-12", 7, 5)),
      row("a2", "gym", pdtLog("2026-05-13", 7, 20)),
      row("a3", "gym", pdtLog("2026-05-14", 7, 45)),
      row("a4", "gym", pdtLog("2026-05-15", 8, 10)),
      row("a5", "gym", pdtLog("2026-05-18", 7, 30)),
    ];
    const baselineSb = makeSupabase({ activityRows: baselineRows, routineMatches: [] });
    const baseline = await routineCandidatesDetector.run(makeCtx(baselineSb));
    expect(baseline.length).toBe(1);
    const baseConf = baseline[0].confidence;

    // Boosted: 8 occurrences across 8 distinct days.
    const boostedRows = [
      row("b1", "gym", pdtLog("2026-05-09", 7, 0)),
      row("b2", "gym", pdtLog("2026-05-10", 7, 15)),
      row("b3", "gym", pdtLog("2026-05-11", 7, 30)),
      row("b4", "gym", pdtLog("2026-05-12", 7, 45)),
      row("b5", "gym", pdtLog("2026-05-13", 7, 10)),
      row("b6", "gym", pdtLog("2026-05-14", 7, 25)),
      row("b7", "gym", pdtLog("2026-05-15", 7, 40)),
      row("b8", "gym", pdtLog("2026-05-18", 7, 5)),
    ];
    const boostedSb = makeSupabase({ activityRows: boostedRows, routineMatches: [] });
    const boosted = await routineCandidatesDetector.run(makeCtx(boostedSb));
    expect(boosted.length).toBe(1);
    expect(boosted[0].confidence).toBeGreaterThan(baseConf);
    expect(boosted[0].confidence).toBeLessThanOrEqual(0.9);
  });
});
