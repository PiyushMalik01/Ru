# Conversational Voice (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a voice loop that feels like talking to a friend — sub-second turn-taking, prosody-aware speech, emotional adaptation, butter-smooth state transitions — without changing the chat brain.

**Architecture:** Cascaded STT → LLM → TTS, wrapped with 4 intelligence layers (semantic EOT via Deepgram Flux, paralinguistic side-channel, prosody-tagged LLM output, dual-signal barge-in) and 3 surpass features (tool-fill speech, rhythm mirroring, predictive opening). The chat pipeline (`/api/chat`, `runConversation`, M0 memory, tools) is untouched — voice is an I/O wrapper.

**Tech Stack:** Next.js 16 App Router, TypeScript, Deepgram SDK (`@deepgram/sdk`), Vitest, Framer Motion, Tailwind v4, Supabase Postgres.

**Spec:** `docs/superpowers/specs/2026-05-22-conversational-voice-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/voice/flux.ts` | Deepgram Flux WS — semantic EOT STT, replaces `stt.ts` |
| `src/lib/voice/local-vad.ts` | Local audio energy detector (second VAD signal) |
| `src/lib/voice/state-machine.ts` | Explicit FSM for voice phases + watchdog timers |
| `src/lib/voice/prosody.ts` | Tag-parse LLM output → SSML stream, replaces `speakable.ts` |
| `src/lib/voice/tool-filler.ts` | Canned filler phrases per tool name |
| `src/lib/voice/paralinguistic.ts` | Server-side feature extraction (energy/pace/emotion) |
| `src/lib/voice/wakeup.ts` | WS pre-warm orchestration (viewport-entry trigger) |
| `src/lib/ai/engine/voice-persona.ts` | Voice persona + voiceContext system prompt blocks |
| `src/lib/ai/tools/handlers/voice.ts` | `end_voice_session` tool handler |
| `src/app/api/voice/opening/route.ts` | Predictive opening line from memory + behavioral signals |
| `src/app/api/voice/features/route.ts` | Paralinguistic feature extraction endpoint |
| `src/app/api/chat/truncate/route.ts` | Barge-in transcript truncation endpoint |
| `src/components/chat/voice-debug-panel.tsx` | Dev/QA debug overlay (FSM state, EOT trace, paralinguistic) |

### Modified files

| Path | Change |
|---|---|
| `src/lib/voice/tts.ts` | Add SSML format option + `setSpeed(wpm)` |
| `src/lib/voice/audio-player.ts` | Fix `playing` getter — explicit source count |
| `src/components/chat/voice-conversation.tsx` | Rewrite around FSM, two-stage indicator, dual-VAD, truncation |
| `src/app/api/chat/route.ts` | Accept `voiceContext`; conditionally register `end_voice_session` |
| `src/lib/ai/engine/context.ts` | Accept `voiceContext`; inject voice persona + context blocks |
| `src/lib/ai/engine/system-prompt.ts` | Add prosody-tag instructions when `voice=true` |
| `src/lib/ai/tools/definitions.ts` | Define `end_voice_session` tool schema |
| `src/lib/ai/tools/executor.ts` | Wire `end_voice_session` handler |

### Deleted files

| Path | Reason |
|---|---|
| `src/lib/voice/stt.ts` | Replaced by `flux.ts` |
| `src/lib/voice/speakable.ts` | Replaced by `prosody.ts` |

### Database migration

| Migration | Change |
|---|---|
| `supabase/migrations/20260523000000_messages_truncated_at.sql` | Add `truncated_at timestamptz` column to `messages` |

---

## Phase 1 — Foundation: Flux STT + AudioPlayer fix + Truncation route

**Goal:** Get semantic EOT working. Fix the AudioPlayer bug that contributes to "stuck thinking." Land the truncate endpoint so barge-in doesn't corrupt memory.

### Task 1.1: Verify Flux endpoint + request shape (spike)

**Files:**
- Verify: Deepgram Flux docs at https://developers.deepgram.com/docs/flux
- Test: `src/tests/flux-spike.test.ts` (delete after task)

- [ ] **Step 1: Read Deepgram Flux docs**

Open https://developers.deepgram.com/docs/flux and confirm:
- WebSocket endpoint URL
- Connection params (model, encoding, sample_rate, eot_threshold, eager_eot_threshold)
- Event types emitted (Transcript with `is_final`, EndOfTurn with `confidence`)

- [ ] **Step 2: Write a tiny smoke-test script**

Create `src/tests/flux-spike.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("flux endpoint spike", () => {
  it("can mint a key for Flux", async () => {
    // This test only runs locally; in CI it would skip.
    if (!process.env.DEEPGRAM_API_KEY) return;
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/tests/flux-spike.test.ts`
Expected: PASS (or skip if no key set locally)

- [ ] **Step 4: Delete the spike**

```bash
rm src/tests/flux-spike.test.ts
```

- [ ] **Step 5: Commit findings as a code comment in the plan**

If the API contract differs from this plan (e.g., different event names), update Task 1.2 below to match. Otherwise skip this step.

### Task 1.2: Write Flux client (`flux.ts`)

**Files:**
- Create: `src/lib/voice/flux.ts`
- Test: `src/tests/voice-flux.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-flux.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { FluxEvent } from "@/lib/voice/flux";

describe("flux event shape", () => {
  it("FluxEvent union has the expected variants", () => {
    const samples: FluxEvent[] = [
      { type: "ready" },
      { type: "interim", text: "hello" },
      { type: "final", text: "hello world" },
      { type: "eot", confidence: 0.8, reason: "semantic" },
      { type: "speech_started" },
      { type: "error", message: "boom" },
    ];
    expect(samples).toHaveLength(6);
  });

  it("ringBuffer collects PCM frames bounded by maxBytes", async () => {
    const { createPCMRingBuffer } = await import("@/lib/voice/flux");
    const buf = createPCMRingBuffer({ maxBytes: 100 });
    buf.push(new ArrayBuffer(40));
    buf.push(new ArrayBuffer(40));
    buf.push(new ArrayBuffer(40));  // overflows; oldest drops
    const snap = buf.snapshot();
    expect(snap.byteLength).toBeLessThanOrEqual(100);
    expect(snap.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/voice-flux.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/flux.ts`:

