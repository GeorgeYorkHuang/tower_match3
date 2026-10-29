// 火冰参数「改参生效性」验证（W策划 · 第二批）
// 原则：只读源码、不改任何文件；仅在运行时改 tower-skills 配置对象的值，跑完立刻还原。
// 目的：把字典里「这个参数真的能改出效果」变成可执行断言，并把 P1（两个字段未接入）钉成改参验证。
//
// 用法：node tools/_verify_fire_ice_params.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const SKILL_NUM = require('../js/config/tower-skills.js');
const { CombatSystem } = require('../js/combat.js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; console.log('  PASS ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  → ' + extra : '')); }
};

/** 最小战斗上下文：只提供 tickFire/tickIce/齐射路径真正用到的东西 */
function makeCtx(opts = {}) {
  const game = {
    enemies: opts.enemies || [],
    fx: [],
    ly: () => ({ areaY: 0, entryH: 100, wallY: 900 }),
    run: { relic3: () => false, gsState: {}, effects: { towerDps: () => 32 } },
  };
  const c = new CombatSystem(game);
  c.lv = (k, n) => (opts.owned && opts.owned[k] && opts.owned[k].includes(n) ? 1 : 0);
  c.branchLv = (k, n, br) => (opts.branch && opts.branch[n] && opts.branch[n][br]) || 0;
  c.shotDmg = () => 100;                 // 固定单发伤害，便于等比断言
  c.castEnergy = () => {};
  c.inTowerRange = () => true;
  c.range = () => 200;
  c.relicVal = () => 0;
  c.towerMuzzle = () => ({ x: 100, y: 900 });
  c.tower = () => null;
  c.tryAttackDebuff = () => {};
  c.iceHitFx = () => {};
  c.damage = (e, d) => { e.log = e.log || []; e.log.push(d); };
  c.applyBurn = () => {};
  c.applySlow = () => {};
  c.fxParticle = () => {}; c.fxRing = () => {}; c.fxFlash = () => {};
  return { c, game };
}

const enemy = (x = 375, y = 900) => ({ x, y, hp: 1000, maxHp: 1000, dots: [], slow: null, frozen: 0 });

/** 小步推进到「刚施放」那一刻（大步长会让同一帧内既施放又结算，观测不到中间态） */
function tickUntil(c, pick, max = 500, phase = 'fire') {
  for (let i = 0; i < max; i++) {
    if (phase === 'fire') c.tickFire(0.05); else c.tickIce(0.05);
    const v = pick(c);
    if (v) return v;
  }
  return null;
}

/** 改配置 → 跑用例 → 还原。fn 返回值即观测值 */
function withParam(path, value, fn) {
  const [tower, skill, key] = path.split('.');
  const node = SKILL_NUM[tower][skill];
  const old = node[key];
  node[key] = value;
  try { return fn(); } finally { node[key] = old; }
}

const fireCtx = (owned, branch) => makeCtx({ owned: { fire: owned }, branch, enemies: [enemy()] });
const iceCtx = (owned, branch, enemies) => makeCtx({ owned: { ice: owned }, branch, enemies: enemies || [enemy()] });

console.log('\n— 火柱：伤害 / 半径 / 延迟 —');
{
  const a = tickUntil(fireCtx(['火柱'], {}).c, (c) => c.pillarWaves && c.pillarWaves[0]);
  const b = withParam('fire.火柱.damage', 2.4, () => tickUntil(fireCtx(['火柱'], {}).c, (c) => c.pillarWaves && c.pillarWaves[0]));
  ok(a && b && a.dmg === 120 && b.dmg === 240, '① damage 1.2→2.4：爆发伤害 120→240', `${a && a.dmg} / ${b && b.dmg}`);

  const r0 = tickUntil(fireCtx(['火柱'], { 火柱: { B: 3 } }).c, (c) => c.pillarWaves && c.pillarWaves[0]);
  const r1 = withParam('fire.火柱.radiusPerBranch', 0.40, () => tickUntil(fireCtx(['火柱'], { 火柱: { B: 3 } }).c, (c) => c.pillarWaves && c.pillarWaves[0]));
  ok(r0 && r1 && r0.r === 192 && r1.r === 264, '② radiusPerBranch 0.20→0.40（B3）：半径 192→264', `${r0 && r0.r} / ${r1 && r1.r}`);

  const t0 = tickUntil(fireCtx(['火柱'], {}).c, (c) => c.pillarWaves && c.pillarWaves[0]);
  const t1 = withParam('fire.火柱.delay', 2.0, () => tickUntil(fireCtx(['火柱'], {}).c, (c) => c.pillarWaves && c.pillarWaves[0]));
  ok(t0 && t1 && Math.abs((t1.t - t0.t) - 1.4) < 1e-6, '③ delay 0.6→2.0：结算延迟同步 +1.4s', `${t0 && t0.t.toFixed(2)} / ${t1 && t1.t.toFixed(2)}`);
}

