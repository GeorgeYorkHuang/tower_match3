/** 六塔真实扣费回归：临界能量、空场、同帧多技能、延迟伤害和免耗返能。 */
'use strict';
const assert = require('assert');
const fixture = require('./tower-balance-fixture.cjs');
const CONFIG = require('../js/config.js');
const Energy = require('../js/config/energy-state.js');
const modules = Object.fromEntries(Object.keys(CONFIG.TOWERS).map(key =>
  [key, require('../js/combat/towers/' + key + '.js')]));
const ticks = { fire: 'tickFire', ice: 'tickIce', poison: 'tickPoison', electric: 'tickElectric', boomerang: 'tickBoomerang', cannon: 'tickCannon' };
const skills = {
  fire: { '火柱': 'firePillar', '烈焰墙': 'fireWall', '火雨': 'fireRain' },
  ice: { '冰花': 'iceFlower', '冬珠': 'frostOrb', '冰墙': 'iceWall' },
  poison: { '毒池': 'pool', '毒棒': 'stick', '毒藤': 'vine' },
  electric: { '极光电击': 'arc', '雷暴': 'storm', '球形闪电': 'ballLightning' },
  boomerang: { '风暴镖': 'storm', '弹力镖': 'ringN', '风眼涡旋': 'vortex' },
  cannon: { '炮火支援': 'support', '地雷阵': 'mine', '碎裂弹': 'shatter', '炮台': 'turret' },
};
// 这些技能空场时也实际生成护盾/地雷/自由移动弹体，并非失败空放。
const independent = new Set(['冰墙', '地雷阵', '球形闪电', '弹力镖']);
const close = (a, b, label) => assert(Math.abs(a - b) < 1e-7, `${label}: ${a} != ${b}`);
function world(key, names = []) {
  const w = fixture.setup(key, names.map(name => [name, 'A']), 0, 'dense', 41);
  const muzzle = w.combat.towerMuzzle(key);
  for (const e of w.game.enemies) { e.x = muzzle.x; e.y = muzzle.y - 100; }
  return w;
}
function tick(w, key, dt = 0) { modules[key][ticks[key]](w.combat, dt); }

