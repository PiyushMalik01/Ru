"use client";

// ---------------------------------------------------------------------------
// Local VAD
// ---------------------------------------------------------------------------
// Cheap RMS-based voice activity detector running on the same MediaStream
// that Flux consumes. We use it as the SECOND signal in dual-signal barge-in:
// Flux's server-side speech_started fires on a network round-trip, so we'd
// rather have a local signal that says "the mic actually picked up energy
// while Ru is speaking" — gating barge-in on (Flux OR local-VAD) cuts the
// false-negative rate.
//
// Hysteresis prevents the "on/off/on" flapping you get from raw thresholding
// near the cutoff. Once we cross `threshold` upward we stay active until we
// fall below `threshold - hysteresis`. Debounce ensures the onset is a real
// utterance, not a tabletop tap.
// ---------------------------------------------------------------------------

export function computeRMS(buf: Float32Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export function isSpeech(
  rms: number,
  state: { lastState: boolean; threshold: number; hysteresis: number },
): boolean {
  if (state.lastState) return rms > state.threshold - state.hysteresis;
  return rms > state.threshold;
}

export interface LocalVADHandle {
  stop: () => void;
}

const DEFAULT_THRESHOLD = 0.04;
const DEFAULT_HYSTERESIS = 0.01;
const DEBOUNCE_MS = 80;

export function startLocalVAD(
  stream: MediaStream,
  onSpeech: () => void,
  opts?: { threshold?: number; hysteresis?: number },
): LocalVADHandle {
  const AudioContextClass: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AudioContextClass();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const hysteresis = opts?.hysteresis ?? DEFAULT_HYSTERESIS;
  const buf = new Float32Array(analyser.fftSize);
  let lastState = false;
  let speechStart = 0;
  let raf = 0;
  let alive = true;

  const tick = () => {
    if (!alive) return;
    analyser.getFloatTimeDomainData(buf);
    const rms = computeRMS(buf);
    const now = performance.now();
    const speaking = isSpeech(rms, { lastState, threshold, hysteresis });
    if (speaking) {
      if (!lastState) {
        lastState = true;
        speechStart = now;
      } else if (now - speechStart >= DEBOUNCE_MS) {
        // Fire once per speech onset; caller is responsible for not
        // over-handling repeats.
        onSpeech();
        lastState = true;
        speechStart = Number.POSITIVE_INFINITY; // suppress repeat fires
      }
    } else {
      lastState = false;
      speechStart = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
      try {
        analyser.disconnect();
        source.disconnect();
        ctx.close();
      } catch {}
    },
  };
}
