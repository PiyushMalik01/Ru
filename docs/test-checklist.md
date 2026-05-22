# Test Checklist

Running list of things to manually verify before shipping. Add to it as features land. Tick items as you test them. This is **not** the automated test suite — it's the human-in-the-loop QA pass.

**Status legend:**
- `[ ]` = not tested yet
- `[x]` = verified working
- `[~]` = partially works / known minor issue
- `[!]` = bug found, needs fix (link issue/PR)
- `[skip]` = intentionally out of scope for now

---

## M0 — Memory & Personalization

### Memory writes (model-initiated)
- [ ] **note_episode happy path** — tell Ru a fact ("I'm allergic to peanuts"), open `/settings/memory` → Episodic, verify it appears
- [ ] **note_episode embedding** — confirm `episodes.embedding` is non-null in DB after a write
- [ ] **note_episode importance clamp** — model sends importance > 1.0 or < 0; verify clamped to [0,1]
- [ ] **update_memory_profile** — tell Ru "I live in Tokyo", run consolidation, verify identity section updates
- [ ] **update_memory_profile rejects invalid section** — handler should refuse sections not in the canonical 5
- [ ] **forget exact match** — tell Ru "forget that I like coffee" after teaching it; verify archived_at is set
- [ ] **forget fuzzy match** — paraphrase the original fact in the forget request; verify matchEpisodeByText finds it
- [ ] **forget no-match** — try to forget something Ru never knew; verify graceful no-op response
- [ ] **Memory writes survive page reload** — write a fact, reload, confirm still present

### Memory reads (recall into chat)
- [ ] **Episodic recall on relevant topic** — teach Ru a fact in session 1, start session 2, ask about it → Ru recalls it
- [ ] **Episodic recall skips irrelevant** — verify Ru doesn't dump unrelated episodes into context
- [ ] **Profile injection** — fill the profile, start a fresh chat, verify Ru references it (e.g. knows your name/timezone)
- [ ] **Behavioral block surfaces low-completion days** — after a week of routine logs, Ru mentions skip patterns
- [ ] **Memory blocks render in fixed order** — Identity → Preferences → Current themes → Active projects → Ru & me
- [ ] **Entity top-up** — mention a task by partial name; verify retrieve.ts pulls the right episode by entity match
- [ ] **Rerank scoring** — engineer two similar memories with different importance; higher-importance one wins
- [ ] **Recall cap = 6** — write 20 highly similar episodes; verify at most 6 surface per turn

### Memory kill switch
- [ ] **`memory_enabled = false` skips all memory** — flip the flag in DB; verify no profile/episodic/enrichment blocks injected
- [ ] **Onboarding modal sets memory_enabled to true on accept** — fresh account, accept modal, verify DB
- [ ] **Memory writes still work after kill switch toggle** — disable, re-enable, write → verify it lands

### Enrichment layer
- [ ] **OAuth users get substring fallback** — verify `enrichTurn` returns deterministic result without burning quota
- [ ] **Resolved entities surface in system block** — mention "the gym thing" with a tracker named "Gym"; verify resolution
- [ ] **Date resolution** — say "tomorrow" / "next Friday"; verify dates land in enrichment block
- [ ] **600ms timeout** — simulate slow enrichment path; verify chat doesn't block past deadline
- [ ] **Memory signals** — say "by the way, my birthday is May 22"; verify memorySignals flags it

