/**
 * _sim_battle.js —— 完整战斗模拟（过程文件，非交付）
 * 全技能 3 级开满，怪物从入口走到城墙并攻城 30s，抓 combat.update 崩溃点
 */
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
  const game = {
    run: {
      slotOrder: order, lineHp: CONFIG.LINE.hp, lineMaxHp: CONFIG.LINE.hp,
      effects: { tower: (k) => towers[k] || null, towerDps: (k) => CONFIG.TOWERS[k] ? CONFIG.TOWERS[k].baseDps : 0, synergyDone: [false, false, false] },
    },
    ly: { areaX: 25, areaY: 72, areaW: 700, areaH: 970, entryH: 68, wallY: 967, slotY: 1079, slotSize: 48, slotGap: 12 },
    state: 'fighting',
    fx: [],
    playSfx() {},
    enemies: [],
  };
  game.combat = new CombatSystem(game);
  return game;
}

// 六塔全技能三分支 3 级
const ALL = {};
Object.keys(CONFIG.EFFECT_POOLS).forEach((k) => {
  ALL[k] = {};
  CONFIG.EFFECT_POOLS[k].forEach((e) => { ALL[k][e.name] = { A: 3, B: 3, C: 3 }; });
});

function runScenario(slotOrder) {
  const g = mkGame(ALL, slotOrder);
  const e = initEnemyState({ id: 1, x: 375, y: 100, hp: 200000, maxHp: 200000, speed: 120, attack: 100 });
  g.enemies.push(e);
  let err = null;
  let hits = 0;
  for (let i = 0; i < 600; i++) {   // 30s @ dt 0.05
    const dt = 0.05;
    try {
      g.combat.update(dt);
      // moveEnemy（照抄 main.js）
      if (!(e.frozen > 0)) { if (e.y < g.ly.wallY - 10) { const mult = e.slow && e.slow.ttl > 0 ? e.slow.mult : 1; e.y += e.speed * mult * dt; } }
      // 攻城段（照抄 main.js）
      const wallLine = g.ly.wallY - 10;
      if (e.y >= wallLine && !(e.frozen > 0) && !(e.paralyzed > 0)) {
        const eAtkInt = (e.attackInterval || 1) + (e.atkSlowAdd || 0);
        e.attackT = (e.attackT || 0) + dt;
        if (e.attackT >= eAtkInt) {
          e.attackT -= eAtkInt;
          const iw = g.combat.iceWall;
          if (iw && iw.ttl > 0) {
            const absorbed = Math.min(iw.absorb, e.attack);
            iw.absorb -= absorbed;
            const leak = e.attack - absorbed;
            if (leak > 0) g.run.lineHp -= leak;
          } else {
            g.run.lineHp -= e.attack;
          }
          hits++;
        }
      }
    } catch (ex) { err = ex; break; }
  }
  return { g, err, hits };
}

// 单塔
for (const k of ['fire', 'ice', 'poison', 'electric', 'cannon', 'boomerang']) {
  const r = runScenario([k]);
  if (r.err) console.log(`[CRASH] ${k}: ${r.err.stack.split('\n')[0]} @ ${r.err.stack.split('\n')[1]}`);
  else console.log(`[OK] ${k} 单塔 30s：lineHp ${r.g.run.lineHp}（hits=${r.hits}，怪 y=${r.g.enemies[0] ? r.g.enemies[0].y : '-'}）`);
}
// 六塔齐上
const r6 = runScenario(Object.keys(CONFIG.EFFECT_POOLS));
if (r6.err) console.log(`[CRASH] 六塔: ${r6.err.stack.split('\n')[0]} @ ${r6.err.stack.split('\n')[1]}`);
else console.log(`[OK] 六塔 30s：lineHp ${r6.g.run.lineHp}（hits=${r6.hits}，怪 y=${r6.g.enemies[0] ? r6.g.enemies[0].y : '-'}）`);
