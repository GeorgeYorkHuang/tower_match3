// 局内购买唯一入口，无UI/存档依赖；恢复立即生效，强化仅按战斗秒持续。
'use strict';
const CONFIG = require('../config.js');
function offer(run, item) {
  const bought = run.store && run.store[item.id] || 0;
  return { bought, sold: item.max > 0 && bought >= item.max, cost: item.cost[Math.min(bought, item.cost.length - 1)] };
}
function buy(run, id) {
  const item = CONFIG.STORE.items.find(it => it.id === id);
  if (!item) return { ok: false, reason: 'item' };
  const state = offer(run, item);
  if (state.sold) return { ok: false, reason: 'limit' };
  const maxHp = run.lineMaxHp || CONFIG.LINE.hp;
  const towers = [...new Set(run.slotOrder)].map(k => run.effects.tower(k)).filter(t => t && t.level > 0);
  if (item.heal && run.lineHp >= maxHp) return { ok: false, reason: 'full' };
  if (item.energy && !towers.some(t => t.energy < run.armoryEnergyMax())) return { ok: false, reason: 'energy' };
  if (run.gold < state.cost) return { ok: false, reason: 'gold' };
  run.gold -= state.cost;
  if (!run.store) run.store = {};
  run.store[id] = state.bought + 1;
  if (item.duration) {
    if (!run.storeTimers) run.storeTimers = {};
    run.storeTimers[id] = Math.max(run.storeTimers[id] || 0, item.duration);
  }
  if (item.heal) run.lineHp = Math.min(maxHp, run.lineHp + Math.round(maxHp * item.heal));
  if (item.energy) towers.forEach(t => { t.energy = Math.min(run.armoryEnergyMax(), t.energy + item.energy); });
  return { ok: true, item, cost: state.cost };
}
function tick(run, dt) {
  if (!(dt > 0) || !run.storeTimers) return;
  for (const id of Object.keys(run.storeTimers)) {
    run.storeTimers[id] = Math.max(0, run.storeTimers[id] - dt);
    if (!run.storeTimers[id]) delete run.storeTimers[id];
  }
}
function buffs(run) {
  let damage = 0, speed = 0;
  for (const item of CONFIG.STORE.items) if ((run.storeTimers && run.storeTimers[item.id] || 0) > 0) {
    damage = Math.max(damage, item.damage || 0); speed = Math.max(speed, item.speed || 0);
  }
  return { atk: 0, spd: 0, damageMultiplier: 1 + damage, speedMultiplier: 1 + speed };
}
module.exports = { offer, buy, tick, buffs };
