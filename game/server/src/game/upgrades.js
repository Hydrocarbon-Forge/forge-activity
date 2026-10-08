export const UPGRADES = [
  {
    id: 'gpt4',
    name: 'GPT-4 Subscription',
    desc: '+1 Slop per click',
    type: 'click_power',
    baseCost: 15,
    costMultiplier: 1.15,
    value: 1,
    icon: '🤖',
  },
  {
    id: 'midjourney',
    name: 'Midjourney Pro (11 eyes included)',
    desc: '+2 Slop per second',
    type: 'cps',
    baseCost: 50,
    costMultiplier: 1.15,
    value: 2,
    icon: '👁️',
  },
  {
    id: 'viral_bot',
    name: 'Viral Hashtag Bot',
    desc: '+10% total Slop production',
    type: 'multiplier',
    baseCost: 150,
    costMultiplier: 1.2,
    value: 0.1,
    icon: '📈',
  },
  {
    id: 'ai_clone',
    name: 'AI Assistant Clone (it talks over you)',
    desc: '+8 Slop per second',
    type: 'cps',
    baseCost: 400,
    costMultiplier: 1.15,
    value: 8,
    icon: '🗣️',
  },
  {
    id: 'prompt_injection',
    name: 'Prompt Injection Side Hustle',
    desc: '+25% total Slop production',
    type: 'multiplier',
    baseCost: 1200,
    costMultiplier: 1.25,
    value: 0.25,
    icon: '💉',
  },
  {
    id: 'recursive_self_improvement',
    name: 'Recursive Self-Improvement™',
    desc: 'x2 total Slop multiplier',
    type: 'multiplier',
    baseCost: 5000,
    costMultiplier: 1.5,
    value: 1.0,
    icon: '♾️',
  },
];

export function getUpgradeCost(upgrade, currentCount = 0) {
  return Math.floor(upgrade.baseCost * Math.pow(upgrade.costMultiplier, currentCount));
}

export function calculatePlayerStats(upgrades = {}, activeEvent = null) {
  let baseClickPower = 1;
  let baseCps = 0;
  let multiplierBonus = 0;

  for (const up of UPGRADES) {
    const count = upgrades[up.id] || 0;
    if (count <= 0) continue;

    if (up.type === 'click_power') {
      baseClickPower += count * up.value;
    } else if (up.type === 'cps') {
      baseCps += count * up.value;
    } else if (up.type === 'multiplier') {
      multiplierBonus += count * up.value;
    }
  }

  const baseMultiplier = 1 + multiplierBonus;
  let eventMultiplier = 1;
  let eventClickMultiplier = 1;

  if (activeEvent) {
    if (activeEvent.multiplier) {
      eventMultiplier = activeEvent.multiplier;
    }
    if (activeEvent.clickMultiplier) {
      eventClickMultiplier = activeEvent.clickMultiplier;
    }
  }

  const effectiveClickPower = Math.max(1, Math.round(baseClickPower * baseMultiplier * eventMultiplier * eventClickMultiplier));
  const effectiveCps = Math.max(0, +(baseCps * baseMultiplier * eventMultiplier).toFixed(1));

  return {
    clickPower: effectiveClickPower,
    cps: effectiveCps,
    baseClickPower,
    baseCps,
    multiplier: +(baseMultiplier * eventMultiplier).toFixed(2),
  };
}
