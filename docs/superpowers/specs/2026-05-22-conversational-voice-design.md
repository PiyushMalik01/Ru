# Conversational Voice (M1) — Design Spec

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-22
**Owner:** Ateeb / Ru core
**Predecessor:** M0 (Memory & Personalization)

---

## Why this exists

Ru's current voice mode (Deepgram Nova-3 STT + Aura-2 TTS in a cascaded pipeline) works — but feels like a teleprompter, not a conversation. The LLM writes for *reading*; the TTS *reads* it back; neither side reacts to *how* the user sounds. Add state-machine bugs ("stuck thinking"), brittle stop-phrase detection, and silence between turns, and the gap to "feels like talking to a friend" is large.

This spec lays out the architecture for M1: **a voice loop that feels human, runs around the unchanged chat pipeline, and ships in phases.**

---

## Goals

1. **Feels human, not robotic.** Prosody, pace, and emotional adaptation that match the user — not flat TTS reading flat prose.
2. **Same brain.** Memory, tools, enrichment, persistence — all unchanged. Voice is an I/O wrapper.
3. **Butter smooth.** No state-machine bugs. No mid-conversation dead ends. Every transition reflected in UI within 80ms.
4. **Sub-second p50 turn-taking.** 600-900ms user-stops → Ru-starts. 3× improvement over current ~2s.
5. **Cheap relative to S2S.** ~$0.036/min total, ~10× cheaper than OpenAI Realtime, ~3× cheaper than Hume.
6. **Surpasses general voice AI for *our* use case.** General systems have better raw prosody. Ru has memory, tools, persona, and three "surpass features" they don't (tool-fill speech, rhythm mirroring, predictive opening).

## Non-goals (explicitly deferred)

- **Full speech-to-speech monolith** (OpenAI Realtime, Sesame CSM) — breaks ChatGPT OAuth, breaks M0 memory injection, ~10× cost. Re-evaluate in 2027.
- **Mid-utterance backchannels** (VAP-driven "mhm" while user speaks) — research showed bad implementations are worse than none. Defer to M2.
- **Voice fine-tuning the brain LLM** — highest-ceiling lever, but requires dataset curation. Defer to M2.
- **Multi-language** — English only for M1.
- **Phone-call / PSTN integration** — web/mobile only.
- **Voice cloning for custom Ru voices** — sticking with Aura-2 Thalia.

## Success criteria

- p50 turn latency ≤900ms (measured user-stops → Ru-starts) across 100-turn test set
- p95 turn latency ≤1200ms
- Zero "stuck thinking" recoveries needed in 50-turn QA scripted scenarios
- Semantic stop intent ("I gotta go", "bye Ru", "we're done", etc.) detected with ≥95% recall on a 50-phrase test set
- Subjective: in blind A/B with current voice, 8/10 testers prefer M1 on "feels human" and "feels responsive"

---

## Architectural principle

**Voice is an I/O wrapper around the unchanged chat pipeline.** Same brain (`runConversation`), same memory pipeline (`assembleContext`, `enrichTurn`, `retrieveEpisodes`), same tools, same persistence. Voice adds:

- **Better input understanding**: semantic end-of-turn detection (Flux), paralinguistic features (energy/pace/emotion).
- **Better output rendering**: prosody-tagged LLM output → SSML-compiled Aura playback.
- **Two new request fields** to `/api/chat`: `inputMode: 'voice'` and `voiceContext: VoiceContext`.
- **One new tool** registered only for voice turns: `end_voice_session`.

Neither memory nor tools nor the chat route is aware of voice as a distinct medium. They receive an enriched context and respond accordingly.

---

## Architecture