console.log('\n— 火柱余烬：P1 已接入（改参验证）—');
{
  // C3 → ember=3，落地后生成 groundDots：dps = 100 × 0.15 × 3 = 45，ttl = 3（硬编码）
  const settle = (extra) => {
    const { c } = makeCtx({ owned: { fire: ['火柱'] }, branch: { 火柱: { C: 3 } }, enemies: [enemy()] });
    tickUntil(c, (x) => x.pillarWaves && x.pillarWaves[0]);
    for (let i = 0; i < 40; i++) c.tickFire(0.05);      // 推进过 0.6s 延迟 → 落地生成余烬
    return extra ? extra(c) : c;
  };
  const s0 = settle().groundDots && settle().groundDots[0];
  const sDur = withParam('fire.火柱.emberDuration', 10, () => settle((c) => c.groundDots && c.groundDots[0]));
  const sDps = withParam('fire.火柱.emberDamagePerBranch', 1.0, () => settle((c) => c.groundDots && c.groundDots[0]));
  ok(!!s0 && s0.ttl === 3 && sDur && sDur.ttl === 10,
    '④ emberDuration 3→10：余烬时长变为 10（P1 已接入）', `${s0 && s0.ttl} / ${sDur && sDur.ttl}`);
  ok(!!s0 && s0.dps === 45 && sDps && sDps.dps === 300,
    '⑤ emberDamagePerBranch 0.15→1.0：余烬 DPS 变为 300（P1 已接入）', `${s0 && s0.dps} / ${sDps && sDps.dps}`);
}

console.log('\n— 多重火球：数量 / 单枚伤害 —');
{
  const shoot = () => {
    const { c } = makeCtx({ owned: { fire: ['多重火球'] }, enemies: [enemy()] });
    c._fireMultiShot(enemy(), 100);
    return c.shots;
  };
  const shots0 = shoot();
  const n1 = withParam('fire.多重火球.count', 8, () => shoot().length);
  const d1 = withParam('fire.多重火球.damage', 0.88, () => shoot()[0].dmg);
  ok(shots0.length === 5 && n1 === 8, '⑥ count 5→8：弹道数 5→8', `${shots0.length} / ${n1}`);
  ok(shots0[0].dmg === 44 && d1 === 88, '⑦ damage 0.44→0.88：单枚 44→88', `${shots0[0].dmg} / ${d1}`);
}

console.log('\n— 烈焰墙 / 火雨 —');
{
  const w0 = tickUntil(fireCtx(['烈焰墙'], {}).c, (c) => c.fireWalls && c.fireWalls[0]);
  const w1 = withParam('fire.烈焰墙.width', 360, () => tickUntil(fireCtx(['烈焰墙'], {}).c, (c) => c.fireWalls && c.fireWalls[0]));
  ok(w0 && w1 && w0.w === 180 && w1.w === 360, '⑧ width 180→360：墙长 180→360', `${w0 && w0.w} / ${w1 && w1.w}`);

  const r0 = tickUntil(fireCtx(['火雨'], {}).c, (c) => c.rainWaves && c.rainWaves.length && c.rainWaves);
  const r1 = withParam('fire.火雨.baseWaves', 6, () => tickUntil(fireCtx(['火雨'], {}).c, (c) => c.rainWaves && c.rainWaves.length && c.rainWaves));
  ok(r0 && r1 && r0.length === 3 && r1.length === 6, '⑨ baseWaves 3→6：波数 3→6', `${r0 && r0.length} / ${r1 && r1.length}`);
}

console.log('\n— 多重冰锥 / 冰花 / 冬珠 —');
{
  const volley = () => {
    const { c } = makeCtx({ owned: { ice: ['多重冰锥'] }, enemies: [enemy()] });
    c._iceMultiShot(enemy(), 100);
    return c.shots;
  };
  const v0 = volley();
  const v1 = withParam('ice.多重冰锥.count', 6, () => volley().length);
  ok(v0.length === 3 && v1 === 6, '⑩ count 3→6：冰锥弹道 3→6', `${v0.length} / ${v1}`);

  const three = () => [enemy(375, 900), enemy(360, 880), enemy(390, 860)];
  const f0 = tickUntil(iceCtx(['冰花'], {}, three()).c, (c) => c.delayed && c.delayed.length, 400, 'ice');
  const f1 = withParam('ice.冰花.baseCount', 3, () => tickUntil(iceCtx(['冰花'], {}, three()).c, (c) => c.delayed && c.delayed.length, 400, 'ice'));
  ok(f0 === 1 && f1 === 3, '⑪ baseCount 1→3：冰花落点 1→3', `${f0} / ${f1}`);

  const o0 = tickUntil(iceCtx(['冬珠'], {}).c, (c) => c.frostOrbs && c.frostOrbs[0], 400, 'ice');
  const o1 = withParam('ice.冬珠.damage', 0.88, () => tickUntil(iceCtx(['冬珠'], {}).c, (c) => c.frostOrbs && c.frostOrbs[0], 400, 'ice'));
  ok(o0 && o1 && o0.dmg === 44 && o1.dmg === 88, '⑫ damage 0.44→0.88：每跳 44→88', `${o0 && o0.dmg} / ${o1 && o1.dmg}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
