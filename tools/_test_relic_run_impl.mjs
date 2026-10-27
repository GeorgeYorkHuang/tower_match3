// v1.16.114 普攻圣遗物实装行为验证（#87）：运行时断言核心计算点 + 文本断言接入点
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
const here = fileURLToPath(new URL('.', import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'combat.js'), 'utf8');

globalThis.CONFIG = {
  TOWERS: {
    fire: { atkInterval: 1, shot: { dur: 0.5, kind: 'line' } },
    ice: { atkInterval: 1, shot: { dur: 0.5, kind: 'line' } },
    electric: { atkInterval: 1, shot: { dur: 0.5, kind: 'bolt' } },
    boomerang: { atkInterval: 1, shot: { dur: 0.8, kind: 'arc' } },
    cannon: { atkInterval: 1, shot: { dur: 0.7, kind: 'line' } },
  },
};
globalThis.SKILL_NUM = {
  ice: { '寒霜': { slowMult: [0.3, 0.3, 0.3, 0.3], ttl: [3, 3, 3, 3] } },
  fire: { '多重火球': { scatterSplit: [3, 3, 4, 5], condense: [0.15, 0.15, 0.3, 0.5] } },
  boomerang: { '猎手标记': { deep: [0, 0.12, 0.18, 0.25] } },
};

function extract(name, from, toNext = true) {
  const m = src.match(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([\\s\\S]*?)\\n  \\}'));
  if (!m) { console.error('FAIL: method not found:', name); process.exit(1); }
  const fn = new Function('ctx', ...(from || []), m[1].replace(/\bthis\./g, 'ctx.'));
  return fn;
}
function assert(cond, msg) { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } }

// ============ 1) interval 攻速五件（1★/2★） ============
{
  const ivFn = extract('interval(key)', ['key']);
  let relicVal;
  const ctx = {
    relicVal: (id) => relicVal[id] || 0,
    lv: () => 0, branchLv: () => 0, tower: () => ({}),
    game: { run: { storeBuff: () => ({ spd: 0 }), _tomeBuffTtl: 0, _elecPulseTtl: 0, _burnallTtl: 0 }, meta: {} },
  };
  relicVal = { fire_forge: 15, ice_marrow: 24, elec_light: 15, can_rapid: 12, boo_speed: 10 };
  const base = 1.0;
  const got = {};
  for (const k of ['fire', 'ice', 'electric', 'cannon', 'boomerang']) got[k] = ivFn(ctx, k);
  assert(Math.abs(got.fire - base / 1.15) < 1e-6, 'fire_forge 15% 攻速');
  assert(Math.abs(got.ice - base / 1.24) < 1e-6, 'ice_marrow 24% 攻速');
  assert(Math.abs(got.electric - base / 1.15) < 1e-6, 'elec_light 15% 攻速');
  assert(Math.abs(got.cannon - base / 1.12) < 1e-6, 'can_rapid 12% 攻速');
  assert(Math.abs(got.boomerang - base / 1.10) < 1e-6, 'boo_speed 10% 攻速');
  console.log('PASS1: 攻速五件（1★/2★）接入 interval()');
}

