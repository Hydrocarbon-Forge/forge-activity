<p align="center"><b>A multiplayer Discord Activity party game about making absurd AI slop together.</b></p>

<p align="center">
<a href="LICENSE"><img alt="license: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

---

# 🧠 SLOPWORKS — Discord Activity (Multiplayer Web App)

SLOPWORKS is a multiplayer Discord Activity party game about producing absurd, garbled "AI slop" together in a Discord voice channel.

Complete documentation, dev-portal setup, and cloudflared tunnel instructions are available in [game/README.md](game/README.md).

## Quickstart
```bash
# 1. Build client
cd game/client && npm install && npm run build

# 2. Start server
cd ../server && npm install && npm start

# 3. Test in browser
open http://localhost:3000/?instance=devtest
```
