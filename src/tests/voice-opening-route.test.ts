import { describe, it, expect } from "vitest";
import { z } from "zod";

// Shape contract for /api/voice/opening. The route is server-only (touches
// Supabase auth), so we validate the response shape here and exercise the
// full handler in the manual QA pass.
const ResponseSchema = z.object({
  greeting: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

describe("opening response schema", () => {
  it("validates a neutral greeting", () => {
    expect(ResponseSchema.safeParse({ greeting: "Hey.", confidence: 0.0 }).success).toBe(true);
  });
  it("validates a predictive greeting", () => {
    expect(
      ResponseSchema.safeParse({
        greeting: "Morning. Want me to log the workout?",
        confidence: 0.85,
      }).success,
    ).toBe(true);
  });
  it("rejects empty greeting", () => {
    expect(ResponseSchema.safeParse({ greeting: "", confidence: 0.5 }).success).toBe(false);
  });
  it("rejects confidence outside [0,1]", () => {
    expect(ResponseSchema.safeParse({ greeting: "Hey.", confidence: 1.5 }).success).toBe(false);
  });
});
