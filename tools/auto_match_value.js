'use strict';
/**
 * 自动三消药剂（30s）价值量化 · 只读脚本
 * 口径全部取自项目当前代码配置，不修改任何游戏逻辑。
 *   node tools/auto_match_value.js
 * 输出：docs/auto-match-value.csv（逐波） + 控制台摘要
 */
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');

const AUTO = C.STORE.items.find(it => it.id === 'auto');
const WAVE_SEC = C.WAVE.seconds;                 // 40 逻辑秒/波
const PER_CELL = C.EXP.perCell;                  // 2
const ENE_PER_BLOCK = C.GLOBAL_SKILL.energyPerBlock; // 2
const PENALTY = C.PENALTY_RATIO;                 // 0.5
const TOWER_SLOTS = C.TOWER_SLOTS;               // 4
const COLORS = C.DIFFICULTY.activeColors[String(C.DIFFICULTY.default)].length; // 6
const BAD_COLORS = COLORS - TOWER_SLOTS;         // 塔位满后 2 个惩罚色

const shapeMult = (shape, size) =>
  (size >= 5 || ['5', 'L5', '6+'].includes(shape)) ? 1.5
    : (size === 4 || shape === '4') ? 1.2 : 1;
const expOf = (shape, size) => PER_CELL * size * shapeMult(shape, size);
const energyOf = (shape, size) => size * ENE_PER_BLOCK * shapeMult(shape, size);

/* ---------- 1. 单次交换收益：自动 vs 手动 ---------- */
// 自动：_findAutoTripleMove 只接受 shape='3' && size=3 && !rainbow
const AUTO_EXP = expOf('3', 3), AUTO_ENE = energyOf('3', 3);
// 颜色随机：塔色全额经验，惩罚色半量经验（能量转为全局技能充能，不算损失）
const pGood = TOWER_SLOTS / COLORS;
const AUTO_EXP_EFF = AUTO_EXP * (pGood + BAD_COLORS / COLORS * PENALTY);
// 手动：按 WAVE.matchDist 形状分布，且玩家会主动挑塔色
const dist = C.WAVE.matchDist;
const MANUAL_SHAPES = [['3', 3, dist['3']], ['4', 4, dist['4']], ['L5', 5, dist.L5], ['5', 5, dist['5']]];
const MANUAL_EXP = MANUAL_SHAPES.reduce((s, [sh, sz, p]) => s + expOf(sh, sz) * p, 0);
const MANUAL_ENE = MANUAL_SHAPES.reduce((s, [sh, sz, p]) => s + energyOf(sh, sz) * p, 0);
// 手动贪心：优先选塔色（全额），保守不计连锁与特殊块收益 → 手动收益是下界
const N = AUTO.duration / AUTO.autoMatchInterval;   // 30 次
const autoTotal = { exp: AUTO_EXP_EFF * N, energy: AUTO_ENE * N };
const manualTotal = { exp: MANUAL_EXP * N, energy: MANUAL_ENE * N };

/* ---------- 2. 倍速口径：30 真实秒覆盖多少战斗 ---------- */
// match3.update(dt) 用真实 dt；战斗 waveTime += dt * runSpeed
const speedRows = [1, 2, 3, 4].map(s => ({
  speed: s,
  logicSeconds: AUTO.duration * s,
  waves: AUTO.duration * s / WAVE_SEC,
  swaps: N,                                   // 真实秒 1 次/秒，与倍速无关
  swapsPerWave: N / (AUTO.duration * s / WAVE_SEC),
  attentionSavedSec: AUTO.duration,
}));

/* ---------- 3. 银币可负担波次 ---------- */
// 波末银币（ECONOMY.waveSilver）+ 击杀银币估算（killGold 均值 × 怪物数 × 代际系数）
const KD = C.KILL_DROP;
const BAL = (() => { try { return require('../js/config/enemy-balance.js'); } catch (e) { return {}; } })();
const goldMult = (w) => {
  const lv = C.ENEMY.mainLevel(w);
  if (BAL.goldLevelMult) { try { return BAL.goldLevelMult(lv); } catch (e) { /* fallthrough */ } }
  return 1 + Math.min(1.5, (lv - 1) * 0.12);   // 保守线性近似，标注为估算
};
const killGoldAvg = (KD.killGold[0] + KD.killGold[1]) / 2;
let cumWave = 0, cumKill = 0;
const affordWave = { waveOnly: null, withKills: null };
const goldRows = [];
for (let w = 1; w <= 60; w++) {
  const waveGold = C.ECONOMY.waveSilver(w);
  const cnt = C.ENEMY.countForWave(w);
  const kill = Math.round(killGoldAvg * cnt * goldMult(w));
  cumWave += waveGold; cumKill += kill;
  if (!affordWave.waveOnly && cumWave >= AUTO.cost[0]) affordWave.waveOnly = w;
  if (!affordWave.withKills && cumWave + cumKill >= AUTO.cost[0]) affordWave.withKills = w;
  goldRows.push({ wave: w, waveGold, killGoldEst: kill, cumWave, cumTotal: cumWave + cumKill });
}

