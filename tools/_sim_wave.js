/**
 * _sim_wave.js —— 贴近真实波次模拟（过程文件，非交付）
 * 1-2 塔 + 少量技能 1 级，40s 波（CONFIG.WAVE.seconds），验证怪物能否抵达城墙并造成掉血
 */
const CONFIG = require('../js/config.js');
const { CombatSystem, initEnemyState } = require('../js/combat.js');

const WAVE_S = CONFIG.WAVE.seconds || 40;

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
    state: 'fighting', fx: [], playSfx() {}, enemies: [],
  };
  game.combat = new CombatSystem(game);
  return game;
}

function runWave(label, skills, slotOrder, opts = {}) {
  const g = mkGame(skills, slotOrder);
  const speed = opts.speed || 120;
  const hp = opts.hp || 1500;
  const n = opts.n || 5;
  for (let i = 0; i < n; i++) {
    g.enemies.push(initEnemyState({ id: i + 1, x: 100 + i * 100, y: 120, hp, maxHp: hp, speed, attack: 80 }));
  }
  let reachedWall = false, hits = 0, deaths = 0;
  const steps = Math.round(WAVE_S / 0.05);
  for (let i = 0; i < steps; i++) {
    const dt = 0.05;
    g.combat.update(dt);
    g.enemies.forEach((e) => {
      if (e.frozen > 0) return;
      if (e.y < g.ly.wallY - 10) {
        const mult = e.slow && e.slow.ttl > 0 ? e.slow.mult : 1;
        e.y += e.speed * mult * dt;
      }
    });
    const wallLine = g.ly.wallY - 10;
    for (const e of g.enemies) {
      if (e.y >= wallLine && !(e.frozen > 0) && !(e.paralyzed > 0)) {
        reachedWall = true;
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
          } else g.run.lineHp -= e.attack;
          hits++;
        }
      }
    }
    const before = g.enemies.length;
    g.enemies = g.enemies.filter((e) => e.hp > 0);
    deaths += before - g.enemies.length;
    if (g.enemies.length === 0) break;
  }
  console.log(`[${label}] 掉血 ${CONFIG.LINE.hp - g.run.lineHp}（${g.run.lineHp}）· 怪到墙=${reachedWall} · 攻击 ${hits} 次 · 死亡 ${deaths}/${n}`);
}

// 无技能：纯普攻
runWave('无技能', {}, ['fire']);
// 火塔普攻 + 灼烧基础
runWave('火·灼烧1', { fire: { 灼烧: 1 } }, ['fire']);
// 火·灼烧 C 真火 3 级
runWave('火·灼烧C3', { fire: { 灼烧: { A: 3, B: 3, C: 3 } } }, ['fire']);
// 冰塔 + 冰缓（减速）
runWave('冰·冰冻1', { ice: { 冰冻: 1 } }, ['ice']);
// 毒塔 + 毒沼减速（重）
runWave('毒·毒爆C毒沼', { poison: { 毒爆: { A: 3, B: 3, C: 3 } } }, ['poison']);
// 回旋镖 + 风痕卷痕减速
runWave('回旋镖·风痕C3', { boomerang: { 风痕: { A: 3, B: 3, C: 3 } } }, ['boomerang']);
// 冰+毒：双重减速
runWave('冰+毒双减速', { ice: { 冰冻: 1 }, poison: { 毒爆: { A: 1, B: 1, C: 1 } } }, ['ice', 'poison']);