```
USER MIC ──► getUserMedia (echo-cancel, noise-suppress, AGC)
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  Deepgram Flux (replaces Nova-3)                    │  NEW
│  • Semantic end-of-turn detection                   │
│  • eot_threshold=0.7, eager_eot=0.3                 │
│  • Rolling ring buffer of raw PCM (10s)             │
└─────────────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐    ┌─────────────────────────────┐
│ Turn         │    │ Paralinguistic extractor    │ NEW
│ orchestrator │    │ (server-side, ONNX or       │
│ (FSM)        │    │  Deepgram bundled sentiment)│
└──────────────┘    └─────────────────────────────┘
        │                       │
        └─────────┬─────────────┘
                  ▼
┌─────────────────────────────────────────────────────┐
│ POST /api/chat   (unchanged route)                   │
│ body: {                                              │
│   message, conversationId,                           │
│   inputMode: 'voice',         ← NEW                  │
│   voiceContext: { ... },      ← NEW                  │
│ }                                                    │
│ Server: same assembleContext + enrichTurn +          │
│   retrieveEpisodes + runConversation;                │
│   adds voice persona + voiceContext system blocks    │
│   when inputMode='voice'; registers                  │
│   end_voice_session tool                             │
│                                                      │
│ Streams response with prosody tags:                  │
│   "[soft] Oh, really? [pause:200] That's hard."     │
└─────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ Prosody parser / SSML compiler                       │ NEW
│ (replaces speakable.ts)                              │
│ • Tag translation → Aura-2 SSML subset               │
│ • First-sentence streaming to TTS                    │
│ • Rhythm mirroring: set Aura speed from              │
│   voiceContext.pace_wpm / 150 clamped 0.85-1.15     │
└─────────────────────────────────────────────────────┘
                  │
                  ▼
        Deepgram Aura-2 (existing) → AudioPlayer → speakers

Parallel side-paths:
• Tool-fill speech — when stream contains tool_call,
  client speaks canned filler via Aura WS during
  tool execution (Surpass #1)
• Predictive opening — /api/voice/opening fires on mode
  open, uses M0 memory + behavioral signals to draft
  a context-aware greeting (Surpass #3)
• Barge-in truncation — when user speaks mid-Ru-reply,
  client posts /api/chat/truncate so DB reflects what
  was actually played
```

### Why cascaded, not S2S

| Constraint | Cascaded fits | S2S problem |
|---|---|---|
| ChatGPT OAuth for brain | Preserved | OAuth tool injection limited in Realtime API |
| M0 memory pipeline injection | Preserved (text-based system blocks) | Audio token context, no system-block hook |
| Tool quality (M0 tools, Ru tools) | Same as text | Realtime tool calling weaker than text models |
| Cost envelope ~$0.05/min | ~$0.036 achievable | ~$0.30/min |
| Debuggability + audit trail | Text transcript at every stage | Opaque audio loop |
| Phased shippability | Yes — each layer independent | All-or-nothing rewrite |

Trade-off accepted: ~150-200ms slower turn-taking and slightly less natural raw prosody than OpenAI Realtime. We win it back via tool-fill, predictive opening, rhythm mirroring, and crucially — answer quality from M0 memory + tool grounding.

---

## Data flow — turn lifecycle

```
t=0      User taps voice button
t+10     Parallel: getUserMedia + Flux WS open + Aura WS open +
         GET /api/voice/opening
t+200    Opening returns; client immediately speaks via Aura
t+1100   Opening finishes; mic armed
t+2400   USER SPEAKS
         Flux streams interim transcripts; paralinguistic ring buffer fills
t+5400   USER PAUSES (Flux: EOT=false, conf=0.55) — eager LLM fires
t+5700   User resumes — eager LLM cancelled (cheap)
t+5900   USER TRULY STOPS (Flux: EOT=true, conf=0.82) — commit
t+5910   Paralinguistic extractor runs on buffered PCM (~30ms)
t+5940   POST /api/chat with inputMode='voice' + voiceContext
t+6200   LLM TTFT — first tokens arrive
t+6250   Tool call detected → tool-fill speech starts via Aura
         (parallel with tool execution)
t+7050   LLM finishes; prosody parser streams sentence-by-sentence
         to Aura with speed param matched to user pace
t+7400   Ru speaking
t+9500   Ru finishes; 500ms cooldown
t+10000  Mic re-opens; loop continues
```

### Barge-in path

```
mid-tts_speaking, user starts talking:
1. Flux speech_started + local VAD both fire (dual signal, 80ms debounce)
2. Aura WS: send Clear (kill server buffer)
3. AudioPlayer.interrupt() (kill local playback)
4. Compute playedUpToChar from prosody parser's last-flushed cursor
5. POST /api/chat/truncate { messageId, playedUpToChar }
6. FSM → listening (new turn captured)
```

