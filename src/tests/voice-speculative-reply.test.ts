import { describe, it, expect } from "vitest";
import { textsAreCloseEnough } from "@/lib/voice/speculative-reply";

describe("textsAreCloseEnough", () => {
  it("exact match passes", () => {
    expect(textsAreCloseEnough("hello world", "hello world")).toBe(true);
  });

  it("case- and whitespace-insensitive", () => {
    expect(textsAreCloseEnough("Hello World", "  hello world  ")).toBe(true);
  });

  it("confirmed extends speculative — passes", () => {
    expect(
      textsAreCloseEnough("what's on my plate", "what's on my plate today"),
    ).toBe(true);
  });

  it("speculative extends confirmed — passes", () => {
    // Rare but possible if Flux over-extended on the eager EOT
    expect(textsAreCloseEnough("hello there friend", "hello there")).toBe(true);
  });

  it("80% token overlap passes", () => {
    // 4 of 5 speculative words appear in confirmed — close enough
    expect(
      textsAreCloseEnough(
        "remind me about laundry tomorrow",
        "tomorrow can you remind me about laundry",
      ),
    ).toBe(true);
  });

  it("different content fails", () => {
    expect(
      textsAreCloseEnough(
        "what's on my plate",
        "create a task for laundry",
      ),
    ).toBe(false);
  });

  it("empty strings fail", () => {
    expect(textsAreCloseEnough("", "hello")).toBe(false);
    expect(textsAreCloseEnough("hello", "")).toBe(false);
    // Both empty: also fail (no useful content to match)
    expect(textsAreCloseEnough("", "")).toBe(false);
  });

  it("substantially different — fails", () => {
    // Half the words don't overlap → < 80% threshold
    expect(
      textsAreCloseEnough(
        "what's on my schedule",
        "create a task to call mom",
      ),
    ).toBe(false);
  });
});
