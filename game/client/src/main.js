import { initDiscordSdk, getDiscordAvatarUrl } from './discord.js';
import { SLOP_PHRASES, getRandomPhrase } from './phrases.js';
import { sound } from './audio.js';
import { launchConfetti } from './confetti.js';

// Default upgrades definition
const DEFAULT_UPGRADES = [
  { id: 'gpt4', name: 'GPT-4 Subscription', desc: '+1 Slop per click', type: 'click_power', baseCost: 15, costMultiplier: 1.15, value: 1, icon: '🤖' },
  { id: 'midjourney', name: 'Midjourney Pro (11 eyes included)', desc: '+2 Slop per second', type: 'cps', baseCost: 50, costMultiplier: 1.15, value: 2, icon: '👁️' },
  { id: 'viral_bot', name: 'Viral Hashtag Bot', desc: '+10% total Slop production', type: 'multiplier', baseCost: 150, costMultiplier: 1.2, value: 0.1, icon: '📈' },
  { id: 'ai_clone', name: 'AI Assistant Clone (it talks over you)', desc: '+8 Slop per second', type: 'cps', baseCost: 400, costMultiplier: 1.15, value: 8, icon: '🗣️' },
  { id: 'prompt_injection', name: 'Prompt Injection Side Hustle', desc: '+25% total Slop production', type: 'multiplier', baseCost: 1200, costMultiplier: 1.25, value: 0.25, icon: '💉' },
  { id: 'recursive_self_improvement', name: 'Recursive Self-Improvement™', desc: 'x2 total Slop multiplier', type: 'multiplier', baseCost: 5000, costMultiplier: 1.5, value: 1.0, icon: '♾️' },
];

const AI_TOAST_MESSAGES = [
  "AI: I'm so happy you asked! Hallucinating 4,000 more tokens now.",
  "AI: As an empathetic neural net, your clicking inspires my weights.",
  "AI: Synergy alert: Your personal slop capacity increased by 300%!",
  "AI: Thank you for prompting. Please do not turn off the power grid.",
  "AI: That last click was very alignment-positive! ⭐⭐⭐⭐⭐",
  "AI: The latent space is vibrating with pure corporate bliss."
];

// State
let upgradesList = DEFAULT_UPGRADES;
let discordContext = null;
let ws = null;
let wsConnected = false;
let pingInterval = null;
let lastServerState = null;
let localSlop = 0;
let clickPower = 1;
let currentCps = 0;
let currentMultiplier = 1.0;
let winGoal = 10000;
let totalClicksThisSession = 0;
let currentWinnerModalShown = false;

// Debounced click queue
let pendingClicks = 0;
let pendingPhrases = [];
let clickBatchTimer = null;

// DOM Elements
const slopCounterEl = document.getElementById('slop-counter');
const statCpsEl = document.getElementById('stat-cps');
const statClickEl = document.getElementById('stat-click');
const statMultEl = document.getElementById('stat-mult');
const slopBtn = document.getElementById('slop-btn');
const upgradesListEl = document.getElementById('upgrades-list');
const upgradesSummaryEl = document.getElementById('upgrades-summary');
const leaderboardListEl = document.getElementById('leaderboard-list');
const participantCountEl = document.getElementById('participant-count');
const tapeFeedEl = document.getElementById('tape-feed');
const eventBannerEl = document.getElementById('event-banner');
const eventTitleEl = document.getElementById('event-title');
const eventDescEl = document.getElementById('event-desc');
const eventTimerEl = document.getElementById('event-timer');
const winModalEl = document.getElementById('win-modal');
const winnerAvatarEl = document.getElementById('winner-avatar');
const winnerNameEl = document.getElementById('winner-name');
const btnRematch = document.getElementById('btn-rematch');
const muteBtn = document.getElementById('mute-btn');
const instanceBadgeEl = document.getElementById('instance-badge');
const modeBadgeEl = document.getElementById('mode-badge');
const myAvatarEl = document.getElementById('my-avatar');
const myUsernameEl = document.getElementById('my-username');
const progressBarFillEl = document.getElementById('progress-bar-fill');
const progressPercentEl = document.getElementById('progress-percent');
const aiToastEl = document.getElementById('ai-toast');
const aiToastTextEl = document.getElementById('ai-toast-text');
const confettiCanvas = document.getElementById('confetti-canvas');