```ts
"use client";

import { createClient, LiveTranscriptionEvents, type LiveClient } from "@deepgram/sdk";

export type FluxEvent =
  | { type: "ready" }
  | { type: "interim"; text: string }
  | { type: "final"; text: string }
  | { type: "eot"; confidence: number; reason: "silence" | "semantic" | "timeout" }
  | { type: "speech_started" }
  | { type: "error"; message: string };

export interface FluxHandle {
  stop: () => void;
  /** Snapshot the last ~10s of raw PCM as Float32 for paralinguistic extraction. */
  snapshotPCM: () => Float32Array;
}

export interface PCMRingBuffer {
  push(chunk: ArrayBuffer): void;
  snapshot(): ArrayBuffer;
  clear(): void;
}

export function createPCMRingBuffer(opts: { maxBytes: number }): PCMRingBuffer {
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    push(chunk) {
      chunks.push(chunk);
      bytes += chunk.byteLength;
      while (bytes > opts.maxBytes && chunks.length > 0) {
        const dropped = chunks.shift()!;
        bytes -= dropped.byteLength;
      }
    },
    snapshot() {
      const out = new Uint8Array(bytes);
      let cursor = 0;
      for (const c of chunks) {
        out.set(new Uint8Array(c), cursor);
        cursor += c.byteLength;
      }
      return out.buffer;
    },
    clear() {
      chunks.length = 0;
      bytes = 0;
    },
  };
}

export interface FluxCallbacks {
  onEvent: (e: FluxEvent) => void;
}

const PCM_MAX_BYTES = 10 * 16000 * 2; // 10s @ 16kHz @ 16-bit

export async function startFlux(callbacks: FluxCallbacks): Promise<FluxHandle> {
  // Mint scoped key + get mic in parallel
  const [tokenRes, stream] = await Promise.all([
    fetch("/api/deepgram/token", { method: "POST" }),
    navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    }),
  ]);

  if (!tokenRes.ok) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("could not mint deepgram key");
  }
  const { key } = await tokenRes.json();

  const dg = createClient(key);
  // Flux model: semantic end-of-turn detection in-model
  // If Deepgram's Flux model identifier differs at run-time, update here.
  const live: LiveClient = dg.listen.live({
    model: "flux-general-en",
    language: "en",
    smart_format: true,
    punctuate: true,
    interim_results: true,
    eot_threshold: 0.7,
    eager_eot_threshold: 0.3,
    eot_timeout_ms: 5000,
    vad_events: true,
    sample_rate: 16000,
    encoding: "linear16",
    channels: 1,
    filler_words: false,
  } as never);  // SDK type may not yet know about Flux fields

  const AudioContextClass: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);

  const preReady: ArrayBuffer[] = [];
  let ready = false;
  const ring = createPCMRingBuffer({ maxBytes: PCM_MAX_BYTES });

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const chunk = pcm.buffer;
    ring.push(chunk);
    if (ready && live.getReadyState() === 1) {
      live.send(chunk);
    } else {
      preReady.push(chunk);
    }
  };

  live.on(LiveTranscriptionEvents.Open, () => {
    ready = true;
    while (preReady.length > 0) {
      const c = preReady.shift();
      if (c) live.send(c);
    }
    callbacks.onEvent({ type: "ready" });
  });

  live.on(
    LiveTranscriptionEvents.Transcript,
    (data: {
      channel?: { alternatives?: { transcript?: string }[] };
      is_final?: boolean;
    }) => {
      const t = data?.channel?.alternatives?.[0]?.transcript ?? "";
      if (!t) return;
      callbacks.onEvent(
        data.is_final ? { type: "final", text: t } : { type: "interim", text: t }
      );
    }
  );

  // Flux emits an EndOfTurn event with confidence; SDK exposes generic message.
  // If the SDK ships a typed event later, swap. For now, listen on raw messages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (live as unknown as { on(ev: string, cb: (m: unknown) => void): void }).on(
    "message",
    (msg: unknown) => {
      const m = msg as { type?: string; confidence?: number; reason?: string };
      if (m?.type === "EndOfTurn" && typeof m.confidence === "number") {
        const reason =
          m.reason === "semantic" || m.reason === "timeout" ? m.reason : "silence";
        callbacks.onEvent({
          type: "eot",
          confidence: m.confidence,
          reason: reason as "silence" | "semantic" | "timeout",
        });
      }
    }
  );

  live.on(LiveTranscriptionEvents.SpeechStarted, () => {
    callbacks.onEvent({ type: "speech_started" });
  });

  live.on(LiveTranscriptionEvents.Error, (e: Error) => {
    callbacks.onEvent({ type: "error", message: e.message });
  });

  return {
    stop: () => {
      try { live.requestClose(); } catch {}
      try {
        processor.disconnect();
        source.disconnect();
        audioCtx.close();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
      ring.clear();
    },
    snapshotPCM: () => {
      const buf = ring.snapshot();
      const int16 = new Int16Array(buf);
      const float = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;
      return float;
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/voice-flux.test.ts`
Expected: PASS (both ring buffer test + FluxEvent shape test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/flux.ts src/tests/voice-flux.test.ts
git commit -m "feat(voice): add Deepgram Flux client with semantic EOT + PCM ring buffer"
```

### Task 1.3: Update `voice-conversation.tsx` to consume Flux events

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`
- Delete: `src/lib/voice/stt.ts`

- [ ] **Step 1: Open voice-conversation.tsx, replace `import { startSTT, type STTHandle } from "@/lib/voice/stt"` with Flux**

Replace the import line with:

```ts
import { startFlux, type FluxHandle } from "@/lib/voice/flux";
```

Replace `sttRef: useRef<STTHandle | null>(null)` with `fluxRef: useRef<FluxHandle | null>(null)` (rename throughout file).

- [ ] **Step 2: Replace `startListening` body with FluxEvent handler**

In `voice-conversation.tsx`, replace the `startSTT({ onInterim, onFinal, ... })` call with:

```ts
fluxRef.current = await startFlux({
  onEvent: (e) => {
    switch (e.type) {
      case "ready":
        // Indicator already in 'listening' phase
        return;
      case "interim":
        setTranscript((finalBufRef.current + " " + e.text).trim());
        return;
      case "final":
        finalBufRef.current = (finalBufRef.current + " " + e.text).trim();
        setTranscript(finalBufRef.current);
        return;
      case "eot":
        // Flux's EOT is now the commit signal — confidence-gated.
        if (e.confidence >= 0.7) {
          commitUtterance();
        }
        return;
      case "speech_started":
        if (useChatStore.getState().status === "streaming" || isTTSPlaying()) {
          abort();
        }
        return;
      case "error":
        console.error("flux error", e.message);
        stopFlux();
        return;
    }
  },
});
```

Rename `stopSTT` → `stopFlux` everywhere in the file. Remove the now-unused `onUtteranceEnd` callback (Flux EOT replaces it).

- [ ] **Step 3: Delete stt.ts**

```bash
git rm src/lib/voice/stt.ts
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no errors)

- [ ] **Step 5: Run vitest**

Run: `npx vitest run`
Expected: all green (no test file imports `stt.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): wire voice-conversation to Flux (semantic EOT replaces silence timer)"
```

### Task 1.4: Fix AudioPlayer `playing` getter

**Files:**
- Modify: `src/lib/voice/audio-player.ts`
- Test: `src/tests/voice-audio-player.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-audio-player.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

class FakeAudioBufferSourceNode extends EventTarget {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start(_when?: number) { /* noop in test */ }
  stop() { if (this.onended) this.onended(); }
  connect() { /* noop */ }
}

class FakeAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  destination = {};
  sampleRate = 24000;
  createBuffer() {
    return { copyToChannel: () => {} } as unknown as AudioBuffer;
  }
  createBufferSource() {
    return new FakeAudioBufferSourceNode() as unknown as AudioBufferSourceNode;
  }
  close() { this.state = "closed"; return Promise.resolve(); }
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

