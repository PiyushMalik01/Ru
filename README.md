# Ru

A conversation-first AI life organizer. You talk to Ru — text or voice — and she turns the back-and-forth into tasks, routines, reminders, plans, activity logs, and trackers. She remembers context across chats, watches for patterns, and surfaces the things that matter that day.

Built to feel like a warm editorial workspace, not another dashboard.

---

## What it does

- **Chat that actually does things.** Ru is wired to ~30 tools — create/modify/delete tasks, routines, reminders, plans, workspaces, trackers, activity log, profile. No "I can't do that" walls.
- **Full-duplex voice.** Deepgram Nova-3 STT + Aura-2 TTS with barge-in. Hold space anywhere to talk, or open a conversation and just speak.
- **Today, Sheet, Chat.** Three primary surfaces. Today is the briefing. Sheet is the full table view of everything. Chat is where things change.
- **Quantitative trackers.** Custom-column tables ("sleep hours / quality / dream"), logged from chat, charted on the detail page.
- **Pattern detection.** A nightly Inngest job looks at your activity log and suggests routines you're already doing without naming.
- **BYOK.** Bring your own OpenAI / Anthropic / Gemini key, or sign in with ChatGPT.
- **Companion.** Ru herself is a small character that drifts around the UI, reacts to chat, and speaks. She has moods.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Fluid Compute) |
| UI | React 19, Tailwind v4 (`@theme inline`), Framer Motion, Base UI |
| Type | Geist Sans + Mono, Fraunces (editorial display) |
| DB / Auth | Supabase Postgres + RLS, `pg_trgm` for fuzzy match |
| AI | OpenAI, Anthropic, Gemini — provider-adapter pattern; SSE streaming |
| Voice | Deepgram SDK v3 (STT + TTS) |
| State | Zustand (chat, companion, confirm dialog) |
| Jobs | Inngest (routine detection, daily 5am UTC) |
| Push | web-push (browser notifications) |
| Tests | Vitest |

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in keys
npm run dev
```

Required env:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=               # 32-byte hex for BYOK key envelope
DEEPGRAM_API_KEY=
DEEPGRAM_PROJECT_ID=
OPENAI_MODEL_DEFAULT=
ANTHROPIC_MODEL_DEFAULT=
GEMINI_MODEL_DEFAULT=
```

Then apply Supabase migrations from `supabase/migrations/` against your project.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on `:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve the build |
| `npm run lint` | ESLint |
| `npm test` | Vitest run |
| `npm run test:watch` | Vitest watch mode |

## Deploying to Vercel

1. Import the repo at https://vercel.com/new — framework auto-detects as Next.js.
2. In **Project Settings → Environment Variables**, paste every key from `.env.local.example` into Production (and Preview, if you want PR deploys to work). `ENCRYPTION_KEY` must be a 32-byte hex string: `openssl rand -hex 32`.
3. The API chat route runs on Fluid Compute with a 300s `maxDuration` — set in `vercel.json`. SSE streaming works out of the box; no edge runtime config needed.
4. **Supabase**: apply every file in `supabase/migrations/` against your project, in filename order. The `pg_trgm` extension is required for fuzzy entity lookup — enable it under Database → Extensions.
5. **Supabase auth redirect**: in Authentication → URL Configuration, add `https://<your-domain>/auth/callback` to "Redirect URLs". The proxy at `src/proxy.ts` enforces signed-in access on every route except `/`, `/login`, `/signup`, `/auth/callback`.
6. **Deepgram** scoped key minting needs `DEEPGRAM_API_KEY` + `DEEPGRAM_PROJECT_ID`. If scoped minting fails the client falls back to the master key (see `b5da14c`).

Deploy. First Production deploy will trigger a clean build; subsequent pushes to `master` auto-deploy.

## Layout

```
src/
  app/
    (app)/        today, sheet, chat, plans, tasks, routines, trackers, insights, settings
    (auth)/       sign-in / sign-up
    (landing)/    marketing site
    api/chat/     SSE streaming chat route (Fluid Compute, Node runtime)
  components/
    app-shell/    top nav, sub nav, floating pill, dock, confirm dialog
    chat/         message bubbles, cards, voice conversation
    dashboard/    today view, task rows, activity items
    workspace/    workspace header, item list
    landing/      landing-page sections
    trackers/     tracker rows, charts, entries table, fields panel
  lib/
    ai/           providers, engine, tools (executor + 30 handlers)
    voice/        STT / TTS clients
    queries/      Supabase read helpers
    stores/       Zustand stores
    theme.tsx     home-rolled theme provider (replaces next-themes)
supabase/
  migrations/     SQL migrations
```

## Notes for contributors

- **Next 16 has breaking changes.** Read `node_modules/next/dist/docs/` before assuming patterns from your training data are current. `proxy.ts` replaces `middleware.ts`. Use the Cache Components patterns (`use cache`, `cacheLife`, `cacheTag`) instead of `unstable_cache`.
- **Hydration is strict.** No `Date.now()` or unpinned locales in render — use `useRelativeTime` / `<RelativeTime>` and `toLocaleDateString("en-US", …)`.
- **No `window.confirm`.** Use `confirm()` from `@/lib/stores/confirm-store` — Promise-based, themed dialog.
- **Force-dynamic anything that reads user data.** Server actions that mutate must `revalidatePath(...)` — including `"/chat/[id]"` with the `"page"` arg for dynamic segments.
- **AI knowledge cutoff.** This is a Next 16 + React 19 + Tailwind v4 codebase. Older patterns will look right but won't build.
