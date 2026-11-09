/**
 * balance_curve.js —— 难度曲线确定性模拟（只读，不修改任何游戏配置）
 *
 * 口径来源：
 *   - 升级速度：js/run.js gainExp / expNeed、js/effects.js TowerBuild.dps、js/config/towers.js EXP
 *   - 技能强度：js/config/skills.js EFFECT（bonusPerLv / synergyBonus / activeSlots）
 *   - 怪物强度：js/config/monsters.js levelOf / levelMix / waveTotalHp、js/config/enemy-balance.js
 *   - Boss 尖峰：js/config/bosses.js + js/bosses/{rosea,galvin,vera}.js 的 enemyTotalHp
 *   - 抽象结算：js/run.js endWave（dealt = totalDps × WAVE.seconds / windMul）
 *
 * 两种经验口径：
 *   sim  —— 项目自带 simulateRun 口径：仅三消经验，无击杀经验、无波末经验（成长下界）
 *   real —— 补全真实游戏链路：按本波击杀完成度补 EXP.kill，并补 waveBonus × 已获得塔数
 *
 * 用法：node tools/balance_curve.js [seeds=20] [maxWave=60]
 * 输出：docs/balance-curve-data.csv、docs/balance-curve-raw.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');
const { Run, mulberry32 } = require('../js/run.js');
const BOSSES = require('../js/config/bosses.js');

const SEEDS = Number(process.argv[2] || 20);
const MAX_WAVE = Number(process.argv[3] || 60);
const SHAPE_SIZE = { '3': 3, '4': 4, L5: 5, '5': 5 };
const ROOT = path.resolve(__dirname, '..');

/**
 * 脚本 Boss 波（20/40/60）的实际投放构成，逐项精算。
 * 原始血量口径与 js/bosses/{rosea,galvin,vera}.js 的 director.enemyTotalHp 一致；
 * 有效血量按各段自身护甲折算。未计入：迦尔文共鸣回血、薇拉 ward 护甲递增与周期召唤
 * （均为动态增益，故本表是 Boss 强度下界）。
 */
function scriptBossWave(w) {
  const B = BOSSES;
  const b = w === 20 ? B.altar_rosea : w === 40 ? B.altar_galvin : w === 60 ? B.altar_vera : null;
  if (!b) return null;
  const acc = { name: b.name, rawHp: 0, effHp: 0, killExp: 0, siegeDps: 0 };
  const add = (hp, armor, type, interval, atk) => {
    const a = Math.min(0.85, armor);
    acc.rawHp += hp;
    acc.effHp += hp / (1 - a);
    acc.killExp += (C.EXP.kill[type] || C.EXP.kill.normal);
    acc.siegeDps += atk / interval;
  };
  const addLevels = (levels) => levels.forEach((lv) => {
    const c = C.ENEMY.levelOf(lv);
    add(c.hp, c.armor, c.type, C.ENEMY.attackInterval[c.type] || 1, c.atk);
  });

  if (w === 20) {
    add(b.hp, b.armor, 'boss', C.ENEMY.attackInterval.boss, b.attack);
    addLevels(b.adds.flat());
    for (let i = 0; i < b.summonCount; i++) add(b.summonHp, 0, 'normal', C.ENEMY.attackInterval.normal, C.ENEMY.levelOf(6).atk);
  } else if (w === 40) {
    add(b.hp * (1 - b.threshold), b.armor, 'boss', C.ENEMY.attackInterval.boss, b.attack);
    for (let i = 0; i < 2; i++) add(b.hp * b.twinHpRatio, b.twinArmor, 'boss', C.ENEMY.attackInterval.boss, b.attack);
    addLevels(b.adds.flat());
  } else {
    add(b.hp, b.armor, 'boss', C.ENEMY.attackInterval.boss, b.attack);
    addLevels(b.adds.flat());
  }
  return acc;
}

