'use strict';
const SKILL_NUM = require('../config/tower-skills.js');
const ElectricTower = require('./towers/electric.js');
const PoisonTower = require('./towers/poison.js');
const BoomerangTower = require('./towers/boomerang.js');

function tryAttackDebuff(combat, key, o, dmg) {
  if (key === 'fire') {
    // 灼烧（v1.16.21）：基础 20%；学「点燃」+25%（A 炽焰每级再 +15%）
    const ignite = combat.lv('fire', '点燃');
    let burnProb = SKILL_NUM.fire['点燃'].baseProbability;
    if (ignite > 0) burnProb += SKILL_NUM.fire['点燃'].learnedProbability + SKILL_NUM.fire['点燃'].probabilityPerBranch * combat.branchLv('fire', '点燃', 'A');
    burnProb += combat.relicVal('fire_fuel') / 100;   // v1.16.114 薪柴1★/2★：普攻灼烧概率 +20%/30%
    // v1.16.96 薪柴3★：灼烧概率触顶（≥80%）时，多余的判定转为 +10% 灼烧伤害（失败部分累积，上限 +50%）
    if (combat.game.run.relic3('fire_fuel') && burnProb >= 0.8) {
      if (Math.random() < 0.8) combat.applyBurn(o, dmg, 'fire');
      else combat.game.run._fuelBoost = Math.min(50, (combat.game.run._fuelBoost || 0) + 10);
    } else if (Math.random() < burnProb) combat.applyBurn(o, dmg, 'fire');
  } else if (key === 'ice') {
    // 冰缓（v1.16.21）：基础 20%；学寒霜 +25% + A 极寒每级 +15%（45→60→75→90%）；B 凝结 时长 +1/+2/+3s；C 深寒 减速幅度 +10%/20%/30%
    const frost = combat.lv('ice', '寒霜');
    const probSlow = SKILL_NUM.ice['寒霜'].baseProbability + (frost > 0 ? SKILL_NUM.ice['寒霜'].learnedProbability + SKILL_NUM.ice['寒霜'].probabilityPerBranch * combat.branchLv('ice', '寒霜', 'A') : 0) + combat.relicVal('ice_extreme') / 100;   // v1.16.114 极寒1★/2★
    // v1.16.99 极寒3★：冰缓概率触顶（≥80%）时，多余判定转为 0.3 秒冻结
    const ext = combat.game.run.relic3('ice_extreme') && probSlow >= 0.8;
    const slowOK = ext ? Math.random() < 0.8 : Math.random() < probSlow;
    if (slowOK) {
      const mult = SKILL_NUM.ice['寒霜'].baseSlow + SKILL_NUM.ice['寒霜'].slowMult[combat.branchLv('ice', '寒霜', 'C')] + combat.relicVal('ice_spike') / 100;   // v1.16.114 霜刺1★/2★
      const ttl = SKILL_NUM.ice['寒霜'].duration + SKILL_NUM.ice['寒霜'].ttl[combat.branchLv('ice', '寒霜', 'B')];
      combat.applySlow(o, mult, ttl);
      combat.fxParticle(o.x, o.y, '#a9d6f5', 6, 50, 0.5, 80, 5);
    } else if (ext) {
      combat.freezeE(o, 0.3);
    }
    // 冰冻（v1.16.21）：学技能后 20% 概率冻结 + A 档位；B 深结 时长 +1/1.5/2s
    const frzLv = combat.lv('ice', '冰冻');
    if (frzLv > 0) {
      const prob = SKILL_NUM.ice['冰冻'].baseProbability + SKILL_NUM.ice['冰冻'].prob[combat.branchLv('ice', '冰冻', 'A')];
      if (Math.random() < prob) {
        const dur = SKILL_NUM.ice['冰冻'].baseDuration + SKILL_NUM.ice['冰冻'].dur[combat.branchLv('ice', '冰冻', 'B')];
        o.frozen = Math.max(o.frozen || 0, dur);
        combat.fxFlash(o.x, o.y, '#d6f0ff', 0.28);
        combat.fxRing(o.x, o.y, '#7fd4ff', 46, 0.4, 4);
        combat.fxParticle(o.x, o.y, '#b8e6ff', 10, 60, 0.5, 130, 5);
      }
    }
  } else if (key === 'electric') {
    ElectricTower.tryAttackDebuff(combat, o, dmg);
  } else if (key === 'poison') {
    PoisonTower.tryAttackDebuff(combat, o, dmg);
  } else if (key === 'boomerang') {
    BoomerangTower.tryAttackDebuff(combat, o, dmg);
  }
}

function hit(combat, key, e, dmg) {
  const g = combat.game;
  ElectricTower.onAnyTowerHit(combat, e);

  if (key === 'fire') combat.hitFire(e, dmg);
  else if (key === 'ice') combat.hitIce(e, dmg);
  else if (key === 'poison') combat.hitPoison(e, dmg);
  else if (key === 'electric') combat.hitElectric(e, dmg);
  else if (key === 'boomerang') combat.hitBoomerang(e, dmg);
  else if (key === 'cannon') combat.hitCannon(e, dmg);

  // 命中计数（电·充能）
  e.hitCount++;
  // 命中特效：按塔类型爆发专属粒子（v1.13.2 增强：数量更多 + 命中冲击环 + 双色火花）
  const HIT_FX = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
  combat.fxParticle(e.x, e.y, HIT_FX[key] || '#ffffff', 8, 52, 0.4, 140, 5);
  combat.fxParticle(e.x, e.y, '#ffffff', 4, 30, 0.25, 110, 3);
  combat.fxRing(e.x, e.y, HIT_FX[key] || '#ffffff', 30, 0.28, 3);
  combat.fxFlash(e.x, e.y, '#ffffff', 0.25);
}

module.exports = { hit, tryAttackDebuff };
