/** 修复后复核：保留原诊断证据，另写多重火球射程快照修复后的结果。 */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const api = require('./tower-balance-fixture.cjs');
const { attackEnergyMultiplier } = require('../js/combat/attack-energy.js');
const rows = [];
try {
  for (const kind of ['partial', 'neutral']) {
    const w = api.setup('fire', [['多重火球', 'A'], ['大火球', 'B']], 0, 'dense', 41, 'finite');
    const c = w.combat, muzzle = c.towerMuzzle('fire'), target = w.game.enemies[0];
    w.game.enemies = [target]; target.x = muzzle.x; target.y = muzzle.y - 500;
    const fee = w.run.attackCost(w.tower) * attackEnergyMultiplier(c, 'fire');
    w.tower.energy = kind === 'partial' ? fee / 2 : 60;
    const before = w.tower.energy, range = c.range('fire'), hp = target.hp;
    assert(c.pickTarget('fire') === target, '目标原本在射程内');
    c.attackOnce('fire');
    const count = c.shots.length;
    const distances = c.shots.map(s => Math.hypot(s.tx - s.sx, s.ty - s.sy));
    for (let i = 0; i < 65; i++) for (let j = c.shots.length - 1; j >= 0; j--) {
      if (!c.stepShot(c.shots[j], 1 / 60)) c.shots.splice(j, 1);
    }
    rows.push({ kind, energyBefore: before, fee, rangeBefore: range, targetDistance: 500,
      energyAfter: w.tower.energy, projectiles: count, projectileDistances: distances, actualDamage: hp - target.hp });
  }
  // 原repro.json为修复前报告的数据，不覆盖。
  for (const row of rows) {
    assert(row.actualDamage > 0, '原先锁定的500距离目标现在必须能命中');
    for (const range of row.projectileDistances) assert(Math.abs(range-row.rangeBefore)<1e-7);
  }
  fs.writeFileSync(path.resolve(__dirname, '../docs/wave15-20-fire-range-after-fix.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows));
} finally { api.restore(); }
