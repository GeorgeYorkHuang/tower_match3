'use strict';

// Extra energy for direct-attack enhancers is priced against their expected
// damage output. A plain attack remains at the tower's configured base cost.
const SKILL_NUM = require('../config/tower-skills.js');

function attackEnergyMultiplier(combat, key) {
  let factor = 1;
  const lv = (name) => combat.lv(key, name) || 0;
  const branch = (name, which) => combat.branchLv(key, name, which) || 0;

  if (key === 'fire') {
    const big = lv('大火球');
    if (lv('多重火球')) {
      const b = branch('多重火球', 'B'), c = branch('多重火球', 'C');
      const multi = SKILL_NUM.fire['多重火球'];
      const n = multi.count + branch('多重火球', 'A');
      const bigSplash = big ? 3 * SKILL_NUM.fire['大火球'].splashDamage * (1 + SKILL_NUM.fire['大火球'].damagePerBranch * branch('大火球', 'B')) : 0;
      const main = n * (multi.damage * (1 + multi.condense[b]) + bigSplash);
      const burn = c > 0 ? multi.scatterBurnDps * multi.scatterBurnDuration[c] : 0;
      factor *= main + n * burn;
    } else if (big) {
      const large = SKILL_NUM.fire['大火球'];
      const main = large.mainDamage;
      const splash = 3 * large.splashDamage * (1 + large.damagePerBranch * branch('大火球', 'B'));
      factor *= main + splash;
    }
  } else if (key === 'ice') {
    if (lv('多重冰锥')) {
      const multi = SKILL_NUM.ice['多重冰锥'];
      const b = branch('多重冰锥', 'B'), c = branch('多重冰锥', 'C');
      const n = c > 0 ? multi.swarm[c] + branch('多重冰锥', 'A') : multi.count + branch('多重冰锥', 'A') + (combat.relicVal('ice_blizzard') || 0);
      const perShot = c > 0 ? multi.swarmDamage : multi.damage;
      factor *= n * perShot * (1 + multi.damagePerBranch * b);
    } else if (lv('冰穿刺')) {
      const pierce = SKILL_NUM.ice['冰穿刺'];
      const extraHits = pierce.baseTargets + branch('冰穿刺', 'A');
      const followUp = 1 + pierce.pierceDmg[branch('冰穿刺', 'B')];
      factor *= 1 + 0.6 * extraHits * followUp; // 60% expected occupancy for each additional hit lane
    }
  } else if (key === 'poison' && lv('剧毒')) {
    const toxic = SKILL_NUM.poison['剧毒'];
    const chance = Math.min(1, toxic.baseProbability + toxic.learnedProbability + toxic.probabilityPerBranch * branch('剧毒', 'A'));
    // Expected full poison contribution: per-stack DPS × base duration, relative to the hit.
    factor *= 1 + chance * toxic.baseDamage * toxic.baseDuration;
  } else if (key === 'electric' && lv('连锁')) {
    const chain = SKILL_NUM.electric['连锁'];
    const a = branch('连锁', 'A'), b = branch('连锁', 'B');
    const targets = Math.min(4, chain.extraTargets + chain.targetsPerBranch * a);
    const decay = chain.decay * (1 - chain.decayReductionPerBranch * b);
    factor *= 1 + targets * (1 - decay); // each chain hop uses the same reduced damage ratio
    if (lv('导电')) {
      const conductive = SKILL_NUM.electric['导电'];
      const chance = conductive.baseChance + conductive.branchAChance[branch('导电', 'A')];
      factor *= 1 + chance * 0.5; // expected extra strike on an already-paralyzed target
    }
  }
  if (key === 'electric' && combat.game && combat.game.run && typeof combat.game.run.electricOverload === 'function') {
    const overload = combat.game.run.electricOverload();
    const balance = SKILL_NUM.electric['电磁过载'];
    const tower = combat.tower('electric');
    const maxEnergy = typeof combat.game.run.armoryEnergyMax === 'function' ? combat.game.run.armoryEnergyMax('electric') : 0;
    if (overload.level > 0 && tower && tower.energy >= maxEnergy * balance.resonanceThreshold) {
      factor *= 1 + (balance.resonanceDamage[overload.C] || 0);
    }
  }

  if (key === 'boomerang') {
    const multi = SKILL_NUM.boomerang['多镖'];
    const multiLv = combat.lv(key, '多镖') || 0;
    const extra = multiLv + (multiLv > 0 ? combat.game.run.relicValue('s_sr_boo_multi', 'projectileAdd') : 0);
    const count = multi.baseCount + extra;
    const decay = extra > 0 ? multi.damageDecayPerLevel * extra * (branch('多镖', 'B') > 0 ? multi.branchDecayMultiplier : 1) : 0;
    let sum = 0;
    const multiDmg = multiLv > 0 ? 1 + combat.game.run.relicNum('s_sr_boo_multi') / 100 : 1;
    for (let i = 0; i < count; i++) sum += Math.max(0, 1 - decay * i) * multiDmg;
    factor *= sum;
    if (branch('折返增伤', 'A') > 0) {
      const fold = SKILL_NUM.boomerang['折返增伤'];
      factor *= 1 + fold.damage * (1 + fold.damagePerBranch * branch('折返增伤', 'A')) * (1 + combat.game.run.relicNum('s_sr_boo_hunt') / 100);
    }
  } else if (key === 'cannon') {
    const heavy = lv('重炮');
    if (heavy) {
      const h = SKILL_NUM.cannon['重炮'];
      const splash = h.splashDamage + h.damagePerLevel * heavy + h.damagePerBranch * branch('重炮', 'B');
      factor *= 1 + 3 * splash; // four-target reference, main target plus three splash targets
    }
    if (lv('双管齐射')) {
      const double = SKILL_NUM.cannon['双管齐射'];
      const chance = Math.min(1, 0.25 + 0.15 * branch('双管齐射', 'A') + (combat.relicVal('can_double') || 0) / 100 + combat.game.run.relicValue('s_can_splash', 'doubleChance') / 100);
      const third = double.thirdShotChance[branch('双管齐射', 'B')];
      factor *= 1 + chance * (1 + third * double.thirdShotDamage);
    }
    const armoryC = branch('军火库', 'C');
    const tower = combat.tower('cannon');
    const maxEnergy = typeof combat.game.run.armoryEnergyMax === 'function' ? combat.game.run.armoryEnergyMax('cannon') : 0;
    if (armoryC > 0 && tower && tower.energy >= maxEnergy * (SKILL_NUM.cannon['军火库'].overThreshold || 0.8)) {
      factor *= 1 + SKILL_NUM.cannon['军火库'].overPerBranch * armoryC;
    }
  }

  return Math.max(1, Number.isFinite(factor) ? factor : 1);
}

module.exports = { attackEnergyMultiplier };
