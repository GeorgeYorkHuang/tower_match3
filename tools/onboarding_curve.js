/**
 * onboarding_curve.js —— 入门关卡「塔位分段解锁」难度预算模拟（只读）
 *
 * 口径来源（与 tools/balance_curve.js 完全一致）：
 *   - 怪物构成：js/config/monsters.js levelOf / levelMix / countForWave / bossEvery
 *   - 脚本 Boss：js/config/bosses.js + js/bosses/{rosea,galvin,vera}.js 的整波投放
 *   - 成长与供给：js/run.js gainExp / endWave、js/effects.js totalDps、js/config/towers.js
 *   - 抽象结算：supply = totalDps × WAVE.seconds(40)，pressure = effHp / supply
 *
 * 本脚本不修改任何 js/ 文件。场景差异全部通过「进程内覆盖 config 可写字段」注入：
 *   TOWER_SLOTS  → 按波次动态塔位上限（对应设计稿 capOf）
 *   PENALTY_RATIO→ 锁色全额经验（对应「被锁颜色不打折」建议）
 *   DIRECT_FIRST → 首消定向次数（对应「第 1 章只定向 1 次」建议）
 *   波末经验     → 固定 20（对应「不随已获得塔数衰减」建议）
 *   怪物血量     → scale(w)（对应入门期难度预算建议）
 *
 * 用法：node tools/onboarding_curve.js [seeds=20] [maxWave=60]
 * 输出：docs/onboarding-curve.csv
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');
const { Run, mulberry32 } = require('../js/run.js');
const BOSSES = require('../js/config/bosses.js');
const ROOT = path.resolve(__dirname, '..');

const SEEDS = Number(process.argv[2] || 20);
const MAX_WAVE = Number(process.argv[3] || 60);
const SHAPE_SIZE = { '3': 3, '4': 4, L5: 5, '5': 5 };

/* ---------- 怪物构成（逐项精算，与 balance_curve.js composition 同口径） ---------- */
function scriptBossWave(w) {
  const B = BOSSES;
  const b = w === 20 ? B.altar_rosea : w === 40 ? B.altar_galvin : w === 60 ? B.altar_vera : null;
  if (!b) return null;
  const acc = { name: b.name, rawHp: 0, effHp: 0, killExp: 0 };
  const add = (hp, armor, type) => {
    acc.rawHp += hp;
    acc.effHp += hp / (1 - Math.min(0.85, armor));
    acc.killExp += (C.EXP.kill[type] || C.EXP.kill.normal);
  };
  const addLevels = (levels) => levels.forEach((lv) => {
    const c = C.ENEMY.levelOf(lv);
    add(c.hp, c.armor, c.type);
  });
  if (w === 20) {
    add(b.hp, b.armor, 'boss');
    addLevels(b.adds.flat());
    for (let i = 0; i < b.summonCount; i++) add(b.summonHp, 0, 'normal');
  } else if (w === 40) {
    add(b.hp * (1 - b.threshold), b.armor, 'boss');
    for (let i = 0; i < 2; i++) add(b.hp * b.twinHpRatio, b.twinArmor, 'boss');
    addLevels(b.adds.flat());
  } else {
    add(b.hp, b.armor, 'boss');
    addLevels(b.adds.flat());
  }
  return acc;
}

function composition(w) {
  const E = C.ENEMY;
  const count = E.countForWave(w);
  const hasBoss = w >= 5 && w % E.bossEvery === 0;
  const eliteCount = Math.floor(count / 20);
  const normalCount = count - (hasBoss ? 1 : 0) - eliteCount;
  const mix = E.levelMix(w);
  const main = E.mainLevel(w);
  let rawHp = 0, effHp = 0, killExp = 0;
  const add = (hp, armor, type) => {
    rawHp += hp;
    effHp += hp / (1 - Math.min(0.85, armor));
    killExp += (C.EXP.kill[type] || C.EXP.kill.normal);
  };
  for (let i = 0; i < normalCount; i++) {
    const c = E.levelOf(mix[i % mix.length]);
    add(c.hp, c.armor, c.type);
  }
  for (let i = 0; i < eliteCount; i++) {
    const c = E.levelOf(main);
    add(c.hp * E.eliteHpMult, c.armor + E.eliteArmor, 'elite');
  }
  if (hasBoss) {
    const c = E.levelOf(main);
    add(c.hp * E.bossHpMult, c.armor + E.bossArmor, 'boss');
  }
  return { rawHp, effHp, killExp, count, eliteCount, hasBoss, main };
}

