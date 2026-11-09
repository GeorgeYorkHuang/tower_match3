'use strict';
/**
 * 改版前圣遗物获取节奏分析（历史模型，不代表已接入的方案B）
 * 口径：局内构筑件数 = 战场宝箱 -> 三选一 -> 1 件；卡池耗尽推断仅为原分析假设。
 * 当前普通三地图规则见docs/battle-relic-schedule.md及config/battle-relic-drops.js。
 * 运行：node tools/relic_pace_curve.js
 */
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');

const WAVE_SEC = C.WAVE.seconds;                 // 40s / 波
// 历史掉率快照，防止再次运行时把方案B配置混入旧模型。
const ELITE_P = 0.15;
const MINI_P = 0.55;
const MAJOR_P = 1;
const TOWERS = 4;                                // 4 塔槽
const POOL = TOWERS * 10 + C.RELIC_RUN.common.length; // 本局可用候选池 45
const MAXW = 90;

/** 建议节奏：间隔 2→7 递增，末 5 波收束，总量 11 件 */
const IDEAL = [2, 4, 7, 11, 16, 22, 28, 35, 42, 49, 55];
const idealSet = new Set(IDEAL);

/** 最小改动方案：Boss 波必掉 + 开局保底 + 尾段停发 */
const MINCHANGE = [2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const minSet = new Set(MINCHANGE);

function bossKind(w) {
  if (w < 5 || w % C.ENEMY.bossEvery !== 0) return '';
  return w % 20 === 0 ? 'major' : 'mini';
}

function waveStat(w) {
  const count = C.ENEMY.countForWave(w);
  const elite = Math.floor(count / 20);       // wave.js:53
  const bk = bossKind(w);
  const pBoss = bk === 'major' ? MAJOR_P : bk === 'mini' ? MINI_P : 0;
  // 期望宝箱数：每只精英独立 15%，Boss 一次判定
  const expect = elite * ELITE_P + pBoss;
  const pNone = Math.pow(1 - ELITE_P, elite) * (1 - pBoss);
  return { wave: w, count, elite, bossKind: bk, expect, pNone, pAtLeastOne: 1 - pNone };
}

const S = [];
for (let w = 1; w <= MAXW; w++) S.push(waveStat(w));

let cum = 0, idealCum = 0, minCum = 0;
let lastActual = 0, lastIdeal = 0; // 用期望密度折算的「等效间隔」
const rows = [];
for (const s of S) {
  cum += s.expect;
  if (idealSet.has(s.wave)) idealCum++;
  if (minSet.has(s.wave)) minCum++;
  rows.push({
    wave: s.wave, count: s.count, elite: s.elite, boss: s.bossKind,
    chestExpect: +s.expect.toFixed(4), pNoChest: +s.pNone.toFixed(4),
    cumActual: +cum.toFixed(2),
    idealGet: idealSet.has(s.wave) ? 1 : 0, cumIdeal: idealCum,
    minGet: minSet.has(s.wave) ? 1 : 0, cumMin: minCum,
    actualGapWaves: s.expect > 0 ? +(1 / s.expect).toFixed(2) : '',
  });
}

/** 分段统计 */
function seg(a, b, key) {
  return rows.slice(a - 1, b).reduce((s, r) => s + r[key], 0);
}
const bands = [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50], [51, 60], [61, 90]];

/** 前 10 波一件都拿不到的概率（不含天赋中心赠送件） */
let pFirst10Zero = 1;
for (let w = 1; w <= 10; w++) pFirst10Zero *= S[w - 1].pNone;
/** 首个宝箱期望波次 */
let firstExpectWave = null;
for (let w = 1; w <= MAXW; w++) if (S[w - 1].pAtLeastOne > 0) { firstExpectWave = w; break; }

/** 设计约定符合度：只用客观可测指标，不做「兴趣分数」这类可任意调参的伪精确模型 */
function pulse(waves) { const a = {}; waves.forEach(w => { a[w] = 1; }); return a; }
function expectWaves(maxWave) { const a = {}; S.slice(0, maxWave).forEach(s => { a[s.wave] = s.expect; }); return a; }
function metrics(perWave, total, firstOverride) {
  const sum = (a, b) => { let s = 0; for (let w = a; w <= b; w++) s += perWave[w] || 0; return s; };
  const seq = [];
  let c = 0, next = 1;
  for (let w = 1; w <= total; w++) {
    c += perWave[w] || 0;
    while (c >= next) { seq.push(w); next++; }
  }
  const first = firstOverride || (seq.length ? seq[0] : total + 1);
  let maxGap = first - 1;
  for (let i = 1; i < seq.length; i++) maxGap = Math.max(maxGap, seq[i] - seq[i - 1]);
  maxGap = Math.max(maxGap, total - (seq.length ? seq[seq.length - 1] : 0));
  const n = sum(1, total);
  return { total: +n.toFixed(2), first, first10: +sum(1, 10).toFixed(2),
           last10: +sum(total - 9, total).toFixed(2), maxGap,
           waste: +Math.max(0, n - 12).toFixed(2) };
}
const RULES = [
  ['首件≤W4', m => m.first <= 4],
  ['前10波≥3件', m => m.first10 >= 3],
  ['总量≤12件', m => m.total <= 12],
  ['后10波≤1件', m => m.last10 <= 1],
  ['最大空窗≤8波', m => m.maxGap <= 8],
];

