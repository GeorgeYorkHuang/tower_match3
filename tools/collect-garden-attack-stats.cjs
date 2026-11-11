/** 攻击配置落地后的花园回放：无结算增伤注入，仍只测一星圣物、无商店/天赋。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const previous = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-entry-native.json.gz'))));
const changed = Object.keys(frozen.sourceHashes).filter(f => previous.sourceHashes[f] !== frozen.sourceHashes[f]);
assert.deepStrictEqual(changed.sort(), ['js/combat/damage.js', 'js/config/combat-common.js', 'js/config/towers.js']);
const rows = previous.runs;
assert.equal(rows.length, 24); assert(rows.every(r => r.field === 'ancient'));
const runs = [], start = performance.now();
function options(row) {
  Object.assign(api.routes, routes[row.route]);
  return { field: 'ancient', seed: row.seed, profile: row.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes[row.route], 'build') };
}
try {
  const opts = options(rows[0]);
  const plain = api.collect({ ...opts, configureGame: g => support.configure(g, false) });
  const { observations, ...observed } = api.collect({ ...opts, configureGame: support.configure });
  assert.deepStrictEqual(observed, plain, 'Observer must not change replay');
  for (const row of rows) {
    const result = api.collect({ ...options(row), configureGame: support.configure });
    support.scope(GameGlobal.game); runs.push({ route: row.route, ...result });
    console.log(JSON.stringify({ runs: runs.length, total: 24, route: row.route, profile: row.profile,
      seed: row.seed, wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/garden-attack-stats.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, changedSources: changed,
    passiveReplayChecked: true, liveChanges: [], towers: require('../js/config.js').TOWERS,
    bossHp: require('../js/config/bosses.js').altar_galvin.hp,
    method: 'Garden only; native baseDps/perLv+20%, no shared damage multiplier or injected damage/XP. Full24 replays W1-W40/first breach; real1star relics, no shop/red/talents; same fixed routes,groups,seeds,2s decisions. Base attack also affects target estimates, do not assume identical combat trace to former final multiplier.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