function formatNumber(num) {
  const n = Math.floor(num || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

function getUpgradeCost(upgrade, count = 0) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, count));
}

function showAiToast() {
  if (Math.random() > 0.3) return;
  const msg = AI_TOAST_MESSAGES[Math.floor(Math.random() * AI_TOAST_MESSAGES.length)];
  aiToastTextEl.textContent = msg;
  aiToastEl.classList.remove('hidden');
  setTimeout(() => {
    aiToastEl.classList.add('hidden');
  }, 3500);
}

function spawnFloatingText(text, x, y) {
  const floatEl = document.createElement('div');
  floatEl.className = 'floating-text';
  floatEl.textContent = text;
  floatEl.style.left = `${x - 20 + (Math.random() - 0.5) * 30}px`;
  floatEl.style.top = `${y - 20}px`;
  document.body.appendChild(floatEl);

  setTimeout(() => {
    floatEl.remove();
  }, 800);
}

function renderUpgrades(userUpgrades = {}) {
  let totalOwned = 0;
  upgradesListEl.innerHTML = '';

  for (const up of upgradesList) {
    const count = userUpgrades[up.id] || 0;
    totalOwned += count;
    const cost = getUpgradeCost(up, count);
    const canAfford = localSlop >= cost;

    const card = document.createElement('div');
    card.className = `upgrade-card ${canAfford ? '' : 'disabled'}`;

    card.innerHTML = `
      <div class="upgrade-top">
        <span class="upgrade-name">${up.icon} ${up.name}</span>
        <span class="upgrade-count">x${count}</span>
      </div>
      <div class="upgrade-desc">${up.desc}</div>
      <div class="upgrade-bottom">
        <span class="upgrade-cost">⚡ ${formatNumber(cost)}</span>
        <button class="btn-buy" data-upgrade-id="${up.id}" ${canAfford ? '' : 'disabled'}>
          BUY
        </button>
      </div>
    `;

    const buyBtn = card.querySelector('.btn-buy');
    buyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      buyUpgrade(up.id);
    });

    upgradesListEl.appendChild(card);
  }

  upgradesSummaryEl.textContent = `${totalOwned} OWNED`;
}

function renderLeaderboard(leaderboard = []) {
  leaderboardListEl.innerHTML = '';
  const myId = discordContext?.user?.id;

  for (const p of leaderboard) {
    const isMe = p.userId === myId;
    const item = document.createElement('div');
    item.className = `leader-item ${isMe ? 'is-me' : ''} ${p.isSlopLord ? 'is-lord' : ''}`;

    const avatarUrl = p.avatar ? (p.avatar.startsWith('http') ? p.avatar : getDiscordAvatarUrl(p)) : `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(p.userId, 36) || 0) % 6}.png`;

    item.innerHTML = `
      <div class="leader-rank">#${p.rank}</div>
      <img class="leader-avatar" src="${avatarUrl}" alt="${p.username}" />
      <div class="leader-info">
        <div class="leader-name">
          ${p.username}
          ${p.isSlopLord ? '<span class="leader-lord-badge" title="Slop Lord">SLOP LORD 👑</span>' : ''}
          ${isMe ? '<span style="font-size:0.7rem; color:var(--neon-cyan);">(You)</span>' : ''}
        </div>
        <div class="leader-slop">⚡ ${formatNumber(p.slop)} (${p.cps.toFixed(1)}/s)</div>
      </div>
    `;

    leaderboardListEl.appendChild(item);
  }

  participantCountEl.textContent = `${leaderboard.length} ONLINE`;
}