### Semantic stop intent

```
LLM detects "I gotta go" / "bye Ru" / "let's stop" intent natively
→ calls end_voice_session({ reason })
→ client sees tool_call in stream
→ plays LLM's spoken goodbye via Aura
→ FSM → closing → close modal cleanly
```

Plus fast-path: literal `"stop"` (transcribed bare) triggers immediate close without LLM round-trip (panic stop).

---

## Components

### Input side

#### `src/lib/voice/flux.ts` (NEW, replaces `stt.ts`)

```ts
type FluxEvent =
  | { type: 'ready' }
  | { type: 'interim'; text: string }
  | { type: 'final'; text: string }
  | { type: 'eot'; confidence: number; reason: 'silence' | 'semantic' | 'timeout' }
  | { type: 'speech_started' }
  | { type: 'error'; message: string };

export function startFlux(callbacks: { onEvent: (e: FluxEvent) => void }): FluxHandle;
```

Config: `eot_threshold: 0.7`, `eager_eot_threshold: 0.3`, `eot_timeout_ms: 5000`. Retains pre-ready audio buffer. Adds rolling 10-second PCM ring buffer for paralinguistic extractor to read post-EOT.

#### `src/lib/voice/paralinguistic.ts` (NEW)

```ts
type VoiceContext = {
  energy: number;          // 0-1, RMS-based
  pace_wpm: number;        // words / minute
  pitch_variance: number;  // 0-1
  emotion: 'calm' | 'excited' | 'tired' | 'tense' | 'sad' | 'casual';
};

export function extractFeatures(pcm: Float32Array, transcript: string): Promise<VoiceContext>;
```

Implementation strategy:
1. Try Deepgram Flux bundled sentiment first (zero new dep)
2. Fallback: wav2vec2-emotion ONNX via `onnxruntime-node` in a server worker

Called from `/api/voice/features` route. Latency budget <30ms.

#### `src/lib/voice/local-vad.ts` (NEW)

Second signal for dual-signal barge-in. Web Audio `AnalyserNode`, ~10ms RMS windows with hysteresis. Triggers `onSpeech` callback when either Flux or local-VAD fires AND persists ≥80ms.

### Brain side

#### `src/lib/ai/engine/voice-persona.ts` (NEW)

```ts
export function buildVoicePersonaBlock(): string;
export function buildVoiceContextBlock(ctx: VoiceContext): string;
```

The persona block instructs the model:
- Spoken style — contractions, hedges, sentence fragments OK
- Max ~3 sentences unless asked for detail
- No markdown, lists, headers
- Emit prosody tags: `[pause]`, `[pause:200]`, `[soft]`, `[emphasized]`, `[warm]`, `[laughs]`
- Adapt to `voiceContext.emotion` — match if excited, lower energy if tired

Wired into `assembleContext` when `inputMode === 'voice'`. Sits alongside the existing Memory/Behavioral/Episodic system blocks.

#### `src/lib/ai/tools/handlers/voice.ts` (NEW)

```ts
export async function endVoiceSession({ reason }: { reason: string }): Promise<{ acknowledged: true }>;
```

Just acknowledges. Client detects the tool call in the stream and handles close behavior.

#### `src/lib/ai/tools/definitions.ts` (EXTEND)

Conditional registration: `end_voice_session` only appears in the tool registry passed to `runConversation` when `inputMode === 'voice'`.

**Fallback if OAuth tool injection is constrained:** server-side regex/LLM classifier on the assistant's response text post-hoc. Lower-quality fallback, but functional.

### Output side

#### `src/lib/voice/prosody.ts` (NEW, replaces `speakable.ts`)

```ts
type SSMLChunk = { ssml: string; sentenceComplete: boolean };

export function createProsodyStream(opts: { pace_wpm?: number }): {
  push(delta: string): SSMLChunk[];
  flush(): SSMLChunk[];
  playedUpToChar(): number;  // for barge-in truncation
};
```

Tag → SSML translation:

| LLM tag | Aura-2 SSML | Fallback (if Aura subset narrower) |
|---|---|---|
| `[pause]` | `<break time="300ms"/>` | (always supported) |
| `[pause:Nms]` | `<break time="Nms"/>` | (always supported) |
| `[soft]…[/soft]` | `<prosody volume="soft">…</prosody>` | Slower pace via `<prosody rate="0.9">` |
| `[emphasized]…[/emphasized]` | `<emphasis level="strong">…</emphasis>` | `<prosody pitch="+10%">…</prosody>` |
| `[warm]…[/warm]` | `<prosody pitch="-5%" rate="0.95">…</prosody>` | (if `<prosody>` works) or no-op |
| `[laughs]` | `<break time="200ms"/>` + breath audio token | Plain `<break time="300ms"/>` |

**SSML feature detection** runs once at startup: tries each tag against a tiny synthesis request, caches which work. Translation table dynamically narrows based on detection.

Markdown stripping (existing `speakable.ts` logic) is preserved.

Streams sentence-by-sentence to Aura WS — first sentence boundary → first audio chunk on the wire. No buffering for "more context."

#### `src/lib/voice/tool-filler.ts` (NEW — Surpass #1)

```ts
export function getFillerFor(toolName: string, opts?: { previousFiller?: string }): string;
```

Phrase bank, 3-5 variants per tool:

| Tool | Examples |
|---|---|
| `note_episode` | "Got it, saving that.", "Alright, I'll remember.", "Mhm, locking that in." |
| `create_task` | "Adding that now.", "On the list.", "One sec, putting it down." |
| `update_memory_profile` | "Noting that.", "Got it." |
| `search_memory` | "Let me check.", "Looking that up.", "One sec." |
| `forget` | "Okay, letting that go.", "Removing it." |
| default | "One sec.", "Hold on." |

Random selection avoiding immediate repetition. Tags allowed in fillers (`[soft]`, `[pause]`). Triggered only after actual `tool_call` event in the stream — never speculatively.

If filler is still playing when the LLM's primary response begins, primary response queues until filler completes. If user barges in during filler, standard barge-in flow.

#### `src/lib/voice/tts.ts` (EXTEND)

- `speak(text: string, opts?: { format: 'ssml' | 'plain' })`
- `setSpeed(wpm: number)` — sends Aura speed param; speed = clamp(wpm / 150, 0.85, 1.15)
- Existing `interrupt`, `flush`, `stop` unchanged

#### `src/lib/voice/audio-player.ts` (FIX)

Replace the `currentTime < next` race-prone `playing` getter with `activeSourceCount > 0`. Increment on `start()`, decrement on `onended`. Eliminates the "stuck playing forever" path that contributed to the FSM watchdog bugs.

### Orchestrator

#### `src/lib/voice/state-machine.ts` (NEW)

```ts
type VoicePhase =
  | 'warming'         // sockets opening, mic perm
  | 'listening'       // mic open
  | 'thinking'        // EOT committed, /api/chat in flight
  | 'tts_speaking'    // Aura streaming
  | 'tool_filling'    // tool-fill speech playing
  | 'cooldown'        // post-TTS silence buffer
  | 'reconnecting'    // socket dropped, recovering
  | 'closing'         // end_voice_session triggered
  | 'error';          // unrecoverable

type VoiceMachine = {
  send(event: VoiceEvent): void;
  current(): VoicePhase;
  onPhaseChange(cb: (phase: VoicePhase) => void): void;
  onWatchdog(cb: (stuckPhase: VoicePhase) => void): void;
};

export function createVoiceMachine(): VoiceMachine;
```

