/**
 * exp_curve_current.js —— 当前代码生效的经验获取曲线 / 升级曲线重算（只读，不改配置）
 *
 * 口径：
 *   - 「目前」= js/config/experience.js 已落地的三段 needs[48] + waveMultiplier(0.045)
 *   - 击杀经验按 kill-hooks.js: round(kill[e.type] × waveMultiplier(e.waveNo)) 逐只结算
 *   - 三消经验按 run.js expOfShape + WAVE.matchDist 的解析期望（41.75/波）
 *   - 波末经验 main.js:611 = EXP.waveBonus × slotOrder.length（稳态 4 塔 = 20/波）
 *   - 全歼 / 无经验圣遗物（bonus.exp=0、s_sr_cm_exp=0、cm_tome=0）
 *   - 普通战场 ancient W1–60：W20/40/60 由 bosses/*.setup() 覆盖投放（脚本 Boss）
 *   - 深渊 abyss W1–90：不触发脚本 Boss（bosses.js 的 field='ancient'），全波走 wave.js 通用 plan
 *     深渊 WAVE.maxWave=9999 无硬上限，settlement.js 的 waveMax=90 只是结算进度条刻度
 *   - 脚本 Boss 波击杀次数按血量实体数计（W40 含 2 尊 twin），周期召唤未计（下界）
 *
 * 用法：node tools/exp_curve_current.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');
const BOSSES = require('../js/config/bosses.js');
const ROOT = path.resolve(__dirname, '..');
const MAXW = 90;
const SCRIPT_BOSS = { 20: 'altar_rosea', 40: 'altar_galvin', 60: 'altar_vera' };

// ---------- 1. 每波真实投放的怪物类型清单 ----------
function wavePlan(w, field) {
  const E = C.ENEMY;
  const bossKey = field === 'ancient' ? SCRIPT_BOSS[w] : null;
  if (bossKey) {
    const b = BOSSES[bossKey];
    const arr = [{ type: 'boss' }];                       // Boss 主体
    if (w === 40) { arr.push({ type: 'boss' }, { type: 'boss' }); } // 分裂 twin ×2
    for (const lv of (b.adds || []).flat()) arr.push({ type: E.levelOf(lv).type, lv });
    if (w === 20) for (let i = 0; i < b.summonCount; i++) arr.push({ type: 'normal', summon: true });
    return arr;
  }
  const count = E.countForWave(w);
  const hasBoss = w >= 5 && w % E.bossEvery === 0;
  const eliteCount = Math.floor(count / 20);
  const normalCount = count - (hasBoss ? 1 : 0) - eliteCount;
  const mix = E.levelMix(w);
  const arr = [];
  for (let i = 0; i < normalCount; i++) {
    const lv = mix[i % mix.length];
    arr.push({ type: E.levelOf(lv).type, lv });
  }
  for (let i = 0; i < eliteCount; i++) arr.push({ type: 'elite' });
  if (hasBoss) arr.push({ type: 'boss' });
  return arr;
}

// ---------- 2. 逐波经验供给 ----------
const MATCH_EXP = C.WAVE.matchesPerWave * Object.entries(C.WAVE.matchDist)
  .reduce((s, [shape, p]) => s + p * Math.floor(C.EXP.perCell * ({ '3': 3, '4': 4, '5': 5, L5: 5 }[shape]) * C.EXP.shape[shape]), 0);
const WAVE_BONUS = C.EXP.waveBonus * C.TOWER_SLOTS;

function build(field, end) {
  const rows = [];
  let cum = 0, exp = 0, lv = 0, cumNoRound = 0;
  for (let w = 1; w <= end; w++) {
    const mult = C.EXP.waveMultiplier(w);
    const plan = wavePlan(w, field);
    let killBase = 0, killExp = 0;
    const byType = {};
    for (const m of plan) {
      const base = C.EXP.kill[m.type] || C.EXP.kill.normal;
      killBase += base;
      killExp += Math.round(base * mult);       // 代码实算：逐只取整
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    const killExpNoRound = killBase * mult;     // 对照：整池缩放不取整
    const supply = MATCH_EXP + WAVE_BONUS + killExp;
    cum += supply; cumNoRound += MATCH_EXP + WAVE_BONUS + killExpNoRound;
    exp += supply;
    const ups = lv;
    while (lv < 48 && exp >= C.EXP.need(lv)) { exp -= C.EXP.need(lv); lv++; }
    rows.push({
      wave: w, monsters: plan.length, killBase: Math.round(killBase), mult: +mult.toFixed(3),
      killExp, killExpNoRound: Math.round(killExpNoRound), matchExp: MATCH_EXP,
      waveBonus: WAVE_BONUS, supply: Math.round(supply), cum: Math.round(cum),
      cumNoRound: Math.round(cumNoRound), level: lv, poolExp: Math.round(exp),
      nextNeed: lv < 48 ? C.EXP.need(lv) : 0,
      progress: lv < 48 ? +(100 * exp / C.EXP.need(lv)).toFixed(1) : 100,
      levelUps: lv - ups, scriptBoss: SCRIPT_BOSS[w] && field === 'ancient' ? SCRIPT_BOSS[w] : '',
      byType: Object.entries(byType).map(([k, n]) => k + '×' + n).join(' '),
    });
  }
  return rows;
}
const ANC = build('ancient', 60);
const ABY = build('abyss', MAXW);

// ---------- 3. 升级需求曲线 ----------
const needs = [];
let Eacc = 0;
for (let L = 0; L < 48; L++) {
  Eacc += C.EXP.need(L);
  needs.push({ level: L, need: C.EXP.need(L), cum: Eacc,
    ratio: L ? +(C.EXP.need(L) / C.EXP.need(L - 1)).toFixed(4) : null });
}

// ---------- 4. 上一轮设计稿口径（exp_curve_solver：整池缩放 + CSV pool，EPS 容差） ----------
const csvPath = path.join(ROOT, 'docs', 'balance-curve-data.csv');
let design = null;
if (fs.existsSync(csvPath)) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).map(l => l.split(','));
  const h = lines[0], iw = h.indexOf('wave'), im = h.indexOf('mode'), ik = h.indexOf('killExpPool');
  const csvPool = {};
  for (let i = 1; i < lines.length; i++) if (lines[i][im] === 'real') csvPool[+lines[i][iw]] = +lines[i][ik];
  function genericPool(w) {
    const E = C.ENEMY, count = E.countForWave(w);
    const hasBoss = w >= 5 && w % E.bossEvery === 0;
    const elite = Math.floor(count / 20), normal = count - (hasBoss ? 1 : 0) - elite;
    const mix = E.levelMix(w);
    let s = 0;
    for (let i = 0; i < normal; i++) s += C.EXP.kill[E.levelOf(mix[i % mix.length]).type] || C.EXP.kill.normal;
    s += C.EXP.kill.elite * elite;
    if (hasBoss) s += C.EXP.kill.boss;
    return s;
  }
  let cumB = 0, expB = 0, lvB = 0;
  design = {};
  for (let w = 1; w <= MAXW; w++) {
    const pool = w <= 60 ? csvPool[w] : genericPool(w);
    const supply = MATCH_EXP + WAVE_BONUS + pool * C.EXP.waveMultiplier(w);
    cumB += supply; expB += supply;
    while (lvB < 48 && expB + 1e-6 >= C.EXP.need(lvB)) { expB -= C.EXP.need(lvB); lvB++; }
    design[w] = { cum: Math.round(cumB), level: lvB, supply: Math.round(supply) };
  }
}

// ---------- 5. 输出 ----------
const fmt = n => String(Math.round(n)).padStart(9);
console.log('=== 常量（当前代码）===');
console.log('三消/波 = %s（%d 次 × 形状期望）| 波末/波 = %s（%d × %d 塔）| 击杀倍率 = 1 + %s×(w−1)',
  MATCH_EXP.toFixed(2), C.WAVE.matchesPerWave, WAVE_BONUS, C.EXP.waveBonus, C.TOWER_SLOTS, C.EXP.killWaveGrowth);
console.log('需求 needs[48]：need(0)=%d / need(9)=%d / need(34)=%d / need(47)=%d',
  C.EXP.need(0), C.EXP.need(9), C.EXP.need(34), C.EXP.need(47));
console.log('累计阈值 E(10)=%d  E(35)=%d  E(48)=%d', needs[9].cum, needs[34].cum, needs[47].cum);

console.log('\n=== 逐波经验获取（普通战场 ancient，W1–60）===');
console.log('wave  怪数 击杀基值 倍率  击杀经验  本波合计    累计经验  等级 本级进度 下一级需求  备注');
for (const r of ANC) {
  if (r.wave <= 10 || r.wave % 5 === 0) {
    console.log(String(r.wave).padStart(4), String(r.monsters).padStart(5), String(r.killBase).padStart(9),
      String(r.mult.toFixed(3)).padStart(6), String(r.killExp).padStart(9), fmt(r.supply), fmt(r.cum),
      String(r.level).padStart(5), String(r.progress + '%').padStart(8), String(r.nextNeed).padStart(10),
      '  ' + r.scriptBoss);
  }
}

console.log('\n=== 逐波经验获取（深渊 abyss，W1–90；无脚本 Boss）===');
console.log('wave  怪数  击杀经验  本波合计    累计经验  等级 本级进度 下一级需求');
for (const r of ABY) {
  if (r.wave <= 10 || r.wave % 5 === 0 || r.wave === 90 || r.wave === 91) {
    console.log(String(r.wave).padStart(4), String(r.monsters).padStart(5), String(r.killExp).padStart(10),
      fmt(r.supply), fmt(r.cum), String(r.level).padStart(5),
      String(r.progress + '%').padStart(8), String(r.nextNeed).padStart(10));
  }
}

console.log('\n=== 关键锚点（两条曲线）===');
console.log('wave   普通累计  普通等级     深渊累计  深渊等级   差额(深渊−普通)   设计稿等级');
for (const w of [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90]) {
  const a = w <= 60 ? ANC[w - 1] : null, b = ABY[w - 1];
  console.log(' W' + String(w).padEnd(3) +
    (a ? fmt(a.cum) + '   L' + String(a.level).padStart(2) + '     ' : '        —      —      ') +
    fmt(b.cum) + '   L' + String(b.level).padStart(2) +
    (a ? String(b.cum - a.cum).padStart(12) : '           —') +
    '        L' + (design ? design[w].level : '?'));
}

console.log('\n=== 达成波次 ===');
console.log('目标   普通战场(ancient W1–60)          深渊(abyss W1–90)');
for (const t of [5, 10, 20, 30, 35, 40, 45, 48]) {
  const ha = ANC.find(r => r.level >= t), hb = ABY.find(r => r.level >= t);
  console.log(' L' + String(t).padEnd(2) + '   ' +
    (ha ? 'W' + String(ha.wave).padEnd(3) : 'W>60 ').padEnd(30) +
    (hb ? 'W' + hb.wave + (hb.wave > 60 ? '（深渊专属段）' : '（与普通战场同期）') : 'W>90'));
}

console.log('\n=== 升级节奏（深渊口径）===');
const marks = [5, 10, 20, 30, 35, 40, 45, 48];
const waveOf = {};
for (const t of marks) { const hit = ABY.find(r => r.level >= t); waveOf[t] = hit ? hit.wave : null; }
for (let i = 1; i < marks.length; i++) {
  const a = marks[i - 1], b = marks[i];
  if (waveOf[a] && waveOf[b]) console.log(' L' + String(a).padEnd(2) + '→L' + String(b).padEnd(2) +
    ' : W' + String(waveOf[a]).padEnd(2) + '→W' + String(waveOf[b]).padEnd(2) +
    '  ' + String(waveOf[b] - waveOf[a]).padStart(2) + ' 波  平均 ' +
    ((waveOf[b] - waveOf[a]) / (b - a)).toFixed(1) + ' 波/级');
}

console.log('\n=== 升级需求表（每 3 级；L48 为硬上限）===');
for (let L = 0; L <= 48; L += 3) {
  const n = L >= 48 ? null : needs[L];
  console.log(' L' + String(L).padEnd(2) + ' 本级需求 ' + (n ? String(n.need).padStart(7) : '      —') +
    '   累计 E(L) ' + String(needs[Math.min(L, 47)].cum).padStart(9) +
    (n && n.ratio ? '   环比 ×' + n.ratio.toFixed(4) : ''));
}

console.log('\n=== 与目标的差距（代码实算 / 全歼 / 无经验圣遗物）===');
for (const [name, rows, w, E] of [['通关 W60（普通）', ANC, 60, needs[34].cum], ['深渊 W90', ABY, 90, needs[47].cum]]) {
  const r = rows[w - 1];
  console.log(' ' + name.padEnd(18) + '累计 ' + String(r.cum).padStart(8) + ' / E(' + (w === 60 ? 35 : 48) + ')=' + E +
    '  Δ ' + String(r.cum - E).padStart(7) + '  等级 L' + r.level + '  本级进度 ' + r.progress + '%');
}
const need48 = ABY.find(r => r.level >= 48);
console.log(' 深渊实际达成 L48：' + (need48 ? 'W' + need48.wave : 'W>90'));

console.log('\n=== 差异来源分解（普通战场 W60）===');
const a60 = ANC[59];
console.log(' ① 逐只 Math.round 取整：累计 ' + a60.cum + ' vs 不取整 ' + a60.cumNoRound +
  '  Δ ' + (a60.cum - a60.cumNoRound));
console.log(' ② 设计稿口径（整池缩放 + CSV pool）：累计 ' + (design ? design[60].cum : '?') +
  '  等级 L' + (design ? design[60].level : '?'));
console.log(' ③ 深渊 W60 vs 普通 W60 累计差：' + (ABY[59].cum - ANC[59].cum) + '（脚本 Boss 波投放不同）');
console.log(' ④ 脚本 Boss 波击杀基值（真实 vs 通用 plan）：');
for (const w of [20, 40, 60]) {
  const r = ANC[w - 1], g = wavePlan(w, 'abyss');
  const gb = g.reduce((s, m) => s + (C.EXP.kill[m.type] || C.EXP.kill.normal), 0);
  console.log('    W' + w + ' ' + r.scriptBoss.padEnd(14) + String(r.monsters).padStart(3) + ' 只 / 基值 ' +
    String(r.killBase).padStart(5) + '  | 通用 ' + String(g.length).padStart(3) + ' 只 / 基值 ' +
    String(gb).padStart(5) + '  Δ ' + String(r.killBase - gb).padStart(5));
}

// ---------- 6. CSV ----------
const cols = ['wave', 'anc_monsters', 'anc_killBase', 'anc_mult', 'anc_killExp', 'anc_supply',
  'anc_cum', 'anc_level', 'anc_progress', 'anc_scriptBoss',
  'aby_monsters', 'aby_killExp', 'aby_supply', 'aby_cum', 'aby_level', 'aby_progress',
  'design_cum', 'design_level'];
const out = [cols.join(',')];
for (let w = 1; w <= MAXW; w++) {
  const a = w <= 60 ? ANC[w - 1] : null, b = ABY[w - 1];
  const v = {
    wave: w,
    anc_monsters: a ? a.monsters : '', anc_killBase: a ? a.killBase : '', anc_mult: a ? a.mult : '',
    anc_killExp: a ? a.killExp : '', anc_supply: a ? a.supply : '', anc_cum: a ? a.cum : '',
    anc_level: a ? a.level : '', anc_progress: a ? a.progress : '', anc_scriptBoss: a ? a.scriptBoss : '',
    aby_monsters: b.monsters, aby_killExp: b.killExp, aby_supply: b.supply,
    aby_cum: b.cum, aby_level: b.level, aby_progress: b.progress,
    design_cum: design ? design[w].cum : '', design_level: design ? design[w].level : '',
  };
  out.push(cols.map(k => v[k]).join(','));
}
fs.writeFileSync(path.join(ROOT, 'docs', 'exp-curve-current-data.csv'), '\ufeff' + out.join('\n'), 'utf8');
console.log('\nCSV -> docs/exp-curve-current-data.csv (' + MAXW + ' 行)');
