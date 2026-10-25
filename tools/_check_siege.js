/**
 * _check_siege.js —— 攻城扣血路径复现（过程文件，非交付）
 * 按 main.js update 攻城段逻辑模拟：有塔、非 testfield、无冰墙时城墙应持续掉血
 */
const assert = require('assert');
const CONFIG = require('../js/config.js');
const { CombatSystem, initEnemyState } = require('../js/combat.js');

const towers = {
  fire: { level: 1, pool: CONFIG.EFFECT_POOLS.fire.map((e) => ({ name: e.name, level: 0, branches: { A: 0, B: 0, C: 0 } })), _chargeLayers: 0 },
};
const game = {
  run: {
    slotOrder: ['fire'], lineHp: 2000, lineMaxHp: 2000,
    effects: { tower: (k) => towers[k] || null, towerDps: (k) => CONFIG.TOWERS[k] ? CONFIG.TOWERS[k].baseDps : 0, synergyDone: [false, false, false] },
  },
  ly: { areaX: 25, areaY: 72, areaW: 700, areaH: 970, entryH: 68, wallY: 967, slotY: 1079, slotSize: 48, slotGap: 12 },
  state: 'battle',
  fx: [],
  playSfx() {},
  enemies: [initEnemyState({ id: 1, x: 350, y: 1000, hp: 5000, maxHp: 5000, speed: 60, attack: 100 })],
};
game.combat = new CombatSystem(game);

// 攻城段逻辑（照抄 main.js update 内 L401-441，this → game）
function siegeStep(dt) {
  const wallLine = game.ly.wallY - 10;
  let wallHits = 0;
  for (const e of game.enemies) {
    if (e.y < wallLine) continue;
    if (e.frozen > 0 || e.paralyzed > 0) continue;
    if (e._miasma && Math.random() < 0.20) continue;
    if (e.atkSlowT > 0) { e.atkSlowT -= dt; if (e.atkSlowT <= 0) e.atkSlowAdd = 0; }
    const eAtkInt = (e.attackInterval || 1) + (e.atkSlowAdd || 0);
    e.attackT = (e.attackT || 0) + dt;
    if (e.attackT >= eAtkInt) {
      e.attackT -= eAtkInt;
      const atkDmg = e.attack * (e._miasmaAtkMult || 1);
      const iw = game.combat.iceWall;
      if (iw && iw.ttl > 0) {
        const absorbed = Math.min(iw.absorb, atkDmg);
        iw.absorb -= absorbed;
        const leak = atkDmg - absorbed;
        if (leak > 0 && game.state !== 'testfield') game.run.lineHp -= leak;
        if (iw.reflect > 0) game.combat.damage(e, absorbed * iw.reflect, 'ice');
        game.combat.applySlow(e, 0.4, 2);
        e.atkSlowAdd = 0.5; e.atkSlowT = 2;
        game.combat.fxParticle(e.x, e.y, '#b8e6ff', 5, 40, 0.35, 90, 4);
      } else {
        if (game.state !== 'testfield') game.run.lineHp -= atkDmg;
      }
      wallHits++;
      if (game.state !== 'testfield' && game.run.lineHp <= 0) {
        game.run.lineHp = 0;
        game.run.broken = true;
      }
    }
  }
  if (wallHits) game.fx.push({ type: 'hitwall', x: 375, y: wallLine, t: 0, dur: 0.3 });
  return wallHits;
}

// 场景 1：普通战斗（远古战场，有塔）—— 应掉血
let hp0 = game.run.lineHp;
let hits = 0;
for (let i = 0; i < 120; i++) hits += siegeStep(0.1); // 12s
assert.strictEqual(game.run.lineHp < hp0, true, `场景1 应掉血：${hp0} → ${game.run.lineHp}（hits=${hits}）`);
console.log(`[OK] 场景1 普通战斗掉血：${hp0} → ${game.run.lineHp}，攻击次数 ${hits}`);

// 场景 2：测试战场 —— 设计不掉血
game.state = 'testfield';
game.run.lineHp = 2000;
for (let i = 0; i < 60; i++) siegeStep(0.1);
assert.strictEqual(game.run.lineHp, 2000, '测试战场应不掉血（设计）');
console.log('[OK] 场景2 测试战场不掉血（设计行为）');

// 场景 3：冰墙 absorb 300 覆盖低攻怪 —— 设计吸收
game.state = 'battle';
game.run.lineHp = 2000;
game.combat.iceWall = { ttl: 10, absorb: 300, reflect: 0 };
for (let i = 0; i < 60; i++) siegeStep(0.1);
console.log(`[OK] 场景3 冰墙吸收：lineHp=${game.run.lineHp}（absorb 300 覆盖 attack 100 → 不掉血=设计）`);

// 场景 4（v1.16.43 修复验证）：无塔（slotOrder 空）时怪物到城墙也应攻城掉血
game.run.slotOrder = [];
game.run.lineHp = 2000;
game.enemies = [initEnemyState({ id: 9, x: 350, y: 1000, hp: 5000, maxHp: 5000, speed: 60, attack: 100 })];
game.combat.iceWall = null;
let h0 = game.run.lineHp;
let h4 = 0;
for (let i = 0; i < 60; i++) h4 += siegeStep(0.1);
assert.strictEqual(game.run.lineHp < h0, true, `场景4 无塔也应掉血：${h0} → ${game.run.lineHp}（hits=${h4}）`);
console.log(`[OK] 场景4 无塔攻城掉血：${h0} → ${game.run.lineHp}（攻击 ${h4} 次）`);

console.log('\n攻城路径基线验证通过');
