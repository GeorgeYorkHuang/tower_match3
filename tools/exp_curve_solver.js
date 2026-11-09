/**
 * exp_curve_solver.js —— 经验双曲线配平求解（只读，不改任何游戏配置）
 *
 * 设计目标（用户口径）：
 *   - 不带经验加持圣遗物，普通战场 W60 通关时 expLevel = 35
 *   - 48 级（4 塔 × 12 次选择的硬上限）只能在深渊裂隙（独立一局，W1–90）达成
 *   - 附加手感约束：W10 约 10 级，保留前期高频三选一
 *
 * 口径：
 *   - 全歼口径（用户判断「有圣遗物加持，DPS 不是问题」），击杀经验 100% 入账
 *   - 每波经验 = 三消 5 次 + 波末 5×塔数 + 击杀池（随波次缩放）
 *   - 击杀池 W1–60 取 docs/balance-curve-data.csv 的 killExpPool（已按脚本 Boss 逐项精算）
 *   - W61–90 用同样的 composition 规则外推（深渊复用圣坛花园 Boss）
 *
 * 需求曲线（三段连续）：
 *   L 0– 9 : need = A1 × G1^L                 G1 固定（前期快）
 *   L10–34 : need = need(9) × G2^(L−9)        G2 反解
 *   L35–47 : need = need(34) × G3^(L−34)      G3 反解
 *   E(L) = Σ need(l)
 * 三个约束：E(10)=Cum(10)、E(35)=Cum(60)、E(48)=Cum(90)
 *
 * 用法：node tools/exp_curve_solver.js [alpha] [g1]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');

const ROOT = path.resolve(__dirname, '..');
const ALPHA = Number(process.argv[2] || 0.045);   // 击杀经验每波线性增长系数
const G1 = Number(process.argv[3] || 1.25);       // 前 10 级增速（设计旋钮）
const MAXW = 90;
const EPS = 1e-6;

// ---------- 1. 每波「原始击杀经验池」（当前固定 kill 表、全歼口径） ----------
function killPool(w) {
  const E = C.ENEMY;
  const count = E.countForWave(w);
  const hasBoss = w >= 5 && w % E.bossEvery === 0;
  const eliteCount = Math.floor(count / 20);
  const normalCount = count - (hasBoss ? 1 : 0) - eliteCount;
  const mix = E.levelMix(w);
  let pool = 0;
  for (let i = 0; i < normalCount; i++) {
    const t = E.levelOf(mix[i % mix.length]).type;
    pool += C.EXP.kill[t] || C.EXP.kill.normal;
  }
  pool += C.EXP.kill.elite * eliteCount;
  if (hasBoss) pool += C.EXP.kill.boss;
  return pool;
}

// W1–60 用已精算的 CSV 值（脚本 Boss 波 20/40/60 的投放被重写，与通用表不同）
const csv = fs.readFileSync(path.join(ROOT, 'docs', 'balance-curve-data.csv'), 'utf8')
  .trim().split('\n').map((l) => l.split(','));
const head = csv[0];
const kw = head.indexOf('killExpPool'), mw = head.indexOf('mode'), ww = head.indexOf('wave');
const csvPool = {};
for (let i = 1; i < csv.length; i++) {
  if (csv[i][mw] === 'real') csvPool[Number(csv[i][ww])] = Number(csv[i][kw]);
}

const MATCH_EXP = 5 * (0.70 * 6 + 0.20 * 12 + 0.05 * 20 + 0.05 * 15); // = 41.75
const WAVE_BONUS = C.EXP.waveBonus * C.TOWER_SLOTS;                      // = 20
const pool = {}, scaled = {}, supply = {};
for (let w = 1; w <= MAXW; w++) {
  pool[w] = w <= 60 ? csvPool[w] : killPool(w);
  scaled[w] = pool[w] * (1 + ALPHA * (w - 1));   // 新怪物经验曲线
  supply[w] = MATCH_EXP + WAVE_BONUS + scaled[w];
}
function cum(W) { let s = 0; for (let w = 1; w <= W; w++) s += supply[w]; return s; }
const C10 = cum(10), C60 = cum(60), C90 = cum(90);

// ---------- 2. 反解三段需求曲线 ----------
// 段 A：A1 × (G1^10 − 1)/(G1 − 1) = C10
const A1 = C10 * (G1 - 1) / (Math.pow(G1, 10) - 1);
const need9 = A1 * Math.pow(G1, 9);
// 段 B：need9 × G2 × (G2^25 − 1)/(G2 − 1) = C60 − C10
function sumB(g) { return need9 * g * (Math.pow(g, 25) - 1) / (g - 1); }
const targetB = C60 - C10;
let lo = 1.0001, hi = 1.60;
for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (sumB(m) < targetB) lo = m; else hi = m; }
const G2 = (lo + hi) / 2;
const need34 = need9 * Math.pow(G2, 25);
// 段 C：need34 × G3 × (G3^13 − 1)/(G3 − 1) = C90 − C60
function sumC(g) { return need34 * g * (Math.pow(g, 13) - 1) / (g - 1); }
const targetC = C90 - C60;
lo = 1.0001; hi = 1.80;
for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (sumC(m) < targetC) lo = m; else hi = m; }
const G3 = (lo + hi) / 2;

function need(L) {
  if (L < 10) return A1 * Math.pow(G1, L);
  if (L < 35) return need9 * Math.pow(G2, L - 9);
  return need34 * Math.pow(G3, L - 34);
}
function E(L) { let s = 0; for (let l = 0; l < L; l++) s += need(l); return s; }

// ---------- 3. 逐波等级推进 ----------
function levelAt(W) {
  let exp = 0, lv = 0;
  for (let w = 1; w <= W; w++) {
    exp += supply[w];
    while (lv < 48 && exp + EPS >= need(lv)) { exp -= need(lv); lv++; }
  }
  return { lv, exp, next: need(Math.min(lv, 47)) };
}

// ---------- 4. 输出 ----------
const r = (x, n = 2) => Number(x.toFixed(n));
console.log('=== 供给（新怪物经验曲线）===');
console.log('三消/波 %s | 波末/波 %s | 击杀缩放 alpha=%s | killExp(w) = killBase × (1 + %s×(w−1))',
  MATCH_EXP, WAVE_BONUS, ALPHA, ALPHA);
console.log('Cum(10)=%d  Cum(60)=%d  Cum(90)=%d  |  Cum90/Cum60 = %s',
  Math.round(C10), Math.round(C60), Math.round(C90), r(C90 / C60));
console.log('\n=== 需求（三段 expNeed 曲线）===');
console.log('L 0– 9 : %s × %s^L', r(A1, 1), r(G1, 4));
console.log('L10–34 : %s × %s^(L−9)', r(need9, 1), r(G2, 4));
console.log('L35–47 : %s × %s^(L−34)', r(need34, 1), r(G3, 4));
console.log('need(0)=%d  need(9)=%d  need(34)=%d  need(47)=%d',
  Math.round(need(0)), Math.round(need(9)), Math.round(need(34)), Math.round(need(47)));
console.log('E(10)=%d (目标 %d) | E(35)=%d (目标 %d) | E(48)=%d (目标 %d)',
  Math.round(E(10)), Math.round(C10), Math.round(E(35)), Math.round(C60), Math.round(E(48)), Math.round(C90));
console.log('经验圣遗物容许上限：普通战场要摸到 48 级需 +%s%% 经验加成',
  Math.round((C90 / C60 - 1) * 100));

console.log('\n=== 逐波理论数据（全歼 / 无经验圣遗物 / 20 局均值口径）===');
console.log('wave  killOld  killNew  expPerWave   cumExp   level  poolExp  nextNeed');
for (let w = 5; w <= MAXW; w += 5) {
  const s = levelAt(w);
  console.log(String(w).padStart(4), String(Math.round(pool[w])).padStart(9),
    String(Math.round(scaled[w])).padStart(9), String(Math.round(supply[w])).padStart(11),
    String(Math.round(cum(w))).padStart(9), String(s.lv).padStart(7),
    String(Math.round(s.exp)).padStart(9), String(Math.round(s.next)).padStart(9));
}

console.log('\n=== 关键锚点 ===');
for (const w of [1, 5, 10, 20, 30, 40, 50, 60, 61, 70, 80, 90]) {
  const s = levelAt(w);
  console.log(' W' + String(w).padEnd(3) + ' 累计 ' + String(Math.round(cum(w))).padStart(9) +
    '  等级 ' + String(s.lv).padStart(2) + '  本级进度 ' + String(r(100 * s.exp / s.next, 1)).padStart(5) + '%');
}

console.log('\n=== 升级需求表（每 3 级；L48 为硬上限，本级需求不适用）===');
for (let L = 0; L <= 48; L += 3) {
  const n = L >= 48 ? '      —' : String(Math.round(need(L))).padStart(7);
  console.log(' L' + String(L).padEnd(2) + ' 本级需求 ' + n + '   累计 E(L) ' + String(Math.round(E(L))).padStart(9));
}

console.log('\n=== 达成波次（普通 W≤60 / 深渊 W61–90）===');
for (const target of [5, 10, 20, 30, 35, 40, 45, 48]) {
  let hit = null;
  for (let w = 1; w <= MAXW; w++) { if (levelAt(w).lv >= target) { hit = w; break; } }
  console.log(' L' + String(target).padEnd(2) + ' -> ' + (hit ? 'W' + hit + (hit > 60 ? '（深渊）' : '（普通）') : 'W>90'));
}

// ---------- 5. 经验圣遗物敏感性 ----------
// 等效口径：击杀经验 +n%（s_sr_cm_exp）、需求 −n%（cm_tome）、经验珠补差，统一折算为总经验倍率
console.log('\n=== 经验圣遗物敏感性（总经验等效加成）===');
console.log(' bonus   W60等级   W90等级   是否仍能守住「48级只在深渊」');
for (const b of [0, 0.20, 0.30, 0.50, 1.00, 1.80]) {
  function levelWith(W) {
    let exp = 0, lv = 0;
    for (let w = 1; w <= W; w++) {
      exp += supply[w] * (1 + b);
      while (lv < 48 && exp + EPS >= need(lv)) { exp -= need(lv); lv++; }
    }
    return lv;
  }
  const l60 = levelWith(60), l90 = levelWith(90);
  console.log('  +' + String(Math.round(b * 100)).padStart(3) + '%   L' + String(l60).padEnd(2) +
    '      L' + String(l90).padEnd(2) + '     ' + (l60 < 48 ? '是' : '否（普通战场已满级）'));
}

// ---------- 6. 升级节奏（每 5 级需几波）----------
console.log('\n=== 升级节奏（每级平均耗时）===');
const marks = [5, 10, 20, 30, 35, 40, 45, 48];
const waveOf = {};
for (const t of marks) {
  waveOf[t] = null;
  for (let w = 1; w <= MAXW; w++) if (!waveOf[t] && levelAt(w).lv >= t) { waveOf[t] = w; break; }
}
for (let i = 1; i < marks.length; i++) {
  const a = marks[i - 1], b = marks[i];
  if (waveOf[a] && waveOf[b]) {
    console.log(' L' + String(a).padEnd(2) + '→L' + String(b).padEnd(2) +
      ' : W' + String(waveOf[a]).padEnd(2) + '→W' + String(waveOf[b]).padEnd(2) +
      '  ' + String(waveOf[b] - waveOf[a]).padStart(2) + ' 波  平均 ' +
      r((waveOf[b] - waveOf[a]) / (b - a), 1) + ' 波/级');
  }
}
