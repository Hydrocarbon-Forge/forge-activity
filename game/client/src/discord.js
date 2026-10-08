import { DiscordSDK, Events } from '@discord/embedded-app-sdk';

const SLOP_GUEST_NAMES = [
  'PromptEngineer_42',
  'LLM_Whisperer_99',
  'TokenOverlord_7',
  'Hallucination_X',
  'MultiFinger_3000',
  'LatentSpace_Drifter',
  'VibeCoder_88',
  'NeuralGhost_13',
  'SynergyBro_69',
  'WoodGluePizza_404',
];

export function getDiscordAvatarUrl(user) {
  if (!user || !user.id) return 'https://cdn.discordapp.com/embed/avatars/0.png';
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
  }
  try {
    const idBig = BigInt(user.id);
    const index = (idBig >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch (e) {
    const fallbackIdx = Math.abs(parseInt(user.id, 36) || 0) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${fallbackIdx}.png`;
  }
}

export function createGuestIdentity() {
  const urlParams = new URLSearchParams(window.location.search);
  const instanceId = urlParams.get('instance') || urlParams.get('instanceId') || 'devtest';

  let guestId = sessionStorage.getItem('slopworks_guest_id');
  if (!guestId) {
    guestId = `guest_${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem('slopworks_guest_id', guestId);
  }

  let guestName = sessionStorage.getItem('slopworks_guest_name');
  if (!guestName) {
    const randName = SLOP_GUEST_NAMES[Math.floor(Math.random() * SLOP_GUEST_NAMES.length)];
    guestName = `${randName}_${Math.floor(Math.random() * 900 + 100)}`;
    sessionStorage.setItem('slopworks_guest_name', guestName);
  }

  let avatarIndex = sessionStorage.getItem('slopworks_guest_avatar_idx');
  if (!avatarIndex) {
    avatarIndex = Math.floor(Math.random() * 6).toString();
    sessionStorage.setItem('slopworks_guest_avatar_idx', avatarIndex);
  }

  const avatarUrl = `https://cdn.discordapp.com/embed/avatars/${avatarIndex}.png`;

  return {
    isDiscord: false,
    sdk: null,
    instanceId,
    user: {
      id: guestId,
      username: guestName,
      avatar: null,
      avatarUrl,
    },
    participants: [],
  };
}

export async function initDiscordSdk() {
  // 1. Fetch server config for clientId
  let clientId = '';
  try {
    const configRes = await fetch('/api/config');
    if (configRes.ok) {
      const config = await configRes.json();
      clientId = config.clientId || '';
    }
  } catch (e) {
    console.warn('[SLOPWORKS] Failed to fetch /api/config', e);
  }

  // Check URL query param fallback for client_id
  const urlParams = new URLSearchParams(window.location.search);
  if (!clientId && urlParams.get('client_id')) {
    clientId = urlParams.get('client_id');
  }

  // If no clientId or not in an iframe, quickly fall back to guest
  const inIframe = window.self !== window.top;
  if (!clientId || !inIframe) {
    console.log('[SLOPWORKS] Not in Discord iframe or no clientId configured. Using Guest mode.');
    return createGuestIdentity();
  }

  try {
    const discordSdk = new DiscordSDK(clientId);

    // Timeout ready() after 1500ms so plain browser loads don't stall
    const readyPromise = discordSdk.ready();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Discord SDK ready() timed out')), 1500)
    );

    await Promise.race([readyPromise, timeoutPromise]);
    console.log('[SLOPWORKS] Discord SDK ready! Instance ID:', discordSdk.instanceId);

    const instanceId = discordSdk.instanceId || 'discord-session';
    let authenticatedUser = null;

    // Attempt Discord OAuth authorization & authentication
    try {
      const { code } = await discordSdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds'],
      });

      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        const auth = await discordSdk.commands.authenticate({ access_token });
        authenticatedUser = auth.user;
        console.log('[SLOPWORKS] Discord authenticated user:', authenticatedUser.username);
      }
    } catch (authErr) {
      console.warn('[SLOPWORKS] Authorization failed or skipped:', authErr);
    }

    // Fallback user if auth was skipped or errored
    const user = authenticatedUser || {
      id: `discord_user_${Math.random().toString(36).substring(2, 8)}`,
      username: 'Discord Sloper',
      avatar: null,
    };

    user.avatarUrl = getDiscordAvatarUrl(user);

    let participants = [];
    try {
      const participantsData = await discordSdk.commands.getActivityInstanceConnectedParticipants();
      if (participantsData && participantsData.participants) {
        participants = participantsData.participants;
      }

      discordSdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, (update) => {
        if (update && update.participants && window.__onDiscordParticipantsUpdate) {
          window.__onDiscordParticipantsUpdate(update.participants);
        }
      });
    } catch (partErr) {
      console.warn('[SLOPWORKS] Failed to subscribe to participants:', partErr);
    }

    return {
      isDiscord: true,
      sdk: discordSdk,
      instanceId,
      user,
      participants,
    };
  } catch (err) {
    console.warn('[SLOPWORKS] Discord SDK init failed:', err.message);
    return createGuestIdentity();
  }
}
