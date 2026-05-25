"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  useChatStore,
  isTTSPlaying,
  setTTSSpeed,
  speakImmediate,
  getTTSHandleForSpeculative,
} from "@/lib/stores/chat-store";
import { getFillerFor } from "@/lib/voice/tool-filler";
import type { VoiceContext } from "@/lib/ai/engine/voice-persona";
import {
  startSpeculativeReply,
  type SpeculativeController,
} from "@/lib/voice/speculative-reply";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { startFlux, type FluxHandle } from "@/lib/voice/flux";
import { startLocalVAD, type LocalVADHandle } from "@/lib/voice/local-vad";
import {
  createEOTConfirmer,
  type EOTConfirmer,
} from "@/lib/voice/eot-confirmer";
import {
  createVoiceMachine,
  type VoicePhase,
} from "@/lib/voice/state-machine";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  VoiceDebugPanel,
  type VoiceDebugSignals,
} from "./voice-debug-panel";

import { isLikelyScattered } from "@/lib/voice/transcript-sanity";

// Phrases the user can say to end the conversation. Match case-insensitively
// on the full final transcript, after light normalization.
const STOP_PHRASES = [
  "that's it",
  "thats it",
  "i'm done",
  "im done",
  "we're done",
  "were done",
  "stop talking",
  "stop ru",
  "bye ru",
  "goodbye ru",
];

function isStopPhrase(text: string): boolean {
  const t = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  if (STOP_PHRASES.some((p) => t === p || t.endsWith(" " + p))) return true;
  if (t === "stop" || t === "done" || t === "exit") return true;
  return false;
}

/**
 * Full-duplex voice conversation, FSM-driven.
 *
 * Phase 2 rewrite: instead of inferring phase from a fan-out of chat-store
 * status + isTTSPlaying() + mic-buffer state (which produced "stuck
 * thinking" when any signal got desynced), we own a single explicit FSM
 * (`createVoiceMachine`) and feed it events from Flux, the chat store,
 * and the local VAD. Watchdog timers in the FSM guarantee we recover from
 * any wedged phase within at most ~15s.
 *
 * Dual-signal barge-in: we run local VAD on the SAME MediaStream Flux is
 * consuming (exposed via `FluxHandle.stream`). When TTS is playing, either
 * Flux's server-side `speech_started` OR the local VAD's onset can trigger
 * a barge-in. Local VAD is faster (no network) and harder to lose.
 */