// ============ 2) tryAttackDebuff 概率五件（1★/2★）采样近似 ============
{
  const debFn = extract('tryAttackDebuff(key, o, dmg)', ['key', 'o', 'dmg']);
  let relicVal = {};
  let burns = 0;
  const ctx = {
    relicVal: (id) => relicVal[id] || 0,
    lv: () => 0, branchLv: () => 0,
    applyBurn: () => { burns++; },
    applySlow: () => {}, applyPoison: () => {}, applyBleed: () => {},
    freezeE: () => {},
    fxParticle: () => {}, fxFlash: () => {}, fxRing: () => {}, fxBeam: () => {},
    enemies: () => [],
    game: { run: { relic3: () => false } },
  };
  // fire_fuel 1★=20 → 基础 20% + 20% = 40%
  relicVal = { fire_fuel: 20 };
  burns = 0;
  for (let i = 0; i < 400; i++) debFn(ctx, 'fire', { x: 0, y: 0, hp: 100 }, 10);
  const rFire = burns / 400;
  assert(rFire > 0.30 && rFire < 0.50, `fire_fuel 灼烧概率≈40% (${rFire.toFixed(2)})`);
  // ice_extreme 1★=15 → 20+15=35%
  let slows = 0;
  ctx.applySlow = () => { slows++; };
  relicVal = { ice_extreme: 15 };
  slows = 0;
  for (let i = 0; i < 400; i++) debFn(ctx, 'ice', { x: 0, y: 0, hp: 100, slow: null, frozen: 0 }, 10);
  const rIce = slows / 400;
  assert(rIce > 0.25 && rIce < 0.45, `ice_extreme 冰缓概率≈35% (${rIce.toFixed(2)})`);
  // elec_strong 1★=15 → 20+15=35%
  let paras = 0;
  ctx.applySlow = () => {};
  ctx.fxParticle = () => {};
  const origPB = ctx;
  // 重建 ctx 以便统计麻痹
  const ctxE = {
    relicVal: (id) => (id === 'elec_strong' ? 15 : 0),
    lv: () => 0, branchLv: () => 0,
    applyBurn: () => {}, applySlow: () => {}, applyPoison: () => {}, applyBleed: () => {},
    freezeE: () => {},
    fxParticle: () => {}, fxFlash: () => {}, fxRing: () => {}, fxBeam: () => {},
    enemies: () => [],
    game: { run: { relic3: () => false } },
  };
  let parasN = 0;
  ctxE.applySlow = () => { parasN++; };
  for (let i = 0; i < 400; i++) debFn(ctxE, 'electric', { x: 0, y: 0, hp: 100, paralyzed: 0 }, 10);
  const rElec = parasN / 400;
  assert(rElec > 0.25 && rElec < 0.45, `elec_strong 麻痹概率≈35% (${rElec.toFixed(2)})`);
  // poison_fang 1★=15 → 35%
  let pois = 0;
  const ctxP = {
    relicVal: (id) => (id === 'poison_fang' ? 15 : 0),
    lv: () => 0, branchLv: () => 0,
    applyPoison: () => { pois++; }, applyBurn: () => {}, applySlow: () => {}, applyBleed: () => {},
    freezeE: () => {},
    fxParticle: () => {}, fxFlash: () => {}, fxRing: () => {}, fxBeam: () => {},
    enemies: () => [],
    game: { run: { relic3: () => false } },
  };
  for (let i = 0; i < 400; i++) debFn(ctxP, 'poison', { x: 0, y: 0, hp: 100 }, 10);
  const rPoi = pois / 400;
  assert(rPoi > 0.25 && rPoi < 0.45, `poison_fang 中毒概率≈35% (${rPoi.toFixed(2)})`);
  // boo_bleed 1★=15 → 35%
  let bleeds = 0;
  const ctxB = {
    relicVal: (id) => (id === 'boo_bleed' ? 15 : 0),
    lv: () => 0, branchLv: () => 0,
    applyBleed: () => { bleeds++; }, applyBurn: () => {}, applySlow: () => {}, applyPoison: () => {},
    freezeE: () => {},
    fxParticle: () => {}, fxFlash: () => {}, fxRing: () => {}, fxBeam: () => {},
    enemies: () => [],
    game: { run: { relic3: () => false } },
  };
  for (let i = 0; i < 400; i++) debFn(ctxB, 'boomerang', { x: 0, y: 0, hp: 100 }, 10);
  const rBleed = bleeds / 400;
  assert(rBleed > 0.25 && rBleed < 0.45, `boo_bleed 流血概率≈35% (${rBleed.toFixed(2)})`);
  console.log('PASS2: debuff 概率五件（1★/2★）接入 tryAttackDebuff');
}

// ============ 3) _fireAttackHit：fire_rain 1★/2★ 火球数（多重火球路径） ============
{
  const hitFn = extract('_fireAttackHit(e, dmg)', ['e', 'dmg']);
  const ctx = {
    relicVal: (id) => (id === 'fire_rain' ? 2 : 0),
    lv: (k, s) => (s === '多重火球' ? 1 : s === '大火球' ? 0 : 0),
    branchLv: () => 0,
    tryAttackDebuff: () => {},
    towerMuzzle: () => ({ x: 100, y: 900 }),
    range: () => 200,
    shotDmg: () => 100,
    damage: () => {},
    fxParticle: () => {}, fxRing: () => {}, fxFlash: () => {},
    shots: [],
    _fireImpact: () => {},
    _fireSingleBlast: () => {},
    _attackFireOnHit: () => {},
    enemies: () => [],
    game: { run: { relic3: () => false }, fx: [] },
  };
  hitFn(ctx, { x: 300, y: 700, hp: 100 }, 100);
  const scatters = ctx.shots.filter((s) => s.scatter);
  // 主目标伤害不产生弹道；散射 = (5 + A0 + relic2) - 1 = 6 条额外
  assert(scatters.length === 6, `fire_rain 1★ 多重火球应 +2 枚（散射 6 条，实际 ${scatters.length}）`);
  console.log('PASS3: fire_rain 1★/2★ 火球数接入多重火球');
}