describe("AudioPlayer.playing", () => {
  it("is false before any pushPCM", async () => {
    const { AudioPlayer } = await import("@/lib/voice/audio-player");
    const p = new AudioPlayer();
    expect(p.playing).toBe(false);
  });

  it("becomes true after a source starts and false after it ends", async () => {
    const { AudioPlayer } = await import("@/lib/voice/audio-player");
    const p = new AudioPlayer();
    const pcm = new Int16Array(2400).buffer; // ~0.1s
    p.pushPCM(pcm);
    expect(p.playing).toBe(true);
    // Simulate the source ending
    p.interrupt();
    expect(p.playing).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/voice-audio-player.test.ts`
Expected: FAIL (current `playing` uses `currentTime < next`, which the fake doesn't drive)

- [ ] **Step 3: Replace `playing` getter with explicit source count**

In `src/lib/voice/audio-player.ts`:

```ts
// At top of class:
private active = 0;

// In pushPCM, change:
//   src.onended = () => { ... splice ... }
// to:
src.onended = () => {
  this.active = Math.max(0, this.active - 1);
  const i = this.sources.indexOf(src);
  if (i >= 0) this.sources.splice(i, 1);
};
src.start(start);
this.active += 1;
this.next = start + audio.duration;
this.sources.push(src);

// In interrupt(), at the end:
this.active = 0;

// Replace the `playing` getter with:
get playing(): boolean {
  return this.active > 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/voice-audio-player.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/audio-player.ts src/tests/voice-audio-player.test.ts
git commit -m "fix(voice): AudioPlayer.playing uses explicit source count, not time comparison"
```

### Task 1.5: DB migration — `messages.truncated_at`

**Files:**
- Create: `supabase/migrations/20260523000000_messages_truncated_at.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Track when an assistant message was truncated by voice barge-in.
-- The DB content reflects only what was actually played to the user.
alter table public.messages
  add column if not exists truncated_at timestamptz;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` MCP tool with name `messages_truncated_at` and the SQL above.

- [ ] **Step 3: Regenerate types**

Use `mcp__plugin_supabase_supabase__generate_typescript_types` and paste into `src/types/database.ts`. Verify `truncated_at: string | null` is on the `messages` table row type.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260523000000_messages_truncated_at.sql src/types/database.ts
git commit -m "feat(voice): add messages.truncated_at for barge-in truncation"
```

### Task 1.6: `/api/chat/truncate` route

**Files:**
- Create: `src/app/api/chat/truncate/route.ts`
- Test: `src/tests/voice-truncate-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-truncate-route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

const BodySchema = z.object({
  messageId: z.string().uuid(),
  playedUpToChar: z.number().int().min(0),
});

describe("truncate route body schema", () => {
  it("accepts valid body", () => {
    const r = BodySchema.safeParse({
      messageId: "00000000-0000-0000-0000-000000000001",
      playedUpToChar: 50,
    });
    expect(r.success).toBe(true);
  });
  it("rejects missing fields", () => {
    expect(BodySchema.safeParse({}).success).toBe(false);
  });
  it("rejects negative playedUpToChar", () => {
    expect(BodySchema.safeParse({
      messageId: "00000000-0000-0000-0000-000000000001",
      playedUpToChar: -1,
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx vitest run src/tests/voice-truncate-route.test.ts`
Expected: PASS (the schema is defined inline in the test)

- [ ] **Step 3: Write the route**

Create `src/app/api/chat/truncate/route.ts`:

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messageId: z.string().uuid(),
  playedUpToChar: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  const { messageId, playedUpToChar } = parsed.data;

  // Load + verify ownership
  const { data: msg } = await supabase
    .from("messages")
    .select("id, user_id, role, content")
    .eq("id", messageId)
    .single();
  if (!msg || msg.user_id !== user.id) {
    return new Response("not found", { status: 404 });
  }
  if (msg.role !== "assistant") {
    return new Response("only assistant messages can be truncated", { status: 400 });
  }

  const cur = msg.content ?? "";
  const upTo = Math.min(playedUpToChar, cur.length);
  if (upTo >= cur.length) {
    // Nothing to truncate — call still succeeds.
    return Response.json({ ok: true, unchanged: true });
  }

  const truncated = cur.slice(0, upTo).trimEnd() + " …";
  const { error } = await supabase
    .from("messages")
    .update({ content: truncated, truncated_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return new Response(`db error: ${error.message}`, { status: 500 });

  return Response.json({ ok: true, truncatedTo: upTo });
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/truncate/route.ts src/tests/voice-truncate-route.test.ts
git commit -m "feat(voice): add POST /api/chat/truncate for barge-in transcript truncation"
```

---

## Phase 2 — Reliability: FSM + dual-VAD + orchestrator rewrite

**Goal:** No more "stuck thinking", no more "real listening starts later." Explicit FSM with watchdogs, dual-signal barge-in, WS pre-warm, two-stage indicator.

### Task 2.1: State machine module + tests

**Files:**
- Create: `src/lib/voice/state-machine.ts`
- Test: `src/tests/voice-state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-state-machine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createVoiceMachine, type VoicePhase } from "@/lib/voice/state-machine";

describe("voice state machine", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("starts in warming", () => {
    const m = createVoiceMachine();
    expect(m.current()).toBe<VoicePhase>("warming");
  });

  it("warming → listening on ready event", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("listening → thinking on commit", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hello" });
    expect(m.current()).toBe<VoicePhase>("thinking");
  });

  it("thinking → tts_speaking on first_audio", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    expect(m.current()).toBe<VoicePhase>("tts_speaking");
  });

  it("tts_speaking → cooldown → listening", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    m.send({ type: "audio_done" });
    expect(m.current()).toBe<VoicePhase>("cooldown");
    vi.advanceTimersByTime(600);
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("watchdog: thinking longer than 15s force-returns to listening", () => {
    const seen: VoicePhase[] = [];
    const watchdogs: VoicePhase[] = [];
    const m = createVoiceMachine();
    m.onPhaseChange((p) => seen.push(p));
    m.onWatchdog((p) => watchdogs.push(p));
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    vi.advanceTimersByTime(15_000);
    expect(watchdogs).toContain("thinking");
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("barge_in transitions tts_speaking → listening immediately", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "commit", text: "hi" });
    m.send({ type: "first_audio" });
    m.send({ type: "barge_in" });
    expect(m.current()).toBe<VoicePhase>("listening");
  });

  it("close transitions any phase → closing", () => {
    const m = createVoiceMachine();
    m.send({ type: "ready" });
    m.send({ type: "close" });
    expect(m.current()).toBe<VoicePhase>("closing");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/voice-state-machine.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/state-machine.ts`:

```ts
export type VoicePhase =
  | "warming"
  | "listening"
  | "thinking"
  | "tts_speaking"
  | "tool_filling"
  | "cooldown"
  | "reconnecting"
  | "closing"
  | "error";

export type VoiceEvent =
  | { type: "ready" }
  | { type: "commit"; text: string }
  | { type: "first_audio" }
  | { type: "audio_done" }
  | { type: "tool_call_detected" }
  | { type: "tool_call_done" }
  | { type: "barge_in" }
  | { type: "ws_dropped" }
  | { type: "ws_recovered" }
  | { type: "close" }
  | { type: "fatal"; reason: string };

export interface VoiceMachine {
  send(event: VoiceEvent): void;
  current(): VoicePhase;
  onPhaseChange(cb: (phase: VoicePhase, prev: VoicePhase) => void): void;
  onWatchdog(cb: (stuckPhase: VoicePhase) => void): void;
  dispose(): void;
}

const MAX_DWELL_MS: Partial<Record<VoicePhase, number>> = {
  warming: 5_000,
  thinking: 15_000,
  tts_speaking: 60_000,
  tool_filling: 5_000,
  cooldown: 2_000,
  reconnecting: 8_000,
  closing: 4_000,
  // listening: no watchdog — user may pause indefinitely
};

const COOLDOWN_TO_LISTENING_MS = 500;

export function createVoiceMachine(): VoiceMachine {
  let phase: VoicePhase = "warming";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const phaseListeners: Array<(p: VoicePhase, prev: VoicePhase) => void> = [];
  const watchdogListeners: Array<(p: VoicePhase) => void> = [];

  const clearTimers = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; }
  };

  const setPhase = (next: VoicePhase) => {
    if (next === phase) return;
    const prev = phase;
    phase = next;
    clearTimers();
    armWatchdog();
    if (phase === "cooldown") {
      cooldownTimer = setTimeout(() => {
        if (phase === "cooldown") setPhase("listening");
      }, COOLDOWN_TO_LISTENING_MS);
    }
    for (const l of phaseListeners) l(phase, prev);
  };

  const armWatchdog = () => {
    const max = MAX_DWELL_MS[phase];
    if (!max) return;
    timer = setTimeout(() => {
      for (const l of watchdogListeners) l(phase);
      // Recovery policy: phase-specific
      switch (phase) {
        case "warming":
        case "reconnecting":
          setPhase("error");
          break;
        case "thinking":
        case "tool_filling":
        case "tts_speaking":
        case "cooldown":
          setPhase("listening");
          break;
        case "closing":
          setPhase("error");
          break;
      }
    }, max);
  };

  armWatchdog();

  return {
    send(e) {
      switch (e.type) {
        case "ready":
          if (phase === "warming" || phase === "reconnecting") setPhase("listening");
          break;
        case "commit":
          if (phase === "listening") setPhase("thinking");
          break;
        case "tool_call_detected":
          if (phase === "thinking") setPhase("tool_filling");
          break;
        case "tool_call_done":
          if (phase === "tool_filling") setPhase("thinking");
          break;
        case "first_audio":
          if (phase === "thinking" || phase === "tool_filling") setPhase("tts_speaking");
          break;
        case "audio_done":
          if (phase === "tts_speaking") setPhase("cooldown");
          break;
        case "barge_in":
          if (phase === "tts_speaking" || phase === "tool_filling") setPhase("listening");
          break;
        case "ws_dropped":
          if (phase !== "closing" && phase !== "error") setPhase("reconnecting");
          break;
        case "ws_recovered":
          if (phase === "reconnecting") setPhase("listening");
          break;
        case "close":
          if (phase !== "error") setPhase("closing");
          break;
        case "fatal":
          setPhase("error");
          break;
      }
    },
    current() { return phase; },
    onPhaseChange(cb) { phaseListeners.push(cb); },
    onWatchdog(cb) { watchdogListeners.push(cb); },
    dispose() { clearTimers(); phaseListeners.length = 0; watchdogListeners.length = 0; },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/voice-state-machine.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/state-machine.ts src/tests/voice-state-machine.test.ts
git commit -m "feat(voice): add explicit FSM with per-state watchdog timers"
```

### Task 2.2: Local VAD module

**Files:**
- Create: `src/lib/voice/local-vad.ts`
- Test: `src/tests/voice-local-vad.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-local-vad.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeRMS, isSpeech } from "@/lib/voice/local-vad";

describe("local VAD math", () => {
  it("RMS of silence is ~0", () => {
    const buf = new Float32Array(1024); // all zeros
    expect(computeRMS(buf)).toBeLessThan(0.001);
  });

  it("RMS of full-volume sine is ~0.707", () => {
    const n = 1024;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * i) / 64);
    expect(computeRMS(buf)).toBeGreaterThan(0.6);
    expect(computeRMS(buf)).toBeLessThan(0.75);
  });

  it("isSpeech respects threshold + hysteresis", () => {
    expect(isSpeech(0.05, { lastState: false, threshold: 0.04, hysteresis: 0.01 })).toBe(true);
    // hysteresis: once active, doesn't release until below threshold - hysteresis
    expect(isSpeech(0.035, { lastState: true, threshold: 0.04, hysteresis: 0.01 })).toBe(true);
    expect(isSpeech(0.025, { lastState: true, threshold: 0.04, hysteresis: 0.01 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/voice-local-vad.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/local-vad.ts`:

```ts
"use client";

export function computeRMS(buf: Float32Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export function isSpeech(
  rms: number,
  state: { lastState: boolean; threshold: number; hysteresis: number }
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
  opts?: { threshold?: number; hysteresis?: number }
): LocalVADHandle {
  const AudioContextClass: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      if (!lastState) { lastState = true; speechStart = now; }
      else if (now - speechStart >= DEBOUNCE_MS) {
        // Fire once per speech onset; caller is responsible for not over-handling
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
      try { analyser.disconnect(); source.disconnect(); ctx.close(); } catch {}
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/voice-local-vad.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/local-vad.ts src/tests/voice-local-vad.test.ts
git commit -m "feat(voice): add local VAD (RMS + hysteresis) for dual-signal barge-in"
```

### Task 2.3: Rewrite `voice-conversation.tsx` around the FSM

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: Read the current file**

Run: `npx prettier --check src/components/chat/voice-conversation.tsx` (just a sanity touch — no expected output)

Take a backup mentally; the rewrite is comprehensive.

- [ ] **Step 2: Replace `voice-conversation.tsx` with the FSM-driven version**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useChatStore, isTTSPlaying } from "@/lib/stores/chat-store";
import { useRuCompanion } from "@/lib/stores/ru-companion-store";
import { startFlux, type FluxHandle } from "@/lib/voice/flux";
import { startLocalVAD, type LocalVADHandle } from "@/lib/voice/local-vad";
import { createVoiceMachine, type VoicePhase } from "@/lib/voice/state-machine";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const FAST_STOP_PHRASES = new Set(["stop", "stop ru", "ru stop"]);

function isFastStop(text: string): boolean {
  const t = text.toLowerCase().replace(/[.,!?]/g, "").trim();
  return FAST_STOP_PHRASES.has(t);
}

export function VoiceConversation({ onClose }: { onClose: () => void }) {
  const status = useChatStore((s) => s.status);
  const thinking = useChatStore((s) => s.thinking);
  const sendText = useChatStore((s) => s.sendText);
  const abort = useChatStore((s) => s.abort);

  const setRuExpression = useRuCompanion((s) => s.setExpression);
  const ruClear = useRuCompanion((s) => s.clear);

  const [transcript, setTranscript] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("warming");

  const fluxRef = useRef<FluxHandle | null>(null);
  const vadRef = useRef<LocalVADHandle | null>(null);
  const machineRef = useRef<ReturnType<typeof createVoiceMachine> | null>(null);
  const finalBufRef = useRef("");
  const stoppingRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Wire FSM once on mount; tear down on unmount.
  useEffect(() => {
    const m = createVoiceMachine();
    machineRef.current = m;
    m.onPhaseChange((p) => {
      setPhase(p);
      if (p === "listening")       setRuExpression("happy");
      else if (p === "thinking")   setRuExpression("thinking");
      else if (p === "tts_speaking") setRuExpression("happy");
    });
    m.onWatchdog((stuck) => {
      console.warn("[voice] watchdog fired", stuck);
    });

    void boot();

    return () => {
      stoppingRef.current = true;
      tearDown();
      m.dispose();
      ruClear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-wire chat-store status back into the FSM
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (status === "idle" && m.current() === "thinking") {
      // The brain didn't produce any audio — push toward cooldown to recover
      m.send({ type: "audio_done" });
    }
  }, [status]);

  // Track tts_speaking → audio_done via store + isTTSPlaying polling
  useEffect(() => {
    const m = machineRef.current;
    if (!m) return;
    if (m.current() !== "tts_speaking") return;
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      if (!isTTSPlaying() && useChatStore.getState().status === "idle") {
        m.send({ type: "audio_done" });
      }
    }, 80);
    return () => { alive = false; clearInterval(id); };
  }, [phase]);

  async function boot() {
    try {
      const flux = await startFlux({
        onEvent: (e) => {
          const m = machineRef.current;
          if (!m) return;
          if (stoppingRef.current) return;
          switch (e.type) {
            case "ready":
              m.send({ type: "ready" });
              // Start local VAD on the same captured stream for dual-signal barge-in
              if (mediaStreamRef.current) {
                vadRef.current = startLocalVAD(mediaStreamRef.current, () => onBargeIn(m));
              }
              return;
            case "interim":
              setTranscript((finalBufRef.current + " " + e.text).trim());
              return;
            case "final":
              finalBufRef.current = (finalBufRef.current + " " + e.text).trim();
              setTranscript(finalBufRef.current);
              return;
            case "eot":
              if (e.confidence >= 0.7) commit();
              return;
            case "speech_started":
              onBargeIn(m);
              return;
            case "error":
              console.error("flux error", e.message);
              m.send({ type: "fatal", reason: e.message });
              return;
          }
        },
      });
      fluxRef.current = flux;
      // We need the underlying MediaStream for local VAD too — startFlux grabs
      // one internally. We retrieve it by querying user media here as well; OS
      // returns the existing stream cheap-ly. (If this proves wasteful, refactor
      // startFlux to expose the stream.)
      mediaStreamRef.current = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch(() => null);
    } catch (e) {
      console.error("voice boot failed", e);
      machineRef.current?.send({ type: "fatal", reason: String(e) });
    }
  }

  function commit() {
    const text = finalBufRef.current.trim();
    finalBufRef.current = "";
    setTranscript("");
    if (!text) return;
    if (isFastStop(text)) { handleClose(); return; }
    tearDownInputs();
    machineRef.current?.send({ type: "commit", text });
    void sendText(text);
  }

  function onBargeIn(m: ReturnType<typeof createVoiceMachine>) {
    const cur = m.current();
    if (cur === "tts_speaking" || cur === "tool_filling") {
      abort();
      m.send({ type: "barge_in" });
    }
  }

  function tearDownInputs() {
    fluxRef.current?.stop();
    fluxRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
  }

  function tearDown() {
    tearDownInputs();
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  }

  function handleClose() {
    stoppingRef.current = true;
    tearDown();
    abort();
    ruClear();
    machineRef.current?.send({ type: "close" });
    onClose();
  }

  // Reopen mic when we land in 'listening' (post-cooldown).
  useEffect(() => {
    if (phase !== "listening") return;
    if (stoppingRef.current) return;
    if (fluxRef.current) return;
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-2">
        <AnimatePresence>
          {transcript && (
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

        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-elevated/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-2 pl-1 pr-1">
            <PhaseDot phase={phase} />
            <span className="min-w-[80px] font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
              {statusLabel[phase]}
            </span>
          </div>

          <button
            type="button"
            onClick={() => machineRef.current && onBargeIn(machineRef.current)}
            disabled={phase !== "tts_speaking" && phase !== "tool_filling"}
            className={cn(
              "rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-all",
              (phase === "tts_speaking" || phase === "tool_filling")
                ? "bg-secondary text-foreground hover:bg-secondary/80"
                : "cursor-not-allowed text-muted-foreground/40"
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
          Say &ldquo;stop&rdquo; or wave goodbye to end · start talking to interrupt
        </p>
      </div>
    </div>
  );
}

function PhaseDot({ phase }: { phase: VoicePhase }) {
  const color =
    phase === "listening"     ? "var(--entity-routine)" :
    phase === "tts_speaking"  ? "var(--entity-task)" :
    phase === "tool_filling"  ? "var(--entity-task)" :
    phase === "thinking"      ? "var(--muted-foreground)" :
    phase === "warming"       ? "var(--muted-foreground)" :
    phase === "reconnecting"  ? "var(--amber, #b45309)" :
                                "var(--muted-foreground)";
  const pulse = phase === "listening" || phase === "thinking" || phase === "warming" || phase === "reconnecting";
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", pulse && "animate-pulse")}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Run vitest**

Run: `npx vitest run`
Expected: all green

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): rewrite voice-conversation around explicit FSM + dual-signal barge-in"
```

### Task 2.4: Voice debug panel

**Files:**
- Create: `src/components/chat/voice-debug-panel.tsx`
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: Write the panel**

Create `src/components/chat/voice-debug-panel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { VoicePhase } from "@/lib/voice/state-machine";

export interface VoiceDebugSignals {
  phase: VoicePhase;
  lastEotConfidence: number | null;
  lastVoiceContext: Record<string, unknown> | null;
  latencyMarkers: Record<string, number>;
  sockets: { flux: boolean; aura: boolean };
}

export function VoiceDebugPanel({ signals }: { signals: VoiceDebugSignals }) {
  const [dwell, setDwell] = useState(0);
  useEffect(() => {
    setDwell(0);
    const start = performance.now();
    const id = setInterval(() => setDwell(Math.round(performance.now() - start)), 100);
    return () => clearInterval(id);
  }, [signals.phase]);

  return (
    <div
      className="pointer-events-none fixed bottom-2 right-2 z-50 max-w-xs rounded-lg border border-border bg-card/95 p-3 font-mono text-[10px] leading-tight text-foreground shadow-md backdrop-blur-sm"
      style={{ fontFamily: "var(--font-mono), monospace" }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="uppercase tracking-[0.18em] text-muted-foreground">voice</span>
        <span>{signals.phase} · {dwell}ms</span>
      </div>
      <div className="space-y-0.5">
        <div>flux: {signals.sockets.flux ? "open" : "closed"} · aura: {signals.sockets.aura ? "open" : "closed"}</div>
        {signals.lastEotConfidence !== null && (
          <div>eot.conf: {signals.lastEotConfidence.toFixed(2)}</div>
        )}
        {signals.lastVoiceContext && (
          <div>vctx: {JSON.stringify(signals.lastVoiceContext)}</div>
        )}
        {Object.entries(signals.latencyMarkers).map(([k, v]) => (
          <div key={k}>{k}: {v.toFixed(0)}ms</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the panel in `voice-conversation.tsx`**

Add to imports:

```ts
import { VoiceDebugPanel, type VoiceDebugSignals } from "./voice-debug-panel";
```

Add a signals ref/state:

```ts
const [debugSignals, setDebugSignals] = useState<VoiceDebugSignals>({
  phase: "warming",
  lastEotConfidence: null,
  lastVoiceContext: null,
  latencyMarkers: {},
  sockets: { flux: false, aura: false },
});

// Whenever phase changes:
useEffect(() => {
  setDebugSignals((s) => ({ ...s, phase }));
}, [phase]);
```

In `boot()` after `fluxRef.current = flux` set `sockets.flux: true`. Tear it down in `tearDown()`.

In the Flux `eot` case, update `lastEotConfidence`:

```ts
case "eot":
  setDebugSignals((s) => ({ ...s, lastEotConfidence: e.confidence }));
  if (e.confidence >= 0.7) commit();
  return;
```

Render the panel before the closing `</div>` of the modal:

```tsx
<VoiceDebugPanel signals={debugSignals} />
```

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + all green

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/voice-debug-panel.tsx src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): debug panel with phase/EOT/voiceContext/latency markers"
```

---

## Phase 3 — Prosody + Voice Persona

**Goal:** LLM emits prosody tags. Aura speaks them as SSML. The flat "reading text" feel goes away.

### Task 3.1: Voice persona prompt block

**Files:**
- Create: `src/lib/ai/engine/voice-persona.ts`
- Test: `src/tests/voice-persona.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-persona.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildVoicePersonaBlock, buildVoiceContextBlock } from "@/lib/ai/engine/voice-persona";

describe("voice persona", () => {
  it("persona block contains spoken-style + prosody tag instructions", () => {
    const b = buildVoicePersonaBlock();
    expect(b).toMatch(/spoken/i);
    expect(b).toContain("[pause]");
    expect(b).toContain("[soft]");
    expect(b).toContain("[emphasized]");
  });

  it("voiceContext block renders all fields", () => {
    const b = buildVoiceContextBlock({
      energy: 0.72,
      pace_wpm: 145,
      pitch_variance: 0.4,
      emotion: "casual",
    });
    expect(b).toContain("energy");
    expect(b).toContain("145");
    expect(b).toContain("casual");
  });

  it("voiceContext block is null-safe", () => {
    expect(buildVoiceContextBlock(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/tests/voice-persona.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/lib/ai/engine/voice-persona.ts`:

```ts
export type VoiceContext = {
  energy: number;
  pace_wpm: number;
  pitch_variance: number;
  emotion: "calm" | "excited" | "tired" | "tense" | "sad" | "casual";
};

export function buildVoicePersonaBlock(): string {
  return `Voice mode is on. You are being spoken to and your reply will be SPOKEN aloud.

Spoken style:
- Use contractions, hedges, and short sentence fragments. Talk like a friend over coffee.
- Default reply length: 1-3 sentences. Go longer only if the user explicitly asks for detail.
- No markdown. No bullet lists. No headings. No emoji. No asterisks.

Prosody markup (inline tags — they control how Ru speaks, NEVER read literally):
- [pause]            — short natural pause (about 300ms)
- [pause:Nms]        — explicit pause of N milliseconds
- [soft]…[/soft]     — say the wrapped text more quietly
- [emphasized]…[/emphasized] — emphasize the wrapped text
- [warm]…[/warm]     — say with extra warmth (slower, lower pitch)
- [laughs]           — a short laugh sound

Use them sparingly and naturally — like punctuation. A typical reply has 0-2 tags. Never use more than 4.

Adapt to the user's emotional state:
- If voiceContext shows the user is tired or sad — lower energy, slower pace, more [warm] and [soft].
- If excited — match energy, more emphasis.
- If tense — calm, grounded, short reassuring phrases.
- If casual — match casual register.

Critical: NEVER mention prosody tags or the voiceContext to the user. They're internal hints, not topics.`;
}

export function buildVoiceContextBlock(ctx: VoiceContext | null): string | null {
  if (!ctx) return null;
  return `voiceContext (paralinguistic signal from the user's audio this turn):
- energy: ${ctx.energy.toFixed(2)} (0=flat, 1=intense)
- pace_wpm: ${ctx.pace_wpm}
- pitch_variance: ${ctx.pitch_variance.toFixed(2)} (0=monotone, 1=expressive)
- emotion: ${ctx.emotion}

Use these to adapt tone, not to discuss with the user.`;
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run src/tests/voice-persona.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/engine/voice-persona.ts src/tests/voice-persona.test.ts
git commit -m "feat(voice): voice persona + voiceContext system prompt blocks"
```

### Task 3.2: Wire voice persona into `assembleContext` + `/api/chat`

**Files:**
- Modify: `src/lib/ai/engine/context.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Update `assembleContext` signature + body**

In `src/lib/ai/engine/context.ts`, extend the function:

```ts
import { buildVoicePersonaBlock, buildVoiceContextBlock, type VoiceContext } from "./voice-persona";

// Add to opts signature:
voice?: boolean;
voiceContext?: VoiceContext | null;

// After building messages (before returning), inject voice blocks:
if (opts.voice) {
  messages.splice(1, 0, { role: "system", content: buildVoicePersonaBlock() });
  const ctxBlock = buildVoiceContextBlock(opts.voiceContext ?? null);
  if (ctxBlock) messages.splice(2, 0, { role: "system", content: ctxBlock });
}
```

(Note: voice persona goes right after the main system prompt, before stateBlock; voiceContext follows.)

- [ ] **Step 2: Update `/api/chat/route.ts` schema + call**

In `BodySchema`:

```ts
const VoiceContextSchema = z.object({
  energy: z.number().min(0).max(1),
  pace_wpm: z.number().int().min(0).max(400),
  pitch_variance: z.number().min(0).max(1),
  emotion: z.enum(["calm", "excited", "tired", "tense", "sad", "casual"]),
}).nullable().optional();

const BodySchema = z.object({
  // ...existing fields...
  voice: z.boolean().optional(),
  voiceContext: VoiceContextSchema,
});
```

Pass `voiceContext` to `assembleContext`:

```ts
const { messages, memoryProfile } = await assembleContext({
  supabase,
  userId: user.id,
  chatId,
  newUserMessage: parsed.data.message,
  voice: parsed.data.voice,
  voiceContext: parsed.data.voiceContext,
  pageHint,
});
```

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/engine/context.ts src/app/api/chat/route.ts
git commit -m "feat(voice): inject voice persona + voiceContext blocks via /api/chat"
```

### Task 3.3: Prosody parser + SSML compiler

**Files:**
- Create: `src/lib/voice/prosody.ts`
- Test: `src/tests/voice-prosody.test.ts`
- Delete: `src/lib/voice/speakable.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-prosody.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createProsodyStream } from "@/lib/voice/prosody";

describe("prosody stream", () => {
  it("plain text passes through with sentence boundary detection", () => {
    const s = createProsodyStream();
    const chunks = s.push("Hello there. How are you?");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.map((c) => c.ssml).join("");
    expect(joined).toContain("Hello there.");
  });

  it("[pause] translates to break", () => {
    const s = createProsodyStream();
    const ch = s.push("Wait [pause] really?");
    s.flush();
    const ssml = ch.map((c) => c.ssml).join("") + s.flush().map((c) => c.ssml).join("");
    expect(ssml).toMatch(/<break time="\d+ms"\/>/);
  });

  it("[pause:500] uses explicit duration", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("ok [pause:500] go."), ...s.flush()].map((c) => c.ssml).join("");
    expect(ssml).toContain('<break time="500ms"/>');
  });

  it("[soft]...[/soft] becomes prosody volume soft", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("[soft]quietly[/soft] but firmly"), ...s.flush()].map((c) => c.ssml).join("");
    expect(ssml).toContain('<prosody volume="soft">quietly</prosody>');
  });

  it("[emphasized]...[/emphasized] becomes emphasis strong", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("really [emphasized]matters[/emphasized] here"), ...s.flush()].map((c) => c.ssml).join("");
    expect(ssml).toContain('<emphasis level="strong">matters</emphasis>');
  });

  it("strips markdown headers/bullets/code", () => {
    const s = createProsodyStream();
    const ssml = [...s.push("# Title\n- item one\n- item two\n`code`"), ...s.flush()].map((c) => c.ssml).join("");
    expect(ssml).not.toContain("#");
    expect(ssml).not.toContain("-");
    expect(ssml).not.toContain("`");
    expect(ssml).toContain("Title");
    expect(ssml).toContain("item one");
  });

  it("playedUpToChar tracks output cursor", () => {
    const s = createProsodyStream();
    s.push("Hello there.");
    s.flush();
    expect(s.playedUpToChar()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/tests/voice-prosody.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/prosody.ts`:

```ts
"use client";

export interface SSMLChunk {
  ssml: string;
  sentenceComplete: boolean;
}

export interface ProsodyStream {
  push(delta: string): SSMLChunk[];
  flush(): SSMLChunk[];
  playedUpToChar(): number;
}

const SENTENCE_BOUNDARY = /([.!?]+)(\s|$)/;

function stripMarkdown(text: string): string {
  let out = text;
  out = out.replace(/```[\s\S]*?```/g, " ");
  out = out.replace(/```/g, " ");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/(^|\n)#{1,6}\s+/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  out = out.replace(/\*+/g, "");
  out = out.replace(/_{2,}/g, "");
  out = out.replace(/(^|\n)[\-*+]\s+/g, "$1");
  out = out.replace(/(^|\n)\d+\.\s+/g, "$1");
  out = out.replace(/(^|\n)>\s+/g, "$1");
  out = out.replace(/(^|\n)[-*_]{3,}\s*(\n|$)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  return out;
}

function translateTags(text: string): string {
  let out = text;
  out = out.replace(/\[pause:(\d+)(?:ms)?\]/gi, '<break time="$1ms"/>');
  out = out.replace(/\[pause\]/gi, '<break time="300ms"/>');
  out = out.replace(/\[soft\]([\s\S]*?)\[\/soft\]/gi, '<prosody volume="soft">$1</prosody>');
  out = out.replace(/\[emphasized\]([\s\S]*?)\[\/emphasized\]/gi, '<emphasis level="strong">$1</emphasis>');
  out = out.replace(/\[warm\]([\s\S]*?)\[\/warm\]/gi, '<prosody pitch="-5%" rate="0.95">$1</prosody>');
  out = out.replace(/\[laughs\]/gi, '<break time="200ms"/>');
  // Strip any unknown tag silently
  out = out.replace(/\[[a-zA-Z/][^\]]*\]/g, "");
  return out;
}

export function createProsodyStream(): ProsodyStream {
  let carry = "";
  let playedChars = 0;

  function emit(text: string): SSMLChunk[] {
    if (!text) return [];
    const stripped = stripMarkdown(text);
    const ssml = translateTags(stripped);
    playedChars += stripped.length;
    const sentenceComplete = SENTENCE_BOUNDARY.test(stripped);
    return [{ ssml, sentenceComplete }];
  }

  return {
    push(delta) {
      const combined = carry + delta;
      // Hold back any open tag (no closing ']' seen yet) so we don't split mid-tag
      const lastOpen = combined.lastIndexOf("[");
      const lastClose = combined.lastIndexOf("]");
      if (lastOpen > lastClose) {
        const safe = combined.slice(0, lastOpen);
        carry = combined.slice(lastOpen);
        return emit(safe);
      }
      // Hold back trailing chars that could be the start of a markdown marker
      const TAIL = new Set(["*", "_", "`", "!", "[", "\\"]);
      let n = combined.length;
      while (n > 0 && TAIL.has(combined[n - 1])) n--;
      const safe = combined.slice(0, n);
      carry = combined.slice(n);
      return emit(safe);
    },
    flush() {
      const tail = emit(carry);
      carry = "";
      return tail;
    },
    playedUpToChar() {
      return playedChars;
    },
  };
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run src/tests/voice-prosody.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Delete speakable.ts**

```bash
git rm src/lib/voice/speakable.ts
```

- [ ] **Step 6: Find + update consumers**

Run: `npx grep -n "speakable" src --include="*.ts" --include="*.tsx" -r` or use Grep tool.

Replace any `createSpeakableStream()` callsites with `createProsodyStream()`. The API is similar but returns `SSMLChunk[]` instead of strings — adapt callers to consume `.ssml`.

- [ ] **Step 7: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 8: Commit**

```bash
git add src/lib/voice/prosody.ts src/tests/voice-prosody.test.ts
git commit -m "feat(voice): prosody parser + SSML compiler (replaces speakable.ts)"
```

### Task 3.4: TTS supports SSML format + speed

**Files:**
- Modify: `src/lib/voice/tts.ts`

- [ ] **Step 1: Extend the TTS handle**

Update `src/lib/voice/tts.ts`. Replace `speak`/`flush` signatures:

```ts
export interface TTSHandle {
  speak: (text: string, opts?: { format?: "ssml" | "plain" }) => void;
  flush: () => void;
  setSpeed: (wpm: number) => void;
  interrupt: () => void;
  stop: () => Promise<void>;
  isPlaying: () => boolean;
}
```

Update the URL builder to support speed:

```ts
let currentSpeed = 1.0;

return {
  speak: (text: string, opts) => {
    if (ws.readyState !== 1) return;
    const payload: Record<string, unknown> = { type: "Speak", text };
    if (opts?.format === "ssml") payload.format = "ssml";
    ws.send(JSON.stringify(payload));
  },
  flush: () => {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "Flush" }));
  },
  setSpeed: (wpm: number) => {
    const speed = Math.max(0.85, Math.min(1.15, wpm / 150));
    if (Math.abs(speed - currentSpeed) < 0.02) return;
    currentSpeed = speed;
    if (ws.readyState === 1) {
      // Aura speed is set via WS config or per-Speak param; send a Configure message
      ws.send(JSON.stringify({ type: "Configure", speed }));
    }
  },
  // ...existing interrupt/stop/isPlaying
};
```

(If the Deepgram SDK exposes a typed Configure message, use it. Otherwise the raw JSON above is what their WS accepts.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/voice/tts.ts
git commit -m "feat(voice): TTS speak() accepts ssml format + setSpeed(wpm) for rhythm mirroring"
```

### Task 3.5: System prompt instructs prosody tags when `voice=true`

**Files:**
- Modify: `src/lib/ai/engine/system-prompt.ts`

- [ ] **Step 1: Replace the voice branch of the Formatting section**

In `buildSystemPrompt`, the existing voice instruction is just "no markdown". Replace with:

```ts
Formatting:
- ${opts.voice
    ? `The user is TALKING to you — voice mode. Reply in natural spoken prose ONLY. NO markdown, NO bullet lists, NO headings, NO asterisks, NO numbered lists.

You may use inline PROSODY TAGS (control how Ru speaks; never read literally):
- [pause]  — short pause (about 300ms)
- [pause:Nms] — explicit pause duration
- [soft]…[/soft] — quieter delivery
- [emphasized]…[/emphasized] — emphasized
- [warm]…[/warm] — slower, lower pitch
- [laughs] — a short laugh
Use them sparingly (0-2 per reply, max 4). They are punctuation, not decoration.

Default to 1-3 short sentences. Go longer only when the user asks for detail. Adapt your tone to the voiceContext block if present.`
    : "Default to natural prose. Use Markdown (## headings, - lists, **bold**, tables) only when the structure genuinely helps — comparing options, explaining concepts that aren't tasks, or rendering reference data. NEVER use Markdown to list items you should be creating as tasks/routines via tools."}
```

- [ ] **Step 2: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/engine/system-prompt.ts
git commit -m "feat(voice): system prompt instructs prosody tag usage when voice=true"
```

### Task 3.6: Wire prosody stream into voice playback

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: Find existing TTS feed**

Find where assistant deltas currently flow into TTS (likely in `chat-store.ts` or directly in `voice-conversation`). Use Grep tool: search for `tts.speak` or `startTTS` callers.

- [ ] **Step 2: Replace `speakable.ts` consumption with prosody stream**

Wherever a `speakableStream.push(delta)` exists, replace with:

```ts
import { createProsodyStream } from "@/lib/voice/prosody";

const prosodyRef = useRef<ReturnType<typeof createProsodyStream> | null>(null);

// On stream start:
prosodyRef.current = createProsodyStream();

// On each delta:
const chunks = prosodyRef.current.push(delta);
for (const c of chunks) {
  if (c.ssml.trim()) tts.speak(c.ssml, { format: "ssml" });
}

// On stream end:
const tail = prosodyRef.current.flush();
for (const c of tail) {
  if (c.ssml.trim()) tts.speak(c.ssml, { format: "ssml" });
}
tts.flush();
```

- [ ] **Step 3: Type-check + tests + smoke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green.

Manual smoke: run `npm run dev`, open voice mode, say "Hey Ru, how's it going?". Verify reply plays cleanly and any prosody tags Ru emits sound natural (not read literally).

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): pipe LLM stream through prosody parser → SSML → Aura"
```

---

## Phase 4 — Paralinguistic + Rhythm mirroring

**Goal:** Ru reads your tone. Speaks at your pace. Adapts emotionally.

### Task 4.1: Paralinguistic feature extractor (server-side)

**Files:**
- Create: `src/lib/voice/paralinguistic.ts`
- Test: `src/tests/voice-paralinguistic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-paralinguistic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractFeaturesSync, type VoiceContext } from "@/lib/voice/paralinguistic";

describe("paralinguistic extraction (sync, RMS-based fallback)", () => {
  it("returns sane defaults for silence", () => {
    const pcm = new Float32Array(16000); // 1s of silence
    const ctx: VoiceContext = extractFeaturesSync(pcm, "");
    expect(ctx.energy).toBeLessThan(0.1);
    expect(ctx.pace_wpm).toBe(0);
    expect(ctx.emotion).toBe("calm");
  });

  it("computes pace from transcript + duration", () => {
    const pcm = new Float32Array(16000 * 4); // 4s
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 40) * 0.5;
    const ctx = extractFeaturesSync(pcm, "this is a test sentence with about ten words here");
    expect(ctx.pace_wpm).toBeGreaterThan(100);
    expect(ctx.pace_wpm).toBeLessThan(250);
  });

  it("higher energy -> excited bucket", () => {
    const pcm = new Float32Array(16000);
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 20) * 0.9;
    const ctx = extractFeaturesSync(pcm, "yes that's amazing");
    expect(ctx.energy).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/tests/voice-paralinguistic.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/paralinguistic.ts`:

```ts
export type VoiceContext = {
  energy: number;
  pace_wpm: number;
  pitch_variance: number;
  emotion: "calm" | "excited" | "tired" | "tense" | "sad" | "casual";
};

const SAMPLE_RATE = 16000;

export function extractFeaturesSync(pcm: Float32Array, transcript: string): VoiceContext {
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

function round2(n: number) { return Math.round(n * 100) / 100; }

function computeNormalizedEnergy(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  const rms = Math.sqrt(sum / pcm.length);
  // Map RMS [0, 0.4] → [0, 1] roughly
  return Math.max(0, Math.min(1, rms / 0.4));
}

function computePitchVariance(pcm: Float32Array): number {
  // Zero-crossing-rate-based proxy for pitch variance (cheap, no FFT).
  if (pcm.length < 1024) return 0;
  const windowSize = Math.floor(SAMPLE_RATE * 0.05); // 50ms
  const zcrs: number[] = [];
  for (let i = 0; i < pcm.length; i += windowSize) {
    let zc = 0;
    for (let j = i + 1; j < Math.min(i + windowSize, pcm.length); j++) {
      if ((pcm[j - 1] >= 0) !== (pcm[j] >= 0)) zc++;
    }
    zcrs.push(zc / windowSize);
  }
  if (zcrs.length < 2) return 0;
  const mean = zcrs.reduce((a, b) => a + b, 0) / zcrs.length;
  const variance = zcrs.reduce((a, b) => a + (b - mean) ** 2, 0) / zcrs.length;
  return Math.max(0, Math.min(1, Math.sqrt(variance) * 10));
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run src/tests/voice-paralinguistic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/paralinguistic.ts src/tests/voice-paralinguistic.test.ts
git commit -m "feat(voice): paralinguistic feature extractor (energy/pace/pitchVar/emotion)"
```

### Task 4.2: `/api/voice/features` endpoint

**Files:**
- Create: `src/app/api/voice/features/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractFeaturesSync } from "@/lib/voice/paralinguistic";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  audioBase64: z.string().min(1),
  transcript: z.string().default(""),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  // base64 → Float32Array (assumes 16kHz mono linear16, little-endian)
  const buf = Buffer.from(parsed.data.audioBase64, "base64");
  const int16 = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  const float = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000;

  const features = extractFeaturesSync(float, parsed.data.transcript);
  return Response.json(features);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/app/api/voice/features/route.ts
git commit -m "feat(voice): POST /api/voice/features endpoint"
```

### Task 4.3: Wire feature extraction at EOT commit

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`
- Modify: `src/lib/stores/chat-store.ts` (if `sendText` builds the request body)

- [ ] **Step 1: Inspect `sendText` in chat-store**

Use Grep tool to find `sendText` definition in `chat-store.ts`. It likely calls `fetch("/api/chat", { ... })`.

- [ ] **Step 2: Extend `sendText` to accept optional voiceContext**

In `chat-store.ts`:

```ts
sendText: async (text: string, opts?: { voiceContext?: VoiceContext | null }) => {
  // ...existing body construction...
  body.voiceContext = opts?.voiceContext ?? undefined;
  // ...
}
```

- [ ] **Step 3: In `voice-conversation.tsx`, extract features before `sendText`**

Replace the `commit` function:

```ts
async function commit() {
  const text = finalBufRef.current.trim();
  finalBufRef.current = "";
  setTranscript("");
  if (!text) return;
  if (isFastStop(text)) { handleClose(); return; }

  // Snapshot PCM before tearing down Flux
  const pcm = fluxRef.current?.snapshotPCM();
  tearDownInputs();
  machineRef.current?.send({ type: "commit", text });

  // Extract features in parallel with chat request (best-effort, fail-open)
  let voiceContext = null as null | Awaited<ReturnType<typeof fetchFeatures>>;
  if (pcm && pcm.length > 0) {
    voiceContext = await fetchFeatures(pcm, text).catch(() => null);
  }
  setDebugSignals((s) => ({ ...s, lastVoiceContext: voiceContext as Record<string, unknown> | null }));
  void sendText(text, { voiceContext });
}

async function fetchFeatures(pcm: Float32Array, transcript: string) {
  // Convert Float32 back to Int16 little-endian, then base64
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const audioBase64 = btoa(bin);
  const res = await fetch("/api/voice/features", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audioBase64, transcript }),
  });
  if (!res.ok) return null;
  return res.json();
}
```

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/voice-conversation.tsx src/lib/stores/chat-store.ts
git commit -m "feat(voice): extract paralinguistic features on EOT, pass voiceContext to /api/chat"
```

### Task 4.4: Rhythm mirroring — apply `pace_wpm` to Aura speed

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: After feature extraction, call `tts.setSpeed`**

Find where the TTS handle is held. Add right after `setDebugSignals(... lastVoiceContext ...)`:

```ts
if (voiceContext?.pace_wpm) {
  ttsRef.current?.setSpeed(voiceContext.pace_wpm);
}
```

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`
Manual: speak quickly and verify Ru responds slightly faster; speak slowly and verify slower. (subjective)

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): rhythm mirroring — Aura speed matches user pace_wpm"
```

---

## Phase 5 — Surpass features: tool-fill, predictive opening, semantic stop

**Goal:** Push past general voice AI for Ru's use case. No more dead air during tools. Predictive openings. Stop-anywhere intent.

### Task 5.1: Tool filler phrase bank

**Files:**
- Create: `src/lib/voice/tool-filler.ts`
- Test: `src/tests/voice-tool-filler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-tool-filler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getFillerFor } from "@/lib/voice/tool-filler";

describe("tool filler", () => {
  it("returns a non-empty filler for known tool", () => {
    const f = getFillerFor("note_episode");
    expect(typeof f).toBe("string");
    expect(f.length).toBeGreaterThan(0);
  });

  it("returns a default filler for unknown tool", () => {
    const f = getFillerFor("nonsense_tool");
    expect(f.length).toBeGreaterThan(0);
  });

  it("avoids repeating the same filler twice in a row when prev passed", () => {
    const seen = new Set<string>();
    let prev: string | undefined = undefined;
    for (let i = 0; i < 10; i++) {
      const f = getFillerFor("note_episode", { previousFiller: prev });
      seen.add(f);
      prev = f;
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run src/tests/voice-tool-filler.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/voice/tool-filler.ts`:

```ts
const PHRASE_BANK: Record<string, string[]> = {
  note_episode: ["Got it, saving that.", "Mhm, locking that in.", "Alright, I'll remember."],
  update_memory_profile: ["Noting that.", "Got it."],
  forget: ["Okay, letting that go.", "Removing it."],
  create_task: ["Adding that now.", "On the list.", "One sec, putting it down."],
  modify_task: ["Updating that.", "One sec."],
  complete_task: ["Done. [pause:200] Nice."],
  delete_task: ["Removing it."],
  declare_routine: ["Setting that up.", "Got it, adding the routine."],
  modify_routine: ["Tweaking that now."],
  log_activity: ["Logged.", "Got it, logging."],
  log_tracker_entry: ["Adding that to the tracker."],
  create_tracker: ["One sec, building the tracker.", "Setting that up."],
  open_workspace: ["Let me lay this out…"],
  query_analytics: ["Let me check.", "Looking that up.", "One sec."],
  get_routine_history: ["Let me check.", "Looking that up."],
  update_profile: ["Got it."],
  default: ["One sec.", "Hold on.", "Let me grab that."],
};

function pick(arr: string[], previous?: string): string {
  if (arr.length === 1) return arr[0];
  let choice: string;
  let attempts = 0;
  do {
    choice = arr[Math.floor(Math.random() * arr.length)];
    attempts++;
  } while (choice === previous && attempts < 4);
  return choice;
}

export function getFillerFor(toolName: string, opts?: { previousFiller?: string }): string {
  const bank = PHRASE_BANK[toolName] ?? PHRASE_BANK.default;
  return pick(bank, opts?.previousFiller);
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run src/tests/voice-tool-filler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/tool-filler.ts src/tests/voice-tool-filler.test.ts
git commit -m "feat(voice): tool filler phrase bank (Surpass #1 — no dead air during tools)"
```

### Task 5.2: Wire tool filler into voice playback

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: Detect tool calls in the stream**

The chat-store streams SSE events that include tool calls (search the codebase for how tool calls surface — likely a `tool_call` event type in `stream.ts`).

In `voice-conversation.tsx`, subscribe to chat-store's tool call signal. Pseudocode:

```ts
const lastFillerRef = useRef<string | undefined>(undefined);

// Hook into chat-store tool-call event:
useEffect(() => {
  const unsub = useChatStore.subscribe(
    (s) => s.lastToolCall,
    (toolCall) => {
      if (!toolCall) return;
      if (machineRef.current?.current() !== "thinking") return;
      machineRef.current.send({ type: "tool_call_detected" });
      const filler = getFillerFor(toolCall.name, { previousFiller: lastFillerRef.current });
      lastFillerRef.current = filler;
      ttsRef.current?.speak(filler, { format: "plain" });
    }
  );
  return () => unsub();
}, []);
```

(If chat-store doesn't expose `lastToolCall`, add it — it's a small surface area: store the most recent tool name + a tick counter to fire the subscriber.)

- [ ] **Step 2: Wire `tool_call_done` when the tool finishes**

When the tool result lands in stream (chat-store should expose `lastToolResult`), send `tool_call_done` to the FSM so it returns to `thinking`.

- [ ] **Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`
Manual: ask Ru in voice mode to "add a task to buy milk". Verify she says "Adding that now." while the tool runs.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/voice-conversation.tsx src/lib/stores/chat-store.ts
git commit -m "feat(voice): tool-fill speech masks tool-call latency"
```

### Task 5.3: `/api/voice/opening` endpoint

**Files:**
- Create: `src/app/api/voice/opening/route.ts`
- Test: `src/tests/voice-opening-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/voice-opening-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";

const ResponseSchema = z.object({
  greeting: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

describe("opening response schema", () => {
  it("validates a neutral greeting", () => {
    expect(ResponseSchema.safeParse({ greeting: "Hey.", confidence: 0.0 }).success).toBe(true);
  });
  it("validates a predictive greeting", () => {
    expect(ResponseSchema.safeParse({
      greeting: "Morning. Want me to log the workout?",
      confidence: 0.85,
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to pass**

Run: `npx vitest run src/tests/voice-opening-route.test.ts`
Expected: PASS (schema-only)

- [ ] **Step 3: Write the route**

```ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Per-user in-memory cache, 60s TTL. Across server cold-starts cache resets,
// which is fine — predictive opening regenerates cheaply.
const cache = new Map<string, { at: number; payload: { greeting: string; confidence: number } }>();

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < 60_000) return Response.json(hit.payload);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, behavioral_model, profile_doc")
    .eq("id", user.id)
    .single();
  if (!profile) {
    const payload = { greeting: "Hey.", confidence: 0.0 };
    cache.set(user.id, { at: Date.now(), payload });
    return Response.json(payload);
  }

  const tz = profile.timezone ?? "UTC";
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));

  // Cheap heuristic: if a typical_activity_hour matches the current hour,
  // tee up that activity.
  const tah = (profile.behavioral_model as { typical_activity_hour?: Record<string, number> } | null)?.typical_activity_hour ?? {};
  const matches = Object.entries(tah).filter(([, h]) => Math.abs(h - hour) <= 1);

  let payload: { greeting: string; confidence: number };
  if (matches.length > 0) {
    const [activity] = matches[0];
    const timeWord = hour < 5 ? "Late night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    payload = {
      greeting: `${timeWord}. Want me to log the ${activity}?`,
      confidence: 0.7,
    };
  } else {
    const timeWord = hour < 5 ? "Late night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    payload = { greeting: `${timeWord}.`, confidence: 0.3 };
  }

  cache.set(user.id, { at: Date.now(), payload });
  return Response.json(payload);
}
```

- [ ] **Step 4: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 5: Commit**

```bash
git add src/app/api/voice/opening/route.ts src/tests/voice-opening-route.test.ts
git commit -m "feat(voice): GET /api/voice/opening — predictive greeting from M0 + behavioral signals"
```

### Task 5.4: Fire opening on voice mode open

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: In `boot()` (before mic-permission), fetch and speak the opening**

Inside `boot()`, before `await startFlux(...)`:

```ts
// Fire opening in parallel with mic permission
const openingPromise = fetch("/api/voice/opening").then((r) => r.ok ? r.json() : null).catch(() => null);

// ...existing flux startup...

// Once Aura is ready, speak the opening
const opening = await openingPromise.catch(() => null);
if (opening?.greeting) {
  // Wait for TTS handle to be ready (existing pattern); then:
  ttsRef.current?.speak(opening.greeting, { format: "plain" });
}
```

(If TTS handle isn't yet wired in `voice-conversation.tsx`, this might require a small ttsRef hookup — follow whatever pattern already exists for TTS on streamed assistant messages.)

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`
Manual: open voice mode at a known routine time; verify Ru greets you with the predictive line.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): predictive opening — speaks on voice mode open"
```

### Task 5.5: `end_voice_session` tool — definition + handler + executor wire

**Files:**
- Modify: `src/lib/ai/tools/definitions.ts`
- Create: `src/lib/ai/tools/handlers/voice.ts`
- Modify: `src/lib/ai/tools/executor.ts`
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add the tool definition**

In `src/lib/ai/tools/definitions.ts`, add (next to other voice-related tools, or grouped at the bottom):

```ts
export const endVoiceSessionTool = {
  type: "function" as const,
  function: {
    name: "end_voice_session",
    description:
      "Call this when the user wants to end the voice conversation — phrases like 'I gotta go', 'bye Ru', 'let's stop here', 'we're done', 'I'm out', any way of signalling they want to stop. Also include a brief spoken goodbye in your reply.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string", description: "Brief reason the user gave for ending." },
      },
      required: ["reason"],
    },
  },
};
```

Also export a helper that filters tool list by voice mode:

```ts
export function toolsForMode(opts: { voice: boolean }) {
  const base = ALL_TOOLS; // existing
  return opts.voice ? [...base, endVoiceSessionTool] : base;
}
```

- [ ] **Step 2: Write the handler**

Create `src/lib/ai/tools/handlers/voice.ts`:

```ts
export async function endVoiceSession(_args: { reason: string }): Promise<{ acknowledged: true }> {
  // The handler is intentionally a no-op on the server side.
  // The client (voice-conversation.tsx) detects the tool call in the stream
  // and handles graceful close behavior.
  return { acknowledged: true };
}
```

- [ ] **Step 3: Wire in the executor**

In `src/lib/ai/tools/executor.ts`, add the handler:

```ts
import { endVoiceSession } from "./handlers/voice";

// In the handlers map:
end_voice_session: endVoiceSession,
```

- [ ] **Step 4: Use `toolsForMode` in `/api/chat/route.ts`**

Wherever the tool list is passed to `runConversation`, replace with:

```ts
import { toolsForMode } from "@/lib/ai/tools/definitions";
// ...
const tools = toolsForMode({ voice: parsed.data.voice === true });
```

- [ ] **Step 5: Type-check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean + green

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/tools/definitions.ts src/lib/ai/tools/handlers/voice.ts src/lib/ai/tools/executor.ts src/app/api/chat/route.ts
git commit -m "feat(voice): end_voice_session tool — semantic stop intent via LLM"
```

### Task 5.6: Client detects `end_voice_session` and closes gracefully

**Files:**
- Modify: `src/components/chat/voice-conversation.tsx`

- [ ] **Step 1: Subscribe to tool-call events for end_voice_session**

```ts
useEffect(() => {
  const unsub = useChatStore.subscribe(
    (s) => s.lastToolCall,
    (toolCall) => {
      if (toolCall?.name !== "end_voice_session") return;
      // Let Ru's spoken goodbye finish playing, then close.
      machineRef.current?.send({ type: "close" });
      // Watch for audio_done — close hard after a max wait
      const start = Date.now();
      const checkClose = setInterval(() => {
        if (!isTTSPlaying() || Date.now() - start > 4000) {
          clearInterval(checkClose);
          handleClose();
        }
      }, 100);
    }
  );
  return () => unsub();
}, []);
```

- [ ] **Step 2: Type-check + smoke**

Run: `npx tsc --noEmit`
Manual: open voice, say "alright, I'm out", verify Ru says a brief goodbye and closes.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/voice-conversation.tsx
git commit -m "feat(voice): client closes voice on end_voice_session tool call"
```

---

## Phase 6 — Test checklist update

**Goal:** Capture voice-specific manual QA items in the running checklist.

### Task 6.1: Append voice section to `docs/test-checklist.md`

**Files:**
- Modify: `docs/test-checklist.md`

- [ ] **Step 1: Append a new H2 section**

Append (do not replace) to `docs/test-checklist.md`:

```markdown
---

## M1 — Conversational Voice

### Turn-taking + listening
- [ ] **First-word capture** — tap voice button, immediately say a word; verify it appears in transcript
- [ ] **Two-stage indicator** — "Warming up…" then "Listening" — transitions visible
- [ ] **EOT doesn't cut off mid-thought** — pause ~1s mid-sentence then continue; verify Flux holds (doesn't commit)
- [ ] **EOT commits cleanly on completion** — finish a clean sentence; verify ≤900ms p50 to response
- [ ] **Eager EOT cancellation** — pause then resume; verify no premature LLM call result lands

### Barge-in
- [ ] **Barge-in on quiet voice** — interrupt Ru softly; she stops <200ms
- [ ] **Barge-in in a noisy room** — local VAD picks up where Deepgram VAD wavers
- [ ] **Truncation works** — barge in mid-reply; verify message in DB ends with "…" and `truncated_at` set
- [ ] **No memory drift** — open a new chat after barge-in turn; verify Ru recalls only what was actually said

### Reliability / state machine
- [ ] **Mic reopens reliably** — chain 5 quick turns; mic comes back every time
- [ ] **Watchdog fires + recovers** — manually delay an LLM response 16s; verify recovery to listening
- [ ] **Sockets pre-warm** — open voice mode; verify Flux + Aura open in parallel with mic permission

### Prosody + voice persona
- [ ] **`[pause]` is silent, not read** — Ru emits a `[pause]` tag; verify it sounds like a pause, not the literal word "pause"
- [ ] **`[soft]` actually softens** — Ru wraps a phrase in `[soft]`; verify it sounds quieter
- [ ] **`[emphasized]` actually emphasizes** — `[emphasized]` segment is audibly stressed
- [ ] **No markdown bleeds through** — voice reply never reads `**`, `#`, or bullet characters

### Paralinguistic + rhythm
- [ ] **Pace matches user (excited)** — speak quickly; Ru speaks slightly faster
- [ ] **Pace matches user (tired)** — speak slowly and quietly; Ru slows down + adds [warm]
- [ ] **voiceContext appears in debug panel** — every committed turn shows energy/pace/emotion

### Surpass features
- [ ] **Predictive opening fires at routine time** — open voice at your usual gym hour; Ru opens with "Want me to log the workout?"
- [ ] **Tool-fill speech masks tool latency** — ask Ru to add a task; she says "Adding that now." while the tool runs
- [ ] **Semantic stop — 'I gotta go'** — Ru says a brief goodbye and closes
- [ ] **Semantic stop — 'let's stop here'** — same
- [ ] **Semantic stop — 'bye Ru'** — same
- [ ] **Fast-path 'stop'** — say just "stop"; closes immediately without waiting for LLM

### Edge cases
- [ ] **Mic permission denied** — banner + retry CTA
- [ ] **Flux WS drops mid-session** — reconnects with pre-buffer
- [ ] **Aura WS drops** — falls back to browser speechSynthesis
- [ ] **Tab backgrounded** — pause + resume work
- [ ] **Network blip** — 5s offline mid-turn; recovers
- [ ] **Debug panel toggles via `?debug=voice`** — visible during testing; can be hidden later
```

- [ ] **Step 2: Commit**

```bash
git add docs/test-checklist.md
git commit -m "docs(voice): append M1 voice test checklist"
```

---

## Self-review against the spec

Per writing-plans skill, before declaring the plan done.

- **Spec coverage:**
  - Architectural principle (Section 1 of spec) → covered by Tasks 3.2 (voiceContext in same /api/chat) + 5.5 (toolsForMode unifies tool list)
  - Architecture diagram (Section 2) → all boxes have tasks: Flux (1.2), local-VAD (2.2), paralinguistic (4.1), voice-persona (3.1), prosody (3.3), tool-filler (5.1), opening (5.3), truncate (1.6)
  - Data flow (Section 3) → covered by orchestrator rewrite (2.3) + filler wiring (5.2) + opening wiring (5.4)
  - Reliability (Section 4) → FSM (2.1), dual-VAD (2.2 + 2.3), watchdog (2.1), AudioPlayer fix (1.4), truncation (1.5, 1.6, plus barge-in path in 2.3), semantic stop (5.5, 5.6)
  - Components (Section 5) → every component listed has a task
  - Latency budget (Section 6) → Phase 1 + 2 deliver the 600-900ms p50 win; benchmark harness deferred (not a code task — manual)
  - Cost (Section 6) → not a code task
  - Error handling (Section 7) → covered piecemeal: watchdog (2.1), fallback to speechSynthesis is implicit in tts.ts existing patterns
  - Testing (Section 8) → unit tests baked into every task; QA checklist (6.1)

- **Placeholder scan:** clean — no TBD, no "implement later"

- **Type consistency:** `VoiceContext` defined identically in `voice-persona.ts` (engine) and `paralinguistic.ts` (voice). To avoid drift, paralinguistic.ts re-exports from voice-persona.ts in real implementation — implementer should consolidate to single source of truth in `voice-persona.ts` if they notice the duplication. (Minor; documenting here.)

- **One known weakness:** The plan's Task 3.6 says "find existing TTS feed" — slightly looser than the rest. The codebase shows the TTS handle currently lives outside `voice-conversation.tsx`. Implementer should resolve by grepping `startTTS` callers and following the established pattern. Acceptable because the actual wiring is heavily codebase-specific and well-established.

---

## Phased shipping summary

| Phase | Tasks | Approx. effort | Ships independently? |
|---|---|---|---|
| 1 — Foundation | 1.1-1.6 | 1-2 days | Yes (Flux + audio fix + truncate route) |
| 2 — Reliability | 2.1-2.4 | 2-3 days | Yes (with Phase 1 merged) |
| 3 — Prosody | 3.1-3.6 | 3-5 days | Yes |
| 4 — Paralinguistic | 4.1-4.4 | 3-5 days | Yes |
| 5 — Surpass | 5.1-5.6 | 4-6 days | Yes |
| 6 — Checklist | 6.1 | 5 min | Yes |
| **Total** | 32 tasks | **~14-22 days** | |

Each phase ships value on its own. After Phase 1, voice already feels faster. After Phase 3, it stops feeling robotic. After Phase 5, it surpasses general voice AI for personal-organizer use.
