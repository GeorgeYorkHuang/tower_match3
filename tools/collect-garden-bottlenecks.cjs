/** 花园W25起缺能诊断：每次只给一塔/全队补至60能量；仅当前离线进程，不改游戏数值。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const route = process.argv[2]; assert(['primary', 'secondary'].includes(route));
const base = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-attack-stats.json.gz'))));
assert.deepStrictEqual(base.sourceHashes, frozen.sourceHashes);
const wanted = route === 'primary' ? [['no_ice', 41], ['artillery_control', 123]]
  : [['wind_control', 41], ['artillery_control', 123]];
const cases = wanted.map(([p, s]) => base.runs.find(r => r.route === route && r.profile === p && r.seed === s));
assert(cases.every(r => r && r.field === 'ancient' && r.wave < 40));
Object.assign(api.routes, routes[route]);
let selected = [];
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument), audit = {};
  const update = g.combat.update.bind(g.combat);
  g.combat.update = dt => {
    if (g.run.wave >= 25) for (const key of selected) {
      const t = g.combat.tower(key);
      if (!t) continue;
      const floor = Math.min(60, g.run.armoryEnergyMax(key));
      if (t.energy < floor) {
        audit[key] = (audit[key] || 0) + floor - t.energy;
        t.energy = floor;
      }
    }
    return update(dt);
  };
  if (!instrument) return null;
  return { afterUpdate: observer.afterUpdate,
    finish: () => ({ ...observer.finish(), diagnosticEnergy: { ...audit } }) };
}
function options(row) {
  return { field: 'ancient', seed: row.seed, profile: row.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes[route], 'build') };
}
const runs = [], start = performance.now();
try {
  for (const row of cases) {
    selected = [];
    const { route: ignored, observations, ...saved } = row;
    assert.deepStrictEqual(api.collect({ ...options(row), configureGame: g => configure(g, false) }), saved,
      'Diagnostic without extra energy must reproduce saved current game');
    if (row === cases[0]) {
      selected = [row.keys[0]];
      const plain = api.collect({ ...options(row), configureGame: g => configure(g, false) });
      const { observations, ...observed } = api.collect({ ...options(row), configureGame: configure });
      assert.deepStrictEqual(observed, plain, 'Observer must remain passive');
    }
    for (const mode of [...row.keys, 'all']) {
      selected = mode === 'all' ? [...row.keys] : [mode];
      const result = api.collect({ ...options(row), configureGame: configure });
      support.scope(GameGlobal.game);
      assert.deepStrictEqual(result.waves.filter(w => w.wave < 25), row.waves.filter(w => w.wave < 25));
      assert(Object.keys(result.observations.diagnosticEnergy).every(k => selected.includes(k)));
      assert(Object.values(result.observations.diagnosticEnergy).every(v => v >= 0));
      runs.push({ route, energyFloor: mode, ...result });
      console.log(JSON.stringify({ route, profile: row.profile, seed: row.seed, mode, wave: result.wave,
        terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
    }
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs', `garden-bottleneck-${route}.json.gz`), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: [], reproducedBaselines: true,
    passiveReplayChecked: true, method: 'Four deliberately selected preW40 failures across both routes; each replay startsW1. FromW25 before combat updates, refill only selected tower(s) to at least60 if below, preserve energy above60. Costs/skills/damage unchanged; supply is unlimited diagnostic intervention, not a realistic balance proposal. Real1star relics, no shop/talents. Other decisions and RNG may diverge after treatment.',
    selectedCases: cases.map(r => ({ profile: r.profile, seed: r.seed, wave: r.wave })), runs,
  })));
} finally { api.restore(); frozen.restore(); }
