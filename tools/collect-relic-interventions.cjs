/** 一星圣物单因素对照：六塔输出/经验入账/花园W40本体血量，仅在独立Node进程注入。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const interventions = require('./relic-interventions.cjs');
const name = process.argv[2] || 'damage20';
assert(interventions.spec[name] && name !== 'none');
const baseline = ['primary', 'secondary'].flatMap(route => {
  const data = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs', `relic-only-${route}-build.json.gz`))));
  assert.deepStrictEqual(data.sourceHashes, frozen.sourceHashes, 'Game changed since relic baseline');
  return data.runs;
});
const hpOnly = name.startsWith('boss');
const cases = hpOnly ? baseline.filter(r => r.field === 'ancient' && r.wave === 40) : baseline;
const start = performance.now(), runs = [];
let treatmentName = 'none';
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument);
  const treatment = interventions.attach(g, treatmentName);
  g._offlineRelicTreatment = treatment;
  if (!instrument) return null;
  return {
    afterUpdate: observer.afterUpdate,
    finish() { return { ...observer.finish(), intervention: treatment.audit }; },
  };
}
function options(row) {
  Object.assign(api.routes, routes[row.route]);
  return { field: row.field, seed: row.seed, profile: row.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, candidates) => policy.select(g, candidates, routes[row.route], 'build'),
    afterSpawnEnemy: (g, enemy) => { if (g._offlineRelicTreatment) g._offlineRelicTreatment.spawn(g, enemy); },
  };
}
try {
  // 抽出的公共策略/观察器和新出生钩子在无干预时必须完整复现既有圣物基线。
  const base = cases[0], opts = options(base);
  const reproduced = api.collect({ ...opts, configureGame: g => configure(g, false) });
  const { route, strategy, observations, ...saved } = base;
  assert.deepStrictEqual(reproduced, saved, 'No-treatment baseline did not reproduce');
  treatmentName = name;
  const plain = api.collect({ ...opts, configureGame: g => configure(g, false) });
  const { observations: observed, ...instrumented } = api.collect({ ...opts, configureGame: configure });
  assert.deepStrictEqual(plain, instrumented, 'Observer changed intervention replay');
  for (const row of cases) {
    const result = api.collect({ ...options(row), configureGame: configure });
    support.scope(GameGlobal.game);
    const audit = result.observations.intervention;
    if (hpOnly) {
      assert.equal(audit.bossBodies.length, 1, 'Naturally reachedW40 body must be treated once');
      assert.equal(audit.bossBodies[0].before, 540000);
      assert.equal(audit.bossBodies[0].after, 540000 * interventions.spec[name].bossBodyHp);
      assert.equal(audit.damageCalls, 0); assert.equal(audit.xpCalls, 0);
    } else if (name === 'damage20') {
      assert(audit.damageCalls > 0); assert.equal(audit.xpCalls, 0); assert.equal(audit.bossBodies.length, 0);
    } else {
      assert(audit.xpCalls > 0); assert.equal(audit.damageCalls, 0); assert.equal(audit.bossBodies.length, 0);
    }
    runs.push({ route: row.route, intervention: name, ...result });
    console.log(JSON.stringify({ name, runs: runs.length, total: cases.length, route: row.route,
      field: row.field, seed: row.seed, profile: row.profile, wave: result.wave, terminal: result.terminal,
      elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  fs.writeFileSync(path.join(root, 'docs', `relic-intervention-${name}.json.gz`), gzipSync(JSON.stringify({
    date: '2026-11-10', intervention: name, treatment: interventions.spec[name],
    sourceHashes: frozen.sourceHashes, loadedSources: frozen.loaded(), liveChanges: frozen.liveChanges(), frozenRuntime: true,
    reproducedBaseline: true, passiveReplayChecked: true, routes,
    method: 'Same1star relic-only baseline and chest/build policy; no shop/talent/permanent growth. Changes only current Game instance. damage20 scales each tower damage-entry event1.2 before armor, costs unchanged. exp20 scales all positive gainExp1.2, not thresholds/initial levels. boss probes only naturally reached gardenW40 cases from baseline, replayed fromW1; body max/currentHP scaled after native spawn, twins unchanged. W40fullclear or firstbreach/time1800s.', runs,
  })));
} finally { api.restore(); frozen.restore(); }
