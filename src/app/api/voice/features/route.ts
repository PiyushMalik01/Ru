import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractFeaturesSync } from "@/lib/voice/paralinguistic";

export const dynamic = "force-dynamic";

/**
 * Paralinguistic feature extraction endpoint.
 *
 * Client snapshots the last ~10s of mic PCM at EOT commit, base64-encodes
 * it, and POSTs alongside the recognized transcript. Server runs the cheap
 * synchronous feature extractor and returns a VoiceContext that the client
 * threads into the chat request (`voiceContext` field on /api/chat).
 *
 * Audio format contract: 16kHz mono linear16 little-endian PCM, matching
 * what `startFlux` already captures and pushes upstream to Deepgram.
 */

const BodySchema = z.object({
  audioBase64: z.string().min(1),
  transcript: z.string().default(""),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  // base64 → Int16 → Float32 in [-1, 1]. We cap at 10s of audio (~320KB)
  // to bound CPU on the route — the client already enforces this via the
  // PCM ring buffer in flux.ts, but defense-in-depth.
  const buf = Buffer.from(parsed.data.audioBase64, "base64");
  const MAX_BYTES = 10 * 16000 * 2;
  if (buf.byteLength > MAX_BYTES) {
    return new Response("audio payload too large", { status: 413 });
  }
  const sampleCount = Math.floor(buf.byteLength / 2);
  const int16 = new Int16Array(buf.buffer, buf.byteOffset, sampleCount);
  const float = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;

  const features = extractFeaturesSync(float, parsed.data.transcript);
  return Response.json(features);
}
