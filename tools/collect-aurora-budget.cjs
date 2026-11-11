/** 仅一版极光电击收益候选：主弧120%/分叉60%，原生过程从W1回放，不改文件或能耗。 */
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
const SKILLS = require('../js/config/tower-skills.js');
const arc = SKILLS.electric['极光电击'];
const original = { damage: arc.damage, branchDamage: arc.branchDamage }, before = JSON.stringify(SKILLS);
const baseline = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/periodic-skill-audit.json.gz'))));
assert.deepStrictEqual(baseline.sourceHashes, frozen.sourceHashes);
const rows = baseline.runs; Object.assign(api.routes, routes.secondary);
function options(row) {
  return { field: 'ancient', profile: row.profile, seed: row.seed, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes.secondary, 'build') };
}
function configure(g) {
  const a = support.configure(g), b = attach(g);
  return { afterUpdate(dt) { a.afterUpdate(dt); b.afterUpdate(dt); }, finish: () => ({ ...a.finish(), periodic: b.finish() }) };
}
const runs = [], start = performance.now();
try {
  const { route, observations, ...saved } = rows[0];
  assert.deepStrictEqual(api.collect({ ...options(rows[0]), configureGame: g => support.configure(g, false) }), saved);
  arc.damage = 1.2; arc.branchDamage = .6;
  const plain = api.collect({ ...options(rows[0]), configureGame: g => support.configure(g, false) });
  const { observations: ignored, ...observed } = api.collect({ ...options(rows[0]), configureGame: configure });
  assert.deepStrictEqual(plain, observed);
  for (const row of rows) {
    const result = api.collect({ ...options(row), configureGame: configure }); support.scope(GameGlobal.game);
    runs.push({ route: 'secondary', ...result });
    console.log(JSON.stringify({ runs: runs.length, total: rows.length, profile: row.profile, seed: row.seed,
      wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  Object.assign(arc, original); assert.equal(JSON.stringify(SKILLS), before);
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/aurora-budget-candidate.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: [], passiveReplayChecked: true,
    reproducedBaseline: true, parameters: { damage: 1.2, branchDamage: .6 },
    method: 'Single candidate only; process-local skill config mutation. Aurora primary120%+B20%per rank; fork60%of primary. Costs,cooldown,range,status,other skills unchanged. Garden full12 secondary route,current base attack+20%,real1star relics,no shop/red/talents. FullW1-W40/first breach.', runs,
  })));
} finally { Object.assign(arc, original); api.restore(); frozen.restore(); }
