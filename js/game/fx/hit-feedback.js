/** 怪物受击表现。毒池使用战斗时间；普通命中保留现有反馈与节奏。 */
'use strict';
const hits = new WeakMap();
const poolHits = new WeakMap();

function record(enemy, kind, skill) {
  if (kind === 'dot') {
    // 仅实际结算出扣血/扣盾的毒池直伤可到达此处，其他持续伤害保持原表现。
    if (skill === '毒池') poolHits.set(enemy, 0);
    return;
  }
  const now = Date.now(), prev = hits.get(enemy);
  if (!prev || now - prev > 90) hits.set(enemy, now);
}

function step(enemies, dt) {
  if (!(dt > 0)) return;
  (enemies || []).forEach(enemy => {
    const age = poolHits.get(enemy);
    if (age == null) return;
    const next = age + dt * 1000;
    if (next >= 150) poolHits.delete(enemy);
    else poolHits.set(enemy, next);
  });
}

function clearPool(enemies) {
  (enemies || []).forEach(enemy => poolHits.delete(enemy));
}

function ageOf(enemy) {
  const normal = hits.get(enemy), pool = poolHits.get(enemy);
  return Math.min(normal == null ? Infinity : Math.max(0, Date.now() - normal), pool == null ? Infinity : pool);
}

function strength(enemy) { return Math.max(0, 1 - ageOf(enemy) / 150); }
function brightness(enemy) {
  const age = ageOf(enemy);
  return age <= 50 ? 0.9 : 0.9 * Math.max(0, 1 - (age - 50) / 100);
}

module.exports = { record, step, clearPool, strength, brightness };
