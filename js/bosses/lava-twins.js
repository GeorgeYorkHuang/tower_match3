'use strict';
const spec=require('../config/boss-expansion.js').lava_twins;
const base=require('../config/bosses.js').altar_galvin;
// 首版按当前首关生命预算同比折算，待实战平衡。
const B={...base,...spec,hp:84000,armor:0.35,attack:302,speed:0.70,twinSpeed:0.91,
echoPeriod:spec.suppressionPeriod,echoDuration:spec.suppressionDuration,echoSlow:1-spec.attackRateScale,echoTowerCount:6,
resonanceAttackPerStack:spec.attackPerStack,resonanceHealPerStack:0,
adds:[[9,9,9,9,9,9,9,9,10,10],[9,9,9,9,9,9,9,9,9,10,10,10]]};
module.exports=require('./twin-encounter.js')(B);
