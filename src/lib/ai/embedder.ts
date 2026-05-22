export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_MODEL = "text-embedding-3-small";
const ENDPOINT = "https://api.openai.com/v1/embeddings";

export function createEmbedder(): Embedder {
  return {
    async embed(texts) {
      if (texts.length === 0) return [];
      const apiKey = process.env.OPENAI_EMBEDDING_API_KEY;
      if (!apiKey) throw new Error("OPENAI_EMBEDDING_API_KEY is not set");
      const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`embedder ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
      // Defensive: order by index — OpenAI usually returns sorted, but don't rely on it.
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    },
  };
}
