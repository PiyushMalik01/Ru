import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Predictive opening line — Surpass #3.
 *
 * General voice AI starts every conversation cold ("How can I help you?").
 * Ru opens with context: "Morning. Want me to log the workout?" — if the
 * user typically does something at this hour, tee it up. If not, a warm
 * neutral greeting.
 *
 * Signal sources (cheap, no LLM):
 *   - profile.timezone → resolve current local hour
 *   - profile.behavioral_model.typical_activity_hour → match-by-hour to
 *     a known activity routine (populated by M0 consolidation)
 *
 * Behavioral_model may be empty for new users (consolidation hasn't run
 * yet) — handle gracefully by falling through to the neutral greeting.
 *
 * Per-user 60-second in-memory cache. Across server cold-starts the cache
 * resets; that's fine — predictive opening regenerates cheaply and a
 * stale opening that's 60s old is still appropriate to the same hour.
 */
const cache = new Map<
  string,
  { at: number; payload: { greeting: string; confidence: number } }
>();

const TTL_MS = 60_000;

function timeWordFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.payload);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, behavioral_model")
    .eq("id", user.id)
    .single();

  // No profile at all — neutral fallback. Don't cache (very rare path).
  if (!profile) {
    return Response.json({ greeting: "Hey.", confidence: 0.0 });
  }

  const tz = profile.timezone ?? "UTC";
  let hour = 0;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
    );
    if (!Number.isFinite(hour)) hour = 0;
  } catch {
    hour = 0;
  }

  // behavioral_model is a JSON column produced by M0 consolidation. For
  // brand-new users it's null/empty, and that's expected — we just skip
  // straight to the neutral greeting in that case.
  const bm = (profile.behavioral_model ?? {}) as {
    typical_activity_hour?: Record<string, number>;
  };
  const tah = bm?.typical_activity_hour ?? {};
  const matches = Object.entries(tah).filter(
    ([, h]) => typeof h === "number" && Math.abs(h - hour) <= 1,
  );

  const timeWord = timeWordFor(hour);
  let payload: { greeting: string; confidence: number };
  if (matches.length > 0) {
    const [activity] = matches[0];
    payload = {
      greeting: `${timeWord}. Want me to log the ${activity}?`,
      confidence: 0.7,
    };
  } else {
    payload = { greeting: `${timeWord}.`, confidence: 0.3 };
  }

  cache.set(user.id, { at: Date.now(), payload });
  return Response.json(payload);
}