/* ---------- 设计口径 ---------- */
// 主口径 A：按现有 EVAC.interval=10 / MILESTONES=[10,20,30,40,50] 分章
function capOf(w) { return w <= 10 ? 1 : w <= 20 ? 2 : w <= 30 ? 3 : 4; }
// 目标压力（设计意图，不是实机预测）
// 第 1–3 章：普通教学波 0.60 / 小 Boss 0.75 / 章末 0.80 / W20 脚本 Boss 0.85
// 第 4 章 W31–40：坡度段，目标从 0.60 线性抬到 0.85，W40 毕业 Boss 单独设 0.85
// W41+ 回到现有曲线（ancient.lateEnemyHp 也从 W41 起生效），不在本方案范围内
function targetPressure(w) {
  if (w === 20 || w === 40) return 0.85;
  if (w === 60) return null; // W60 不缩放
  if (w >= 31 && w <= 39) return Math.min(0.85, +(0.60 + (w - 30) * 0.025).toFixed(3));
  if (w % 10 === 0) return 0.80;
  if (w % 5 === 0) return 0.75;
  return 0.60;
}

const ORIG = {
  slots: C.TOWER_SLOTS,
  penalty: C.PENALTY_RATIO,
  direct: C.DIRECT_FIRST,
};

/** 场景配置：design=true 启用三条经验保护；scaleFn 为血量缩放函数 */
function restoreConfig() {
  C.TOWER_SLOTS = ORIG.slots;
  C.PENALTY_RATIO = ORIG.penalty;
  C.DIRECT_FIRST = ORIG.direct;
}

function runOne(seed, mode, scaleFn) {
  const r = new Run({ rng: mulberry32(seed), difficulty: C.DIFFICULTY.default });
  // 项目自带 simulateRun 在中后期会崩：TowerBuild.pickChoices() 直接调 this.rng()。
  // 分析脚本只读补注入，不修改任何游戏代码。
  Object.keys(r.effects.towers).forEach((k) => { r.effects.towers[k].rng = r.rng; });
  // 统计每波实际发放的升级选择次数（量化「解锁波补发轰炸」）
  const origGain = r.gainExp.bind(r);
  let ups = 0;
  r.gainExp = (v) => { const n = origGain(v); ups += n; return n; };

  const rows = [];
  for (let w = 1; w <= MAX_WAVE; w++) {
    // 每波开始按设计口径注入塔位上限（run.js applyMatch 实时读取 CONFIG.TOWER_SLOTS）
    C.TOWER_SLOTS = mode === 'baseline' ? ORIG.slots : capOf(w);
    ups = 0;
    r.startWave();
    r.effects.settleAuto(); // real 口径：上一波补发经验在波末结算（一阶滞后）

    const comp = composition(w);
    const boss = scriptBossWave(w);
    const scale = scaleFn ? scaleFn(w) : 1;
    const rawHp = (boss ? boss.rawHp : comp.rawHp) * scale;
    const effHp = (boss ? boss.effHp : comp.effHp) * scale;
    const killExpPool = boss ? boss.killExp : comp.killExp;

    for (let i = 0; i < C.WAVE.matchesPerWave; i++) {
      const x = r.rng();
      let shape = '3';
      if (x < C.WAVE.matchDist['3'] + C.WAVE.matchDist['4']) {
        shape = x < C.WAVE.matchDist['3'] ? '3' : '4';
      } else {
        shape = x < C.WAVE.matchDist['3'] + C.WAVE.matchDist['4'] + C.WAVE.matchDist.L5 ? 'L5' : '5';
      }
      let color;
      if (r._directDone < C.DIRECT_FIRST && r._directDone < r._directSeq.length) {
        color = r._directSeq[r._directDone++];
      } else color = r._pickColor();
      r.applyMatch(color, shape, SHAPE_SIZE[shape]);
    }

    const totalDps = r.effects.totalDps();
    const supply = totalDps * C.WAVE.seconds;
    const res = r.endWave(true); // skipLeak：诊断模式，保证能观察到 60 波
    const owned = Object.keys(r.effects.towers).filter((k) => r.effects.tower(k).level > 0);

    rows.push({
      wave: w, mode, seed, cap: C.TOWER_SLOTS, owned: owned.length, scale: +scale.toFixed(3),
      effHp: Math.round(effHp), supply: Math.round(supply),
      pressure: +(effHp / Math.max(1, supply)).toFixed(3),
      totalDps: +totalDps.toFixed(1), expLevel: r.expLevel,
      expPool: Math.round(r.exp), upgrades: ups,
      pending: r.effects.pendingTotal(),
      leak: Math.round(Math.max(0, effHp - supply)),
      abstractLeak: Math.round(res.leak),
    });

    // real 口径：击杀经验按输出完成度折算 + 波末经验
    const ratio = Math.min(1, supply / Math.max(1, effHp));
    r.gainExp(Math.round(ratio * killExpPool));
    // design 场景：波末经验固定 20（不随已获得塔数衰减）；baseline/cap-only 保持原样
    const waveBonusExp = mode === 'design' || mode === 'budget'
      ? C.EXP.waveBonus * ORIG.slots
      : C.EXP.waveBonus * owned.length;
    r.gainExp(waveBonusExp);
  }
  return rows;
}

