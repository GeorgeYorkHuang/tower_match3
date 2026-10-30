'use strict';
// Match-related relic hooks. All mutable state belongs to the supplied Run.
// Preserve call order: experience base is calculated before the combo shape promotion.
function beforeMatch(run, shape, size) {
    const comboN = run.relicNum('cm_combo');
    if (comboN > 0 && size <= 3 && run.rng() < comboN / 100) {
      shape = '4'; size = 4;
      run.relicFx('cm_combo', `4连触发 +${comboN}%`); // v1.17 生效提示
    }
    // v1.16.96 力量符3★：4连及以上消除 → 全塔伤害永久 +0.5%（本局，上限15%）
    if (run.relic3('cm_power') && (size >= 4 || shape === '4' || shape === 'L5' || shape === '5')) {
      run.cmPower3 = Math.min(15, run.cmPower3 + 0.5);
      run.relicFx('cm_power', `4连叠伤 +${run.cmPower3}%`); // v1.17 生效提示
    }
    return { shape, size };
}
function experience(run, value) {
  let amount = Math.round(value * (1 + run.relicNum('cm_triple') / 100));
  if (run._triple3) amount = Math.round(amount * 1.5);
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