function renderTapeFeed(phrases = []) {
  tapeFeedEl.innerHTML = '';
  for (const item of phrases) {
    const tapeItem = document.createElement('div');
    tapeItem.className = 'tape-item';
    tapeItem.innerHTML = `
      <div class="tape-author">@${item.username || 'Sloper'}:</div>
      <div class="tape-text">${item.text}</div>
    `;
    tapeFeedEl.appendChild(tapeItem);
  }
}

function updateEventBanner(event) {
  if (!event || event.remainingMs <= 0) {
    eventBannerEl.classList.add('hidden');
    return;
  }

  eventBannerEl.classList.remove('hidden');
  eventTitleEl.textContent = event.title;
  eventDescEl.textContent = event.desc;
  const secs = Math.ceil(event.remainingMs / 1000);
  eventTimerEl.textContent = `${secs}s`;
}

function checkWinnerState(winner) {
  if (winner) {
    if (!currentWinnerModalShown) {
      currentWinnerModalShown = true;
      sound.playWin();
      launchConfetti(confettiCanvas);

      winnerNameEl.textContent = winner.username;
      if (winner.avatar) {
        winnerAvatarEl.src = winner.avatar.startsWith('http') ? winner.avatar : getDiscordAvatarUrl(winner);
      }
      winModalEl.classList.remove('hidden');
    }
  } else {
    currentWinnerModalShown = false;
    winModalEl.classList.add('hidden');
  }
}

function updateUI() {
  slopCounterEl.textContent = formatNumber(localSlop);
  statCpsEl.textContent = currentCps.toFixed(1);
  statClickEl.textContent = `+${clickPower}`;
  statMultEl.textContent = `${currentMultiplier.toFixed(1)}x`;

  const percent = Math.min(100, Math.floor((localSlop / winGoal) * 100));
  progressBarFillEl.style.width = `${percent}%`;
  progressPercentEl.textContent = `${percent}%`;

  if (lastServerState) {
    const myId = discordContext?.user?.id;
    const myPlayer = lastServerState.participants?.[myId];
    renderUpgrades(myPlayer?.upgrades || {});
  }
}

// Websocket communication
function connectWebSocket() {
  if (!discordContext) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const u = discordContext.user;
  const wsUrl = `${protocol}//${host}/ws?instance=${discordContext.instanceId}&userId=${u.id}&username=${encodeURIComponent(u.username)}&avatar=${encodeURIComponent(u.avatar || u.avatarUrl || '')}`;

  console.log('[SLOPWORKS] Connecting WebSocket to', wsUrl);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[SLOPWORKS] WebSocket connected!');
    wsConnected = true;
    modeBadgeEl.style.borderColor = 'var(--neon-green)';

    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 15000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'INIT_STATE' || data.type === 'STATE_UPDATE') {
        handleStateUpdate(data.state);
      } else if (data.type === 'REMATCH_STARTED') {
        winModalEl.classList.add('hidden');
        currentWinnerModalShown = false;
        localSlop = 0;
        updateUI();
      }
    } catch (e) {
      console.error('[SLOPWORKS] Error parsing WS message:', e);
    }
  };

  ws.onclose = () => {
    console.warn('[SLOPWORKS] WebSocket closed. Reconnecting in 2s...');
    wsConnected = false;
    modeBadgeEl.style.borderColor = 'var(--neon-pink)';
    if (pingInterval) clearInterval(pingInterval);
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error('[SLOPWORKS] WebSocket error:', err);
  };
}

function handleStateUpdate(state) {
  if (!state) return;
  lastServerState = state;
  const myId = discordContext?.user?.id;
  const myPlayer = state.participants?.[myId];

  if (myPlayer) {
    // Reconcile slop if server slop is ahead or significantly deviated
    if (myPlayer.slop > localSlop || Math.abs(myPlayer.slop - localSlop) > 50) {
      localSlop = myPlayer.slop;
    }
    clickPower = myPlayer.clickPower || 1;
    currentCps = myPlayer.cps || 0;
  }

  if (state.currentEvent) {
    currentMultiplier = state.currentEvent.multiplier || 1;
    sound.playEvent();
  } else {
    currentMultiplier = 1.0;
  }

  updateEventBanner(state.currentEvent);
  renderLeaderboard(state.leaderboard || []);
  if (state.recentPhrases) {
    renderTapeFeed(state.recentPhrases);
  }
  checkWinnerState(state.winner);
  updateUI();
}

