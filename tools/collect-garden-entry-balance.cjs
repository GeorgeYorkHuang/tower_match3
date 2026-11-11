/** 花园入门难度候选：沿用伤害+20%的回放，仅在本进程同步缩放W40本体/分身生命。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const { gzipSync, gunzipSync } = require('zlib');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..');
const frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./moving-battle-fixture.cjs');
const routes = require('./six-tower-current-routes.cjs');
const policy = require('./relic-only-policy.cjs');
const support = require('./relic-replay-support.cjs');
const interventions = require('./relic-interventions.cjs');
const boss = require('../js/config/bosses.js').altar_galvin;
const factor = Number(process.argv[2]);
assert([.5, .3, .2].includes(factor));
const data = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'docs/relic-intervention-damage20.json.gz'))));
assert.deepStrictEqual(data.sourceHashes, frozen.sourceHashes, 'Candidate must use the existing damage20 source');
const garden = data.runs.filter(r => r.field === 'ancient');
const cases = garden.filter(r => r.wave === 40);
const originalHp = boss.hp, bossBefore = JSON.stringify(boss);
const runs = [], start = performance.now();
function configure(g, instrument = true) {
  const observer = support.configure(g, instrument);
  interventions.attach(g, 'damage20');
  return observer;
}
function options(row) {
  Object.assign(api.routes, routes[row.route]);
  return { field: 'ancient', seed: row.seed, profile: row.profile, cadence: 2,
    maxWave: 40, windowEnd: 40, maxSeconds: 1800, relics: true, stopAtFirstBreach: true,
    selectRelic: (g, candidates) => policy.select(g, candidates, routes[row.route], 'build') };
}
try {
  // 先在原Boss数值下完整复现已保存的伤害+20%样本，包括W40。
  const base = cases[0];
  const { route, intervention, observations, ...saved } = base;
  assert.deepStrictEqual(api.collect({ ...options(base), configureGame: g => configure(g, false) }), saved);
  // Boss模块读取同一配置对象；只改本Node进程内存，正式文件和其他战斗不受影响。
  boss.hp = originalHp * factor;
  const plain = api.collect({ ...options(base), configureGame: g => configure(g, false) });
  const { observations: observed, ...sample } = api.collect({ ...options(base), configureGame: configure });
  assert.deepStrictEqual(plain, sample, 'Observer changed replay');
  for (const row of cases) {
    const result = api.collect({ ...options(row), configureGame: configure });
    support.scope(GameGlobal.game);
    assert.deepStrictEqual(result.waves.filter(w => w.wave < 40), row.waves.filter(w => w.wave < 40));
    assert.deepStrictEqual(result.observations.entries, row.observations.entries);
    runs.push({ route: row.route, bossHpFactor: factor, ...result });
    console.log(JSON.stringify({ factor, runs: runs.length, total: cases.length, route: row.route,
      seed: row.seed, profile: row.profile, wave: result.wave, terminal: result.terminal,
      phase: result.waves.at(-1).boss.phase, elapsed: +((performance.now() - start) / 1000).toFixed(1) }));
  }
  boss.hp = originalHp;
  assert.equal(JSON.stringify(boss), bossBefore);
  fs.writeFileSync(path.join(root, 'docs', `garden-entry-boss${Math.round(factor * 100)}.json.gz`), gzipSync(JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: frozen.liveChanges(),
    damageMultiplier: 1.2, bossHpFactor: factor, bodyHp: originalHp * factor,
    twinHp: originalHp * factor * boss.twinHpRatio, reproducedDamage20: true, passiveReplayChecked: true,
    method: 'Only garden; naturally acquired1star relics, no shop/talents. FullW1 replay of10 damage20 cases naturally reachingW40. Other14 fail beforeW40, so their damage20 results are reused unchanged. Boss hp changed only in process memory; body/twins/heal/survivor heal scale together, armor/attack/speed/adds/timers unchanged.',
    unchanged: garden.filter(r => r.wave < 40).map(r => ({ route: r.route, seed: r.seed, profile: r.profile, wave: r.wave, terminal: r.terminal })),
    runs,
  })));
} finally { boss.hp = originalHp; api.restore(); frozen.restore(); }
