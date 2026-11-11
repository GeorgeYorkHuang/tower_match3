/** 专项观察器不能改变原生回放、伤害与棋盘；弹体命中/落空/在途必须守恒。 */
'use strict';
const assert = require('assert');
const api = require('./moving-battle-fixture.cjs');
const { attach } = require('./wave15-20-observer.cjs');
const routes = { fire: [['多重火球', 'A'], ['大火球', 'B'], ['灼烧', 'C']],
  ice: [['多重冰锥', 'C'], ['冰穿刺', 'A'], ['碎冰', 'B']],
  poison: [['剧毒', 'A'], ['瘟疫', 'A'], ['毒爆', 'A']],
  cannon: [['重炮', 'B'], ['双管齐射', 'A'], ['碎裂弹', 'C']] };
const previous = { ...api.routes };
try {
  Object.assign(api.routes, routes);
  const opts = { field: 'ancient', profile: 'artillery_control', cadence: 2, seed: 41,
    maxSeconds: 2400, maxWave: 20, windowEnd: 20, stopAtFirstBreach: true };
  const plain = api.collect(opts);
  const { observations, ...measured } = api.collect({ ...opts, configureGame: g => attach(g) });
  assert.deepEqual(measured, plain, 'Observation must leave native game and RNG untouched');
  let projectiles = 0, hit = 0, missed = 0;
  for (const w of observations.waves) for (const r of Object.values(w.towers)) {
    projectiles += r.projectiles; hit += r.hitProjectiles; missed += r.missedProjectiles;
    assert(r.asked >= r.paid - 1e-6 && r.directHits >= 0 && r.splashHits >= 0);
    assert(r.directDamage >= 0 && r.splashDamage >= 0);
  }
  assert.equal(projectiles, observations.launchedProjectiles);
  assert.equal(projectiles, hit + missed + observations.pendingProjectiles, 'Projectile outcomes must balance');
  assert(observations.waves.some(w => w.wave === 20 && w.bossSeconds > 0));
  const ref = api.collect({ ...opts, configureGame: g => attach(g, ['fire', 'cannon']) });
  const a = plain.waves.filter(w => w.wave < 15), b = ref.waves.filter(w => w.wave < 15);
  assert.deepEqual(a, b, 'W15补能不能提前改变W1–14');
  for (let i = 0; i < Math.min(plain.moves.length, ref.moves.length); i++) {
    assert.equal(plain.moves[i].board, ref.moves[i].board);
    assert.deepEqual(plain.moves[i].move, ref.moves[i].move);
  }
  console.log('PASS passive replay/HP/damage/RNG, projectile outcome conservation, boss observation, W1–14 identical and paired action prefixes.');
} finally { Object.assign(api.routes, previous); api.restore(); }