try {
  let cases = 0;
  for (const [key, mapping] of Object.entries(skills)) {
    for (const [name, timer] of Object.entries(mapping)) {
      const cost = CONFIG.SKILL_ENERGY[name];
      for (const energy of [0, cost - 0.1, cost, cost + 0.1, 19.9, 20, 39.9, 40, 90, 90.1, 100]) {
        const w = world(key, [name]), c = w.combat;
        w.tower.energy = energy;
        c.timers[timer] = 1e9;
        const calls = [];
        const original = c.shotDmg.bind(c);
        c.shotDmg = (...args) => { calls.push(args); return original(...args); };
        tick(w, key);
        close(w.tower.energy, Math.max(0, energy - cost), `${key}/${name}/${energy} 扣费`);
        assert.equal(c.timers[timer], 0, name + ' 已释放才重置冷却');
        // 风眼在结束时才计算伤害，冰墙只生成护盾。
        if (!['冰墙', '风眼涡旋'].includes(name)) assert(calls.length, name + ' 缺能仍生成伤害');
        for (const args of calls) close(args[3], energy, name + ' 应用出手前快照');
        if (name === '风眼涡旋') {
          w.tower.energy = energy > 40 ? 0 : 100;
          modules.boomerang.updateVortexes(c, 100);
          assert(calls.length);
          close(calls[0][3], energy, '延迟风眼爆炸保留原能量');
        }
        cases++;
      }
      const empty = world(key, [name]);
      empty.game.enemies = [];
      empty.tower.energy = 60;
      empty.combat.timers[timer] = 1e9;
      tick(empty, key);
      close(empty.tower.energy, independent.has(name) ? 60 - cost : 60, name + ' 空场');
      assert.equal(empty.combat.timers[timer], independent.has(name) ? 0 : 1e9, name + ' 空场就绪状态');
    }
  }

  // 普攻真实弹道伤害与费用，不只检查传参；包含零能量、费用临界、能量跨档。
  for (const key of Object.keys(CONFIG.TOWERS)) {
    const cost = CONFIG.TOWERS[key].attackCost;
    for (const energy of [0, cost / 2, cost, 20.1, 40.1, 90.1, 100]) {
      const w = world(key), c = w.combat;
      const normal = c.shotDmg(key, false, false, 60);
      w.tower.energy = energy;
      c.attackOnce(key);
      close(w.tower.energy, Math.max(0, energy - cost), key + ' 普攻扣费');
      assert(c.shots.length, key + ' 缺能不停火');
      close(c.shots[0].dmg, normal * Energy.evaluate(energy).attack, key + ' 普攻出手前伤害');
    }
    const empty = world(key);
    empty.game.enemies = [];
    empty.tower.energy = 60;
    empty.combat.attackOnce(key);
    empty.combat.bonusStrike(key, '3');
    close(empty.tower.energy, 60, key + ' 普攻/三消无目标不收费');
  }

  // 扣到0后射程缩短，不得使这次已经锁定的区域技能失去目标。
  for (const [key, name, timer] of [
    ['fire', '火柱', 'firePillar'], ['ice', '冰花', 'iceFlower'], ['poison', '毒池', 'pool'],
    ['electric', '极光电击', 'arc'], ['boomerang', '风暴镖', 'storm'], ['cannon', '炮台', 'turret'],
  ]) {
    const w = world(key, [name]), c = w.combat;
    w.tower.energy = CONFIG.SKILL_ENERGY[name];
    const target = w.game.enemies[0], muzzle = c.towerMuzzle(key);
    target.x = muzzle.x;
    target.y = muzzle.y - (400 + c.range(key)) / 2;
    w.game.enemies = [target];
    assert(c.inTowerRange(key, target.x, target.y));
    c.timers[timer] = 1e9;
    const calls = [];
    const shot = c.shotDmg.bind(c);
    c.shotDmg = (...args) => { calls.push(args); return shot(...args); };
    tick(w, key);
    assert(calls.length, key + ' 扣费后仍应命中出手前射程内的目标');
    assert(!c.inTowerRange(key, target.x, target.y), key + ' 下次攻击按新能量射程');
    assert(c.inTowerRange(key, target.x, target.y, CONFIG.SKILL_ENERGY[name]));
  }

  const multi = world('fire', ['火柱', '烈焰墙', '火雨']);
  multi.tower.energy = 3.5;
  for (const timer of Object.values(skills.fire)) multi.combat.timers[timer] = 1e9;
  const used = [], cast = multi.combat.castEnergy.bind(multi.combat);
  multi.combat.castEnergy = (...args) => { const value = cast(...args); used.push(value); return value; };
  tick(multi, 'fire');
  assert.deepEqual(used, [3.5, 1.5, 0], '同帧逐次扣费，不共用帧初能量');
  close(multi.tower.energy, 0, '同帧不得透支');

  const bank = world('cannon');
  bank.tower.energy = 0;
  bank.run.energyBank = 1;
  const normal = bank.combat.shotDmg('cannon', false, false, 60);
  bank.combat.attackOnce('cannon');
  close(bank.run.energyBank, 0, '先借用备用能量');
  close(bank.combat.shots[0].dmg, normal * 0.6, '借用完成后记录能量档位');
  const skillBank = world('fire', ['火柱']);
  skillBank.tower.energy = 0.5;
  skillBank.run.energyBank = 10;
  skillBank.combat.timers.firePillar = 1e9;
  tick(skillBank, 'fire');
  close(skillBank.tower.energy, 0, '周期技扣余量');
  close(skillBank.run.energyBank, 10, '周期技保留不借备用库的规则');

  const refund = world('boomerang', ['接镖']);
  refund.tower.pool.find(s => s.name === '接镖').branches.B = 1;
  refund.tower.energy = 0.1;
  const random = Math.random;
  Math.random = () => 0;
  try { refund.combat.attackOnce('boomerang'); } finally { Math.random = random; }
  close(refund.tower.energy, 0.1, '免耗只退实际扣款，不凭名义费用增能');

  // 三消额外攻击沿用基础收费与快照；直接伤害读真实血量差。
  const bonus = world('fire');
  bonus.game.enemies = [bonus.game.enemies[0]];
  bonus.tower.energy = 0.1;
  const victim = bonus.game.enemies[0], hp = victim.hp;
  const expected = bonus.combat.shotDmg('fire', false, false, 60) * 0.6;
  bonus.combat.bonusStrike('fire', '3');
  assert(Math.abs(hp - victim.hp - expected) < 1e-5);
  close(bonus.tower.energy, 0, '三消扣光余量');

  console.log(`PASS: ${cases} periodic boundaries, six-tower attack damage/fees, empty field, cast-range snapshots, delayed vortex, sequential casts, reserve bank, refund and match bonus.`);
} finally { fixture.restore(); }
