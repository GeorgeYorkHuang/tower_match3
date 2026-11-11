/** 离线候选隔离：只改变选定普攻技能收费，Boss/小Boss原价，周期/三消不受影响。 */
'use strict';
const assert = require('assert');
const { specs, attach } = require('./garden-energy-candidates.cjs');
const SKILLS = require('../js/config/tower-skills.js');
const before = JSON.stringify(SKILLS);
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
let cases = 0;
for (const name of Object.keys(specs)) for (const [key, names] of [
  ['fire', ['多重火球']], ['cannon', ['重炮']], ['cannon', ['双管齐射']], ['cannon', ['重炮', '双管齐射']],
]) for (const level of [0, 1, 4]) for (const context of ['normal', 'boss', 'mini', 'dead', 'locked']) {
  const tower = { key, energy: 100 }, paid = [];
  const g = { enemies: [], run: {
    bossLock: context === 'locked',
    spendAttackEnergy(t, cost = 8) { paid.push(cost); t.energy -= cost; return t.energy + cost; },
  }, combat: {
    lv(k, n) { return k === key && names.includes(n) ? level : 0; },
    attackOnce() { return g.run.spendAttackEnergy(tower, 8); },
  } };
  if (context === 'boss' || context === 'mini') g.enemies = [{ hp: 10, isBoss: true }];
  if (context === 'dead') g.enemies = [{ hp: 0, isBoss: true }];
  const audit = attach(g, name);
  g.combat.attackOnce(key);
  let ratio = 1;
  if (level > 0 && ['normal', 'dead'].includes(context)) for (const [n, value] of Object.entries(specs[name][key] || {})) {
    if (names.includes(n)) ratio *= value / .8;
  }
  close(paid[0], 8 * ratio);
  close(audit.bossOriginal, audit.bossCharged);
  // 非普攻费用直接传入，不套普攻技能折算。
  g.run.spendAttackEnergy(tower, 3);
  close(paid[1], 3);
  g.combat.attackOnce(key);
  close(paid[2], 8 * ratio);
  cases++;
}
assert.equal(JSON.stringify(SKILLS), before);
console.log(`PASS ${cases} candidate source/activation/branch/Boss/mini/dead/locked cases; no extra discount per upgrade/read, non-primary costs unchanged, config untouched.`);
