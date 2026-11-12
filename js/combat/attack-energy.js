/** 普攻费用只按技能初次激活档计算；本模块不读取任何分支或升级等级。 */
'use strict';
const SKILLS = require('../config/tower-skills.js');
const ENERGY_SKILLS = Object.fromEntries(Object.entries(SKILLS).map(([key, skills]) =>
  [key, Object.entries(skills).filter(([, skill]) => skill.attackEnergyFactor != null)]));

function attackEnergyMultiplier(combat, key) {
  const active = name => combat.lv(key, name) > 0;
  let factor = 1;
  if (key === 'fire') {
    const big = SKILLS.fire['大火球'];
    if (active('多重火球')) {
      const multi = SKILLS.fire['多重火球'];
      factor *= multi.count * (multi.damage + (active('大火球') ? 3 * big.splashDamage : 0));
    } else if (active('大火球')) factor *= big.mainDamage + 3 * big.splashDamage;
  } else if (key === 'ice') {
    if (active('多重冰锥')) {
      const multi = SKILLS.ice['多重冰锥'];
      factor *= (multi.count + (combat.relicVal('ice_blizzard') || 0)) * multi.damage;
    }
    if (active('冰穿刺')) factor *= 1 + .6 * (SKILLS.ice['冰穿刺'].baseTargets + (combat.relicVal('ice_pierce') || 0));
  } else if (key === 'poison' && active('剧毒')) {
    const toxic = SKILLS.poison['剧毒'];
    factor *= 1 + Math.min(1, toxic.baseProbability + toxic.learnedProbability) * toxic.baseDamage * toxic.baseDuration;
  } else if (key === 'electric' && active('连锁')) {
    const chain = SKILLS.electric['连锁'];
    factor *= 1 + Math.min(4, chain.extraTargets) * (1 - chain.decay);
    if (active('导电')) factor *= 1 + SKILLS.electric['导电'].baseChance * .5;
  }
  if (key === 'boomerang') {
    const multi = SKILLS.boomerang['多镖'], learned = active('多镖');
    const count = multi.baseCount + (learned ? 1 + combat.game.run.relicValue('s_sr_boo_multi', 'projectileAdd') : 0);
    const decay = learned ? multi.damageDecayPerLevel : 0;
    const damage = learned ? 1 + combat.game.run.relicNum('s_sr_boo_multi') / 100 : 1;
    factor *= count * Math.max(0, 1 - decay) * damage;
  } else if (key === 'cannon') {
    if (active('重炮')) {
      const heavy = SKILLS.cannon['重炮'];
      factor *= 1 + 3 * (heavy.splashDamage + heavy.damagePerLevel);
    }
    if (active('双管齐射')) {
      const chance = Math.min(1, .25 + (combat.relicVal('can_double') || 0) / 100 + combat.game.run.relicValue('s_can_splash', 'doubleChance') / 100);
      factor *= 1 + chance;
    }
  }
  // 保留各技能独立的首次激活折算和既有圣物口径，真实分支收益仍由攻击模块处理。
  let coefficient = 1;
  for (const [name, definition] of ENERGY_SKILLS[key] || []) {
    const value = definition.attackEnergyFactor;
    if (active(name) && Number.isFinite(value) && value >= 0) coefficient *= value;
  }
  return Math.max(1, Number.isFinite(factor) ? factor : 1) * coefficient;
}
module.exports = { attackEnergyMultiplier };
