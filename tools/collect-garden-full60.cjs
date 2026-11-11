/** 花园完整60波收尾：仅重放已过W40的8组，源代码一致的16组早期失败复用，不空降造构筑。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const base = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-attack-stats.json.gz'))));
assert.deepStrictEqual(base.sourceHashes, frozen.sourceHashes);
const rows = base.runs.filter(r => r.terminal === 'window_complete');
assert.equal(rows.length, 8);
function options(r) {
  Object.assign(api.routes, routes[r.route]);
  return { field: 'ancient', profile: r.profile, seed: r.seed, cadence: 2,
    maxWave: 60, windowEnd: 60, maxSeconds: 3600, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes[r.route], 'build') };
}
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument);
  if (!instrument) return null;
  const lateBoss = []; let time = 0, next = 0;
  return {
    afterUpdate(dt) {
      observer.afterUpdate(dt); time += dt;
      if (g.run.wave === 60 && time >= next) {
        next = time + 5;
        lateBoss.push({ time, wallHp: g.run.lineHp, levels: Object.fromEntries(g.run.slotOrder.map(k => [k, g.combat.tower(k).level])),
          relics: { ...g.run.runRelic }, phase: g.run.bossEncounter && g.run.bossEncounter.phase,
          bosses: g.enemies.filter(e => e.isBoss && e.hp > 0).map(e => ({ hp: e.hp, maxHp: e.maxHp, armor: e.armor, phase: e.phase, bossId: e.bossId })) });
      }
    },
    finish: () => ({ ...observer.finish(), lateBoss }),
  };
}
const runs = [], start = performance.now();
try {
  const plain = api.collect({ ...options(rows[0]), configureGame: g => configure(g, false) });
  const { observations, ...observed } = api.collect({ ...options(rows[0]), configureGame: configure });
  assert.deepStrictEqual(observed, plain);
  for (const row of rows) {
    const result = api.collect({ ...options(row), configureGame: configure }); support.scope(GameGlobal.game);
    assert.deepStrictEqual(result.waves.filter(w => w.wave < 40), row.waves.filter(w => w.wave < 40));
    runs.push({ route: row.route, ...result });
    console.log(JSON.stringify({ runs: runs.length, total: rows.length, route: row.route, profile: row.profile, seed: row.seed,
      wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/garden-full60.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: [], passiveReplayChecked: true,
    method: 'Garden only,current native parameters,no candidates. FullW1-W60/first breach for8 cases that clearedW40;16 source-identical earlier failures reused from garden-attack-stats. Naturally acquired1star relics,no shop/red/talents/revive/reroll. W40 reward now normally received and later build develops naturally; no injected levels/cards/energy. Two routes,six groups,two seeds,2s operations;3600s cap not a clear.',
    reused: base.runs.filter(r => r.terminal !== 'window_complete').map(r => ({ route: r.route, profile: r.profile, seed: r.seed, wave: r.wave, terminal: r.terminal })), runs,
  })));
} finally { api.restore(); frozen.restore(); }
