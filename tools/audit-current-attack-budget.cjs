/** 实际普攻弹体与收费预估的只读核对；展示混合技能差异，不写配置、不新增子弹收费。 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tag = process.argv[2] || 'current';
if (!/^[a-z0-9-]+$/.test(tag)) throw Error('Invalid result tag');
const frozen = require('./freeze-runtime.cjs').freeze(root);
const api = require('./tower-balance-fixture.cjs');
const { attackEnergyMultiplier } = require('../js/combat/attack-energy.js');
const skills = require('../js/config/tower-skills.js');
const cases = [
  ['ice', [['多重冰锥', 'C']]],
  ['ice', [['多重冰锥', 'C'], ['冰穿刺', 'A']]],
  ['ice', [['多重冰锥', 'C'], ['冰穿刺', 'A'], ['碎冰', 'B']]],
  ['ice', [['冰穿刺', 'A']]],
  ['boomerang', [['多镖', 'A']]],
  ['boomerang', [['多镖', 'A'], ['接镖', 'A'], ['风痕', 'B']]],
];
try {
  const rows = [];
  for (const [key, choices] of cases) for (const stage of [0, 1, 3]) {
    const w = api.setup(key, choices, stage, 'dense', 41, 'finite');
    const baseDamage = w.combat.shotDmg(key, false, false, 60);
    const costFactor = attackEnergyMultiplier(w.combat, key);
    const configuredFactor = choices.reduce((value, [name]) => value * (skills[key][name].attackEnergyFactor ?? 1), 1);
    w.combat.attackOnce(key);
    rows.push({ key, choices, stage, level: w.tower.level,
      costFactor, configuredFactor, preDiscountExpected: costFactor / configuredFactor,
      paidEnergy: 60 - w.tower.energy, projectileCount: w.combat.shots.length,
      projectileDamageFactor: w.combat.shots.reduce((sum, s) => sum + s.dmg, 0) / baseDamage,
      maxTargetsPerProjectile: Math.max(...w.combat.shots.map(s => s.pierceMaxHits || 1)),
      perProjectileDamageFactors: w.combat.shots.map(s => s.dmg / baseDamage),
    });
  }
  fs.writeFileSync(path.join(root, 'docs', `six-tower-${tag}-attack-budget.json`), JSON.stringify({
    date: '2026-11-10', sourceHashes: frozen.sourceHashes, liveChanges: frozen.liveChanges(),
    method: 'Real attackOnce at60energy on12stationary normal targets; stage0/1/3. Capacity means maximum piercing hits, not predicted real occupancy. Direct projectile factors exclude shards, DOT, wind trails and return-pass multipliers. No skill damage/fee was changed.',
    rows,
  }, null, 2));
  console.log(JSON.stringify({ cases: rows.length, configurationChanged: false }));
} finally { api.restore(); frozen.restore(); }