/* ---------- 4. 30 秒窗口内塔防侧决策密度（用已产出的曲线数据） ---------- */
// 逐波三选一次数近似：升级次数（经验等级差）+ 圣遗物期望件数
const csvPath = path.join(__dirname, '..', 'docs', 'exp-curve-current-data.csv');
const relicCsv = path.join(__dirname, '..', 'docs', 'relic-pace-data.csv');
function readCsv(p) {
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])));
}
const expRows = readCsv(csvPath);
const relicRows = readCsv(relicCsv);
const decisions = [];
for (let w = 1; w <= 60; w++) {
  const e = expRows[w - 1] || {};
  const prev = expRows[w - 2] || {};
  const lvNow = +(e.anc_level ?? e.aby_level ?? 0);
  const lvPrev = +(prev.anc_level ?? prev.aby_level ?? 0);
  const picks = Math.max(0, lvNow - lvPrev);                      // 升级三选一
  const relic = +((relicRows[w - 1] || {}).chestExpect ?? 0);      // 圣遗物三选一期望（列名 chestExpect）
  const perWave = picks + relic;
  // 30 真实秒在 ×1 下 = 0.75 波
  decisions.push({ wave: w, upgradePicks: picks, relicPicks: +relic.toFixed(3),
    decisionsPerWave: +perWave.toFixed(3), decisionsIn30s: +(perWave * AUTO.duration / WAVE_SEC).toFixed(3) });
}
const band = (a, b) => decisions.slice(a - 1, b).reduce((s, r) => s + r.decisionsIn30s, 0) / (b - a + 1);

/* ---------- 输出 ---------- */
console.log('=== 1. 单次交换收益（自动 = 只普通三连，手动 = 按 matchDist 分布）===');
console.log('自动单次 : 经验 %s  能量 %s  | 计惩罚色后有效经验 %s (塔色 %s%%)',
  AUTO_EXP, AUTO_ENE, AUTO_EXP_EFF.toFixed(2), (pGood * 100).toFixed(1));
console.log('手动单次 : 经验 %s  能量 %s  （保守下界，未计连锁/特殊块）', MANUAL_EXP.toFixed(2), MANUAL_ENE.toFixed(2));
console.log('30 次合计: 自动 经验 %s / 能量 %s  |  手动 经验 %s / 能量 %s',
  autoTotal.exp.toFixed(0), autoTotal.energy.toFixed(0),
  manualTotal.exp.toFixed(0), manualTotal.energy.toFixed(0));
console.log('自动/手动效率比: 经验 %s%%  能量 %s%%  （不含连锁，实际更低）',
  (autoTotal.exp / manualTotal.exp * 100).toFixed(1), (autoTotal.energy / manualTotal.energy * 100).toFixed(1));

const pad = (v, n) => String(v).padStart(n);
console.log('\n=== 2. 30 真实秒在不同倍速下覆盖的战斗 ===');
console.log('倍速  逻辑秒  覆盖波数  自动消除次数  每波消除次数');
speedRows.forEach(r => console.log(' x' + r.speed + '   ' + pad(r.logicSeconds, 5) + '   '
  + pad(r.waves.toFixed(2), 7) + '   ' + pad(r.swaps, 10) + '   ' + pad(r.swapsPerWave.toFixed(1), 12)));

console.log('\n=== 3. 银币可负担波次（售价 ' + AUTO.cost[0] + '）===');
console.log('仅波末银币累计达标 : W' + affordWave.waveOnly);
console.log('波末+击杀银币估算  : W' + affordWave.withKills + '  （击杀银币为估算，见 goldMult）');
[5, 10, 15, 20, 40, 60].forEach(w => {
  const r = goldRows[w - 1];
  console.log('  W' + pad(w, 2) + ' 波末 ' + pad(r.waveGold, 4) + ' 击杀估算 ' + pad(r.killGoldEst, 5)
    + ' 累计 ' + pad(r.cumTotal, 7) + ' 折合药剂 ' + (r.cumTotal / AUTO.cost[0]).toFixed(2) + ' 瓶');
});

console.log('\n=== 4. 30 秒窗口内塔防侧决策点（×1 下 = 0.75 波）===');
if (decisions.some(d => d.decisionsPerWave > 0)) {
  [[1, 10], [11, 20], [21, 40], [41, 60]].forEach(([a, b]) =>
    console.log('  W' + pad(a, 2) + '–W' + pad(b, 2) + ' 平均 ' + band(a, b).toFixed(2) + ' 次决策 / 30 秒'));
} else console.log('  （缺少 docs 曲线数据，跳过；文档改用解析口径）');

console.log('\n=== 5. 三消经验在总经验中占比（药剂数值天花板）===');
const perWaveManualExp = C.WAVE.matchesPerWave * MANUAL_EXP;
console.log('手动每波三消经验(模型) ' + perWaveManualExp.toFixed(1) + '  | 自动 30 秒经验 '
  + autoTotal.exp.toFixed(0) + ' ≈ ' + (autoTotal.exp / perWaveManualExp).toFixed(2) + ' 波三消');
console.log('W60 单波总经验 ~3595 → 自动药剂经验占比 ' + (autoTotal.exp / 3595 * 100).toFixed(2) + '%');

// CSV
const out = path.join(__dirname, '..', 'docs', 'auto-match-value.csv');
const lines = ['wave,waveGold,killGoldEst,cumTotal,decisionsPerWave,decisionsIn30s,autoExpPer30s,manualExpPer30s'];
goldRows.forEach(r => {
  const d = decisions[r.wave - 1] || {};
  lines.push([r.wave, r.waveGold, r.killGoldEst, r.cumTotal,
    d.decisionsPerWave ?? '', d.decisionsIn30s ?? '',
    autoTotal.exp.toFixed(1), manualTotal.exp.toFixed(1)].join(','));
});
fs.writeFileSync(out, '\uFEFF' + lines.join('\n') + '\n', 'utf8');
console.log('\nCSV ->', out, '|', goldRows.length, '行');