### Sleep-time consolidation (`memory-consolidate.ts`)
- [ ] **Manual rebuild endpoint** — POST `/api/memory/rebuild`, verify Inngest job triggers
- [ ] **Profile section rewrite produces valid prose** — after rebuild, check `/settings/memory` Profile tab
- [ ] **Critique pass corrects voice slips** — seed a draft with first-person "I"; verify refine pass removes it
- [ ] **Critique pass catches hallucinations** — see if it rejects facts not in source episodes (hard to test deterministically — eyeball quality across 3-5 rebuilds)
- [ ] **Dedup merges near-duplicates** — write 2 nearly identical episodes (cosine > 0.92); verify one supersedes the other
- [ ] **Cross-day merge with entity overlap** — write related episodes on different days with same entity refs; verify older one absorbs newer
- [ ] **Behavioral SQL passes** — verify `typical_activity_hour`, `routine_completion_by_dow`, task lag p50 land in `profiles.behavioral_model`
- [ ] **Sentiment trend** — log 7 days of activity_log with sentiment; verify `sentiment_trend_7d` is non-null
- [ ] **Voice share** — voice + text in last 24h; verify ratio in behavioral_model
- [ ] **Routine detection vote** — pattern with ≥4 occurrences, stdev<2; verify LLM vote runs and creates an `is_active: false` routine
- [ ] **Decay archives stale low-importance episodes** — seed importance<0.3, last_referenced > 90d; verify archived_at is set
- [ ] **Audit row written for every change** — every merge, rewrite, forget should append to `memory_audit`
- [ ] **Cron sweep picks 3am local users** — set timezone to "Asia/Kolkata" or whatever, wait until local 3am UTC equivalent, verify sweep enqueues
- [ ] **First-run rebuild mode** — empty profile_doc; verify mode auto-promotes to "rebuild" (180-day backfill)
- [ ] **Patch mode for single section** — send `memory.consolidate.user_profile_touched` with section; only that section rewrites

### Memory UI (`/settings/memory`)
- [ ] **Profile tab — section editing** — edit identity inline, save, verify correction lands in `memory_corrections`
- [ ] **Profile tab — light patch event** — after edit, verify `memory.consolidate.user_profile_touched` fires
- [ ] **Timeline tab — day grouping** — write 3 facts today, 2 yesterday; verify they group by day
- [ ] **Timeline tab — undo button (hover-revealed)** — undo a `learned` entry; verify episode archived
- [ ] **Timeline tab — undo a `merged`** — verify dropped episode is restored
- [ ] **Timeline tab — undo a `profile_rewrite`** — verify section reverts to `before` payload
- [ ] **Episodic tab — forget button** — click forget on a row; verify archived_at + audit row
- [ ] **Episodic tab — importance slider filter** — drag slider; verify list filters
- [ ] **Onboarding modal — first visit only** — fresh user, modal appears; dismiss, verify `memory_onboarded_at` set, modal doesn't return
- [ ] **"{n} facts" chip in nav** — count matches `profile_doc` sentences + active episodes
- [ ] **Chip links to `/settings/memory`** — click navigates correctly
- [ ] **Rollout banner — one-time dismiss** — appears once, dismiss persists across reloads (localStorage)

### OpenAI key + cost
- [ ] **OPENAI_API_KEY drives embeddings** — drop key in `.env.local`, verify `note_episode` writes have non-null embedding
- [ ] **OPENAI_API_KEY drives consolidation** — verify gpt-4o-mini calls succeed (check logs / network)
- [ ] **Missing key — graceful degrade** — unset key, write episode → embedding null but no crash; trigger rebuild → log error, no crash
- [ ] **Strict JSON schema works** — set up gpt-4o-mini chat, verify responses always parse (no malformed JSON)
- [ ] **Critique pass actually runs** — instrument logs; verify both passes fire per section
- [ ] **Cost estimate matches reality** — run 5 consolidations on a populated account, check OpenAI usage dashboard; should be ~$0.10 total

---

## Pre-M0 regression (things that must not break)

### Chat
- [ ] **Main chat still streams via ChatGPT OAuth** — send a message, verify reply
- [ ] **Tool calls still work** — ask Ru to create a task, verify tool fires and DB row created
- [ ] **Anthropic prompt cache hit** — second message in a session; verify `cache_read_input_tokens` > 0 in response metadata
- [ ] **System prompt still has Memory section** — inspect the assembled context

### Voice
- [ ] **STT — Deepgram transcription works** — voice message, verify transcript saved
- [ ] **TTS — Deepgram Aura playback works** — Ru reply plays as audio
- [ ] **Full-duplex** — interrupt Ru mid-speech; verify it stops
- [ ] **Voice input flagged correctly** — verify `messages.input_method = 'voice'` in DB

