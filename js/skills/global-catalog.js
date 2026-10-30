// Shared read-only definitions and live balance descriptions; no player state.
const BALANCE = require('../config/global-balance.js');
const POOL = [
 ['shuffle','全局洗牌','棋盘','打乱棋盘，并触发已学技能齐发。','#ffad58'],
 ['refill','能量补给','辅助','全场已激活塔补充8点能量。','#79e5a4'],
 ['forge','神兵铸就','输出','全塔攻击提升25%，持续12秒。','#ffd36b'],
 ['haste','急速风暴','输出','全塔攻速提升40%，持续10秒。','#72d9ff'],
 ['volley','弹幕齐射','输出','全塔下一次普攻变为三连发，总伤害150%。','#ff967c'],
 ['resonance','元素共鸣','输出','随机3座已激活塔各释放一次已学周期技能。','#bc9bff'],
 ['barrier','铁壁结界','防御','城墙获得1200点护盾，持续至波末。','#86caff'],
 ['heal','圣愈之光','防御','城墙立即回复40%最大血量。','#79e5a4'],
 ['reflect','爆裂反击','防御','8秒内城墙受击时，向攻击者反弹60%伤害。','#ff7d89'],
 ['freeze','时间冻结','控制','全场敌人定身4秒，Boss定身2秒。','#a6e8ff'],
 ['tide','霜寒潮汐','控制','全场敌人减速60%，持续6秒。','#7bbaff'],
 ['pull','虚空牵引','控制','将场上敌人推回出生方向240像素。','#bf91ff'],
 ['chainstorm','连锁风暴','三消','下次有效交换，第2组消除即可触发连消技。','#ffbd75'],
 ['twins','双子印记','三消','下次四消同时遗留两个同类特殊方块。','#e7a5ff'],
 ['charge','元素充能','三消','下次有效消除优先为对应颜色塔、再为另一座塔各补10能量。','#83e4dd'],
 ['gold','黄金浪潮','收益','6秒内击杀获得的局内金币翻倍。','#ffe17c'],
].map(([id,name,category,desc,color],i)=>({id,name,category,desc,color,glyph:i}));
// 展示文案与实际行为共用参数，避免改数值后说明过期。
const descriptions = {
 forge:()=>`全塔攻击提升${Math.round((BALANCE.forge.damageMultiplier-1)*100)}%，持续${BALANCE.forge.duration}秒。`,
 haste:()=>`全塔攻速提升${Math.round((BALANCE.haste.speedMultiplier-1)*100)}%，持续${BALANCE.haste.duration}秒。`,
 volley:()=>`全塔下一次普攻变为${BALANCE.volley.count}连发，总伤害${Math.round(BALANCE.volley.count*BALANCE.volley.damagePerShot*100)}%。`,
 resonance:()=>`随机${BALANCE.resonance.towerCount}座已激活塔各释放一次已学周期技能。`,
 barrier:()=>`城墙获得${BALANCE.barrier.shield}点护盾，持续至波末。`,
 heal:()=>`城墙立即回复${Math.round(BALANCE.heal.maxHpRatio*100)}%最大血量。`,
 reflect:()=>`${BALANCE.reflect.duration}秒内城墙受击，向攻击者反弹${Math.round(BALANCE.reflect.damageRatio*100)}%伤害。`,
 freeze:()=>`敌人定身${BALANCE.freeze.duration}秒，Boss定身${BALANCE.freeze.bossDuration}秒。`,
 tide:()=>`全场敌人减速${Math.round(BALANCE.tide.slowRatio*100)}%，持续${BALANCE.tide.duration}秒。`,
 pull:()=>`将场上敌人推回出生方向${BALANCE.pull.distance}像素。`,
 chainstorm:()=>`下次有效交换，第${BALANCE.chainstorm.startGroup}组消除即可触发连消技。`,
 charge:()=>`下次有效消除优先对应颜色，为${BALANCE.charge.towerCount}座已激活塔各补${BALANCE.charge.energy}能量。`,
 gold:()=>`${BALANCE.gold.duration}秒内击杀局内金币变为${BALANCE.gold.multiplier}倍。`,
 refill:()=>`全场已激活塔补充${require('../config.js').GLOBAL_SKILL.refillEnergy}点能量。`,
};
POOL.forEach(def=>{if(descriptions[def.id])Object.defineProperty(def,'desc',{enumerable:true,get:descriptions[def.id]});});
function get(id){return POOL.find(d=>d.id===id);}

module.exports = { POOL, get };
