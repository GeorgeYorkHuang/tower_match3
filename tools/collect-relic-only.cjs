/** 只计局内1星圣遗物的W20/W40压力测试：正常供能、无商店/红卡天赋，不改游戏数值或账号存档。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const { scope, configure } = require('./relic-replay-support.cjs');
const CONFIG = require('../js/config.js');
const route = process.argv[2] || 'primary', strategy = process.argv[3] || 'build';
assert(routes[route] && ['build', 'first'].includes(strategy));
Object.assign(api.routes, routes[route]);
const start = performance.now(), runs = [];

try {
  const options = { field: 'ancient', seed: 41, profile: 'elements', cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, candidates) => policy.select(g, candidates, routes[route], strategy) };
  // 同一策略下验证观察器被动性；不把棋盘因宝箱占位产生的变化强说成与无圣物配对。
  const plain = api.collect({ ...options, configureGame: g => configure(g, false) });
  const { observations, ...observed } = api.collect({ ...options, configureGame: g => configure(g, true) });
  assert.deepStrictEqual(plain, observed, 'Relic observer changed replay');
  const fields = strategy === 'first' ? ['ancient'] : ['ancient', 'lava', 'frost'];
  for (const field of fields) for (const seed of [41, 123]) for (const profile of Object.keys(api.profiles)) {
    const result = api.collect({ ...options, field, seed, profile, configureGame: configure });
    const seen = new Set();
    for (const choice of result.relicChoices) {
      assert(choice.candidates.includes(choice.id));
      assert.notEqual(choice.rarity, 'ur');
      if (choice.rarity !== 'r') { assert(!seen.has(choice.id)); seen.add(choice.id); }
      if (choice.goldOnly) {
        assert.equal(choice.rarity, 'ssr');
        assert(choice.candidates.every(id => CONFIG.relicRarity(id) === 'ssr'));
      }
    }
    scope(GameGlobal.game);
    runs.push({ route, strategy, ...result });
    console.log(JSON.stringify({ route, strategy, runs: runs.length, field, seed, profile, wave: result.wave,
      terminal: result.terminal, relics: result.relicChoices.length, elapsed: +(performance.now() - start).toFixed(0) / 1000 }));
  }
  assert.equal(runs.length, strategy === 'first' ? 12 : 36);
  fs.writeFileSync(path.join(root, 'docs', `relic-only-${route}-${strategy}.json.gz`), gzipSync(JSON.stringify({
    date: '2026-11-10', route, strategy, sourceHashes: frozen.sourceHashes, loadedSources: frozen.loaded(),
    liveChanges: frozen.liveChanges(), frozenRuntime: true, passiveReplayChecked: true, routes: routes[route],
    stars: 'native new account; picked cards unlock1star', shop: false, talents: false,
    method: 'Native chest landing/adjacent elimination/open/3choice, prioritize legal chest-adjacent matches then ordinary triples. Build policy ranks only offered candidates by planned route/current energy; first policy is sensitivity control. No reroll/shop/talent/UR/stars2-3/neutral energy. Stop first breach or W40fullyclear/time1800s; W20gold helps later waves, not W20itself.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
