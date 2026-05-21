# AI Pipeline Roadmap

A living index of things we know we want to build into Ru's AI pipeline,
in the rough order we believe they should ship. Anything listed here is
**deferred from the current design cycle** — it's been thought about, it's
on the path, but it is not part of whatever spec is in flight right now.

Each item should answer:
- **What it is** in one paragraph
- **Why now / why later** — what unlocks it, what depends on it
- **Moat impact** — does this make Ru harder to clone or just nicer?

Add to this file when scope creeps. Move to `docs/superpowers/specs/` when
it becomes the active design.

---

## Now (in design)

### M0 — Memory & Personalization
Hierarchical memory: structured user-profile core block (always in
context), durable semantic recall (vector + entity graph) of meaningful
turns and decisions, and a nightly "sleep-time" consolidation job that
rewrites the user model from raw signal. This is the *substrate* every
later item compounds on. Spec in flight under
`docs/superpowers/specs/`.

**Moat:** Highest. The moat is the accumulated user-shaped state, not
the code. Two months of use and Ru genuinely knows you; a clone can
copy the architecture but not the data.

---

## Next (1–2 cycles after M0 lands)

### M1 — Anticipatory layer ("Ru speaks first")
Per-user pattern model running hourly (or on event triggers) that
surfaces things Ru *should* say before being asked: "you usually run
by 7pm — want to log it or skip?", "your OChem midterm is in 3 days
and you haven't touched it since Tuesday", "you've completed the same
4-task pattern 3 weeks in a row, want me to make it a routine?"

Surfaces via the Today briefing, a soft toast in the floating pill,
and optionally a push. Suppressed if the user has dismissed the same
suggestion twice (learned annoyance threshold).

**Depends on M0:** without the user model, this is just generic
nagging.

**Moat:** High. Combined with M0, this is what makes Ru feel like a
person who knows you, not a chatbot you talk at.

### M2 — Voice that thinks out loud
Streaming-aware TTS bridge:
- Acknowledge instantly on utterance-end ("mm-hm, working on that…")
  while the LLM is still planning, using a tiny local cache of
  natural acknowledgers tuned to detected intent.
- Narrate tool results as they land ("OK, added the run to your
  tracker — that's 4 days in a row.") instead of waiting for the
  final assistant prose.
- Self-correct mid-utterance on barge-in: Aura `Clear` + a verbal
  "yep, go ahead" handoff instead of the current dead-stop.
- Optionally: a "thinking sound" / breath layer (very subtle) during
  long tool rounds so silence never feels like a freeze.

**Moat:** Medium. Visceral in demos. Easier to copy than M0/M1 but
high quality-bar work in practice.

---

## After that

### M3 — Multi-modal capture
- **Image → tasks:** Photo of a whiteboard, syllabus, handwritten
  to-do list, or grocery list → Ru extracts tasks/dates and offers
  to add them.
- **Screenshot → context:** Drop a Slack thread, calendar invite,
  email screenshot → Ru parses and acts.
- **Voice memo → activity:** Record a 30-second debrief after a run
  → log_activity with the structured fields filled in.

**Depends on:** provider-adapter pattern needs an image content-part
path (Anthropic and Gemini support this natively; OpenAI too). Codex
OAuth path may not — flag that as a fallback.

### M4 — Calendar & external state ingestion
Read-only sync with Google Calendar / Outlook so Ru knows what
already exists when she schedules. Conflict detection ("you have a
2pm Tuesday, want me to push the dentist call to 3?"). Eventually
two-way sync but read-only first.

**Moat:** Medium-high. The first competitor who does this well wins
the "actually replaces your planner" niche.

### M5 — Conflict / coherence layer
A small validator that runs over every batch of tool calls before
they're committed: overlapping reminders, double-booked time slots,
a task due before its parent plan, a tracker created twice with
different units, contradictory routine declarations. Surfaces as a
soft confirm ("you already have a 'morning run' routine — add to it
instead?") rather than a hard block.

**Depends on M0** for the existing-entity matching to be good
enough.

### M6 — Cross-chat continuity
The current pipeline scopes history per chat. M0 partially addresses
this via vector recall, but a dedicated "thread linking" layer would
let Ru explicitly say "you started OChem study planning in another
chat last week — pulling that in" and stitch workspaces across
threads.

### M7 — Speculative execution on partial transcripts
While the user is still talking, the STT interim transcript triggers
a *shadow* assembleContext + tool-pre-warm pipeline. By the time the
utterance ends, the model already has context loaded and (sometimes)
a tentative tool plan ready. Discarded on barge-in. Saves 200–600ms
of perceived latency on every voice turn.

**Risk:** doubles inference cost in voice mode. Gate behind a
plan/quota.

### M8 — Personality model that evolves
Ru's companion has moods today, but they're transient. Long-term: a
per-user "relationship state" — formality, humor level, callbacks to
in-jokes, learned nicknames. Persisted in M0's profile block, applied
to every turn. The thing that makes Ru feel like *your* Ru, not
everyone's Ru.

**Moat:** Highest of the post-M0 items. This is essentially
unclonable.

### M9 — Eval harness + memory grading
Once M0 lands, we need a way to measure whether memory is actually
helping. Per-user gold-set: "Ru should know X after Y conversations."
Run nightly; regressions block deploys. Without this, M0 quality
silently drifts.

### M10 — Provider-agnostic prompt cache + cost-aware routing
Cache stable prefixes (system prompt + state block) on Anthropic
side. Route cheap turns (single-tool, no recall) to a smaller model;
reserve Opus/Sonnet for builds. Visible to the user as a cost
counter in Settings; invisible in default operation.

---

## Speculative / not committed

- **Group memory.** Two users sharing a plan ("our wedding", "our
  trip"). Mostly an auth + scoping problem on top of M0.
- **Local-first memory.** On-device vector store, encrypted sync
  upstream. Differentiator on privacy. Hard to do well in browser.
- **Programmable routines.** A routine that *triggers another tool*
  ("at 9pm, log how the gym went"). Cron + tool dispatcher.
- **Ru-initiated calls.** Push → outbound TTS → 30-second check-in.
  Probably crosses a creepy-line for most users.

---

## Out of scope (intentionally not building)

- Open-ended agentic web browsing on the user's behalf.
- Email/SMS sending as Ru.
- Anything that requires us to be the source of truth for the
  user's calendar (we sync, we don't own).
- "Train your own Ru model" — we don't fine-tune per user.

---

## Update log

- **2026-05-21** — initial draft. M0 (memory) in active design.
