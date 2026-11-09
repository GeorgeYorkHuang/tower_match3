// 塔升级与圣遗物三选一共享本局重掷次数，不消耗选择机会。
'use strict';
const RULE = require('../config/shop.js').reroll;
function cost(run, kind) {
  const base = RULE.first + Math.max(0, run.pickRerolls || 0) * RULE.step;
  // 寻踪只优惠圣遗物重掷；技能升级三选一仍按原价，共享的重掷次数不变。
  const discount = kind === 'relic' && run.relicNum ? run.relicNum('s_sr_cm_bounty') : 0;
  return Math.max(0, Math.round(base * (1 - Math.max(0, Math.min(100, discount)) / 100)));
}
function reroll(run, roll, kind) {
  const price = cost(run, kind);
  if (run.gold < price) return { ok: false, reason: 'gold', cost: price };
  const result = roll();
  if (!result || !(result.candidates || result).length) return { ok: false, reason: 'empty' };
  run.gold -= price; run.pickRerolls = (run.pickRerolls || 0) + 1;
  return { ok: true, result, cost: price };
}
module.exports = { cost, reroll };
