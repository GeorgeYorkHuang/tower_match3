/** 普攻出手前的费用预估：组合技能相乘，再应用各技能独立的首次激活系数。 */
'use strict';

// 普攻强化先按预期输出合并倍率，再叠加各已激活技能自己的能耗系数。
const SKILL_NUM = require('../config/tower-skills.js');
// 配置决定哪些技能参与折算；只缓存配置引用，不记录本局选择次数，避免升级/读档重复叠加。
const ENERGY_SKILLS = Object.fromEntries(Object.entries(SKILL_NUM).map(([key, skills]) =>
  [key, Object.entries(skills).filter(([, skill]) => skill.attackEnergyFactor != null)]));

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
      // 普通/小冰锥都沿用真实发射数量，圣物追加弹数不因进入C分支而漏算。
      const n = (c > 0 ? multi.swarm[c] : multi.count) + branch('多重冰锥', 'A') + (combat.relicVal('ice_blizzard') || 0);
      const perShot = c > 0 ? multi.swarmDamage : multi.damage;
      factor *= n * perShot * (1 + multi.damagePerBranch * b);
    }
    // 每枚冰锥都可以穿透，必须在多重倍率之后继续合并；只在出手时收费一次。
    if (lv('冰穿刺')) {
      const pierce = SKILL_NUM.ice['冰穿刺'];
      const extraHits = pierce.baseTargets + branch('冰穿刺', 'A') + (combat.relicVal('ice_pierce') || 0);
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
      const bonus = balance.resonanceDamage[overload.C] || 0;
      factor *= 1 + bonus;
    }
  }

  if (key === 'boomerang') {
    const multi = SKILL_NUM.boomerang['多镖'];
    const multiLv = combat.lv(key, '多镖') || 0;
    const extra = multiLv + (multiLv > 0 ? combat.game.run.relicValue('s_sr_boo_multi', 'projectileAdd') : 0);
    const count = multi.baseCount + extra;
    // 与launchAttack一致：同轮每枚都是同一伤害倍率，不按第i枚继续递减；
    // 圣物只追加数量，其伤害衰减仍由多镖技能等级决定。
    const decay = multiLv > 0 ? multi.damageDecayPerLevel * multiLv * (branch('多镖', 'B') > 0 ? multi.branchDecayMultiplier : 1) : 0;
    const multiDmg = multiLv > 0 ? 1 + combat.game.run.relicNum('s_sr_boo_multi') / 100 : 1;
    factor *= count * Math.max(0, 1 - decay) * multiDmg;
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

  const expected = Math.max(1, Number.isFinite(factor) ? factor : 1);
  // 每个已激活技能只乘一次自己的系数；lv仅判断是否激活，不作为次数/指数。
  // 系数位于原有倍率下限之后，小冰锥等1倍强化仍可获得能效收益。
  let energyFactor = 1;
  for (const [name, skill] of ENERGY_SKILLS[key] || []) {
    const value = skill.attackEnergyFactor;
    if (lv(name) > 0 && Number.isFinite(value) && value >= 0) energyFactor *= value;
  }
  return expected * energyFactor;
}

module.exports = { attackEnergyMultiplier };
