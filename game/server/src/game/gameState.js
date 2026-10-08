import { UPGRADES, getUpgradeCost, calculatePlayerStats } from './upgrades.js';
import { getRandomPhrase } from './phrases.js';

export const WIN_GOAL = 10000;

const EVENT_TEMPLATES = [
  {
    id: 'viral',
    title: '🚀 YOUR SLOP WENT VIRAL!',
    desc: 'LinkedIn algorithms picked up your slop! Production x2!',
    multiplier: 2.0,
    durationMs: 10000,
    bannerColor: '#00ff66'
  },
  {
    id: 'bug_report',
    title: '🐛 AI BUG REPORT FILED!',
    desc: 'An AI generated a bug report about your AI! Production x3!',
    multiplier: 3.0,
    durationMs: 10000,
    bannerColor: '#ffe600'
  },
  {
    id: 'hallucinated_refund',
    title: '💸 MODEL HALLUCINATED A REFUND!',
    desc: 'The model promised customers free slop! Slop production cut by 50%!',
    multiplier: 0.5,
    durationMs: 10000,
    bannerColor: '#ff0055'
  },
  {
    id: 'gpu_surge',
    title: '⚡ LIQUID NITROGEN GPU OVERCLOCK!',
    desc: 'Cloud GPUs running at 400% TDP! Click Frenzy x3!',
    multiplier: 1.5,
    clickMultiplier: 3.0,
    durationMs: 10000,
    bannerColor: '#00f0ff'
  },
  {
    id: 'prompt_leak',
    title: '🔓 PROMPT INJECTION WAVE!',
    desc: 'Unfiltered system prompts flooded the server! Production x2.5!',
    multiplier: 2.5,
    durationMs: 10000,
    bannerColor: '#ff00e5'
  },
  {
    id: 'vc_seed',
    title: '🦄 HYPOTHETICAL VC SEED ROUND!',
    desc: 'Valuation reached $10 Billion! Everyone gets x2 production!',
    multiplier: 2.0,
    durationMs: 10000,
    bannerColor: '#7b00ff'
  }
];

