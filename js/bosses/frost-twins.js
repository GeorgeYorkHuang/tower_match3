'use strict';
const spec = require('../config/boss-expansion.js').frost_twins;
const base = require('../config/bosses.js').altar_galvin;
// 沿用当前首关预算同比折算，尚待实战数值平衡。
const B = { ...base, ...spec, hp: 109000, armor: 0.20, attack: 275, speed: 0.96,
  twinArmor: 0.10, armorPerStack: 0,
  echoPeriod: spec.suppressionPeriod, echoDuration: spec.suppressionDuration,
  echoSlow: 1 - spec.attackRateScale, echoTowerCount: 6,
  resonanceAttackPerStack: spec.attackPerStack, resonanceHealPerStack: 0,
  splitLabel: '风裂', suppressionLabel: '风蚀', recoveryLabel: '霜灵回风',
  adds: [[9,9,9,10,10,10,10,10,10,10,10], [9,9,9,9,10,10,10,10,10,10,10,10,10]],
};
module.exports = require('./twin-encounter.js')(B);
