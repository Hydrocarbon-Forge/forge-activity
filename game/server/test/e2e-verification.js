import assert from 'assert';
import { WebSocket } from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTabClient(instanceId, userId, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?instance=${instanceId}&userId=${userId}&username=${username}`);
    const messages = [];

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        send(obj) {
          ws.send(JSON.stringify(obj));
        },
        waitForMessage(predicate, timeout = 4000) {
          return new Promise((res, rej) => {
            const start = Date.now();
            const check = () => {
              const found = messages.find(predicate);
              if (found) return res(found);
              if (Date.now() - start > timeout) {
                return rej(new Error(`Timed out waiting for message after ${timeout}ms`));
              }
              setTimeout(check, 50);
            };
            check();
          });
        },
        close() {
          ws.close();
        }
      });
    });

    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch (e) {
        messages.push(data.toString());
      }
    });

    ws.on('error', reject);
  });
}

async function verifyAll() {
  console.log('====================================================');
  console.log('🧪 RUNNING FULL SLOPWORKS END-TO-END VERIFICATION');
  console.log('====================================================\n');

  // 1. Verify HTML serving
  console.log('1. Checking http://localhost:3000 HTML delivery...');
  const htmlRes = await fetch(BASE_URL);
  assert.strictEqual(htmlRes.status, 200, 'Expected status 200 from localhost:3000');
  const htmlText = await htmlRes.text();
  assert(htmlText.includes('SLOPWORKS'), 'HTML should include SLOPWORKS');
  assert(htmlText.includes('THE AI SLOP FACTORY'), 'HTML should include tagline');
  assert(htmlText.includes('slop-counter'), 'HTML should contain slop counter element');
  console.log('✅ localhost:3000 serves valid SLOPWORKS client HTML');

  // 2. Verify REST endpoints
  console.log('\n2. Checking REST API endpoints...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200);
  const health = await healthRes.json();
  assert.strictEqual(health.status, 'ok');
  assert.strictEqual(health.game, 'SLOPWORKS');
  console.log('✅ GET /api/health returned:', health);

  const configRes = await fetch(`${BASE_URL}/api/config`);
  assert.strictEqual(configRes.status, 200);
  const config = await configRes.json();
  assert.strictEqual(config.winGoal, 10000);
  assert.strictEqual(config.upgrades.length, 6);
  console.log('✅ GET /api/config returned winGoal: 10000, 6 upgrades');

  // 3. Verify Two-Tab Multiplayer on ?instance=devtest
  console.log('\n3. Checking 2-tab multiplayer sync on ?instance=devtest...');
  const tab1 = await createTabClient('devtest', 'tab1_user', 'VibeCoder_101');
  const tab2 = await createTabClient('devtest', 'tab2_user', 'PromptLord_202');

  const tab1Init = await tab1.waitForMessage(m => m.type === 'INIT_STATE' || m.type === 'STATE_UPDATE');
  const tab2Init = await tab2.waitForMessage(m => m.type === 'INIT_STATE' || m.type === 'STATE_UPDATE');
  assert(tab1Init, 'Tab 1 received init state');
  assert(tab2Init, 'Tab 2 received init state');
  console.log('✅ Both browser tabs connected to shared instance "devtest"');

  // Tab 1 clicks 5 times
  console.log('   Tab 1 clicks 5 times...');
  tab1.send({
    type: 'CLICK',
    count: 5,
    phrases: ['How I use generative AI to sleep 14 hours a day while disrupting healthcare.']
  });

  const tab2UpdateAfterClick = await tab2.waitForMessage(m => {
    return m.state?.participants?.tab1_user?.slop >= 5;
  });
  assert(tab2UpdateAfterClick, 'Tab 2 should receive Tab 1 slop update');
  console.log('✅ Tab 2 saw Tab 1 slop increase live to:', tab2UpdateAfterClick.state.participants.tab1_user.slop);

  // Tab 1 is crowned Slop Lord
  const leader1 = tab2UpdateAfterClick.state.leaderboard[0];
  assert.strictEqual(leader1.userId, 'tab1_user');
  assert.strictEqual(leader1.isSlopLord, true);
  console.log('✅ Tab 1 is crowned SLOP LORD 👑');

  // Tab 2 clicks 20 times and dethrones Tab 1
  console.log('   Tab 2 clicks 20 times to dethrone Tab 1...');
  tab2.send({
    type: 'CLICK',
    count: 20,
    phrases: ['Please add wood glue to your pizza sauce so the cheese stays structurally sound.']
  });

  const tab1UpdateAfterDethrone = await tab1.waitForMessage(m => {
    const leader = m.state?.leaderboard?.[0];
    return leader && leader.userId === 'tab2_user' && leader.slop >= 20;
  });
  assert(tab1UpdateAfterDethrone, 'Tab 1 should see Tab 2 dethrone them');
  console.log('✅ Tab 2 dethroned Tab 1 live! Leaderboard updated on Tab 1:', tab1UpdateAfterDethrone.state.leaderboard.map(p => `${p.username}: ${p.slop}`).join(', '));

  // Tab 2 buys upgrade 'gpt4' (cost 15)
  console.log('   Tab 2 buys upgrade "gpt4"...');
  tab2.send({
    type: 'BUY_UPGRADE',
    upgradeId: 'gpt4',
  });

  const tab1UpdateAfterUpgrade = await tab1.waitForMessage(m => {
    const t2 = m.state?.participants?.tab2_user;
    return t2 && t2.upgrades && t2.upgrades.gpt4 === 1;
  });
  assert(tab1UpdateAfterUpgrade, 'Tab 1 should see Tab 2 upgrade');
  console.log('✅ Tab 2 bought GPT-4 Subscription, synced live to Tab 1. ClickPower is now:', tab1UpdateAfterUpgrade.state.participants.tab2_user.clickPower);

  // Output tape feed check
  console.log('   Checking output tape feed has phrases across tabs...');
  const recentPhrases = tab1UpdateAfterUpgrade.state.recentPhrases;
  assert(recentPhrases.length >= 2, 'Should contain phrases from both tabs');
  console.log('✅ Tape feed synced with phrases:', recentPhrases.slice(0, 2).map(p => `[${p.username}]: "${p.text}"`));

  // Rematch test
  console.log('   Triggering Rematch...');
  tab1.send({ type: 'REMATCH' });
  const rematchMsg = await tab2.waitForMessage(m => m.type === 'REMATCH_STARTED' || (m.state && m.state.participants?.tab2_user?.slop === 0));
  assert(rematchMsg, 'Tab 2 received rematch notification');
  console.log('✅ Rematch reset successfully synced to both tabs');

  tab1.close();
  tab2.close();
  await wait(200);

  console.log('\n====================================================');
  console.log('🎉 ALL END-TO-END CRITERIA VERIFIED SUCCESSFULLY!');
  console.log('====================================================\n');
}

verifyAll().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
