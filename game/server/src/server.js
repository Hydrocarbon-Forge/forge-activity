import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from './game/gameState.js';
import { UPGRADES } from './game/upgrades.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current directory, parent directory (game/.env), or root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = parseInt(process.env.PORT, 10) || 3000;
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const gameManager = new GameManager();

// Broadcast state update to all sockets in an instance
function broadcastInstance(instance, customMessage = null) {
  if (!instance || !instance.connections) return;
  const state = instance.getPublicState();
  const payload = JSON.stringify(customMessage || {
    type: 'STATE_UPDATE',
    state,
  });

  for (const client of instance.connections) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }
}

// Start game manager CPS ticker
gameManager.startTicker((instance) => {
  broadcastInstance(instance);
});

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    game: 'SLOPWORKS',
    uptime: process.uptime(),
    activeInstances: gameManager.instances.size,
    timestamp: Date.now(),
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    clientId: process.env.DISCORD_CLIENT_ID || '',
    winGoal: 10000,
    upgrades: UPGRADES,
  });
});

app.post('/api/token', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({
      error: 'DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not configured on server',
    });
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokenData);
    }

    res.json({ access_token: tokenData.access_token });
  } catch (err) {
    console.error('Error exchanging oauth token:', err);
    res.status(500).json({ error: 'Failed to exchange token with Discord API' });
  }
});

app.get('/api/instance/:instanceId', (req, res) => {
  const instance = gameManager.getInstance(req.params.instanceId, true);
  res.json(instance.getPublicState());
});

app.post('/api/instance/:instanceId/action', (req, res) => {
  const { action, userId, username, avatar, count, phrases, upgradeId } = req.body;
  const instance = gameManager.getInstance(req.params.instanceId, true);

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  instance.getOrCreatePlayer(userId, username, avatar);

  if (action === 'click') {
    const result = instance.handleClick(userId, count || 1, phrases || []);
    broadcastInstance(instance);
    return res.json({ success: true, result, state: instance.getPublicState(userId) });
  }

  if (action === 'buy') {
    const result = instance.buyUpgrade(userId, upgradeId);
    broadcastInstance(instance);
    return res.json({ ...result, state: instance.getPublicState(userId) });
  }

  if (action === 'rematch') {
    instance.rematch();
    broadcastInstance(instance, { type: 'REMATCH_STARTED' });
    return res.json({ success: true, state: instance.getPublicState(userId) });
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
});

// Serve frontend dist build if present
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SLOPWORKS - Building</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { background: #120024; color: #00ff66; font-family: monospace; padding: 2rem; }
          </style>
        </head>
        <body>
          <h1>SLOPWORKS Server is Running!</h1>
          <p>Client build not detected at <code>${clientDistPath}</code>.</p>
          <p>Run <code>cd game/client && npm run build</code> to compile the client app.</p>
        </body>
      </html>
    `);
  });
}

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let instanceId = urlObj.searchParams.get('instance') || urlObj.searchParams.get('instanceId') || 'devtest';
  let userId = urlObj.searchParams.get('userId');
  let username = urlObj.searchParams.get('username') || 'Guest Sloper';
  let avatar = urlObj.searchParams.get('avatar') || '';

  let currentInstance = null;
  let currentUserId = userId;

  function bindToInstance(instId, uId, uName, uAvatar) {
    if (currentInstance) {
      currentInstance.connections.delete(ws);
    }
    instanceId = instId || 'devtest';
    currentUserId = uId;
    currentInstance = gameManager.getInstance(instanceId, true);
    currentInstance.connections.add(ws);

    if (currentUserId) {
      currentInstance.getOrCreatePlayer(currentUserId, uName, uAvatar);
    }

    // Send immediate initial state
    ws.send(JSON.stringify({
      type: 'INIT_STATE',
      state: currentInstance.getPublicState(currentUserId),
    }));

    // Broadcast updated player list
    broadcastInstance(currentInstance);
  }

  if (userId) {
    bindToInstance(instanceId, userId, username, avatar);
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        return;
      }

      if (msg.type === 'JOIN') {
        const { instanceId: newInstId, userId: newUId, username: newUName, avatar: newAvatar } = msg;
        bindToInstance(newInstId || instanceId, newUId, newUName, newAvatar);
        return;
      }

      if (!currentInstance || !currentUserId) return;

      if (msg.type === 'CLICK') {
        const { count, phrases } = msg;
        currentInstance.handleClick(currentUserId, count || 1, phrases || []);
        broadcastInstance(currentInstance);
        return;
      }

      if (msg.type === 'BUY_UPGRADE') {
        const { upgradeId } = msg;
        const result = currentInstance.buyUpgrade(currentUserId, upgradeId);
        if (result.success) {
          broadcastInstance(currentInstance);
        } else {
          ws.send(JSON.stringify({
            type: 'ACTION_FAILED',
            reason: result.reason,
            upgradeId,
          }));
        }
        return;
      }

      if (msg.type === 'REMATCH') {
        currentInstance.rematch();
        broadcastInstance(currentInstance, { type: 'REMATCH_STARTED' });
        return;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (currentInstance) {
      currentInstance.connections.delete(ws);
      if (currentUserId && currentInstance.participants.has(currentUserId)) {
        const player = currentInstance.participants.get(currentUserId);
        // Only mark disconnected if no other socket exists for this user
        let hasOtherSocket = false;
        for (const socket of currentInstance.connections) {
          if (socket !== ws && socket.userId === currentUserId) {
            hasOtherSocket = true;
            break;
          }
        }
        if (!hasOtherSocket) {
          player.connected = false;
        }
      }
      broadcastInstance(currentInstance);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket connection error:', err);
  });
});

export { app, server, gameManager };

if (process.env.NODE_ENV !== 'test' && !process.env.TEST_MODE) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SLOPWORKS server listening on port ${PORT}`);
    console.log(`🌐 Fallback dev URL: http://localhost:${PORT}/?instance=devtest`);
  });
}
