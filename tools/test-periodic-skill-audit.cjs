/** 被动技能观察器与极光主目标射程回归，使用真实电球推进/伤害/施法。 */
'use strict';
const assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const { attach } = require('./periodic-skill-observer.cjs');
const close = (a, b) => assert(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
try {
  const w = api.setup('electric', [['球形闪电', 'B']], 0, 'dense', 41, 'finite');
  w.game.siegeEnemies = () => {};
  w.run.wave = 25; w.game.enemies = [w.game.enemies[0]];
  const observer = attach(w.game), target = w.game.enemies[0];
  w.combat.timers.ballLightning = 1e9; w.combat.tickElectric(0);
  assert.equal(w.combat.shots.length, 3);
  const nominal = w.combat.shots.reduce((sum, s) => sum + s.dmg, 0);
  for (const s of w.combat.shots) { s.x = target.x; s.y = target.y; s.speed = 0; }
  for (let frame = 0; frame < 63; frame++) {
    for (const s of w.combat.shots) w.combat.stepShot(s, 1 / 60);
    observer.afterUpdate(1 / 60);
  }
  let r = observer.finish().casts[0];
  assert.equal(r.spawnedObjects, 3); assert.equal(r.pulses, 3);
  assert.equal(r.pulsesWithHits, 3); assert.equal(r.pulseHits, 3);
  close(r.effectiveDamage, nominal); assert.equal(r.uniqueTargets, 1); assert(!r.complete);
  target.x += 2000;
  for (let frame = 0; frame < 63; frame++) {
    for (const s of w.combat.shots) w.combat.stepShot(s, 1 / 60);
    observer.afterUpdate(1 / 60);
  }
  r = observer.finish().casts[0];
  assert.equal(r.pulses, 6); assert.equal(r.pulsesWithHits, 3); assert.equal(r.pulseHits, 3);
  close(r.effectiveDamage, nominal);

  for (const energy of [0, .1, 3, 60]) {
    const a = api.setup('electric', [['极光电击', 'B']], 0, 'dense', 41, 'finite');
    const c = a.combat, m = c.towerMuzzle('electric');
    a.tower.energy = energy;
    const range = c.range('electric', energy), [outside, inside] = a.game.enemies;
    outside.x = m.x + range * .4; outside.y = m.y - range * 1.01;
    inside.x = m.x; inside.y = m.y - range * .98;
    outside.hp = inside.hp = 10000;
    a.game.enemies = [outside, inside];
    assert(!c.inTowerRange('electric', outside.x, outside.y, energy));
    assert(c.inTowerRange('electric', inside.x, inside.y, energy));
    const dmg = c.shotDmg('electric', false, true, energy) * .8;
    c.timers.arc = 1e9; c.tickElectric(0);
    close(10000 - inside.hp, dmg);
    close(outside.hp, 10000);
    close(a.tower.energy, Math.max(0, energy - 3));
  }
  console.log('PASS orb populated/empty pulses, actual damage/targets/pending counts, arc vertical range eligibility at0/.1/3/60energy and single fee.');
} finally { api.restore(); }
