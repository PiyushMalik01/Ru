import { describe, it, expect } from "vitest";
import { extractCardsFromMetadata } from "@/lib/chat-cards";

describe("extractCardsFromMetadata", () => {
  it("returns [] for null / undefined", () => {
    expect(extractCardsFromMetadata(null)).toEqual([]);
    expect(extractCardsFromMetadata(undefined)).toEqual([]);
  });

  it("returns [] for empty object", () => {
    expect(extractCardsFromMetadata({})).toEqual([]);
  });

  it("returns [] when cards is not an array", () => {
    expect(extractCardsFromMetadata({ cards: "nope" })).toEqual([]);
    expect(extractCardsFromMetadata({ cards: 42 })).toEqual([]);
  });

  it("returns valid cards", () => {
    const out = extractCardsFromMetadata({
      cards: [
        { kind: "task", data: { id: "t1", title: "Buy milk" } },
        { kind: "tracker", data: { kind: "entry", tracker_id: "x" } },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe("task");
    expect(out[1].kind).toBe("tracker");
  });

  it("filters out cards with unknown kind", () => {
    const out = extractCardsFromMetadata({
      cards: [
        { kind: "task", data: { id: "t1" } },
        { kind: "bogus", data: { id: "x" } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("task");
  });

  it("filters out malformed entries", () => {
    const out = extractCardsFromMetadata({
      cards: [
        { kind: "task", data: { id: "t1" } },
        null,
        "string",
        { kind: "task" }, // no data
        { data: { id: "x" } }, // no kind
        { kind: 42, data: { id: "x" } }, // kind not a string
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("task");
  });
});
