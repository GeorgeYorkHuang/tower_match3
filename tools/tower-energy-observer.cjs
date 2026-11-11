/** 离线观察器：记录实际耗能、未足额扣费、伤害/冷却档位和射程损失，不改游戏数值。 */
'use strict';
const CONFIG = require('../js/config.js');
const Energy = require('../js/config/energy-state.js');

function attach(game, { neutral = false, enabled = () => true } = {}) {
  const run = game.run, combat = game.combat;
  const rows = {};
  let time = 0, attacker = null;
  const row = key => rows[key] || (rows[key] = {
    attackLaunches: 0, shortAttackLaunches: 0, primaryEnergyAsked: 0, primaryEnergyPaid: 0,
    periodicRequests: 0, unpaidPeriodicRequests: 0, periodicEnergyAsked: 0, periodicEnergyPaid: 0,
    energySeconds: 0, damageStateSeconds: 0, cooldownStateSeconds: 0,
    neutralSeconds: 0, rampSeconds: 0, lowSeconds: 0, zeroSeconds: 0,
    rangeBlockedSeconds: 0, injectedEnergy: 0, bySkill: {},
  });
  const oldAttack = combat.attackOnce.bind(combat);
  combat.attackOnce = key => {
    const prev = attacker; attacker = key;
    try { return oldAttack(key); } finally { attacker = prev; }
  };
  const oldSpend = run.spendAttackEnergy.bind(run);
  run.spendAttackEnergy = (tower, cost) => {
    const before = tower.energy, bank = run.energyBank || 0, asked = cost === undefined ? run.attackCost(tower) : cost;
    const result = oldSpend(tower, cost);
    if (enabled() && attacker === tower.key) {
      const r = row(tower.key);
      r.attackLaunches++;
      if (before + bank < asked - 1e-9) r.shortAttackLaunches++;
      r.primaryEnergyAsked += asked;
      r.primaryEnergyPaid += Math.max(0, before - tower.energy);
    }
    return result;
  };
  const oldCast = combat.castEnergy.bind(combat);
  combat.castEnergy = (key, name) => {
    const tower = combat.tower(key), before = tower.energy, asked = CONFIG.SKILL_ENERGY[name] || 0;
    const result = oldCast(key, name);
    if (enabled()) {
      const r = row(key), detail = r.bySkill[name] || (r.bySkill[name] = { requests: 0, unpaid: 0, asked: 0, paid: 0 });
      r.periodicRequests++; detail.requests++;
      if (before < asked) { r.unpaidPeriodicRequests++; detail.unpaid++; }
      r.periodicEnergyAsked += asked; detail.asked += asked;
      const paid = Math.max(0, before - tower.energy);
      r.periodicEnergyPaid += paid; detail.paid += paid;
    }
    return result;
  };
  const oldUpdate = combat.update.bind(combat);
  combat.update = dt => {
    if (neutral) for (const key of run.slotOrder) {
      const t = combat.tower(key), value = Math.min(60, run.armoryEnergyMax(key));
      if (enabled()) row(key).injectedEnergy += Math.max(0, value - t.energy);
      t.energy = value;
    }
    return oldUpdate(dt);
  };
  return {
    afterUpdate(dt) {
      if (!enabled()) return;
      time += dt;
      for (const key of run.slotOrder) {
        const t = combat.tower(key), s = Energy.evaluate(t.energy, run.armoryEnergyMax(key)), r = row(key);
        r.energySeconds += t.energy * dt;
        r.damageStateSeconds += s.attack * dt;
        r.cooldownStateSeconds += s.cooldown * dt;
        r[t.energy === 0 ? 'zeroSeconds' : t.energy < 20 ? 'lowSeconds' : t.energy < 40 ? 'rampSeconds' : 'neutralSeconds'] += dt;
        if (t.energy < 40) {
          const muzzle = combat.towerMuzzle(key), actual = combat.range(key), normal = Math.max(60, CONFIG.TOWERS[key].range - 50);
          let current = false, full = false;
          for (const e of game.enemies) if (e.hp > 0) {
            const d = Math.hypot(e.x - muzzle.x, e.y - muzzle.y);
            if (d <= actual) current = true;
            if (d <= normal) full = true;
            if (current) break;
          }
          if (full && !current) r.rangeBlockedSeconds += dt;
        }
      }
    },
    finish() { return { seconds: time, towers: rows }; },
  };
}
module.exports = { attach };