const header = Object.keys(rows[0]).join(',');
const csv = [header].concat(rows.map(r => Object.values(r).join(','))).join('\n');
const outCsv = path.join(__dirname, '..', 'docs', 'relic-pace-data.csv');
fs.writeFileSync(outCsv, '\ufeff' + csv, 'utf8');

console.log('=== 改版前历史模型；当前普通三地图已使用固定12节点 ===');
console.log('每波时长', WAVE_SEC, 's | 普通 60 波 =', (60 * WAVE_SEC / 60).toFixed(0), '分钟纯战斗 | 深渊 90 波 =', (90 * WAVE_SEC / 60).toFixed(0), '分钟');
console.log('精英掉率', ELITE_P, '| 小Boss', MINI_P, '| 大Boss', MAJOR_P, '| 本局候选池', POOL, '张（4塔×10 + 通用5）');
console.log('状态栏只展示前 10 个圣遗物图标（render.js:396 / main.js:157）');
console.log('\n=== 现状逐段（期望件数）===');
console.log('波段      件数   平均间隔(波/件)  至少1件的波数');
for (const [a, b] of bands) {
  const n = seg(a, b, 'chestExpect');
  const activeWaves = S.slice(a - 1, b).filter(x => x.pAtLeastOne > 0).length;
  console.log(`W${String(a).padStart(2)}-${String(b).padEnd(2)}  ${n.toFixed(2).padStart(6)}   ${(n > 0 ? (b - a + 1) / n : Infinity).toFixed(2).padStart(8)}        ${activeWaves}/${b - a + 1}`);
}
const c60 = rows[59].cumActual, c90 = rows[89].cumActual;
console.log('\nW1-60 累计期望件数:', c60.toFixed(2), '| 深渊 W1-90 累计:', c90.toFixed(2));
console.log('首个可能掉宝箱的波次: W' + firstExpectWave, '| 前 10 波 0 件概率:', (pFirst10Zero * 100).toFixed(2) + '%');
const zeroList = S.slice(0, 20).filter(x => x.expect === 0).map(x => 'W' + x.wave);
console.log('前 20 波完全零获取机会:', zeroList.length, '波 →', zeroList.join(', '));
console.log('W60 单波期望宝箱:', S[59].expect.toFixed(2), '| W90 单波:', S[89].expect.toFixed(2));
console.log('\n=== 卡池耗尽风险（候选池 45 张）===');
console.log('普通 W60 累计', c60.toFixed(1), '→', c60 >= POOL ? '会耗尽' : '余量 ' + (POOL - c60).toFixed(1) + ' 张');
console.log('深渊 W90 累计', c90.toFixed(1), '→', c90 >= POOL ? '会耗尽（宝箱开不出卡）' : '余量 ' + (POOL - c90).toFixed(1) + ' 张');

console.log('\n=== 方案对比（硬指标；「符合」= 通过 5 条设计约定的条数）===');
console.log('方案                    件数  首件  前10波  后10波  最大空窗  边际浪费  符合');
function fmt(name, perWave, total, firstOverride) {
  const m = metrics(perWave, total, firstOverride);
  const pass = RULES.filter(([, t]) => t(m)).length;
  console.log(name.padEnd(22), String(m.total).padStart(6), ('W' + m.first).padStart(5),
    String(m.first10).padStart(7), String(m.last10).padStart(8),
    (m.maxGap + '波').padStart(9), String(m.waste).padStart(9), (pass + '/5').padStart(6));
}
fmt('现状·普通60波', expectWaves(60), 60, 5);   // 首件取「首个可能掉宝箱波次」
fmt('建议·递增11件', pulse(IDEAL), 60);
fmt('方案B·Boss对齐12件', pulse(MINCHANGE), 60);
console.log('\n建议获取波次:', IDEAL.join(', '));
console.log('建议间隔    :', IDEAL.slice(1).map((w, i) => w - IDEAL[i]).join(', '));
console.log('方案B波次   :', MINCHANGE.join(', '));
console.log('\n=== 建议曲线逐段 ===');
for (const [a, b] of [[1, 10], [11, 30], [31, 50], [51, 60]]) {
  const hit = IDEAL.filter(w => w >= a && w <= b);
  console.log(`W${a}-${b}: ${hit.length} 件 → ${hit.join(', ') || '无'}`);
}
console.log('\nCSV ->', outCsv, '| 行数', rows.length);
