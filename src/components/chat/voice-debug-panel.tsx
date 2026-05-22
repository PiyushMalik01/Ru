"use client";

import { useEffect, useState } from "react";
import type { VoicePhase } from "@/lib/voice/state-machine";

/**
 * Signals fed into the dev-only overlay so we can read voice-loop health
 * at a glance during manual QA: which phase we're in and how long we've
 * dwelled, last EOT confidence, last paralinguistic voiceContext, latency
 * markers (mic_open, first_audio, etc.), and which sockets are open.
 *
 * The orchestrator (voice-conversation.tsx) owns the state and feeds it
 * here on every change — this component is pure presentation.
 */
export interface VoiceDebugSignals {
  phase: VoicePhase;
  lastEotConfidence: number | null;
  lastEagerEotConfidence: number | null;
  lastVoiceContext: Record<string, unknown> | null;
  latencyMarkers: Record<string, number>;
  sockets: { flux: boolean; aura: boolean };
}

export function VoiceDebugPanel({ signals }: { signals: VoiceDebugSignals }) {
  const [dwell, setDwell] = useState(0);
  useEffect(() => {
    setDwell(0);
    const start = performance.now();
    const id = setInterval(
      () => setDwell(Math.round(performance.now() - start)),
      100,
    );
    return () => clearInterval(id);
  }, [signals.phase]);

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-50 max-w-xs rounded-lg border border-border bg-card/95 p-3 font-mono text-[10px] leading-tight text-foreground shadow-md backdrop-blur-sm"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="uppercase tracking-[0.18em] text-muted-foreground">
          voice
        </span>
        <span>
          {signals.phase} &middot; {dwell}ms
        </span>
      </div>
      <div className="space-y-0.5">
        <div>
          flux: {signals.sockets.flux ? "open" : "closed"} &middot; aura:{" "}
          {signals.sockets.aura ? "open" : "closed"}
        </div>
        {signals.lastEotConfidence !== null && (
          <div>eot.conf: {signals.lastEotConfidence.toFixed(2)}</div>
        )}
        {signals.lastEagerEotConfidence !== null && (
          <div>eager.conf: {signals.lastEagerEotConfidence.toFixed(2)}</div>
        )}
        {signals.lastVoiceContext && (
          <div>vctx: {JSON.stringify(signals.lastVoiceContext)}</div>
        )}
        {Object.entries(signals.latencyMarkers).map(([k, v]) => (
          <div key={k}>
            {k}: {v.toFixed(0)}ms
          </div>
        ))}
      </div>
    </div>
  );
}
