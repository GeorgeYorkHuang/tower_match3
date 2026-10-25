/**
 * _check_arc_branch.js —— v1.16.51 极光电击分叉电弧专项验证
 * 基础：电击最近敌人后，向 100 码内分叉命中 3 个敌人（各 40% 主线伤害）；A 扩域每级 +20 码；
 * C 裂电每级 +1 个分叉（3+arcC）
 * 运行：node tools/_check_arc_branch.js
 */
const assert = require('assert');
const CONFIG = require('../js/config.js');
const { CombatSystem, initEnemyState } = require('../js/combat.js');

function mkGame(skills, slotOrder) {
  const order = (slotOrder || []).slice();
  Object.keys(skills || {}).forEach((k) => { if (!order.includes(k)) order.push(k); });
  if (!order.length) order.push('fire');
  const towers = {};
  order.forEach((k) => {
    const lvMap = skills[k] || {};
    towers[k] = {
      level: 1,
      pool: CONFIG.EFFECT_POOLS[k].map((e) => {
        const v = lvMap[e.name] || 0;
        const isObj = typeof v === 'object';
        const br = (b) => (isObj ? (v[b] || 0) : v);
        return { name: e.name, level: isObj ? Math.max(br('A'), br('B'), br('C')) : v, branches: { A: br('A'), B: br('B'), C: br('C') } };
      }),
      _chargeLayers: 0,
    };
  });
  return {
    run: {
      slotOrder: order,
      lineHp: CONFIG.LINE.hp,
      effects: {
        tower: (k) => towers[k] || null,
        towerDps: (k) => (CONFIG.TOWERS[k] ? CONFIG.TOWERS[k].baseDps : 0),
        synergyDone: [false, false, false],
      },
    },
    ly: { areaX: 25, areaY: 72, areaW: 700, areaH: 970, entryH: 68, wallY: 967, slotY: 1079, slotSize: 48, slotGap: 12 },
    enemies: [],
    fx: [],
    playSfx() {},
  };
}
function mkEnemy(hp, x, y) {
  return initEnemyState({ id: Math.random() * 1e6, x, y, hp, maxHp: hp, isBoss: false, speed: 20 });
}

// C1：分叉数量 = 3+1 = 4 个；A1：范围 = 100+20 = 120 码
const g = mkGame({ electric: { 极光电击: { A: 1, C: 1 } } }, ['electric']);
const c = new CombatSystem(g);
const eNear = mkEnemy(1000, 390, 950); g.enemies.push(eNear);   // 最近 → 主线电击目标
const b1 = mkEnemy(1000, 470, 950); g.enemies.push(b1);         // 距 eNear 80px ≤120 ✓
const b2 = mkEnemy(1000, 330, 950); g.enemies.push(b2);         // 距 eNear 60px ≤120 ✓
const b3 = mkEnemy(1000, 300, 930); g.enemies.push(b3);         // 距 eNear ≈92px、行距 173（不抢最近位）✓
const b4 = mkEnemy(1000, 460, 930); g.enemies.push(b4);        // 距 eNear ≈73px、行距 173（不抢最近位）✓

const orig = Math.random;
try { Math.random = () => 0.49; c.update(8.1); } finally { Math.random = orig; }

const mainDmg = 1000 - eNear.hp;
assert.ok(mainDmg > 0, `最近敌应受主线电击伤害（实际 ${mainDmg}）`);
const hitB = [b1, b2, b3, b4].filter((b) => b.hp < 1000);
assert.strictEqual(hitB.length, 4, `A1+C1 应分叉命中 4 个目标（120 码内），实际 ${hitB.length}`);
hitB.forEach((b) => {
  const d = 1000 - b.hp;
  assert.ok(Math.abs(d - mainDmg * 0.4) < 1e-6, `分叉伤害应为主线 40%（${(mainDmg * 0.4).toFixed(2)}），实际 ${d.toFixed(2)}`);
});
console.log(`ARC_BRANCH_OK  主线伤害=${mainDmg.toFixed(2)}  分叉命中 ${hitB.length} 个（各=${(1000 - hitB[0].hp).toFixed(2)}，主线×0.4）`);