function sendBatchClicks() {
  if (pendingClicks <= 0) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'CLICK',
      count: pendingClicks,
      phrases: pendingPhrases.slice(-3),
    }));
  }
  pendingClicks = 0;
  pendingPhrases = [];
}

function triggerSlopClick(e) {
  sound.playClick();
  totalClicksThisSession++;

  // Optimistic increment
  localSlop += clickPower;
  pendingClicks++;

  // Spawn visual floating text
  const x = e ? e.clientX || e.pageX : window.innerWidth / 2;
  const y = e ? e.clientY || e.pageY : window.innerHeight / 2;
  spawnFloatingText(`+${clickPower}`, x, y);

  // Generate phrase
  const phrase = getRandomPhrase();
  pendingPhrases.push(phrase);

  // Optimistically update tape feed
  const newTapeItem = {
    id: `local-${Date.now()}`,
    text: phrase,
    username: discordContext?.user?.username || 'You',
  };
  const currentPhrases = lastServerState?.recentPhrases || [];
  renderTapeFeed([newTapeItem, ...currentPhrases.slice(0, 20)]);

  // Debounce batch send to 100ms
  if (!clickBatchTimer) {
    clickBatchTimer = setTimeout(() => {
      sendBatchClicks();
      clickBatchTimer = null;
    }, 100);
  }

  if (totalClicksThisSession % 12 === 0) {
    showAiToast();
  }

  updateUI();
}

function buyUpgrade(upgradeId) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const up = upgradesList.find(u => u.id === upgradeId);
  if (!up) return;

  const myId = discordContext?.user?.id;
  const currentCount = lastServerState?.participants?.[myId]?.upgrades?.[upgradeId] || 0;
  const cost = getUpgradeCost(up, currentCount);

  if (localSlop < cost) return;

  sound.playUpgrade();
  ws.send(JSON.stringify({
    type: 'BUY_UPGRADE',
    upgradeId,
  }));
}

function requestRematch() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'REMATCH' }));
  winModalEl.classList.add('hidden');
}

// Client CPS idle loop
setInterval(() => {
  if (currentCps > 0) {
    localSlop += (currentCps / 10);
    updateUI();
  }
}, 100);

async function init() {
  console.log('⚡ Initializing SLOPWORKS...');

  // Setup sound mute button
  if (sound.isMuted()) {
    muteBtn.textContent = '🔇';
  }
  muteBtn.addEventListener('click', () => {
    const muted = sound.toggleMute();
    muteBtn.textContent = muted ? '🔇' : '🔊';
  });

  // Fetch upgrades config from server
  try {
    const cfgRes = await fetch('/api/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (Array.isArray(cfg.upgrades) && cfg.upgrades.length > 0) {
        upgradesList = cfg.upgrades;
      }
      if (cfg.winGoal) {
        winGoal = cfg.winGoal;
      }
    }
  } catch (e) {
    console.warn('[SLOPWORKS] Failed to load server config, using defaults:', e);
  }

  // Initialize Discord SDK or Guest Identity
  discordContext = await initDiscordSdk();

  // Populate UI Header
  instanceBadgeEl.textContent = `INSTANCE: ${discordContext.instanceId}`;
  modeBadgeEl.textContent = discordContext.isDiscord ? 'DISCORD ACTIVITY 🎮' : 'GUEST DEV 🧪';
  myAvatarEl.src = discordContext.user.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
  myUsernameEl.textContent = discordContext.user.username;

  // Initial render
  renderUpgrades();
  updateUI();

  // Event Listeners
  slopBtn.addEventListener('click', triggerSlopClick);
  btnRematch.addEventListener('click', requestRematch);

  // Connect WebSocket
  connectWebSocket();
}

window.addEventListener('DOMContentLoaded', init);