Per-state max dwell times:
- `warming`: 5s → error
- `listening`: ∞ (user may pause indefinitely)
- `thinking`: 15s → fallback line + return to listening
- `tts_speaking`: 60s → force cooldown (shouldn't ever hit)
- `tool_filling`: 5s → return to listening
- `cooldown`: 2s → listening
- `reconnecting`: 8s → error
- `closing`: 4s → force close

Unit-testable without React. Watchdog logs structured `voice_watchdog_fired` events.

#### `src/components/chat/voice-conversation.tsx` (REWRITE)

- Consumes the FSM instead of polling+flag spaghetti
- Two-stage indicator: `warming` → "Warming up…" (no orb pulse); `listening` → "Listening" + visual cue (Ru's face changes)
- Pre-warms Flux + Aura WS on mount in parallel with mic permission
- Mounts the debug panel when `?debug=voice` is set OR during testing phase (default on initially)

### Server endpoints

#### `src/app/api/voice/opening/route.ts` (NEW — Surpass #3)

```
GET /api/voice/opening
→ { greeting: string, confidence: number }
```

Logic:
1. Load M0 memory profile + behavioral_model
2. Check `routine_completion_by_dow` for current DOW, `typical_activity_hour` for current hour
3. Check recent episodes (last 24h, importance ≥0.5)
4. If high-confidence signal: call gpt-4o-mini with tight prompt → one-sentence opener
5. Else: `"Hey."`

60s per-user cache (don't re-generate on rapid voice mode toggles).

#### `src/app/api/voice/features/route.ts` (NEW)

```
POST /api/voice/features
body: { audioBase64, transcript, conversationId }
→ VoiceContext
```

Server worker: paralinguistic extractor. Auth: session-scoped.

#### `src/app/api/chat/truncate/route.ts` (NEW — Fix 5)

```
POST /api/chat/truncate
body: { messageId, playedUpToChar }
→ { ok: true }
```

Updates `messages.content` to `content.slice(0, playedUpToChar) + ' …'`. Sets `truncated_at`. Ensures M0 consolidation reads what was heard, not what was generated.

#### `src/app/api/chat/route.ts` (EXTEND)

Accept `inputMode: 'voice' | 'text'` and `voiceContext?: VoiceContext` in body. Pass to `assembleContext`. Register `end_voice_session` tool in the tool registry only when `inputMode === 'voice'`. Zero changes for text turns.

### Debug surface

#### `src/components/chat/voice-debug-panel.tsx` (NEW)

Bottom-right fixed card during dev/testing. Shows:
- Current phase + dwell time
- EOT confidence trace (sparkline)
- Last `VoiceContext`
- Latency markers: user-stops → /api/chat fired → first-token → first-audio
- Socket states

Toggled off via `?debug=voice` query param once stable. Default on for the testing phase.

---

## Latency budget

Target: **p50 600-900ms**, **p95 ≤1200ms** (user-stops-speaking → Ru-starts-speaking).

| Phase | Budget | Owner |
|---|---|---|
| Flux EOT decision | 80-150ms | Deepgram |
| Paralinguistic extraction | 20-30ms | Us (parallel with HTTP) |
| Network → `/api/chat` | 20-40ms | Us (HTTP/2 pre-warmed, region-pinned) |
| LLM TTFT | 250-450ms | Provider (ChatGPT OAuth) |
| Tool detection (if applicable) | 0ms (tool-fill masks) | Us |
| First-sentence boundary | 0ms | Us |
| Aura TTS TTFA | 135-200ms | Deepgram |
| Network → AudioContext schedule | 30-80ms | Us |
| **p50 total** | **~535-850ms** | |
| **p95 total** | **~1200ms** | |

Compared to current (~2000ms p50), 3× improvement.

### Latency wins layered on the architecture

- **Pre-warm Flux + Aura sockets** when voice button enters viewport (not on tap) → saves 200-400ms first-turn cost
- **Aggressive eager EOT** at 0.3 confidence → saves 100-200ms typical
- **First-sentence TTS** → saves 300-600ms perceived
- **HTTP/2 connection reuse** to `/api/chat` → saves 30-80ms per turn
- **Tool-fill speech** masks 200-2000ms tool latency
- **Co-locate Deepgram region with Vercel region** → saves 30-80ms network

---

## Cost

Per-minute envelope (6 turns/min, ~3s user audio + ~7s Ru audio per turn):

| Component | Cost/min |
|---|---|
| Deepgram Flux STT (~18s/min spoken) | ~$0.009 |
| Deepgram Aura-2 TTS (~900 chars/min) | ~$0.027 |
| ChatGPT OAuth (brain) | $0 (user's existing subscription) |
| gpt-4o-mini (predictive opening + consolidation share) | <$0.001 |
| Paralinguistic extractor (ONNX or Deepgram bundled) | $0 |
| Vercel function compute | <$0.001 |
| **Total** | **~$0.036/min** |

Vs alternatives: OpenAI Realtime ~$0.30/min (~8×), Hume EVI 3 ~$0.10/min (~3×), ElevenLabs CAI ~$0.12/min (~3×).

Net delta vs current build: ~$0.002/min (~5%), entirely from Flux being slightly pricier than Nova-3.

---

## Error handling

| Failure | User-facing behavior | Recovery |
|---|---|---|
| Mic permission denied | Banner with retry CTA | Tap to retry; deep-link to browser settings |
| Flux WS fails to open | Stays in "Warming up" with subtle retry, 3 retries (250ms/750ms/2s), then "Voice is having trouble" + text fallback offer | Exponential backoff |
| Flux drops mid-session | "Reconnecting…" indicator, pre-buffer captures audio | Auto-reconnect, 3 retries in 30s before escalation |
| Aura WS fails | Falls back to browser `speechSynthesis` | Reconnect in background |
| `/api/chat` 5xx or hangs (>8s) | Fallback line via cheap-sibling LLM: "I lost my train of thought — say that again?" | Return to listening, no auto-retry |
| LLM TTFT >3s | Speculative tool-fill kicks in; if >6s no tokens, fallback line | Return to listening |
| Tool execution fails | LLM gets error in tool_result, recovers naturally | Existing text path |
| Paralinguistic extractor fails | `voiceContext` omitted | Brain still works |
| `end_voice_session` tool fires but TTS dead | Skip goodbye, brief visual close cue | No retry |
| Predictive opening fails | Silent open, straight to listening | One-shot, no retry |
| `/api/chat/truncate` fails | Local log + background retry | Accept memory-quality cost if all retries fail |
| AudioContext suspended | "Tap to enable audio" CTA | `ctx.resume()` on tap |
| Tab backgrounded | Pause TTS, hold mic optional | Resume on `visible` |
| Watchdog timeout | Brief Ru "shake off" animation, log | Force-transition to listening |
| Network partition | "Reconnecting…" 5s hold | Resume or error |
| Silent mic 10s after listening | "Are you still there?" — not hard close | Tap to continue or auto-close at 60s |

**Cross-cutting principles:**
- Never silent >2s when active
- Degrade gracefully, never crash the modal
- All recoveries user-visible (color, animation)
- No auto-retry loops that could cascade into provider rate limits
- Telemetry on every failure path

---

## Testing strategy

### Unit (Vitest)

- `state-machine.ts` — every transition, watchdog timeouts, illegal transitions
- `prosody.ts` — tag parsing edge cases, split deltas, malformed tags, markdown still stripped
- `tool-filler.ts` — phrase rotation, non-empty bank per tool
- `paralinguistic.ts` — feature extraction on fixed audio samples (bucket-based assertions, not exact-value)
- `voice-persona.ts` — system prompt block contents
- Route handlers for `/voice/opening`, `/voice/features`, `/chat/truncate`
- `audio-player.ts` `playing` getter — explicit source count
- `local-vad.ts` — synthetic Float32 buffer detection

### End-to-end (Playwright + mocks)

- Happy path: warming → listening → thinking → tts_speaking → cooldown → listening
- Barge-in: mid-tts speech detection → truncation → listening
- Stuck thinking: hang chat 16s → watchdog recovery
- Mic permission denied: banner + retry
- Flux dies mid-session: reconnect with pre-buffer
- Aura dies: fallback `speechSynthesis`
- `end_voice_session` tool call: goodbye + clean close

### Manual QA

Items appended to `docs/test-checklist.md` covering: first-word capture, EOT not cutting off, barge-in in quiet + noisy environments, mic reopen across 5 quick turns, watchdog recovery, semantic stop on diverse phrasings, prosody tag audibility, pace mirroring, predictive opening at routine times, tool-fill masking latency, tab background, network blip, debug panel updates.

### Latency benchmark harness

Dev-only script: 50 synthetic voice turns, measures p50/p95 of each phase, outputs table + flame chart. Run before each phase ships.

### Synthetic regression

Canonical 5-turn script exercising memory recall, tool call, barge-in, emotional adaptation, semantic stop. Run weekly with human in the loop.

---

## Phased shipping

This is the order, not a scope cut. Each phase ships independently and adds value.

### Phase 1 — Flux migration (1-2 days)

**Single biggest "feels less robotic" lever, lowest effort.**

- Replace `stt.ts` with `flux.ts`
- Tune `eot_threshold` and `eager_eot_threshold` in dev
- Update `voice-conversation.tsx` to consume new event shape
- Latency benchmark: target 800-1100ms p50 by end of phase

### Phase 2 — Prosody + voice persona (3-5 days)

**Kills the flat-TTS feel.**

- `voice-persona.ts` — system prompt block + voiceContext block
- `/api/chat` accepts `inputMode` + `voiceContext`
- `prosody.ts` — replaces `speakable.ts` — tag parsing + SSML compile + sentence streaming
- SSML feature detection on Aura
- `tts.ts` — `speak()` SSML format + `setSpeed()` method
- LLM emits prosody tags via prompt examples

### Phase 3 — Paralinguistic + rhythm mirroring (3-5 days)

**Kills the "no brain in it" feeling.**

- `paralinguistic.ts` — extractor (Deepgram bundled first, ONNX fallback)
- `/api/voice/features` endpoint
- Flux ring buffer wired to extract on EOT
- `voiceContext` flows end-to-end into chat request
- Aura speed param set from `pace_wpm`
- Voice persona prompt instructs LLM to adapt to emotion

### Phase 4 — Reliability + state machine (2-3 days)

**Butter smooth.**

- `state-machine.ts` — explicit FSM with watchdogs
- `voice-conversation.tsx` rewrite around FSM
- Two-stage indicator (Warming / Listening)
- WS pre-warm on viewport entry
- Dual-signal barge-in (Flux + local-VAD)
- `audio-player.ts` `playing` getter fix
- `/api/chat/truncate` endpoint + client integration
- Debug panel mounted by default

### Phase 5 — Surpass features (4-6 days)

**Pushes past general voice AI for our use case.**

- `tool-filler.ts` + integration (Surpass #1)
- `voice-conversation.tsx` detects `tool_call` in stream and triggers filler
- `/api/voice/opening` endpoint + client integration (Surpass #3)
- `end_voice_session` tool definition + handler + client behavior
- Fast-path literal "stop" detection
- Optional: voice fine-tune (deferred to M2 per non-goals)

---

## Open questions for implementation

1. **Exact Flux pricing** — public docs vague. Verify in Phase 1; adjust cost model if material delta.
2. **Aura-2 SSML subset** — verify supported tags in Phase 2 via feature detection. If `<prosody>` not supported, tag translation narrows to `<break>` + `<emphasis>` only — still useful, but less expressive.
3. **OAuth tool injection** — verify in Phase 5 whether we can add `end_voice_session` as a per-request tool via ChatGPT OAuth. Fallback: post-hoc classifier on assistant response.
4. **Paralinguistic source** — bake-off in Phase 3 between Deepgram bundled sentiment and wav2vec2 ONNX. Cheapest acceptable wins.
5. **gpt-4o-mini availability via the same OPENAI_API_KEY** — already verified working in M0; reuse.

---

## What this spec does NOT cover

- The implementation order within each phase (handled by `writing-plans` skill, separate document)
- Specific prompt strings (drafted during implementation, iterated against real voice samples)
- Marketing/PR copy for "voice 2.0"
- Voice cloning, voice packs, multi-language (deferred, see non-goals)

---

## Appendix — what we steal from each best-in-class system

| From | Technique | Phase |
|---|---|---|
| Deepgram Flux | Semantic end-of-turn + eager EOT | 1 |
| ElevenLabs v3 | LLM-emitted prosody tags | 2 |
| Hume EVI 3 | Paralinguistic side-channel into LLM | 3 |
| OpenAI Realtime | Barge-in with transcript truncation | 4 |
| LiveKit / Pipecat | Explicit FSM with watchdogs | 4 |
| Inflection Pi | Voice persona prompting (later: fine-tune) | 2 (now) + M2 (fine-tune) |
| All production phone agents | Region co-location + pre-warmed sockets | 1 + 4 |
| Originally ours (Ru-specific) | Tool-fill speech (Surpass #1) | 5 |
| Originally ours (Ru-specific) | Rhythm mirroring via pace_wpm | 3 |
| Originally ours (Ru-specific) | Predictive opening from M0 memory | 5 |
