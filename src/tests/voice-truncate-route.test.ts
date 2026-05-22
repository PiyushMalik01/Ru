import { describe, it, expect } from "vitest";
import { z } from "zod";

const BodySchema = z.object({
  messageId: z.uuid(),
  playedUpToChar: z.number().int().min(0),
});

describe("truncate route body schema", () => {
  it("accepts valid body", () => {
    const r = BodySchema.safeParse({
      messageId: "11111111-1111-4111-8111-111111111111",
      playedUpToChar: 50,
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(BodySchema.safeParse({}).success).toBe(false);
  });
  it("rejects negative playedUpToChar", () => {
    expect(
      BodySchema.safeParse({
        messageId: "11111111-1111-4111-8111-111111111111",
        playedUpToChar: -1,
      }).success,
    ).toBe(false);
  });
});
