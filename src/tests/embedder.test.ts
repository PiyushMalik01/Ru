import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEmbedder } from "@/lib/ai/embedder";

describe("embedder", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("embeds a batch and returns one vector per input", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 0 },
          { embedding: new Array(1536).fill(0.2), index: 1 },
        ],
      }),
    } as never);

    const embedder = createEmbedder();
    const result = await embedder.embed(["hello", "world"]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1536);
    expect(result[1][0]).toBeCloseTo(0.2);
  });

  it("throws when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const embedder = createEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it("returns an empty array for empty input without calling the API", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as never;
    const embedder = createEmbedder();
    const result = await embedder.embed([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a clear error when response is not JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    } as never);
    const embedder = createEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(/response was not JSON/);
  });
});