function meanRows(rows) {
  const numeric = ['cap', 'owned', 'scale', 'effHp', 'supply', 'pressure', 'totalDps',
                   'expLevel', 'expPool', 'upgrades', 'pending', 'leak'];
  const out = [];
  for (let w = 1; w <= MAX_WAVE; w++) {
    const rs = rows.filter((x) => x.wave === w);
    const row = { wave: w };
    numeric.forEach((k) => {
      const v = rs.reduce((s, x) => s + x[k], 0) / rs.length;
      row[k] = +v.toFixed(3);
    });
    out.push(row);
  }
  return out;
}

function runScenario(name, scaleFn) {
  restoreConfig();
  if (name === 'design' || name === 'budget') {
    C.PENALTY_RATIO = 1.0;   // 锁色全额经验
    C.DIRECT_FIRST = 1;      // 第 1 章只定向 1 次红
  }
  const all = [];
  for (let s = 1; s <= SEEDS; s++) all.push(...runOne(20261109 + s * 7919, name, scaleFn));
  restoreConfig();
  return { name, rows: all, mean: meanRows(all) };
}

/* ---------- 三阶段执行 ---------- */
// S0 现状基线
const s0 = runScenario('baseline', null);
// S1 只加塔位限制、其余全不动（展示「不配套改会崩」）
const s1 = runScenario('cap-only', null);
// S2 设计建议生效、但血量未缩放 → 作为 scale 反推基准
const s2 = runScenario('design', null);

// 由 S2 逐波压力反推血量缩放系数（只降不升）
// W1–40 按目标压力反推；W41–43 线性回到 1.0；W44+ 完全回到现有曲线
const scaleAt = {};
for (const row of s2.mean) {
  const w = row.wave;
  const tp = targetPressure(w);
  if (w <= 40 && tp !== null) {
    scaleAt[w] = Math.max(0.05, Math.min(1, tp / Math.max(0.01, row.pressure)));
  } else if (w <= 43 && w > 40) {
    const t = (w - 40) / 3;
    scaleAt[w] = scaleAt[40] + (1 - scaleAt[40]) * t;
  } else scaleAt[w] = 1;
}
const scaleFn = (w) => scaleAt[w];

// S3 设计建议 + 入门期血量缩放（最终建议方案）
const s3 = runScenario('budget', scaleFn);

/* ---------- 输出 ---------- */
const scenes = [s0, s1, s2, s3];
const header = ['scenario', 'wave', 'cap', 'owned', 'scale', 'effHp', 'supply', 'pressure',
                'totalDps', 'expLevel', 'expPool', 'upgrades', 'pending', 'leak'];
const lines = [header.join(',')];
scenes.forEach((s) => s.mean.forEach((r) => {
  lines.push([s.name, ...header.slice(1).map((k) => r[k])].join(','));
}));
fs.writeFileSync(path.join(ROOT, 'docs', 'onboarding-curve.csv'), lines.join('\n') + '\n');

function brief(s, w) { const r = s.mean[w - 1]; return r; }
console.log('=== 关键波对比（' + SEEDS + ' 局均值，real 口径）===');
console.log('波  场景       塔位 缩放  有效HP   供给    压力    DPS  经验级 补发次数');
for (const w of [1, 5, 10, 11, 15, 20, 21, 25, 30, 31, 35, 40, 41, 43, 60]) {
  scenes.forEach((s) => {
    const r = brief(s, w);
    console.log(
      String(w).padStart(2),
      s.name.padEnd(10),
      String(r.cap).padStart(2),
      String(r.scale).padStart(5),
      String(r.effHp).padStart(8),
      String(r.supply).padStart(7),
      String(r.pressure).padStart(7),
      String(r.totalDps).padStart(6),
      String(r.expLevel).padStart(6),
      String(r.upgrades).padStart(6));
  });
  console.log('---');
}
console.log('\n=== 入门期血量缩放系数（W1–43）===');
for (const w of [1, 2, 3, 5, 8, 10, 11, 15, 20, 21, 25, 30, 31, 35, 40, 41, 42, 43]) {
  const tp = targetPressure(w);
  console.log('W' + String(w).padStart(2) + '  scale=' + scaleAt[w].toFixed(3) +
              '  targetP=' + (w <= 40 && tp !== null ? tp : '回原曲线'));
}
console.log('\n=== W60 全局等级（real 口径：漏怪会削减击杀经验）===');
console.log('注：全歼口径的 L35 校验见 docs/exp-curve-current.md，两者不可直接对比');
scenes.forEach((s) => {
  const r = brief(s, 60);
  console.log(s.name.padEnd(10), 'expLevel=' + r.expLevel, '本级存量经验=' + r.expPool);
});
console.log('\nCSV: docs/onboarding-curve.csv');
