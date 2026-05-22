/**
 * Paralinguistic feature extractor — derives a coarse VoiceContext (energy,
 * pace, pitch variance, emotion bucket) from a raw PCM snapshot + transcript
 * of the user's just-finished turn.
 *
 * Runs server-side via /api/voice/features (client sends base64 PCM at EOT
 * commit). The math is intentionally cheap — no FFT, no model — because we
 * only need a bucketed signal good enough for the LLM to adapt tone. When
 * we later swap in a real prosody model, this file is the one place to
 * change.
 *
 * `VoiceContext` is the SINGLE SOURCE OF TRUTH for the paralinguistic shape
 * and lives in `src/lib/ai/engine/voice-persona.ts` (Phase 3). We re-export
 * here so callers in the voice subsystem don't need to know about the
 * engine, and so the two stay in lockstep.
 */

export type { VoiceContext } from "@/lib/ai/engine/voice-persona";
import type { VoiceContext } from "@/lib/ai/engine/voice-persona";

const SAMPLE_RATE = 16000;

export function extractFeaturesSync(
  pcm: Float32Array,
  transcript: string,
): VoiceContext {
  const durationSec = pcm.length / SAMPLE_RATE;
  const energy = computeNormalizedEnergy(pcm);
  const pitchVar = computePitchVariance(pcm);
  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const pace = durationSec > 0.3 ? Math.round((words / durationSec) * 60) : 0;

  let emotion: VoiceContext["emotion"] = "calm";
  if (words === 0 && energy < 0.05) emotion = "calm";
  else if (energy > 0.5 && pace > 160) emotion = "excited";
  else if (energy < 0.15 && pace < 110 && pitchVar < 0.3) emotion = "tired";
  else if (energy > 0.4 && pitchVar > 0.5) emotion = "tense";
  else if (energy < 0.2 && pitchVar < 0.25) emotion = "sad";
  else emotion = "casual";

  return {
    energy: round2(energy),
    pace_wpm: pace,
    pitch_variance: round2(pitchVar),
    emotion,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeNormalizedEnergy(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  const rms = Math.sqrt(sum / pcm.length);
  // Map RMS [0, 0.4] → [0, 1] roughly. Speech RMS in our 16-bit-normalized
  // float stream lands ~0.05-0.3 in practice, so 0.4 gives headroom.
  return Math.max(0, Math.min(1, rms / 0.4));
}

function computePitchVariance(pcm: Float32Array): number {
  // Zero-crossing-rate-based proxy for pitch variance (cheap, no FFT).
  // ZCR per 50ms window roughly tracks fundamental frequency; the variance
  // across windows correlates with intonational expressiveness.
  if (pcm.length < 1024) return 0;
  const windowSize = Math.floor(SAMPLE_RATE * 0.05); // 50ms
  const zcrs: number[] = [];
  for (let i = 0; i < pcm.length; i += windowSize) {
    let zc = 0;
    const end = Math.min(i + windowSize, pcm.length);
    for (let j = i + 1; j < end; j++) {
      if ((pcm[j - 1] >= 0) !== (pcm[j] >= 0)) zc++;
    }
    zcrs.push(zc / windowSize);
  }
  if (zcrs.length < 2) return 0;
  const mean = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
  const variance =
    zcrs.reduce((a, b) => a + (b - mean) ** 2, 0) / zcrs.length;
  return Math.max(0, Math.min(1, Math.sqrt(variance) * 10));
}
