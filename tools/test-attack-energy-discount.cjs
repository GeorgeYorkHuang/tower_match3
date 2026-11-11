/** 技能独立能耗系数：真实扣款、不同技能相乘、首次激活一次、分支不重复折算。 */
'use strict';
const assert = require('assert');
const fixture = require('./tower-balance-fixture.cjs');
const CONFIG = require('../js/config.js');
const SKILLS = require('../js/config/tower-skills.js');
const { attackEnergyMultiplier } = require('../js/combat/attack-energy.js');
const close = (a, b, label) => assert(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
function world(key, names = []) {
  const w = fixture.setup(key, names.map(name => [name, 'A']), 0, 'dense', 41);
  const m = w.combat.towerMuzzle(key);
  for (const e of w.game.enemies) { e.x = m.x; e.y = m.y - 100; }
  return w;
}

try {
  const cases = [
    ['fire', ['多重火球'], 0.77 * 0.8],
    ['fire', ['大火球'], (35 / 60) * 2.54 * 0.8],
    ['fire', ['多重火球', '大火球'], (35 / 60) * 5.64 * 0.8 * 0.8],
    ['ice', ['多重冰锥'], 0.66 * 0.8],
    ['ice', ['冰穿刺'], 0.4 * 1.6 * 0.8],
    ['poison', ['剧毒'], (16 / 60) * 1.225 * 0.8],
    ['electric', ['连锁'], 1.2 * 0.8],
    ['boomerang', ['多镖'], (26 / 60) * 1.76 * 0.8],
    ['cannon', ['重炮'], 2.2 * 0.8],
    ['cannon', ['双管齐射'], 1.25 * 0.8],
    ['cannon', ['重炮', '双管齐射'], 2.75 * 0.8 * 0.8],
  ];
  for (const [key, names, expected] of cases) {
    for (const energy of [0, expected / 2, expected, 60]) {
      const w = world(key, names);
      w.tower.energy = energy;
      const dmg = w.combat.shotDmg(key);
      w.combat.attackOnce(key);
      close(w.tower.energy, Math.max(0, energy - expected), `${key}/${names}/${energy} 实扣`);
      assert(w.combat.shots.length, '缺能仍发射');
      if (names.length === 1 && names[0] === '剧毒') close(w.combat.shots[0].dmg, dmg, '八折不更改本次伤害');
    }
  }

  // 未参与倍率收费的周期技或辅助技能不让基础普攻自动打折。
  for (const [key, name] of [
    ['fire', '火柱'], ['ice', '冰花'], ['poison', '毒池'],
    ['electric', '球形闪电'], ['boomerang', '接镖'], ['cannon', '炮台'],
  ]) {
    for (const names of [[], [name]]) {
      const w = world(key, names);
      w.tower.energy = 60;
      w.combat.attackOnce(key);
      close(60 - w.tower.energy, CONFIG.TOWERS[key].attackCost, key + ' 基础费保持不变');
    }
  }

  const small = world('ice', ['多重冰锥']);
  small.tower.pool.find(s => s.name === '多重冰锥').branches.C = 1;
  small.tower.energy = 60;
  small.combat.attackOnce('ice');
  close(60 - small.tower.energy, 0.32, '10枚10%小冰锥合计1倍，仍应收0.4×0.8');

  const armory = world('cannon', ['军火库']);
  armory.tower.pool.find(s => s.name === '军火库').branches.C = 1;
  armory.tower.energy = 120;
  armory.combat.attackOnce('cannon');
  close(120 - armory.tower.energy, 0.88, '军火库高能普攻1.1倍再八折');
  armory.tower.energy = 60;
  close(attackEnergyMultiplier(armory.combat, 'cannon'), 0.8, '激活后折算独立于军火库高能增伤条件');

  const resonance = world('electric', ['电磁过载']);
  close(attackEnergyMultiplier(resonance.combat, 'electric'), 0.8, '激活电磁过载即提供自身能耗系数');
  resonance.tower.pool.find(s => s.name === '电磁过载').branches.C = 1;
  resonance.tower.energy = 60;
  resonance.combat.attackOnce('electric');
  close(60 - resonance.tower.energy, 0.5 * 1.1 * 0.8, '共振普攻增伤统一八折');

  // 参数位于各技能，修改其中一个只影响对应技能；组合按各自参数相乘。
  const heavy = SKILLS.cannon['重炮'], double = SKILLS.cannon['双管齐射'];
  const heavyFactor = heavy.attackEnergyFactor, doubleFactor = double.attackEnergyFactor;
  try {
    heavy.attackEnergyFactor = 0.65;
    double.attackEnergyFactor = 0.9;
    const alone = world('cannon', ['重炮']);
    alone.combat.attackOnce('cannon');
    close(60 - alone.tower.energy, 2.2 * 0.65, '重炮独立配置');
    const together = world('cannon', ['重炮', '双管齐射']);
    together.combat.attackOnce('cannon');
    close(60 - together.tower.energy, 2.75 * 0.65 * 0.9, '两个技能分别取配置后相乘');
    const ice = world('ice', ['多重冰锥']);
    ice.combat.attackOnce('ice');
    close(60 - ice.tower.energy, 0.66 * 0.8, '改炮塔系数不影响冰塔');
  } finally {
    heavy.attackEnergyFactor = heavyFactor;
    double.attackEnergyFactor = doubleFactor;
  }

  // 对每个配置技能走真实激活/分支升级，系数仅计一次而不是按技能等级求幂。
  let activationCases = 0;
  for (const [key, definitions] of Object.entries(SKILLS)) {
    for (const [name, definition] of Object.entries(definitions)) {
      if (definition.attackEnergyFactor == null) continue;
      const w = world(key, [name]);
      for (let branch = 0; branch <= 3; branch++) {
        if (branch > 0) {
          w.tower.pending++;
          assert(w.tower.applyChoice({ name, type: 'branch', branch: 'A', fromTower: key }, { [key]: w.tower }).ok);
        }
        w.tower.energy = 60;
        const coefficient = definition.attackEnergyFactor;
        let expected;
        try {
          definition.attackEnergyFactor = 1;
          expected = attackEnergyMultiplier(w.combat, key) * coefficient;
        } finally { definition.attackEnergyFactor = coefficient; }
        close(attackEnergyMultiplier(w.combat, key), expected, name + ' 分支不多折算');
        close(attackEnergyMultiplier(w.combat, key), expected, name + ' 重复读取不累乘');
        w.combat.attackOnce(key);
        close(60 - w.tower.energy, CONFIG.TOWERS[key].attackCost * expected, name + ' 激活/升级真实扣费');
        activationCases++;
      }
      w.run.resetRunBuild();
      close(attackEnergyMultiplier(w.combat, key), 1, name + ' 新局不继承旧局折算');
    }
  }

  // 多重弹数/伤害与穿透预估相乘，两个已激活技能再各提供一次自身系数。
  const icePair = world('ice', ['多重冰锥', '冰穿刺']);
  icePair.combat.attackOnce('ice');
  close(60 - icePair.tower.energy, 0.66 * 1.6 * 0.8 * 0.8, '多重/穿透组合完整计费，独立系数只计一次');

  const free = world('cannon', ['重炮']);
  free.game.meta.relicStars.can_rapid = 3;
  free.run.runRelic.can_rapid = 1;
  free.tower._rapidN = 9;
  free.tower.energy = 60;
  free.combat.attackOnce('cannon');
  close(free.tower.energy, 60, '免耗仍免耗');

  const refund = world('boomerang', ['多镖', '接镖']);
  refund.tower.pool.find(s => s.name === '接镖').branches.B = 1;
  refund.tower.energy = 0.1;
  const random = Math.random;
  Math.random = () => 0;
  try { refund.combat.attackOnce('boomerang'); } finally { Math.random = random; }
  close(refund.tower.energy, 0.1, '折扣后免耗退款仍只退实扣');

  const bonus = world('fire', ['多重火球']);
  bonus.tower.energy = 60;
  bonus.combat.bonusStrike('fire', '3');
  close(60 - bonus.tower.energy, 35 / 60, '三消额外攻击仍按基础费，不误套普攻强化折扣');
  console.log(`PASS 44 enhanced launches and ${activationCases} activation/upgrade cases; independent coefficients and combinations; no repeat on upgrades/read/reset; base/periodic-only fees, small icicle, free/refund, match bonus.`);
} finally { fixture.restore(); }
