/** 正式花园首版验收：不注入增伤/经验/Boss参数，24组从W1回放并逐项对照离线候选。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const read = name => JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs', name + '.json.gz'))));
const damage = read('relic-intervention-damage20');
const candidate = read('garden-entry-boss20');
const key = r => [r.route, r.seed, r.profile].join(':');
const rows = damage.runs.filter(r => r.field === 'ancient');
const candidates = new Map(candidate.runs.map(r => [key(r), r]));
const changedSources = Object.keys(frozen.sourceHashes).filter(f => frozen.sourceHashes[f] !== damage.sourceHashes[f]);
assert.deepStrictEqual(changedSources.sort(), ['js/combat/damage.js', 'js/config/bosses.js', 'js/config/combat-common.js']);
const runs = [], start = performance.now();
function options(row) {
  Object.assign(api.routes, routes[row.route]);
  return { field: 'ancient', seed: row.seed, profile: row.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes[row.route], 'build') };
}
function expected(row) {
  const { route, intervention, bossHpFactor, observations, ...saved } = candidates.get(key(row)) || row;
  return saved;
}
try {
  const first = rows.find(r => candidates.has(key(r))), opts = options(first);
  const plain = api.collect({ ...opts, configureGame: g => support.configure(g, false) });
  assert.deepStrictEqual(plain, expected(first), 'Native prototype must reproduce whole candidate, not double-scale');
  const { observations, ...observed } = api.collect({ ...opts, configureGame: support.configure });
  assert.deepStrictEqual(observed, plain, 'Observer is passive');
  for (const row of rows) {
    const result = api.collect({ ...options(row), configureGame: support.configure });
    const { observations, ...actual } = result;
    assert.deepStrictEqual(actual, expected(row), `Native/candidate mismatch: ${key(row)}`);
    support.scope(GameGlobal.game);
    runs.push({ route: row.route, ...result });
    console.log(JSON.stringify({ runs: runs.length, total: rows.length, route: row.route, profile: row.profile,
      seed: row.seed, wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/garden-entry-native.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, changedSources, liveChanges: frozen.liveChanges(),
    passiveReplayChecked: true, candidateExactReplayChecked: true,
    damageMultiplier: require('../js/config/combat-common.js').towerDamageMultiplier,
    bossHp: require('../js/config/bosses.js').altar_galvin.hp,
    method: 'Only garden24cases, native game parameters, no interventions. Naturally acquired1star relics, no shop/talents; fullW1-W40/first breach, two routes,six four-tower groups,two seeds,2s decisions.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