### Tasks / Routines / Trackers / Workspaces
- [ ] **Task create / complete / delete** all still work
- [ ] **Routine logging** writes to `routine_logs`
- [ ] **Tracker increment** updates count
- [ ] **Workspace switch** scopes view correctly
- [ ] **Archived items** (`archived: true`) don't surface in main lists or entity catalog

### Auth
- [ ] **Login via ChatGPT OAuth** still works
- [ ] **Logout clears session** + redirects
- [ ] **RLS enforced** — try reading another user's `profiles` / `episodes` row via direct query; should fail

### Settings (non-memory)
- [ ] **Display name + timezone updates** still write via `update_profile` (the structured-field one, not memory)
- [ ] **Provider key BYOK form** still saves encrypted

---

## Performance & latency

- [ ] **Chat first-token latency** — under 1.5s p50 on a warm session
- [ ] **Memory injection overhead** — compare cold turn (no memory) vs warm turn; should add <300ms
- [ ] **Retrieve.ts under 200ms** — instrument; semantic top-k + entity top-up combined
- [ ] **Enrichment under 600ms** — verify timeout fires correctly when LLM stalls
- [ ] **Consolidation completes in <60s per user** — single-user rebuild on a populated account

---

## Edge cases & failure modes

- [ ] **Empty profile (new user)** — chat works, no errors, memory blocks gracefully skipped
- [ ] **No episodes yet** — retrieve.ts returns []; episodic block null; no crash
- [ ] **Profile section over budget** — section content exceeds budget; verify rewrite respects target length
- [ ] **Corrupted embedding (NaN / wrong dim)** — manually break a row; verify retrieve.ts cosine sim returns 0, not crash
- [ ] **Concurrent writes** — fire 5 `note_episode` tool calls in parallel; verify all land, no race
- [ ] **Inngest job retry** — kill consolidation mid-flight; verify Inngest retries cleanly
- [ ] **Very long episode content** — write a 2000-char episode; verify it stores and renders truncated in UI
- [ ] **Special chars in content** — emoji, quotes, JSON-breaking chars; verify storage and rendering
- [ ] **Timezone with DST transition** — set user to a DST timezone, run sweep on transition day; verify 3am still hits correctly
- [ ] **User with `memory_enabled = false` from day one** — verify they never see memory UI/chip, system prompt has no Memory section

---

## Security / data hygiene

- [ ] **Service role only used server-side** — grep verifies no `SUPABASE_SERVICE_ROLE_KEY` in client bundles
- [ ] **OpenAI key only server-side** — verify no leaks into client JS
- [ ] **RLS on episodes** — user A cannot read user B's episodes
- [ ] **RLS on memory_audit** — same
- [ ] **RLS on memory_corrections** — same
- [ ] **match_episodes RPC** — SECURITY INVOKER, pinned search_path, verify only returns caller's rows
- [ ] **Audit row payloads don't leak across users** — payload column has correct user_id scoping

---

## Browser / device matrix
*(Test the golden path — chat + memory write + recall + settings — on each)*

- [ ] Chrome desktop (Win/macOS)
- [ ] Safari desktop (macOS)
- [ ] Firefox desktop
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

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
- [ ] **No more "stuck thinking"** — chain 10 turns; verify FSM never gets wedged

### Prosody + voice persona
- [ ] **`[pause]` is silent, not read** — Ru emits a `[pause]` tag; verify it sounds like a pause (not the literal word "pause")
- [ ] **Pauses audible via ellipsis encoding** — `[pause]` should produce a brief natural pause in Aura output
- [ ] **`[soft]` doesn't get read literally** — wrapped text plays; SSML markup stripped before Aura
- [ ] **No markdown bleeds through** — voice reply never reads `**`, `#`, or bullet characters
- [ ] **Replies are short and spoken-style** — 1-3 sentences default, contractions used, no lists

### Paralinguistic + rhythm
- [ ] **voiceContext appears in debug panel** — every committed turn shows energy/pace/emotion
- [ ] **`pace_wpm` flows end-to-end** — speak fast or slow; debug panel shows the value
- [ ] **`setSpeed` is invoked** — even though Aura doesn't honor it today, log/instrumentation confirms it's called
- [ ] **Emotion classifier produces sane buckets** — speak quietly → "calm" or "sad"; speak excitedly → "excited"

