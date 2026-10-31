// 塔升级与圣遗物三选一共享本局重掷次数，不消耗选择机会。
'use strict';
const RULE = require('../config/shop.js').reroll;
function cost(run) { return RULE.first + Math.max(0, run.pickRerolls || 0) * RULE.step; }
function reroll(run, roll) {
  const price = cost(run);
  if (run.gold < price) return { ok: false, reason: 'gold', cost: price };
  const result = roll();
  if (!result || !(result.candidates || result).length) return { ok: false, reason: 'empty' };
  run.gold -= price; run.pickRerolls = (run.pickRerolls || 0) + 1;
  return { ok: true, result, cost: price };
}
module.exports = { cost, reroll };
