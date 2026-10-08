# 🧠 SLOPWORKS — The AI Slop Factory

A multiplayer **Discord Activity** party game about producing absurd, garbled "AI slop" together in a Discord voice channel.

Built with **Vite + Vanilla JS** on the client, `@discord/embedded-app-sdk` bundled locally (0 external CDNs), and an authoritative **Node.js + Express + WebSocket** backend.

---

## 🎮 Game Features

- **Core Loop:** Click the giant glitchy gradient **SLOP** blob to produce units of synthetic slop. Each click spits hilarious AI-slop phrases onto a scrolling output tape (100+ original absurd phrases).
- **Upgrades Shop:**
  1. *GPT-4 Subscription* (+1 Slop/click)
  2. *Midjourney Pro (11 eyes included)* (+2 Slop/sec)
  3. *Viral Hashtag Bot* (+10% total Slop production)
  4. *AI Assistant Clone (it talks over you)* (+8 Slop/sec)
  5. *Prompt Injection Side Hustle* (+25% total Slop production)
  6. *Recursive Self-Improvement™* (x2 total Slop multiplier)
- **Random Events:** Periodic events (e.g., *Your slop went viral!*, *AI generated a bug report about your AI!*, *Model hallucinated a refund!*, *Liquid nitrogen GPU overclock!*) with live banners and multipliers.
- **Live Leaderboard:** Real-time synchronized rankings with Discord avatars, usernames, and a **SLOP LORD 👑** crown for the top producer.
- **Win Condition & Rematch:** First to 10,000 slop triggers a victory confetti explosion and enables the instant rematch button.
- **Deliberately Ugly Cyber-Neon Aesthetic:** Warped neon gradients, glitch typography, Comic-Sans accents, Web Audio API sound effects, and responsive layout down to ~500px activity tiles.
- **Graceful Degradation:** Runs seamlessly inside Discord or in standalone browser tabs as a guest identity (`?instance=devtest`).

---

## 🛠️ Architecture & Tech Stack

- **Frontend (`game/client`)**:
  - Vite + Vanilla JS.
  - `@discord/embedded-app-sdk` (bundled locally, no external CDN dependencies).
  - Canvas confetti particle engine (zero runtime dependencies).
  - Web Audio API synthesizer for retro sound effects without external audio assets.
- **Backend (`game/server`)**:
  - Node.js + Express + `ws` WebSocket engine.
  - Authoritative in-memory state engine keyed by `instanceId` and `userId`.
  - Background ticker calculating CPS and managing random events.
  - Static file server hosting `game/client/dist` on port 3000.

---

## 🚀 Local Development & Dev Flow

### 1. Build Client & Start Server
```bash
# Build frontend
cd game/client
npm install
npm run build

# Start authoritative server
cd ../server
npm install
npm start
```
The server will start at `http://localhost:3000`.

### 2. Multi-Tab Testing (No Discord Required)
Open two separate browser tabs at:
```text
http://localhost:3000/?instance=devtest
```
Each tab receives an independent guest identity and synchronizes live clicks, upgrades, and leaderboard rankings across the shared `devtest` room.

---

## 🌐 Connecting to Discord Developer Portal

Follow these exact steps to run SLOPWORKS as an Activity inside Discord:

### Step 1: Create Discord Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **"New Application"** in the top right.
3. Enter name: `SLOPWORKS` and accept the Developer Terms.
4. Go to **General Information** and copy your **Application ID** (`DISCORD_CLIENT_ID`).

### Step 2: Enable Activities
1. In your application dashboard, navigate to **Activities** (or **Embedded App SDK**).
2. Click **"Enable Activity"** / agree to terms.
3. Set the Activity orientation, supported platforms (Desktop, Web, Mobile), and age rating.

### Step 3: Start Cloudflared Tunnel
`cloudflared` is installed at `~/.local/bin/cloudflared`. Run:
```bash
~/.local/bin/cloudflared tunnel --url http://localhost:3000
```
`cloudflared` will output a public HTTPS tunnel URL, for example:
```text
https://random-words-here.trycloudflare.com
```

### Step 4: Configure URL Mapping in Developer Portal
1. In the Developer Portal, go to **Activities** -> **URL Mappings**.
2. Add a mapping:
   - **Prefix:** `/`
   - **Target:** The tunnel hostname without `https://` (e.g. `random-words-here.trycloudflare.com`).
3. Save changes.

### Step 5: Configure Environment Variables
1. Go to **OAuth2** tab in Developer Portal and reset/copy your **Client Secret**.
2. In `game/.env` (gitignored), configure:
```env
PORT=3000
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
```
3. Restart the server: `npm start` in `game/server`.

### Step 6: Test in Discord
1. Join any Voice Channel in a Discord server where your application is installed or enabled for testing.
2. Click the **Rocket icon** 🚀 (*"Start an Activity"* / *"Choose an Activity"*).
3. Select **SLOPWORKS**.
4. Discord will load the Activity in an embedded iframe, authenticate your Discord user profile and avatar, and key multiplayer state by the voice channel's `sdk.instanceId`.

---

## 🧪 Verification & Automated Tests

Run the automated integration and end-to-end test suite:
```bash
# Server unit & integration test:
cd game/server
npm test

# Full End-to-End two-tab verification:
node test/e2e-verification.js
```

Or verify with `curl`:
```bash
curl -s http://localhost:3000 | head -n 20
curl -s http://localhost:3000/api/health
curl -s http://localhost:3000/api/config
```