### Surpass features
- [ ] **Predictive opening fires** — at typical routine time, Ru opens with anticipated greeting (e.g., "Want me to log the workout?")
- [ ] **Predictive opening cold-start** — fresh user with no behavioral model → just "Hey."
- [ ] **Tool-fill speech masks tool latency** — ask Ru to add a task; she says "Adding that now." while the tool runs
- [ ] **Tool-fill doesn't repeat itself** — chain multiple tool calls; fillers rotate
- [ ] **Semantic stop — 'I gotta go'** — Ru says a brief goodbye and closes
- [ ] **Semantic stop — 'let's stop here'** — same
- [ ] **Semantic stop — 'bye Ru'** — same
- [ ] **Semantic stop — 'alright we're done'** — same
- [ ] **Fast-path 'stop'** — say just "stop"; closes immediately without waiting for LLM
- [ ] **end_voice_session only registered in voice mode** — text turns must not see it in the tool list

### Edge cases
- [ ] **Mic permission denied** — banner + retry CTA
- [ ] **Flux WS drops mid-session** — reconnects with pre-buffer
- [ ] **Aura WS drops** — falls back to browser speechSynthesis (or graceful failure)
- [ ] **Tab backgrounded** — pause + resume work
- [ ] **Network blip** — 5s offline mid-turn; recovers
- [ ] **Debug panel toggles via `?debug=voice`** — visible during testing; can be hidden later
- [ ] **OAuth session expired mid-call** — verify graceful handling

### Cost + latency
- [ ] **Latency benchmark** — run 50 voice turns; measure p50/p95 user-stops→ru-starts (target p50 ≤900ms, p95 ≤1200ms)
- [ ] **Cost envelope** — verify <$0.05/voice-min on Deepgram dashboard

### M1.1 — Smart EOT + speculative + fast model (2026-05-22)
- [ ] **Composite EOT** — Ru never replies while user is still mid-sentence (smart confirmer holds until Flux EOT + VAD silence agree)
- [ ] **EOT fast path** — high-confidence "thanks bye" / "that's it" → confirmer fires immediately (no extra silence wait)
- [ ] **Flux trust fallback** — if local VAD is quiet but never reaches 200ms threshold (low-volume mic), confirmer fires after 1.5s anyway
- [ ] **Speculative commit** — common case: user finishes, audio plays within ~300ms (speculative LLM already done)
- [ ] **Speculative cancel** — user starts a sentence, pauses (eager_eot), keeps talking → no audio plays, no DB writes happen, no orphan messages
- [ ] **Speculative text divergence** — user says "what's on my plate" then continues "...also remind me at 3pm" — texts diverge → speculative dropped, fresh sendText runs
- [ ] **Speculative + tool side effects** — when speculative runs a tool then user cancels, the tool's side effect remains (KNOWN — document any observed cases)
- [ ] **Speculative on first-turn-of-chat** — chatId is null → speculative skipped, normal sendText fires on confirmer
- [ ] **Voice-fast model** — OpenAI BYOK voice turns use gpt-5-mini (not gpt-5); Anthropic uses claude-haiku-4-5 (not Opus/Sonnet); ChatGPT OAuth still uses codex
- [ ] **Latency p50 with all 3 wins** — target p50 ≤700ms user-stops→ru-starts (was ~1.2-2s pre-M1.1)
- [ ] **/api/chat/persist** — speculative-committed turns appear in chat correctly on reload; chat title derives from user message if "New chat"
- [ ] **Barge-in during speculative-driven reply** — interrupt cleanly; speculative session cancelled; mic re-opens

---

## Notes / open questions
*(Drop short notes here as you test — easier than scrolling to find context)*

- **Aura SSML / speed limitation** — Aura WS doesn't accept SSML or runtime speed control. Workarounds in place (ellipsis-as-pause encoding, setSpeed stub). For full prosody/rhythm value, evaluate swapping to Cartesia Sonic 3 or ElevenLabs v3 as a follow-up after voice testing.
-