// ============ 4) attackOnce：boo_multi 镖数 / can_double 双发概率 ============
{
  const atkFn = extract('attackOnce(key)', ['key']);
  const baseCtx = (relicVal) => ({
    relicVal,
    game: {
      run: { relic3: () => false, spendAttackEnergy: () => {}, armoryEnergyMax: () => 50, slotOrder: ['fire'] },
      meta: {},
      fx: [],
      playSfx: () => {},
      enemies: [],
    },
    tower: () => null,
    pickTarget: () => ({ x: 300, y: 700, hp: 100, speed: 0, slow: null }),
    towerMuzzle: () => ({ x: 100, y: 900 }),
    ly: () => ({ wallY: 957 }),
    shotDmg: () => 100,
    lv: (k, s) => (s === '多镖' ? 0 : s === '双管齐射' ? 1 : 0),
    branchLv: () => 0,
    interval: () => 1,
    shots: [],
    bWait: {},
    _nextDmg: {},
    fxParticle: () => {}, fxFlash: () => {}, fxRing: () => {}, fxBeam: () => {},
  });
  // boo_multi 1★=2：n = 1 + multi(0) + 2 = 3 条镖
  {
    const ctx = baseCtx((id) => (id === 'boo_multi' ? 2 : 0));
    atkFn(ctx, 'boomerang');
    const sweeps = ctx.shots.filter((s) => s.sweep);
    assert(sweeps.length === 3, `boo_multi 1★ 投掷镖数应 3（实际 ${sweeps.length}）`);
  }
  // can_double 1★=20：duelProb = 0.25+0.15*0+0.20 = 0.45 → 采样 200 次双发 ≈45%
  {
    const ctx = baseCtx((id) => (id === 'can_double' ? 20 : 0));
    // 固定随机：用覆盖 Math.random 模拟概率观测
    let duelN = 0, totalN = 0;
    for (let i = 0; i < 200; i++) {
      const c = baseCtx((id) => (id === 'can_double' ? 20 : 0));
      c.shots = [];
      globalThis.__r = Math.random();
      const origRandom = Math.random;
      Math.random = () => (i % 100 < 45 ? 0.1 : 0.9);   // 45% 命中
      atkFn(c, 'cannon');
      Math.random = origRandom;
      totalN++;
      if (c.shots.length >= 2) duelN++;
    }
    assert(duelN === 90, `can_double 1★ 双发概率≈45%（实际 ${duelN}/200）`);
  }
  console.log('PASS4: boo_multi 镖数 / can_double 双发概率接入 attackOnce');
}

// ============ 5) 文本断言：其余接入点（重爆/震烈/穿透/暴雪/穿透凝冰/过载/爆核/霜刺/冰川/凝霜/永冻/猎心/疾接/回旋/燃烧弹） ============
{
  const must = [
    ["relicVal('can_heavy')", 'can_heavy 重爆1★/2★'],
    ["relicVal('can_knock')", 'can_knock 震烈1★/2★'],
    ["relicVal('can_pierce')", 'can_pierce 穿透1★/2★'],
    ["relicVal('ice_blizzard')", 'ice_blizzard 暴雪1★/2★（3处）'],
    ["relicVal('ice_pierce')", 'ice_pierce 穿透凝冰1★/2★'],
    ["relicVal('elec_overload')", 'elec_overload 过载1★/2★'],
    ["relicVal('fire_nuke')", 'fire_nuke 爆核1★/2★'],
    ["relicVal('ice_spike')", 'ice_spike 霜刺1★/2★'],
    ["relicVal('ice_glacier')", 'ice_glacier 冰川1★/2★'],
    ["relicVal('ice_condense')", 'ice_condense 凝霜1★/2★'],
    ["relicVal('ice_forever')", 'ice_forever 永冻1★/2★'],
    ["relicVal('boo_hunt')", 'boo_hunt 猎心1★/2★'],
    ["relicVal('boo_catch')", 'boo_catch 疾接1★/2★'],
    ["relicVal('boo_spin')", 'boo_spin 回旋1★/2★'],
    ["relicVal('can_incend')", 'can_incend 燃烧弹1★/2★'],
    ["relicVal('elec_arc')", 'elec_arc 电弧1★/2★'],
  ];
  for (const [needle, label] of must) {
    if (needle === "relicVal('ice_blizzard')") {
      const n = src.split(needle).length - 1;
      assert(n >= 3, `${label} 应 ≥3 处（实际 ${n}）`);
    } else {
      assert(src.includes(needle), label);
    }
  }
  // 三连重构：真实弹道 + 飘字保留
  assert(src.includes("_fireImpact(o, dmg, off)"), '三连=3条真实弹道命中完整结算');
  assert(src.includes('_fireImpact'), '_fireImpact 统一命中结算 helper');
  assert(src.includes("'焰雨·三连！'"), '三连飘字保留');
  console.log('PASS5: 文本断言其余接入点 16 项 + 三连重构结构');
}

console.log('\nALL PASS (普攻圣遗物实装 v1.16.114)');
