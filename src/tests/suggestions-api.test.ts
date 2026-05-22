import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveSnoozeUntil,
  isSnoozeKeyword,
} from "@/app/api/suggestions/_helpers/snooze";

// --- mock @/lib/supabase/server before importing route modules -------------
// Tests below build a fresh handle per case and the mock pulls from
// `currentClient` so each test gets its own behaviour.

let currentClient: unknown = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => currentClient),
}));

// Imports must come after the vi.mock call so the mocked factory is used.
import { POST as dismissPOST } from "@/app/api/suggestions/[id]/dismiss/route";
import { POST as snoozePOST } from "@/app/api/suggestions/[id]/snooze/route";
import { POST as actedPOST } from "@/app/api/suggestions/[id]/acted/route";

// ---------------------------------------------------------------------------
// resolveSnoozeUntil helper
// ---------------------------------------------------------------------------

describe("resolveSnoozeUntil", () => {
  it("recognises all expected keywords", () => {
    expect(isSnoozeKeyword("1h")).toBe(true);
    expect(isSnoozeKeyword("3h")).toBe(true);
    expect(isSnoozeKeyword("tomorrow")).toBe(true);
    expect(isSnoozeKeyword("next_morning")).toBe(true);
    expect(isSnoozeKeyword("eventually")).toBe(false);
  });

  it("resolves '1h' to now + 1 hour", () => {
    const now = new Date("2026-05-22T15:00:00Z");
    const { until, keyword } = resolveSnoozeUntil("1h", "UTC", now);
    expect(keyword).toBe("1h");
    expect(until.getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it("resolves '3h' to now + 3 hours", () => {
    const now = new Date("2026-05-22T15:00:00Z");
    const { until } = resolveSnoozeUntil("3h", "UTC", now);
    expect(until.getTime() - now.getTime()).toBe(3 * 60 * 60_000);
  });

  it("resolves 'tomorrow' to same local hour:minute next day (UTC)", () => {
    const now = new Date("2026-05-22T15:30:00Z");
    const { until } = resolveSnoozeUntil("tomorrow", "UTC", now);
    expect(until.toISOString()).toBe("2026-05-23T15:30:00.000Z");
  });

  it("resolves 'tomorrow' to user-tz tomorrow at the same local clock time", () => {
    // 2026-05-22 23:00 UTC == 2026-05-22 16:00 America/Los_Angeles (PDT, UTC-7).
    // "tomorrow" => 2026-05-23 16:00 LA == 2026-05-23 23:00 UTC.
    const now = new Date("2026-05-22T23:00:00Z");
    const { until, keyword } = resolveSnoozeUntil(
      "tomorrow",
      "America/Los_Angeles",
      now,
    );
    expect(keyword).toBe("tomorrow");
    expect(until.toISOString()).toBe("2026-05-23T23:00:00.000Z");
  });

  it("resolves 'next_morning' to tomorrow 09:00 local time", () => {
    // 2026-05-22 23:00 UTC == 2026-05-22 16:00 PDT.
    // next_morning => 2026-05-23 09:00 PDT == 2026-05-23 16:00 UTC.
    const now = new Date("2026-05-22T23:00:00Z");
    const { until } = resolveSnoozeUntil(
      "next_morning",
      "America/Los_Angeles",
      now,
    );
    expect(until.toISOString()).toBe("2026-05-23T16:00:00.000Z");
  });

  it("falls back to UTC when tz is empty", () => {
    const now = new Date("2026-05-22T08:15:00Z");
    const { until } = resolveSnoozeUntil("tomorrow", "", now);
    expect(until.toISOString()).toBe("2026-05-23T08:15:00.000Z");
  });

  it("parses ISO timestamps directly", () => {
    const now = new Date("2026-05-22T15:00:00Z");
    const { until, keyword } = resolveSnoozeUntil(
      "2026-06-01T12:00:00.000Z",
      "UTC",
      now,
    );
    expect(keyword).toBeNull();
    expect(until.toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });

  it("throws on garbage input", () => {
    expect(() => resolveSnoozeUntil("not-a-date", "UTC", new Date())).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Route handler tests with a hand-rolled supabase mock
// ---------------------------------------------------------------------------

type Captured = {
  table: string;
  op: "update" | "insert";
  payload: Record<string, unknown>;
};

/**
 * Build a fluent supabase mock. `findResult` controls what
 * `from(suggestions).select(...).eq(...).eq(...).single()` resolves to.
 * `captured` records every update/insert call for assertions.
 */
function buildSupabaseMock(opts: {
  userId: string | null;
  suggestionRow: { id: string; user_id: string } | null;
  profileTimezone?: string;
}): { client: unknown; captured: Captured[] } {
  const captured: Captured[] = [];

  // Helper: a thennable chain. select/eq/order/limit return `this`; terminal
  // methods (single, then update/insert resolution) resolve to the stored result.
  function makeQuery(initialResult: {
    data: unknown;
    error: { message: string } | null;
  }) {
    const q: Record<string, unknown> = {};
    let result = initialResult;
    const chain = () => q;
    q.select = vi.fn(chain);
    q.eq = vi.fn(chain);
    q.lte = vi.fn(chain);
    q.gt = vi.fn(chain);
    q.or = vi.fn(chain);
    q.order = vi.fn(chain);
    q.limit = vi.fn(chain);
    q.single = vi.fn(async () => result);
    q.then = (resolve: (v: unknown) => unknown) => resolve(result);
    q.maybeSingle = vi.fn(async () => result);
    return { q, setResult: (r: typeof initialResult) => (result = r) };
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.userId ? { id: opts.userId } : null },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "suggestions") {
        const initial = opts.suggestionRow
          ? { data: opts.suggestionRow, error: null }
          : { data: null, error: null };
        const { q } = makeQuery(initial);
        q.update = vi.fn((payload: Record<string, unknown>) => {
          captured.push({ table, op: "update", payload });
          // update().eq().eq() returns a thennable resolving to { error: null }.
          const r = { data: null, error: null };
          const upd: Record<string, unknown> = {};
          const chain = () => upd;
          upd.eq = vi.fn(chain);
          upd.then = (resolve: (v: unknown) => unknown) => resolve(r);
          return upd;
        });
        return q;
      }
      if (table === "suggestion_actions") {
        const { q } = makeQuery({ data: null, error: null });
        q.insert = vi.fn(async (payload: Record<string, unknown>) => {
          captured.push({ table, op: "insert", payload });
          return { data: null, error: null };
        });
        return q;
      }
      if (table === "profiles") {
        const { q } = makeQuery({
          data: { timezone: opts.profileTimezone ?? "UTC" },
          error: null,
        });
        return q;
      }
      const { q } = makeQuery({ data: null, error: null });
      return q;
    }),
  };

  return { client, captured };
}

function makeReq(body: unknown): { json: () => Promise<unknown> } {
  return { json: async () => body };
}

beforeEach(() => {
  currentClient = null;
});

describe("POST /api/suggestions/[id]/dismiss", () => {
  it("dismisses a row the user owns and logs the action", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    const { client, captured } = buildSupabaseMock({
      userId,
      suggestionRow: { id: sid, user_id: userId },
    });
    currentClient = client;

    const res = await dismissPOST(
      makeReq({ surface: "briefing" }) as unknown as Parameters<typeof dismissPOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const update = captured.find((c) => c.op === "update");
    expect(update?.payload.status).toBe("dismissed");
    expect(typeof update?.payload.dismissed_at).toBe("string");

    const log = captured.find((c) => c.op === "insert");
    expect(log?.payload.action).toBe("dismissed");
    expect(log?.payload.surface).toBe("briefing");
    expect(log?.payload.suggestion_id).toBe(sid);
    expect(log?.payload.user_id).toBe(userId);
  });

  it("returns 404 when the suggestion is owned by someone else", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    // Suggestion row simply isn't returned for this user (RLS-equivalent in mock).
    const { client, captured } = buildSupabaseMock({
      userId,
      suggestionRow: null,
    });
    currentClient = client;

    const res = await dismissPOST(
      makeReq({}) as unknown as Parameters<typeof dismissPOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(404);
    // Crucially: no UPDATE and no log row.
    expect(captured.find((c) => c.op === "update")).toBeUndefined();
    expect(captured.find((c) => c.op === "insert")).toBeUndefined();
  });

  it("returns 401 with no user", async () => {
    const { client } = buildSupabaseMock({
      userId: null,
      suggestionRow: null,
    });
    currentClient = client;
    const res = await dismissPOST(
      makeReq({}) as unknown as Parameters<typeof dismissPOST>[0],
      { params: Promise.resolve({ id: "abc" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/suggestions/[id]/snooze", () => {
  it("resolves 'tomorrow' against the user's timezone", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    const { client, captured } = buildSupabaseMock({
      userId,
      suggestionRow: { id: sid, user_id: userId },
      profileTimezone: "America/Los_Angeles",
    });
    currentClient = client;

    const res = await snoozePOST(
      makeReq({ until: "tomorrow" }) as unknown as Parameters<typeof snoozePOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; snooze_until: string };
    expect(body.ok).toBe(true);

    // The status update should match.
    const update = captured.find((c) => c.op === "update");
    expect(update?.payload.status).toBe("snoozed");
    expect(update?.payload.snooze_until).toBe(body.snooze_until);

    // Roundtrip the returned ISO and check it advanced ~24h from "now",
    // landing on the same wall-clock time in America/Los_Angeles.
    const now = new Date();
    const until = new Date(body.snooze_until);
    const diffMs = until.getTime() - now.getTime();
    // Allow a generous window — DST or test-clock skew may shift by up to 1h.
    expect(diffMs).toBeGreaterThan(22 * 60 * 60_000);
    expect(diffMs).toBeLessThan(26 * 60 * 60_000);

    const log = captured.find((c) => c.op === "insert");
    expect(log?.payload.action).toBe("snoozed");
    const meta = log?.payload.metadata as { keyword: string; until: string };
    expect(meta.keyword).toBe("tomorrow");
    expect(meta.until).toBe(body.snooze_until);
  });

  it("rejects invalid body", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    const { client } = buildSupabaseMock({
      userId,
      suggestionRow: { id: sid, user_id: userId },
    });
    currentClient = client;
    const res = await snoozePOST(
      makeReq({}) as unknown as Parameters<typeof snoozePOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects garbage 'until'", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    const { client } = buildSupabaseMock({
      userId,
      suggestionRow: { id: sid, user_id: userId },
    });
    currentClient = client;
    const res = await snoozePOST(
      makeReq({ until: "not-a-date" }) as unknown as Parameters<typeof snoozePOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/suggestions/[id]/acted", () => {
  it("marks the suggestion acted and logs the surface", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const sid = "22222222-2222-4222-8222-222222222222";
    const { client, captured } = buildSupabaseMock({
      userId,
      suggestionRow: { id: sid, user_id: userId },
    });
    currentClient = client;

    const res = await actedPOST(
      makeReq({ surface: "toast" }) as unknown as Parameters<typeof actedPOST>[0],
      { params: Promise.resolve({ id: sid }) },
    );
    expect(res.status).toBe(200);

    const update = captured.find((c) => c.op === "update");
    expect(update?.payload.status).toBe("acted");
    expect(typeof update?.payload.acted_at).toBe("string");

    const log = captured.find((c) => c.op === "insert");
    expect(log?.payload.action).toBe("acted");
    expect(log?.payload.surface).toBe("toast");
  });

  it("returns 404 when the suggestion is not owned", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const { client } = buildSupabaseMock({
      userId,
      suggestionRow: null,
    });
    currentClient = client;
    const res = await actedPOST(
      makeReq({}) as unknown as Parameters<typeof actedPOST>[0],
      { params: Promise.resolve({ id: "no-such-id" }) },
    );
    expect(res.status).toBe(404);
  });
});
