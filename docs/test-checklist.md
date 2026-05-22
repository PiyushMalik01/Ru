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

## Notes / open questions
*(Drop short notes here as you test — easier than scrolling to find context)*

-
