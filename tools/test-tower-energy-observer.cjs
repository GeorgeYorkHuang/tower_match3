/** 验证能耗采集不会改变回放，未扣费技能不误记为未施放，W2与新奖励开关独立。 */
const assert = require('assert');
const api = require('./moving-battle-fixture.cjs');
const { attach } = require('./tower-energy-observer.cjs');
const opts = { field: 'ancient', profile: 'elements', seed: 41, maxSeconds: 120, maxWave: 6 };
try {
  const a = api.collect(opts);
  const b = api.collect({ ...opts, configureGame: g => attach(g) });
  const { observations, ...plain } = b;
  assert.deepEqual(a, plain, 'Observation must not alter native simulation');
  assert(b.wave > 2 && b.moves.length > 10, 'No-relic baseline must pass W2 without freezing in reward UI');
  const c = api.collect({ ...opts, relics: true, configureGame: g => attach(g) });
  assert(c.relicChoices.length >= 1);
  assert(c.relicChoices.every(card => card.rarity !== 'ur'));
  assert(c.runRelics[c.relicChoices[0].id] > 0);
  const d = api.collect({ ...opts, configureGame: g => attach(g, { neutral: true }) });
  for (let i = 0; i < Math.min(b.moves.length, d.moves.length); i++) assert.deepEqual(b.moves[i], d.moves[i]);
  for (const r of Object.values(d.observations.towers)) {
    assert.equal(r.lowSeconds, 0); assert.equal(r.zeroSeconds, 0); assert(r.injectedEnergy > 0);
  }
  const mock = { run: { slotOrder: ['fire'], energyBank: 0, armoryEnergyMax: () => 100, attackCost: () => 1,
    spendAttackEnergy(t, cost) { t.energy = Math.max(0, t.energy - cost); } },
    enemies: [], ly: {} };
  const t = { key: 'fire', energy: 0 };
  mock.combat = { tower: () => t, attackOnce() { mock.run.spendAttackEnergy(t, 1); },
    castEnergy() {}, update() {}, range: () => 400, towerMuzzle: () => ({x: 0, y: 0}) };
  const observed = attach(mock);
  mock.combat.attackOnce('fire'); mock.combat.castEnergy('fire', '火柱'); observed.afterUpdate(1);
  const r = observed.finish().towers.fire;
  assert.equal(r.shortAttackLaunches, 1);
  assert.equal(r.periodicRequests, 1); assert.equal(r.unpaidPeriodicRequests, 1);
  assert.equal(r.zeroSeconds, 1); assert.equal(r.damageStateSeconds, 0.3); assert.equal(r.cooldownStateSeconds, 2);
  const breached = api.collect({ ...opts, stopAtFirstBreach: true, configureGame(g) {
    g.run.runRelic.s_sr_cm_regen = 1; g.meta.relicStars.s_sr_cm_regen = 1;
    return { beforeUpdate() { g.run.lineHp = 0; g.run.broken = true; } };
  } });
  assert.equal(breached.terminal, 'wall_broken'); assert.equal(breached.wave, 1);
  assert.equal(breached.waves[0].reason, 'first_breach');
  console.log('PASS passive observations, deterministic paired actions, W2 baseline exclusion, native relic selection, neutral reference, zero-energy attack and unpaid periodic accounting.');
} finally { api.restore(); }
