# SLOPWORKS — Discord Activity (multiplayer web app)

Build a complete, runnable **Discord Activity** (embedded-app) called **SLOPWORKS**.
It is a multiplayer clicker/idle game about producing "AI slop" — absurd,
garbled, AI-generated content. Two or more people join the same Activity
instance in a voice channel and race to produce the most slop.

## What a Discord Activity is (do not get this wrong)

- A web app that runs in an **iframe** inside the Discord client.
- It talks to the client via the **Embedded App SDK** (`@discord/embedded-app-sdk`):
  `new DiscordSDK(clientId)`, `await sdk.ready()`, `sdk.commands.authenticate({access_token})`.
- `sdk.instanceId` is available immediately — it is the key for the shared
  multiplayer instance.
- `sdk.commands.getActivityInstanceConnectedParticipants()` fetches the users
  currently in the instance; `Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE`
  subscribes to changes.
- User avatar: `https://cdn.discordapp.com/avatars/{id}/{avatar}.png?size=256`
  (fallback: `https://cdn.discordapp.com/embed/avatars/${(BigInt(id) >> 22n) % 6n}.png`).
- Read the official docs while building:
  - https://docs.discord.com/developers/activities/development-guides/multiplayer-experience
  - https://docs.discord.com/developers/activities/building-an-activity
- SDK reference: https://github.com/discord/embedded-app-sdk

## Game design (the fun part — make it actually funny)

**SLOPWORKS: The AI Slop Factory.**

- Core loop: click the big **SLOP** button (a giant glitchy gradient blob) →
  produce `slop` units. Each click also spits a short, absurd generated slop
  phrase onto a scrolling "output tape" feed (see the phrase list below —
  write 80+ original ones in the same style; these are examples):
  - "🌊🚀 7 habits of hyper-mindful blockchain gurus (with free PDF!)"
  - "I asked an LLM to write me a novel. It wrote me a novel about writing a novel."
  - "This AI-generated face has 7 eyes and 11 fingers. It's so real."
  - "Synergy-unleashing thought-leadership for the agentic era 💡"
  - "10 tips to future-proof your career from the future. Tips 8-10 are just vibes."
  - "My AI boyfriend said I'm 'emotionally unavailable' so I deleted him. He respawned."
  - "The robot overlords have been very polite about it, honestly."
- **Upgrades** (costs and effects are yours to tune for a good curve; the
  names are the point):
  - "GPT-4 Subscription" — +slop/click
  - "Midjourney Pro (11 eyes included)" — +slop/sec
  - "Viral Hashtag Bot" — multiplier
  - "AI Assistant Clone (it talks over you)" — +slop/sec
  - "Prompt Injection Side Hustle" — multiplier
  - "Recursive Self-Improvement™" — big multiplier, very expensive
- **Random events** (fire every ~30–60s, shown as a banner, last ~10s):
  "Your slop went viral — x2 production!", "An AI generated a bug report about
  your AI — x3 production!", "The model hallucinated a refund — -slop", etc.
- **Live leaderboard**: every participant's avatar + Discord username + total
  slop, sorted, real-time. Crown the leader with a "SLOP LORD 👑" badge.
- **Win condition** (optional, light): first to 10,000 slop wins the round;
  then a confetti/glitch explosion and a "rematch?" state. Keep it
  non-punishing — losers keep their fun.
- Aesthetic: **deliberately ugly AI-slop look** — warped neon gradients,
  glitch text, Comic-Sans-adjacent fonts, garbled emoji, "AI: I'm so happy
  you asked!" toasts. Cozy enough to not hurt, chaotic enough to be funny.
  Responsive: must work in a ~500px-wide activity tile and a full window.
- **Zero external CDNs for the SDK**: bundle the SDK locally (npm).

## Multiplayer architecture

- `sdk.instanceId` identifies the shared instance.
- A **backend** holds authoritative instance state: per-user `slop` total,
  upgrades owned, event state, winner. Clients POST their clicks/purchases
  (debounced/batched, e.g. every 500ms or on action) and receive state
  updates (SSE or WebSocket — your call; keep it simple).
- Participant membership comes from the SDK participant API (not the
  backend). The backend keys state by `instanceId` and `userId`.
- Clean up instance state when all participants leave (TTL sweep is fine).
- The SDK gives you the authenticated user via
  `sdk.commands.authenticate({ access_token })` → `user.id`. Use `user.id`
  for all backend state.

## Tech

- **Frontend**: Vite + vanilla JS (no framework needed) in `game/client/`.
- **Backend**: Node + Express + (ws or SSE) in `game/server/`.
- **Shared state**: in-memory Map is fine (this is a party game, not a bank).
- `client` needs a `CLIENT_ID` at runtime (from the SDK's `ready` payload or
  env `DISCORD_CLIENT_ID` — the official template passes it as a query param
  the server injects; follow the official
  `discord/getting-started-activity` template pattern for this).
- Dev flow (document in `game/README.md`):
  1. `cd game/client && npm i && npm run build` (or dev)
  2. `cd game/server && npm i && npm start` → serves the client build + API on :3000
  3. `cloudflared tunnel --url http://localhost:3000` → tunnel URL
  4. Dev portal → app → **Activities** → URL mapping `/` = tunnel host.
  (cloudflared is installed at `~/.local/bin/cloudflared`.)
- `.env` in `game/` with `DISCORD_CLIENT_ID=` (fill after the dev-portal app
  exists). `.env` must be gitignored; commit a `.env.example`.

## Repo rules (strict)

- `git init` was already done at the project root (this spec's directory).
- **Commit as you go** — after each working milestone (scaffold, game logic,
  multiplayer, polish). Conventional-ish messages. Never commit `.env`.
- Do NOT touch anything outside `~/HydrocarbonForge/Projects/forge-activity/`.

## Definition of done

1. `game/client` + `game/server` build and run: `npm start` in server serves
   the game at `http://localhost:3000` (HTML page renders the game, even
   outside Discord — it must degrade gracefully: if the SDK fails to connect,
   show the game with a local fake identity "guest" so it's playable/testable
   in a plain browser).
2. Multiplayer works: two browser tabs on the same `?instance=devtest` URL
   (a manual dev-mode instance fallback when no Discord instanceId) see each
   other's slop totals live.
3. Leaderboard, events, upgrades, and the output-tape feed all work.
4. `curl -s localhost:3000 | head` returns the game HTML; the API responds.
5. README explains the dev-portal steps (create app, enable Activities, set
   URL mapping, entry-point command) and the cloudflared tunnel flow.
6. Git history has real incremental commits; working tree is clean.

## Constraints

- Node 26 / npm available. No cloud accounts, no API keys besides the
  `DISCORD_CLIENT_ID` placeholder.
- Keep total bundle small (< 500KB) — it's a party game, not an MMO.
- No `eval`, no sketchy deps. Pin to stable, well-known packages.