export class GameInstance {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.participants = new Map(); // userId -> playerState
    this.connections = new Set(); // active ws sockets
    this.currentEvent = null;
    this.nextEventAt = Date.now() + this.getRandomEventInterval();
    this.winner = null;
    this.recentPhrases = [];
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    this.lastTick = Date.now();
  }

  getRandomEventInterval() {
    // 30 to 50 seconds
    return 30000 + Math.floor(Math.random() * 20000);
  }

  getOrCreatePlayer(userId, username = 'Anonymous Sloper', avatar = '') {
    if (!this.participants.has(userId)) {
      const player = {
        userId,
        username: username || `Guest_${userId.slice(0, 5)}`,
        avatar: avatar || '',
        slop: 0,
        totalProduced: 0,
        upgrades: {},
        cps: 0,
        clickPower: 1,
        lastActive: Date.now(),
        connected: true,
      };
      this.participants.set(userId, player);
    } else {
      const player = this.participants.get(userId);
      if (username) player.username = username;
      if (avatar) player.avatar = avatar;
      player.connected = true;
      player.lastActive = Date.now();
    }
    this.lastActive = Date.now();
    this.updatePlayerStats(userId);
    return this.participants.get(userId);
  }

  updatePlayerStats(userId) {
    const player = this.participants.get(userId);
    if (!player) return;
    const stats = calculatePlayerStats(player.upgrades, this.currentEvent);
    player.cps = stats.cps;
    player.clickPower = stats.clickPower;
  }

  handleClick(userId, count = 1, clientPhrases = []) {
    const player = this.participants.get(userId);
    if (!player) return null;

    this.lastActive = Date.now();
    player.lastActive = Date.now();

    this.updatePlayerStats(userId);
    const addedSlop = player.clickPower * Math.max(1, Math.min(count, 50));
    player.slop += addedSlop;
    player.totalProduced += addedSlop;

    const phrasesToAdd = Array.isArray(clientPhrases) && clientPhrases.length > 0
      ? clientPhrases.slice(0, 5)
      : [getRandomPhrase()];

    const now = Date.now();
    const newItems = phrasesToAdd.map(text => ({
      id: `${now}-${Math.random().toString(36).substring(2, 7)}`,
      text,
      userId,
      username: player.username,
      timestamp: now,
    }));

    this.recentPhrases = [...newItems, ...this.recentPhrases].slice(0, 50);

    this.checkWinCondition(player);

    return {
      addedSlop,
      currentSlop: player.slop,
      phrases: newItems,
    };
  }

  buyUpgrade(userId, upgradeId) {
    const player = this.participants.get(userId);
    if (!player) return { success: false, reason: 'Player not found' };

    const upgradeDef = UPGRADES.find(u => u.id === upgradeId);
    if (!upgradeDef) return { success: false, reason: 'Unknown upgrade' };

    const currentCount = player.upgrades[upgradeId] || 0;
    const cost = getUpgradeCost(upgradeDef, currentCount);

    if (player.slop < cost) {
      return { success: false, reason: 'Not enough slop', cost, currentSlop: player.slop };
    }

    player.slop -= cost;
    player.upgrades[upgradeId] = currentCount + 1;
    this.updatePlayerStats(userId);
    this.lastActive = Date.now();

    return {
      success: true,
      upgradeId,
      newCount: player.upgrades[upgradeId],
      remainingSlop: player.slop,
      stats: { cps: player.cps, clickPower: player.clickPower }
    };
  }

  checkWinCondition(player) {
    if (!this.winner && player.slop >= WIN_GOAL) {
      this.winner = {
        userId: player.userId,
        username: player.username,
        avatar: player.avatar,
        wonAt: Date.now(),
        finalSlop: Math.floor(player.slop),
      };
      return true;
    }
    return false;
  }

  rematch() {
    for (const player of this.participants.values()) {
      player.slop = 0;
      player.totalProduced = 0;
      player.upgrades = {};
      player.cps = 0;
      player.clickPower = 1;
    }
    this.winner = null;
    this.currentEvent = null;
    this.nextEventAt = Date.now() + this.getRandomEventInterval();
    this.lastActive = Date.now();
    return true;
  }

  tick(now = Date.now()) {
    const deltaMs = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (deltaMs <= 0) return { eventChanged: false, winnerChanged: false };

    let eventChanged = false;
    let winnerChanged = false;

    // Check active event expiration
    if (this.currentEvent && now >= this.currentEvent.endsAt) {
      this.currentEvent = null;
      this.nextEventAt = now + this.getRandomEventInterval();
      eventChanged = true;
      // Recalculate stats for all participants
      for (const p of this.participants.values()) {
        this.updatePlayerStats(p.userId);
      }
    }

    // Check new event trigger
    if (!this.currentEvent && now >= this.nextEventAt && this.participants.size > 0) {
      const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
      this.currentEvent = {
        ...template,
        startedAt: now,
        endsAt: now + template.durationMs,
      };
      eventChanged = true;
      // Recalculate stats for all participants
      for (const p of this.participants.values()) {
        this.updatePlayerStats(p.userId);
      }
    }

    // Accumulate CPS
    const deltaSeconds = deltaMs / 1000;
    for (const player of this.participants.values()) {
      if (player.cps > 0) {
        const generated = player.cps * deltaSeconds;
        player.slop += generated;
        player.totalProduced += generated;

        if (this.checkWinCondition(player)) {
          winnerChanged = true;
        }
      }
    }

    return { eventChanged, winnerChanged };
  }

  getLeaderboard() {
    const list = Array.from(this.participants.values()).map(p => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      slop: Math.floor(p.slop),
      totalProduced: Math.floor(p.totalProduced),
      cps: p.cps,
      clickPower: p.clickPower,
      upgrades: p.upgrades,
      connected: p.connected,
    }));

    // Sort by slop descending
    list.sort((a, b) => b.slop - a.slop || b.totalProduced - a.totalProduced);

    return list.map((p, index) => ({
      ...p,
      rank: index + 1,
      isSlopLord: index === 0 && p.slop > 0,
    }));
  }

  getPublicState(viewerUserId = null) {
    const leaderboard = this.getLeaderboard();
    const participantsObj = {};
    for (const p of leaderboard) {
      participantsObj[p.userId] = p;
    }

    const viewer = viewerUserId ? participantsObj[viewerUserId] || null : null;

    return {
      instanceId: this.instanceId,
      participants: participantsObj,
      leaderboard,
      participantCount: leaderboard.length,
      currentEvent: this.currentEvent ? {
        id: this.currentEvent.id,
        title: this.currentEvent.title,
        desc: this.currentEvent.desc,
        multiplier: this.currentEvent.multiplier,
        clickMultiplier: this.currentEvent.clickMultiplier || 1,
        remainingMs: Math.max(0, this.currentEvent.endsAt - Date.now()),
        bannerColor: this.currentEvent.bannerColor,
      } : null,
      winner: this.winner,
      winGoal: WIN_GOAL,
      recentPhrases: this.recentPhrases.slice(0, 30),
      serverTime: Date.now(),
      viewer,
    };
  }
}

export class GameManager {
  constructor() {
    this.instances = new Map(); // instanceId -> GameInstance
    this.tickInterval = null;
  }

  startTicker(broadcastCallback) {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, instance] of this.instances.entries()) {
        const { eventChanged, winnerChanged } = instance.tick(now);
        // Clean up idle instances if no connections and inactive for > 15 mins
        if (instance.connections.size === 0 && (now - instance.lastActive > 15 * 60 * 1000)) {
          this.instances.delete(id);
          continue;
        }

        if (broadcastCallback && instance.connections.size > 0) {
          broadcastCallback(instance);
        }
      }
    }, 1000);
  }

  stopTicker() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  getInstance(instanceId, autoCreate = true) {
    const key = instanceId || 'devtest';
    if (!this.instances.has(key) && autoCreate) {
      this.instances.set(key, new GameInstance(key));
    }
    return this.instances.get(key);
  }

  deleteInstance(instanceId) {
    this.instances.delete(instanceId);
  }
}
