import assert from 'assert';
import { WebSocket } from 'ws';
import { server, gameManager } from '../src/server.js';

const TEST_PORT = 3123;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient(instanceId, userId, username) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws?instance=${instanceId}&userId=${userId}&username=${username}`);
    const messages = [];

    ws.on('open', () => {
      resolve({
        ws,
        messages,
        send(obj) {
          ws.send(JSON.stringify(obj));
        },
        waitForMessage(predicate, timeout = 3000) {
          return new Promise((res, rej) => {
            const start = Date.now();
            const check = () => {
              const found = messages.find(predicate);
              if (found) return res(found);
              if (Date.now() - start > timeout) {
                return rej(new Error(`Timed out waiting for message matching predicate after ${timeout}ms`));
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

async function runTests() {
  console.log('🧪 Starting SLOPWORKS server & multiplayer tests...');

  await new Promise((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', resolve);
  });

  try {
    // 1. Health check
    console.log('Checking GET /api/health...');
    const healthRes = await fetch(`http://localhost:${TEST_PORT}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    assert.strictEqual(healthData.game, 'SLOPWORKS');
    console.log('✅ Health check passed');

    // 2. Config check
    console.log('Checking GET /api/config...');
    const configRes = await fetch(`http://localhost:${TEST_PORT}/api/config`);
    assert.strictEqual(configRes.status, 200);
    const configData = await configRes.json();
    assert.strictEqual(configData.winGoal, 10000);
    assert(Array.isArray(configData.upgrades));
    assert.strictEqual(configData.upgrades.length, 6);
    console.log('✅ Config check passed');

    // 3. Connect two WebSocket clients to same instance: devtest
    console.log('Testing WebSocket multiplayer connection for 2 clients...');
    const clientA = await createClient('devtest', 'user_alice', 'AliceSloper');
    const clientB = await createClient('devtest', 'user_bob', 'BobGlitch');

    // Both should receive initial state
    const msgA = await clientA.waitForMessage(m => m.type === 'INIT_STATE' || m.type === 'STATE_UPDATE');
    assert(msgA.state.participants.user_alice);
    console.log('✅ Initial state received by client A');

    // 4. Client A clicks
    console.log('Testing Client A clicking...');
    clientA.send({
      type: 'CLICK',
      count: 20,
      phrases: ['Test synthetic prompt output!']
    });

    // Client B should see updated state with Alice's slop
    const updateB = await clientB.waitForMessage(m => {
      return (m.type === 'STATE_UPDATE' || m.type === 'INIT_STATE') &&
        m.state.participants.user_alice &&
        m.state.participants.user_alice.slop >= 20;
    });

    assert(updateB.state.participants.user_alice.slop >= 20);
    const leader = updateB.state.leaderboard[0];
    assert.strictEqual(leader.userId, 'user_alice');
    assert.strictEqual(leader.isSlopLord, true);
    console.log('✅ Client B received Alice\'s slop update and leaderboard crown');

    // 5. Client A buys upgrade (gpt4: cost 15)
    console.log('Testing upgrade purchase...');
    clientA.send({
      type: 'BUY_UPGRADE',
      upgradeId: 'gpt4'
    });

    const updateAfterUpgrade = await clientB.waitForMessage(m => {
      const alice = m.state?.participants?.user_alice;
      return alice && alice.upgrades && alice.upgrades.gpt4 === 1;
    });

    const aliceState = updateAfterUpgrade.state.participants.user_alice;
    assert.strictEqual(aliceState.upgrades.gpt4, 1);
    assert.strictEqual(aliceState.clickPower, 2);
    console.log('✅ Upgrade purchase synced: clickPower is now', aliceState.clickPower);

    // 6. Win condition test
    console.log('Testing win condition trigger...');
    const inst = gameManager.getInstance('devtest');
    const alicePlayer = inst.participants.get('user_alice');
    alicePlayer.slop = 9999;
    alicePlayer.totalProduced = 9999;

    clientA.send({
      type: 'CLICK',
      count: 1
    });

    const winUpdate = await clientB.waitForMessage(m => {
      return m.state?.winner && m.state.winner.userId === 'user_alice';
    });

    assert.strictEqual(winUpdate.state.winner.userId, 'user_alice');
    console.log('✅ Win condition triggered and broadcast to Client B');

    // 7. Rematch test
    console.log('Testing rematch reset...');
    clientB.send({ type: 'REMATCH' });

    const rematchUpdate = await clientA.waitForMessage(m => {
      return m.type === 'REMATCH_STARTED' || (m.state && m.state.winner === null && m.state.participants.user_alice.slop === 0);
    });
    assert(rematchUpdate);
    console.log('✅ Rematch reset synced to Client A');

    // Cleanup
    clientA.close();
    clientB.close();
    await wait(200);

    console.log('\n🎉 ALL MULTIPLAYER SERVER TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    gameManager.stopTicker();
    server.close();
  }
}

runTests();
