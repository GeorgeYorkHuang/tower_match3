/** 在途伤害预估：从实际弹体生成软预留，只影响发射前选敌，不承诺命中、不修改血量。 */
'use strict';
const CFG = require('../config/targeting.js');
const SKILLS = require('../config/tower-skills.js');
function reserveAttack(combat, key, shots) {
  const scattered = new Set();
  for (const s of shots) {
    if (s.key !== key || s.sweep || s.orb || s.bounce || s.chainFlight || s.onReach) continue;
    const enemy = s.aimTarget || s.target;
    if (!enemy || enemy.hp <= 0) continue;
    let confidence = CFG.reservationConfidence;
    let damage = s.dmg;
    if (s.scatter) {
      // 一轮散射对同一目标最多计一枚；不把所有扇形弹都当作必定命中。
      if (scattered.has(enemy)) continue;
      scattered.add(enemy); confidence = CFG.scatterReservationConfidence;
    } else if (key === 'fire' && combat.lv(key, '大火球') > 0) damage *= SKILLS.fire['大火球'].mainDamage;
    s.damageReservation = { enemy, amount: damage * confidence };
  }
}
function build(combat) {
  const map = new Map();
  for (const s of combat.shots || []) {
    const r = s.damageReservation;
    if (!r || s.finished || s._impactDone || r.enemy.hp <= 0) continue;
    const eta = Math.max(0, s.dur - s.t);
    const amount = r.amount * (1 - Math.min(0.85, Math.max(0, r.enemy.armor || 0)));
    const entries = map.get(r.enemy) || [];
    entries.push({ eta, amount }); map.set(r.enemy, entries);
  }
  return map;
}
function expected(map, enemy, arrival) {
  let sum = 0;
  for (const r of map.get(enemy) || []) if (r.eta <= arrival + 0.05) sum += r.amount;
  return sum;
}
module.exports = { reserveAttack, build, expected };