/** 本波怪物构成：原始血量 / 护甲折算有效血量 / 击杀经验 / 满编攻城 DPS */
function composition(w, curseMult) {
  const E = C.ENEMY;
  const count = E.countForWave(w);
  const hasBoss = w >= 5 && w % E.bossEvery === 0;
  const eliteCount = Math.floor(count / 20);
  const normalCount = count - (hasBoss ? 1 : 0) - eliteCount;
  const mix = E.levelMix(w);
  const main = E.mainLevel(w);
  let rawHp = 0, effHp = 0, killExp = 0, siegeDps = 0, weightedArmor = 0;

  const add = (hp, armor, type, interval, atk) => {
    const a = Math.min(0.85, armor);
    rawHp += hp;
    effHp += hp / (1 - a);
    weightedArmor += hp * a;
    killExp += (C.EXP.kill[type] || C.EXP.kill.normal);
    siegeDps += atk / interval;
  };

  for (let i = 0; i < normalCount; i++) {
    const cfg = E.levelOf(mix[i % mix.length]);
    add(cfg.hp * curseMult, cfg.armor, cfg.type, E.attackInterval[cfg.type] || 1, cfg.atk);
  }
  for (let i = 0; i < eliteCount; i++) {
    const cfg = E.levelOf(main);
    add(cfg.hp * E.eliteHpMult * curseMult, cfg.armor + E.eliteArmor,
        'elite', E.attackInterval.elite, cfg.atk * E.eliteAtkMult);
  }
  if (hasBoss) {
    const cfg = E.levelOf(main);
    add(cfg.hp * E.bossHpMult * curseMult, cfg.armor + E.bossArmor,
        'boss', E.attackInterval.boss, cfg.atk * E.bossAtkMult);
  }
  return { count, normalCount, eliteCount, hasBoss, main, mix: mix.join('/'),
           rawHp, effHp, killExp, siegeDps, avgArmor: rawHp ? weightedArmor / rawHp : 0 };
}

/** 一局逐波模拟；mode = 'sim' | 'real' */
function runOne(seed, mode) {
  const r = new Run({ rng: mulberry32(seed), difficulty: C.DIFFICULTY.default });
  // 项目自带 simulateRun 在中后期会崩：EffectManager 持有 rng，但 TowerBuild.pickChoices()
  // 直接调用 this.rng()。分析脚本只读补注入，不修改任何游戏代码。
  Object.keys(r.effects.towers).forEach((k) => { r.effects.towers[k].rng = r.rng; });
  const rows = [];
  for (let w = 1; w <= MAX_WAVE; w++) {
    r.startWave();
    // 上一波补发的经验在波末结算（一阶滞后，与真实「击杀→波末三选一」等价）
    if (mode === 'real') r.effects.settleAuto();
    const curseMult = Math.pow(1.15, r.curseStacks || 0);
    const windMul = Math.pow(1.10, r.windStacks || 0);
    const comp = composition(w, curseMult);
    const boss = scriptBossWave(w);
    // 脚本 Boss 波：整波投放被 Boss.setup 重写，逐项精算值替换通用 waveTotalHp
    const rawHp = boss ? boss.rawHp : comp.rawHp;
    const effHp = boss ? boss.effHp : comp.effHp;
    const killExpPool = boss ? boss.killExp : comp.killExp;

    // 波内 5 次消除（与 Run.simulateRun 完全相同的形状/颜色抽样）
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
    if (mode === 'sim') r.effects.settleAuto();

    const totalDps = r.effects.totalDps();
    const supply = totalDps * C.WAVE.seconds / windMul;
    const res = r.endWave(true);     // skipLeak：诊断模式，不扣城墙血，保证能观察到 60 波
    const towers = Object.keys(r.effects.towers);
    const owned = towers.filter((k) => r.effects.tower(k).level > 0);
    const levels = owned.map((k) => r.effects.tower(k).level);
    let activeSkills = 0, branchLvSum = 0, baseLinear = 0;
    owned.forEach((k) => {
      const t = r.effects.tower(k);
      baseLinear += t.baseDps + t.perLv * (t.level - 1);
      t.pool.forEach((ef) => { if (ef.level > 0) { activeSkills++; branchLvSum += ef.level; } });
    });

    rows.push({
      wave: w, mode, seed,
      count: comp.count, mainLv: comp.main, mix: comp.mix,
      elite: comp.eliteCount, miniBoss: comp.hasBoss ? 1 : 0,
      scriptBoss: boss ? boss.name : '',
      rawHp: Math.round(rawHp), effHp: Math.round(effHp),
      effArmor: +(1 - rawHp / Math.max(1, effHp)).toFixed(3),
      siegeDps: +((boss ? boss.siegeDps : comp.siegeDps)).toFixed(1),
      expLevel: r.expLevel, expPool: +r.exp.toFixed(1),
      expNeedNext: Math.round(C.EXP.base * Math.pow(C.EXP.growth, r.expLevel)),
      owned: owned.length, towerLvSum: levels.reduce((a, b) => a + b, 0),
      activeSkills, branchLvSum,
      skillMult: baseLinear ? +(totalDps / baseLinear).toFixed(3) : 0,
      synergy: r.effects.synergyDone[0] ? 1 : 0,
      totalDps: +totalDps.toFixed(1),
      supply: Math.round(supply),
      demand: Math.round(effHp),
      pressure: +(effHp / Math.max(1, supply)).toFixed(3),
      leak: Math.round(Math.max(0, effHp - supply)),
      abstractLeak: Math.round(res.leak),
      killExpPool: Math.round(killExpPool),
    });

    if (mode === 'real') {
      // 真实链路：击杀经验按本波输出完成度折算 + 波末经验（main.js:607）
      const ratio = Math.min(1, supply / Math.max(1, effHp));
      r.gainExp(Math.round(ratio * killExpPool));
      r.gainExp(C.EXP.waveBonus * owned.length);
    }
  }
  return rows;
}

