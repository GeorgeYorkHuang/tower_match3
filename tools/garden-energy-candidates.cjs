/** 技能能效候选：只折算选定普攻技能，场上有Boss/锁关时保留原收费，不注入能量。 */
'use strict';
const SKILLS = require('../js/config/tower-skills.js');
const specs = {
  none: {}, fire60: { fire: { '多重火球': .6 } },
  heavy60: { cannon: { '重炮': .6 } }, double60: { cannon: { '双管齐射': .6 } },
  combined: { fire: { '多重火球': .6 }, cannon: { '重炮': .6, '双管齐射': .7 } },
};
function bossBattle(g) {
  return !!g.run.bossLock || g.enemies.some(e => e.isBoss && e.hp > 0);
}
function attach(g, name) {
  const spec = specs[name]; if (!spec) throw Error('Unknown energy candidate');
  const audit = { regularCalls: 0, bossCalls: 0, regularOriginal: 0, regularCharged: 0,
    bossOriginal: 0, bossCharged: 0, byTower: {} };
  let attacker = null;
  const attack = g.combat.attackOnce.bind(g.combat);
  g.combat.attackOnce = key => {
    const before = attacker; attacker = key;
    try { return attack(key); } finally { attacker = before; }
  };
  const spend = g.run.spendAttackEnergy.bind(g.run);
  g.run.spendAttackEnergy = (tower, cost) => {
    if (attacker !== tower.key || cost == null) return spend(tower, cost);
    const boss = bossBattle(g);
    let ratio = 1;
    if (!boss) for (const [skill, value] of Object.entries(spec[tower.key] || {})) {
      if (g.combat.lv(tower.key, skill) > 0) ratio *= value / SKILLS[tower.key][skill].attackEnergyFactor;
    }
    const charged = cost * ratio;
    const prefix = boss ? 'boss' : 'regular';
    audit[prefix + 'Calls']++; audit[prefix + 'Original'] += cost; audit[prefix + 'Charged'] += charged;
    const r = audit.byTower[tower.key] || (audit.byTower[tower.key] = { original: 0, charged: 0 });
    if (!boss) { r.original += cost; r.charged += charged; }
    return spend(tower, charged);
  };
  return audit;
}
module.exports = { specs, attach, bossBattle };
