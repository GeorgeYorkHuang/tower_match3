/** 校验分支成长仍改变实弹，普攻组合收费固定激活档；覆盖缺能与圣物追加。 */
'use strict';
const assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const SKILLS = require('../js/config/tower-skills.js');
const CONFIG = require('../js/config.js');
const { attackEnergyMultiplier } = require('../js/combat/attack-energy.js');
const close = (a, b, text) => assert(Math.abs(a - b) < 1e-7, `${text}: ${a} != ${b}`);

function upgrade(w, name, branch, level) {
  for (let n = 0; n < level; n++) {
    w.tower.pending++;
    assert(w.tower.applyChoice({ name, type: 'branch', branch, fromTower: w.tower.key }, { [w.tower.key]: w.tower }).ok);
  }
}
function relics(w, projectiles, pierce, damage) {
  const num = w.combat.relicVal.bind(w.combat);
  w.combat.relicVal = id => id === 'ice_blizzard' ? projectiles : id === 'ice_pierce' ? pierce : num(id);
  const value = w.run.relicValue.bind(w.run), percent = w.run.relicNum.bind(w.run);
  w.run.relicValue = (id, effect) => id === 's_sr_boo_multi' && effect === 'projectileAdd' ? projectiles : value(id, effect);
  w.run.relicNum = id => id === 's_sr_boo_multi' ? damage : percent(id);
}
function launch(w, key, energy) {
  w.tower.energy = energy;
  const base = w.combat.shotDmg(key, false, false, energy);
  const factor = attackEnergyMultiplier(w.combat, key);
  const expectedCost = CONFIG.TOWERS[key].attackCost * factor;
  w.combat.attackOnce(key);
  close(w.tower.energy, Math.max(0, energy - expectedCost), '仅出手时扣一次，缺能扣光');
  assert(w.combat.shots.length > 0, '缺能仍释放');
  return { base, factor, cost: expectedCost, shots: w.combat.shots };
}
try {
  let cases = 0;
  const variants = [['A', 0], ['A', 1], ['A', 2], ['A', 3], ['B', 1], ['B', 3], ['C', 1], ['C', 3]];
  for (const [multiBranch, multiLevel] of variants) for (const [pierceBranch, pierceLevel] of [['A', 0], ['A', 1], ['A', 3], ['B', 1], ['B', 3]]) {
    const w = api.setup('ice', [['多重冰锥', 'A'], ['冰穿刺', 'A']], 0, 'dense', 41, 'finite');
    upgrade(w, '多重冰锥', multiBranch, multiLevel); upgrade(w, '冰穿刺', pierceBranch, pierceLevel);
    const { base, factor, shots } = launch(w, 'ice', 60);
    const first = shots.reduce((sum, s) => sum + s.dmg / base, 0);
    const extra = shots[0].pierceMaxHits - 1;
    const follow = 1 + SKILLS.ice['冰穿刺'].pierceDmg[pierceBranch === 'B' ? pierceLevel : 0];
    close(factor, 1.65 * 1.6 * .8 * .8, '任意分支组合沿用两个技能的初始档费用');
    assert(first > 0 && extra >= 1 && follow >= 1, '分支实弹与穿透仍正常生成');
    close(attackEnergyMultiplier(w.combat, 'ice'), factor, '读取不重复折算');
    cases++;
  }
  for (const key of ['ice', 'boomerang']) for (const energy of [0, .1, 1, 19.9, 20, 39.9, 40, 60]) {
    const names = key === 'ice' ? [['多重冰锥', 'C'], ['冰穿刺', 'A']] : [['多镖', 'A']];
    const w = api.setup(key, names, 3, 'dense', 41, 'finite');
    const out = launch(w, key, energy);
    const projectileFactor = out.shots.reduce((sum, s) => sum + s.dmg / out.base, 0);
    const expected = key === 'ice' ? 1.65 * 1.6 * .64 : 1.76 * .8;
    close(out.factor, expected, '临界能量不改变费用预估');
    close(projectileFactor, key === 'ice' ? 1.8 : 2.6, '实弹伤害使用扣费前能量'); cases++;
  }
  for (const [branch, level] of variants.filter(([b]) => b !== 'C')) for (const extra of [0, 2]) {
    const w = api.setup('boomerang', [['多镖', 'A']], 0, 'dense', 41, 'finite');
    upgrade(w, '多镖', branch, level); relics(w, extra, 0, extra ? 15 : 0);
    const { base, factor, shots } = launch(w, 'boomerang', 60);
    const actual = shots.reduce((sum, s) => sum + s.dmg / base, 0);
    close(factor, (2 + extra) * .88 * (1 + (extra ? .15 : 0)) * .8, '分支不加价，圣物费用仍按原有口径');
    assert(shots.every(s => Math.abs(s.dmg - shots[0].dmg) < 1e-7)); cases++;
  }
  for (const swarm of [false, true]) {
    const w = api.setup('ice', [['多重冰锥', swarm ? 'C' : 'A'], ['冰穿刺', 'A']], 3, 'dense', 41, 'finite');
    relics(w, 2, 3, 0);
    const { base, factor, shots } = launch(w, 'ice', 60);
    const actual = shots.reduce((sum, s) => sum + s.dmg / base, 0);
    close(factor, 5 * .55 * (1 + .6 * 4) * .64, '圣物追加沿用原口径，普通/小冰锥分支不额外加价');
    assert(actual > 0 && shots[0].pierceMaxHits > 4); cases++;
  }
  const a = SKILLS.ice['多重冰锥'].attackEnergyFactor, b = SKILLS.ice['冰穿刺'].attackEnergyFactor;
  try {
    SKILLS.ice['多重冰锥'].attackEnergyFactor = .7; SKILLS.ice['冰穿刺'].attackEnergyFactor = .9;
    const w = api.setup('ice', [['多重冰锥', 'C'], ['冰穿刺', 'A']], 3, 'dense', 41, 'finite');
    close(launch(w, 'ice', 60).factor, 1.65 * 1.6 * .7 * .9, '组合仍分别读取独立参数');
  } finally { SKILLS.ice['多重冰锥'].attackEnergyFactor = a; SKILLS.ice['冰穿刺'].attackEnergyFactor = b; }
  // 真实碰撞/穿透/碎冰和回程扫敌都不能再次收费。
  for (const key of ['ice', 'boomerang']) {
    const choices = key === 'ice' ? [['多重冰锥', 'C'], ['冰穿刺', 'A'], ['碎冰', 'B']] : [['多镖', 'A']];
    const w = api.setup(key, choices, 3, 'dense', 41, 'finite');
    let debits = 0;
    const spend = w.run.spendAttackEnergy.bind(w.run);
    w.run.spendAttackEnergy = (...args) => { debits++; return spend(...args); };
    launch(w, key, 60); const paidBalance = w.tower.energy;
    for (let frame = 0; frame < 300; frame++) for (let i = w.combat.shots.length - 1; i >= 0; i--) {
      if (!w.combat.stepShot(w.combat.shots[i], 1 / 60)) w.combat.shots.splice(i, 1);
    }
    assert.equal(debits, 1, '一轮攻击只扣一次');
    close(w.tower.energy, paidBalance, '命中/穿透/派生/回程均不补扣'); cases++;
  }
  console.log(`PASS ${cases} real-projectile budget cases; legal branch combinations, shortages/snapshots, relic counts/damage, independent factors, no per-hit charges.`);
} finally { api.restore(); }
