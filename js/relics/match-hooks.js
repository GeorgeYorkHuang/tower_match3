'use strict';
// Match-related relic hooks. All mutable state belongs to the supplied Run.
// Preserve call order: experience base is calculated before the combo shape promotion.
function beforeMatch(run, shape, size) { return {shape,size}; }
function experience(run, value) { return value; }
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
