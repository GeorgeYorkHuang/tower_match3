/** 花园后半段单版验收：8组从W1完整回放，16组早期失败复用；无额外参数/资源注入。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..'), frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const previous = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/garden-full60.json.gz'))));
const changedSources = Object.keys(frozen.sourceHashes).filter(f => frozen.sourceHashes[f] !== previous.sourceHashes[f]);
assert.deepStrictEqual(changedSources.sort(), ['js/config.js', 'js/config/bosses.js', 'js/config/field-balance.js', 'js/run.js', 'js/wave.js']);
const rows = previous.runs; assert.equal(rows.length, 8);
function options(r) {
  Object.assign(api.routes, routes[r.route]);
  return { field: 'ancient', profile: r.profile, seed: r.seed, cadence: 2,
    maxWave: 60, windowEnd: 60, maxSeconds: 3600, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, cs) => policy.select(g, cs, routes[r.route], 'build') };
}
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument); if (!instrument) return null;
  const lateBoss = []; let time = 0, next = 0;
  return {
    afterUpdate(dt) {
      observer.afterUpdate(dt); time += dt;
      if (g.run.wave === 60 && time >= next) {
        next = time + 5;
        const q = g.run.bossEncounter;
        lateBoss.push({ time, wallHp: g.run.lineHp,
          levels: Object.fromEntries(g.run.slotOrder.map(k => [k, g.combat.tower(k).level])),
          relics: { ...g.run.runRelic }, phase: q && q.phase,
          summonedHp: q && q.summonedHp, riftWallDamage: q && q.wallDamage,
          bosses: g.enemies.filter(e => e.isBoss && e.hp > 0).map(e => ({ hp: e.hp, maxHp: e.maxHp, armor: e.armor, phase: e.phase, bossId: e.bossId })) });
      }
    },
    finish() {
      const q = g.run.bossEncounter;
      return { ...observer.finish(), lateBoss,
        finalEncounter: q && q.final ? { phase: q.phase, finished: q.finished, summonedHp: q.summonedHp,
          riftWallDamage: q.wallDamage, finalVictory: !!g.run.finalVictory } : null };
    },
  };
}
const runs = [], start = performance.now();
try {
  const plain = api.collect({ ...options(rows[0]), configureGame: g => configure(g, false) });
  const { observations, ...observed } = api.collect({ ...options(rows[0]), configureGame: configure });
  assert.deepStrictEqual(observed, plain);
  for (const row of rows) {
    const result = api.collect({ ...options(row), configureGame: configure }); support.scope(GameGlobal.game);
    assert.deepStrictEqual(result.waves.filter(w => w.wave <= 40), row.waves.filter(w => w.wave <= 40));
    runs.push({ route: row.route, ...result });
    console.log(JSON.stringify({ runs: runs.length, total: rows.length, route: row.route, profile: row.profile, seed: row.seed,
      wave: result.wave, terminal: result.terminal, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  assert.deepStrictEqual(frozen.liveChanges(), []);
  fs.writeFileSync(path.join(root, 'docs/garden-late-rebalance.json.gz'), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, changedSources, liveChanges: [], passiveReplayChecked: true,
    parameters: { curve: require('../js/config.js').FIELDS.ancient.lateEnemyHp,
      bossHp: require('../js/config/bosses.js').altar_vera.hp, summonHp: require('../js/config/bosses.js').altar_vera.summonHp },
    method: 'One native version only. Garden W41-59 born HP curve1to.7 incl normal/elite/miniBoss/summons; W60 independent Boss240k/summon2400, no curve at60. Actual births and generic reference/settlement share factor. Full8 W1-W60 replays that passedW40;16 prior<=W40 failures reused. Real1star relics,no shop/red/talents, no injected resources. All<=W40 wave rows exact-match old full60.',
    reused: previous.reused, runs,
  })));
} finally { api.restore(); frozen.restore(); }
