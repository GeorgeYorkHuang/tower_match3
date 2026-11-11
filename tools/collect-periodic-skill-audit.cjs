/** 花园电冰收尾采集：12组原生周期路线，完整复现旧回放并附加被动施法/辅助统计。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const { attach } = require('./periodic-skill-observer.cjs');
const baseline = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-attack-stats.json.gz'))));
assert.deepStrictEqual(baseline.sourceHashes, frozen.sourceHashes);
const rows = baseline.runs.filter(r => r.route === 'secondary');
assert.equal(rows.length, 12); Object.assign(api.routes, routes.secondary);
function configure(g) {
  const a = support.configure(g), b = attach(g);
  return { afterUpdate(dt) { a.afterUpdate(dt); b.afterUpdate(dt); }, finish: () => ({ ...a.finish(), periodic: b.finish() }) };
}
const runs = [], start = performance.now();
try {
  for (const row of rows) {
    const result = api.collect({ field: 'ancient', seed: row.seed, profile: row.profile, cadence: 2,
      maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
      configureGame: configure, selectRelic: (g, cs) => policy.select(g, cs, routes.secondary, 'build') });
    const { route, observations, ...saved } = row;
    const { observations: actualObservation, ...actual } = result;
    assert.deepStrictEqual(actual, saved, 'Periodic observer changed real battle');
    const { periodic, ...ordinaryObservation } = actualObservation;
    assert.deepStrictEqual(ordinaryObservation, observations, 'Periodic observer changed ordinary energy/timeline');
    support.scope(GameGlobal.game);
    runs.push({ route: 'secondary', ...result });
    console.log(JSON.stringify({ runs: runs.length, total: 12, profile: row.profile, seed: row.seed,
      casts: periodic.casts.length, wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/periodic-skill-audit.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: [], passiveFullReplayChecked: true,
    method: 'Garden only12 native secondary route. Each complete campaign and previous energy/timeline observations exactly reproduce saved current baseline. Per-cast damage uses actual native stat deltas; orb pulses/empty pulses observed, pending objects identified. Utility sampledW25-39; paralysis/freeze are all-source siege enemy-seconds, not unique tower credit. No parameter/energy/XP injection; real1star relics,no shop/red/talents.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