const all = [];
for (const mode of ['sim', 'real']) {
  for (let s = 1; s <= SEEDS; s++) all.push(...runOne(20261109 + s * 7919, mode));
}

// 逐波均值（数值列），mode 分开输出
const numeric = Object.keys(all[0]).filter((k) => typeof all[0][k] === 'number');
const header = ['mode', 'wave', ...numeric.filter((k) => k !== 'seed' && k !== 'wave')];
const lines = [header.join(',')];
for (const mode of ['sim', 'real']) {
  for (let w = 1; w <= MAX_WAVE; w++) {
    const rows = all.filter((r) => r.mode === mode && r.wave === w);
    const cells = header.slice(2).map((k) => {
      const v = rows.reduce((s, r) => s + r[k], 0) / rows.length;
      return Number.isInteger(v) ? v : +v.toFixed(3);
    });
    lines.push([mode, w, ...cells].join(','));
  }
}
fs.writeFileSync(path.join(ROOT, 'docs', 'balance-curve-data.csv'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'docs', 'balance-curve-raw.json'), JSON.stringify(all, null, 0));

// 控制台摘要
function brief(mode) {
  console.log('\n=== ' + mode.toUpperCase() + ' 口径（' + SEEDS + ' 局均值）===');
  console.log('波次  需求(有效HP)   供给(DPS×40)  压力  经验等级  塔级和  技能数  乘区  DPS');
  for (const w of [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]) {
    const rows = all.filter((r) => r.mode === mode && r.wave === w);
    const g = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length);
    console.log(
      String(w).padStart(3),
      String(Math.round(g('effHp'))).padStart(12),
      String(Math.round(g('supply'))).padStart(13),
      g('pressure').toFixed(2).padStart(7),
      g('expLevel').toFixed(1).padStart(8),
      g('towerLvSum').toFixed(1).padStart(8),
      g('activeSkills').toFixed(1).padStart(7),
      g('skillMult').toFixed(2).padStart(6),
      Math.round(g('totalDps')).toString().padStart(7));
  }
}
brief('sim'); brief('real');
console.log('\n输出: docs/balance-curve-data.csv / docs/balance-curve-raw.json');
