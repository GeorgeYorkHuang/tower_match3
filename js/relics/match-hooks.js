'use strict';
// Match-related relic hooks. All mutable state belongs to the supplied Run.
// Preserve call order: experience base is calculated before the combo shape promotion.
function beforeMatch(run, shape, size) {
    const comboN = run.relicNum('cm_combo');
    if (comboN > 0 && size <= 3 && run.rng() < comboN / 100) {
      shape = '4'; size = 4;
      run.relicFx('cm_combo', `4连触发 +${comboN}%`); // 生效提示
    }
    // 力量符3★：4连及以上消除 → 全塔伤害永久 +0.5%（本局，上限15%）
    if (run.relic3('cm_power') && (size >= 4 || shape === '4' || shape === 'L5' || shape === '5')) {
      run.cmPower3 = Math.min(15, run.cmPower3 + 0.5);
      run.relicFx('cm_power', `4连叠伤 +${run.cmPower3}%`); // 生效提示
    }
    return { shape, size };
}
function experience(run, value, shape, size) {
  let amount = Math.round(value * (1 + run.relicNum('s_sr_cm_triple') / 100));
  const isFourOrMore = (size || 0) >= 4 || shape === '4' || shape === 'L5' || shape === '5' || shape === '6+';
  if (isFourOrMore && run.relic3('s_sr_cm_triple')) {
    amount = Math.round(amount * (1 + run.relicValue('s_sr_cm_triple', 'fourMatchExp') / 100));
  }
  return amount;
}
function onTowerOverflow(run, over) {
  if (run.relic3('cm_ammobox') && run.rng() < 0.5) {
    const room = 20 - run.energyBank;
    if (room > 0) run.energyBank += Math.min(over, room);
  }
}
function onGlobalOverflow(run, over) {
  if (over > 0 && run.relic3('cm_charge')) run.chargeSkillBoost = Math.min(50, run.chargeSkillBoost + 10);
}
module.exports = { beforeMatch, experience, onTowerOverflow, onGlobalOverflow };