export function VoiceConversation({ onClose }: { onClose: () => void }) {
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);
  const insertPersistedTurn = useChatStore((s) => s.insertPersistedTurn);

  const setRuExpression = useRuCompanion((s) => s.setExpression);
  const ruClear = useRuCompanion((s) => s.clear);

  const [transcript, setTranscript] = useState("");
  const [notHeard, setNotHeard] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("warming");
  const [debugSignals, setDebugSignals] = useState<VoiceDebugSignals>({
    phase: "warming",
    lastEotConfidence: null,
    lastEagerEotConfidence: null,
    lastVoiceContext: null,
    latencyMarkers: {},
    sockets: { flux: false, aura: false },
  });

  const fluxRef = useRef<FluxHandle | null>(null);
  const vadRef = useRef<LocalVADHandle | null>(null);
  const machineRef = useRef<ReturnType<typeof createVoiceMachine> | null>(null);
  const confirmerRef = useRef<EOTConfirmer | null>(null);
  const vadTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speculativeRef = useRef<SpeculativeController | null>(null);
  const finalBufRef = useRef("");
  const stoppingRef = useRef(false);
  // Last filler spoken — passed back into getFillerFor so the same phrase
  // doesn't repeat back-to-back when the same tool fires twice.
  const lastFillerRef = useRef<string | undefined>(undefined);
  // Last tool-call tick we acted on. The chat-store bumps a monotonic tick
  // on every tool_call SSE event so we re-fire when the same tool runs
  // twice in a row (zustand wouldn't otherwise re-notify on equal name).
  const lastToolTickRef = useRef(0);

  // ---------------------------------------------------------------------
  // Predictive opening — Surpass #3. Fire the /api/voice/opening fetch in
  // parallel with mic permission so the greeting can speak the instant
  // the TTS handle is warm. Best-effort: if the fetch fails, we just open
  // in silence and the user starts the conversation. We DON'T want to
  // block mic boot on this — a slow opening fetch must not delay
  // listening. `speakImmediate` lazily warms the TTS handle if it isn't
  // already up.
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/voice/opening", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { greeting?: string; confidence?: number };
        if (cancelled || stoppingRef.current) return;
        if (typeof data.greeting === "string" && data.greeting.trim()) {
          await speakImmediate(data.greeting, { format: "plain" });
        }
      } catch (e) {
        // Network blip / route 500 — silent fail. Voice still works.
        console.debug("voice opening fetch skipped", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------
  // Mount: wire the FSM, boot Flux + local VAD. Empty deps — we never want
  // to remount because some upstream ref changed.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const m = createVoiceMachine();
    machineRef.current = m;
    m.onPhaseChange((p) => {
      setPhase(p);
      setDebugSignals((s) => ({ ...s, phase: p }));
      if (p === "listening") setRuExpression("happy");
      else if (p === "thinking") setRuExpression("thinking");
      else if (p === "tts_speaking" || p === "tool_filling")
        setRuExpression("happy");
    });
    m.onWatchdog((stuck) => {
      console.warn("[voice] watchdog fired in phase", stuck);
    });

    // Smart EOT confirmer — composite gate over (Flux EOT confidence + local
    // VAD sustained silence + no recent TurnResumed). Replaces the previous
    // naked `if (e.confidence >= 0.7) commit()` check, which would fire
    // while the user was still speaking on borderline confidences.
    const confirmer = createEOTConfirmer();
    confirmerRef.current = confirmer;
    confirmer.onConfirmed((turn) => {
      if (stoppingRef.current) return;
      setDebugSignals((s) => ({
        ...s,
        lastEotConfidence: turn.confidence,
        latencyMarkers: {
          ...s.latencyMarkers,
          eotConfirmMs: turn.confirmationLatencyMs,
        },
      }));
      void commitConfirmed(turn.text);
    });
    confirmer.onTurnResumed(() => {
      // User came back after Flux fired EOT — cancel any in-flight
      // speculative LLM call and discard its buffered TTS. The smart EOT
      // confirmer already cleared its pending EOT; we just have to drop
      // the speculative session.
      if (speculativeRef.current) {
        speculativeRef.current.cancel();
        speculativeRef.current = null;
      }
    });

    // Tick the confirmer with VAD silence reading every 50ms. The reading
    // is cheap (no audio analysis here — just a wall-clock delta against
    // the last "speaking" frame). Without this the confirmer would only
    // see VAD updates on speech transitions and could miss the silence
    // threshold crossing in between.
    vadTickerRef.current = setInterval(() => {
      const vad = vadRef.current;
      const c = confirmerRef.current;
      if (!vad || !c) return;
      c.push({ type: "vad_silence_ms", ms: vad.silenceMs() });
    }, 50);

    void boot();

    return () => {
      stoppingRef.current = true;
      if (vadTickerRef.current) clearInterval(vadTickerRef.current);
      vadTickerRef.current = null;
      confirmerRef.current?.dispose();
      confirmerRef.current = null;
      if (speculativeRef.current) {
        speculativeRef.current.cancel();
        speculativeRef.current = null;
      }
      tearDownInputs();
      m.dispose();
      ruClear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Cross-wire chat-store → FSM. The chat store goes idle when the brain
  // has finished streaming AND audio has drained. If we're still in
  // tts_speaking and the audio is no longer playing, transition to
  // cooldown. If we're stuck in thinking and the stream errored
  // (status === "idle" without ever firing `first_audio`), push the
  // machine forward so we don't watchdog out.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    const cur = m.current();
    if (status === "idle" && cur === "thinking") {
      // Brain produced no audio — recover by skipping straight to cooldown
      // (which then auto-advances to listening).
      m.send({ type: "audio_done" });
    }
  }, [status]);

  // While `thinking === "speaking"` we know the LLM has begun emitting
  // text destined for TTS. The audio-player's `playing` flag goes true on
  // first frame — when both line up, fire `first_audio`.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (thinking !== "speaking") return;
    if (m.current() !== "thinking" && m.current() !== "tool_filling") return;
    if (isTTSPlaying()) m.send({ type: "first_audio" });
  }, [thinking]);

  // Tool-call lifecycle: thinking === "tooling" → tool_filling phase.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (thinking === "tooling" && m.current() === "thinking") {
      m.send({ type: "tool_call_detected" });
    } else if (thinking !== "tooling" && m.current() === "tool_filling") {
      m.send({ type: "tool_call_done" });
    }
  }, [thinking]);

  // Tool-fill speech — Surpass #1. Whenever the SSE parser bumps the
  // `lastToolCall` signal, speak a tool-appropriate filler so there's no
  // dead air while the tool runs. ALSO handles `end_voice_session` —
  // Surpass #5 — by waiting for Ru's goodbye to finish playing, then
  // closing the voice loop.
  //
  // We subscribe to the store imperatively (not via the selector) so we
  // can dedupe by tick — Zustand selectors can't easily tell us "this is
  // a fresh event" when name + tool stay the same back-to-back. Plain-
  // format fillers because they're short canned phrases; the prosody
  // parser still translates any embedded [pause:Nms] tags into SSML
  // <break/> on the way to Aura.
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const tc = state.lastToolCall;
      if (!tc) return;
      if (tc.tick === lastToolTickRef.current) return;
      lastToolTickRef.current = tc.tick;
      if (stoppingRef.current) return;

      // Semantic stop. The LLM emits a brief goodbye in the same turn
      // (per the tool description) — let that play out, then close. Hard
      // cap at 4s so we never strand the user in a half-open voice loop
      // if Ru forgot to include the goodbye or it never reaches Aura.
      if (tc.name === "end_voice_session") {
        const start = Date.now();
        const id = setInterval(() => {
          if (stoppingRef.current) {
            clearInterval(id);
            return;
          }
          // Wait until BOTH the audio has drained AND the chat stream is
          // idle — otherwise we'd close while text is still arriving.
          const stillSpeaking = isTTSPlaying();
          const stillStreaming = useChatStore.getState().status === "streaming";
          if ((!stillSpeaking && !stillStreaming) || Date.now() - start > 4000) {
            clearInterval(id);
            handleClose();
          }
        }, 100);
        return;
      }

      // Don't fill if Ru is already speaking — barge-in on her own filler
      // would be unpleasant. The fill is most useful in the gap between
      // tool_call_detected and the first text delta from the brain.
      if (isTTSPlaying()) return;
      const filler = getFillerFor(tc.name, {
        previousFiller: lastFillerRef.current,
      });
      lastFillerRef.current = filler;
      void speakImmediate(filler, { format: "plain" });
    });
    return () => unsub();
    // handleClose is stable (defined inside the component but only reads
    // refs + calls the parent onClose), so safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll TTS playback while in tts_speaking — fire `first_audio` when
  // audio actually starts (in case the `thinking` watcher above missed
  // the race), and `audio_done` when both playback and stream are done.
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (m.current() !== "tts_speaking" && m.current() !== "thinking" && m.current() !== "tool_filling") return;
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      const cur = m.current();
      if (
        (cur === "thinking" || cur === "tool_filling") &&
        isTTSPlaying()
      ) {
        m.send({ type: "first_audio" });
        return;
      }
      if (
        cur === "tts_speaking" &&
        !isTTSPlaying() &&
        useChatStore.getState().status === "idle"
      ) {
        m.send({ type: "audio_done" });
      }
    }, 80);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase]);

  // ---------------------------------------------------------------------
  // Reopen the mic when we land in `listening` (after cooldown).
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "listening") return;
    if (stoppingRef.current) return;
    if (fluxRef.current) return;
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function boot() {
    const m = machineRef.current;
    if (!m) return;
    if (stoppingRef.current) return;
    setTranscript("");
    finalBufRef.current = "";
    try {
      const flux = await startFlux({
        onEvent: (e) => {
          const mac = machineRef.current;
          if (!mac) return;
          if (stoppingRef.current) return;
          switch (e.type) {
            case "ready":
              mac.send({ type: "ready" });
              setDebugSignals((s) => ({
                ...s,
                sockets: { ...s.sockets, flux: true },
              }));
              // Start local VAD on the same captured stream — dual-signal
              // barge-in. The handle owns its own AudioContext so it's
              // safe to start/stop independently of Flux's processor.
              if (fluxRef.current) {
                vadRef.current = startLocalVAD(
                  fluxRef.current.stream,
                  () => onBargeIn(mac),
                );
              }
              return;
            case "interim":
              setTranscript((finalBufRef.current + " " + e.text).trim());
              return;
            case "final":
              // Flux's transcript is cumulative per turn — REPLACE,
              // don't append.
              finalBufRef.current = e.text.trim();
              setTranscript(finalBufRef.current);
              return;
            case "eot":
              setDebugSignals((s) => ({
                ...s,
                lastEotConfidence: e.confidence,
              }));
              // Hand off to the confirmer — the composite gate decides
              // whether we actually commit. Use finalBufRef as the
              // authoritative transcript because Flux emits `final` just
              // before `eot` and the `eot` message itself doesn't carry
              // text in the SDK shape.
              confirmerRef.current?.push({
                type: "flux_eot",
                confidence: e.confidence,
                text: finalBufRef.current,
              });
              return;
            case "eager_eot":
              setDebugSignals((s) => ({
                ...s,
                lastEagerEotConfidence: e.confidence,
              }));
              mac.send({
                type: "eager_eot_detected",
                text: e.text,
                confidence: e.confidence,
              });
              // Speculative kick-off — Phase 5. Only fire if confidence is
              // high enough to be useful (≥ 0.45 — Flux's threshold is
              // 0.3 but those are mostly noise) and there's a real chatId
              // (server requires it for speculative). One speculative at
              // a time: if already running, don't restart on subsequent
              // eager_eot events (which Flux can emit many of within a
              // single turn).
              if (
                e.confidence >= 0.45 &&
                e.text.trim().length > 0 &&
                !speculativeRef.current &&
                !stoppingRef.current
              ) {
                void startSpeculative(e.text);
              }
              return;
            case "turn_resumed":
              // User kept talking. Tell the confirmer to drop any pending
              // EOT — and the FSM the eager-EOT was cancelled.
              confirmerRef.current?.push({ type: "turn_resumed" });
              mac.send({ type: "eager_eot_cancelled" });
              return;
            case "speech_started":
              onBargeIn(mac);
              return;
            case "error":
              console.error("flux error", e.message);
              mac.send({ type: "fatal", reason: e.message });
              return;
          }
        },
      });
      fluxRef.current = flux;
    } catch (err) {
      console.error("voice boot failed", err);
      machineRef.current?.send({ type: "fatal", reason: String(err) });
    }
  }

  async function startSpeculative(text: string) {
    const chatId = useChatStore.getState().chatId;
    if (!chatId) return; // First turn of a new chat — no speculative.
    try {
      const tts = await getTTSHandleForSpeculative();
      const { controller } = startSpeculativeReply({
        text,
        chatId,
        voiceContext: null,
        pageContext: useChatStore.getState().pageContext,
        tts,
      });
      speculativeRef.current = controller;
    } catch (e) {
      console.error("speculative start failed", e);
    }
  }

  async function commitConfirmed(confirmedText: string) {
    const text = confirmedText.trim();
    finalBufRef.current = "";
    setTranscript("");
    if (!text) return;
    if (isStopPhrase(text)) {
      // Cancel any pending speculative — we're not going to play its reply.
      if (speculativeRef.current) {
        speculativeRef.current.cancel();
        speculativeRef.current = null;
      }
      handleClose();
      return;
    }

    // Sanity gate — drop scattered transcripts (background noise, single
    // short tokens, repetition) before they reach the LLM + TTS. Cancel
    // any speculative reply that was kicked off on eager_eot. Surface a
    // brief "didn't catch that" message so the user knows the turn was
    // dropped, then keep listening.
    const sanity = isLikelyScattered(text);
    if (!sanity.ok) {
      if (speculativeRef.current) {
        speculativeRef.current.cancel();
        speculativeRef.current = null;
      }
      setNotHeard(true);
      window.setTimeout(() => setNotHeard(false), 1800);
      return;
    }
    // Snapshot the last ~10s of mic PCM BEFORE tearing down Flux — the
    // ring buffer lives on the FluxHandle and disappears with stop().
    const pcm = fluxRef.current?.snapshotPCM();
    // Tear down the mic before sending — we don't want to listen to Ru
    // through her own playback path. The FSM will reopen the mic when we
    // land back in `listening` after cooldown.
    tearDownInputs();
    machineRef.current?.send({ type: "commit", text });

    // Speculative fast path — if there's an in-flight speculative LLM call
    // whose text is close enough to the confirmed text, commit it. This
    // skips the LLM call entirely on the hot path (the call started on
    // eager_eot ~300-500ms ago and is often already buffered).
    const speculative = speculativeRef.current;
    speculativeRef.current = null;
    if (speculative) {
      const result = await speculative.commit(text);
      if (result.usedSpeculative && result.userMessageId && result.assistantMessageId) {
        const chatId = useChatStore.getState().chatId;
        insertPersistedTurn({
          userMessageId: result.userMessageId,
          assistantMessageId: result.assistantMessageId,
          userText: text,
          assistantText: result.assistantText,
          chatId: chatId ?? "",
          voice: true,
        });
        // Paralinguistic extraction is fire-and-forget on the speculative
        // path — the LLM call already finished, so voiceContext can't
        // influence the prosody of THIS reply. We still record it for
        // QA + future-turn carry-over (V2).
        if (pcm && pcm.length > 0) {
          void fetchFeatures(pcm, text)
            .then((vc) => {
              if (vc) {
                setDebugSignals((s) => ({
                  ...s,
                  lastVoiceContext: vc as unknown as Record<string, unknown>,
                }));
              }
            })
            .catch(() => null);
        }
        return;
      }
      // Speculative was cancelled or texts diverged — fall through to a
      // regular sendText below.
    }

    // Paralinguistic side-channel. Fire-and-forget extraction: if the
    // network blips or the route errors we send chat normally without
    // voiceContext (fail-open — the LLM still has the words). When it
    // succeeds, voiceContext flows into /api/chat as a system prompt
    // block and pace_wpm mirrors back into Aura's speed.
    let voiceContext: VoiceContext | null = null;
    if (pcm && pcm.length > 0) {
      voiceContext = await fetchFeatures(pcm, text).catch(() => null);
    }
    if (voiceContext) {
      setDebugSignals((s) => ({
        ...s,
        lastVoiceContext: voiceContext as unknown as Record<string, unknown>,
      }));
      if (voiceContext.pace_wpm > 0) setTTSSpeed(voiceContext.pace_wpm);
    }
    void sendText(text, { voiceContext });
  }

  async function fetchFeatures(
    pcm: Float32Array,
    transcript: string,
  ): Promise<VoiceContext | null> {
    // Float32 [-1, 1] → Int16 little-endian → base64. Matches the format
    // /api/voice/features expects (16kHz mono linear16) and the format
    // Flux's ring buffer already stores upstream of the Int16→Float32
    // conversion in snapshotPCM().
    const int16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(int16.buffer);
    // btoa requires a binary string; build it in chunks to avoid call-stack
    // limits on long PCM (up to 320KB).
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
      );
    }
    const audioBase64 = btoa(bin);
    const res = await fetch("/api/voice/features", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioBase64, transcript }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VoiceContext;
  }

  function onBargeIn(m: ReturnType<typeof createVoiceMachine>) {
    const cur = m.current();
    if (cur === "tts_speaking" || cur === "tool_filling") {
      // Drop any in-flight speculative — user is overriding the current
      // reply with a new utterance.
      if (speculativeRef.current) {
        speculativeRef.current.cancel();
        speculativeRef.current = null;
      }
      abort();
      m.send({ type: "barge_in" });
    }
  }

  function tearDownInputs() {
    fluxRef.current?.stop();
    fluxRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
    setDebugSignals((s) => ({
      ...s,
      sockets: { ...s.sockets, flux: false },
    }));
  }

  function handleClose() {
    stoppingRef.current = true;
    tearDownInputs();
    abort();
    ruClear();
    machineRef.current?.send({ type: "close" });
    onClose();
  }

  const statusLabel: Record<VoicePhase, string> = {
    warming: "Warming up",
    listening: "Listening",
    thinking: "Thinking",
    tts_speaking: "Speaking",
    tool_filling: "Speaking",
    cooldown: "…",
    reconnecting: "Reconnecting",
    closing: "Closing",
    error: "Error",
  };

  const isSpeaking = phase === "tts_speaking" || phase === "tool_filling";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        {/* Live transcript while user is talking. */}
        <AnimatePresence>
          {transcript && !notHeard && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none max-w-[44ch] rounded-2xl border border-border bg-card/95 px-4 py-2 text-center text-[13px] italic leading-snug text-foreground shadow-md backdrop-blur-sm"
              style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
            >
              {transcript}
            </motion.div>
          )}
        </AnimatePresence>

        {/* "Didn't catch that" — sanity-drop feedback. Mounts briefly so the
            user knows their last utterance was dropped (background noise,
            single mumbled word, etc.) and they should repeat. */}
        <AnimatePresence>
          {notHeard && (
            <motion.div
              key="not-heard"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none rounded-full border border-border bg-card/95 px-3 py-1.5 text-center text-[11px] uppercase tracking-[0.16em] text-muted-foreground shadow-md backdrop-blur-sm"
              style={{ fontVariationSettings: "'wght' 620, 'wdth' 100" }}
            >
              didn&rsquo;t catch that — try again
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-elevated/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 pl-1 pr-1">
            <PhaseDot phase={phase} />
            <span className="min-w-[80px] font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {statusLabel[phase]}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              machineRef.current && onBargeIn(machineRef.current)
            }
            disabled={!isSpeaking}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-all",
              isSpeaking
                ? "bg-secondary text-foreground hover:bg-secondary/80"
                : "cursor-not-allowed text-muted-foreground/40",
            )}
            aria-label="Interrupt Ru"
          >
            Interrupt
          </button>

          <button
            type="button"
            onClick={handleClose}
            aria-label="End conversation"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Say &ldquo;that&rsquo;s it&rdquo; to end &middot; just start talking
          to interrupt
        </p>
      </div>
      <VoiceDebugPanel signals={debugSignals} />
    </div>
  );
}

function PhaseDot({ phase }: { phase: VoicePhase }) {
  const color =
    phase === "listening"
      ? "var(--entity-routine)"
      : phase === "tts_speaking"
        ? "var(--entity-task)"
        : phase === "tool_filling"
          ? "var(--entity-task)"
          : phase === "thinking"
            ? "var(--muted-foreground)"
            : phase === "warming"
              ? "var(--muted-foreground)"
              : phase === "reconnecting"
                ? "var(--amber, #b45309)"
                : "var(--muted-foreground)";
  const pulse =
    phase === "listening" ||
    phase === "thinking" ||
    phase === "warming" ||
    phase === "reconnecting";
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        pulse && "animate-pulse",
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
