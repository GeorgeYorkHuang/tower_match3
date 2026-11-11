/**
 * prologue_budget.js —— 前置章节（序章五章）结构量与难度预算（只读）
 *
 * 口径来源：
 *   - 颜色档：js/config.js DIFFICULTY.activeColors（现有 4/5/6 档；3 色档为本方案建议新增）
 *   - 塔面板：js/config/towers.js TOWERS.baseDps / perLv
 *   - 技能乘区：js/config/skills.js EFFECT.bonusPerLv=0.15 / activeSlots=3 / synergyBonus=0.5
 *   - 波时长：js/config/monsters.js WAVE.seconds=40
 *   - 抽象结算：supply = totalDps × 40s；pressure = effHp / supply
 *
 * 本脚本不修改任何 js/ 文件，只读取配置并做解析估算。
 * 塔等级 / 技能乘区按「跨章连续」推进（章首 = 上一章章末），章末可达值是设计假设
 * （按每关最多 1 次三选一节流推算），标注为待原型验证，不是实机数据。
 *
 * 用法：node tools/prologue_budget.js
 * 输出：docs/prologue-budget.csv（40 关逐关）、控制台每章锚点
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../js/config.js');
const T = require('../js/config/towers.js');
const ROOT = path.resolve(__dirname, '..');

const SECONDS = C.WAVE.seconds;

/** 五章配置：波次为「累计门槛」，与用户给的 5/10/20/30/40 一致 */
const CHAPTERS = [
  { id: 1, from: 1,  to: 5,  colors: ['red','blue','green'],                   slots: 2, skill: 'none',
    lvStart: 1,  lvEnd: 1,  multStart: 1.000, multEnd: 1.000, pNormal: 0.55, pFinal: 0.72 },
  { id: 2, from: 6,  to: 10, colors: ['red','blue','green'],                   slots: 2, skill: 'activate',
    lvStart: 1,  lvEnd: 4,  multStart: 1.000, multEnd: 1.521, pNormal: 0.58, pFinal: 0.75 },
  { id: 3, from: 11, to: 20, colors: ['red','blue','green','yellow'],          slots: 3, skill: 'branch',
    lvStart: 4,  lvEnd: 7,  multStart: 1.521, multEnd: 2.100, pNormal: 0.60, pFinal: 0.80 },
  { id: 4, from: 21, to: 30, colors: ['red','blue','green','yellow','purple'], slots: 4, skill: 'branch',
    lvStart: 7,  lvEnd: 10, multStart: 2.100, multEnd: 2.700, pNormal: 0.62, pFinal: 0.82 },
  { id: 5, from: 31, to: 40, colors: ['red','blue','green','yellow','purple'], slots: 4, skill: 'branch',
    lvStart: 10, lvEnd: 13, multStart: 2.700, multEnd: 3.100, pNormal: 0.65, pFinal: 0.85 },
];

function towerKeysOf(colors) { return colors.map((c) => C.COLORS[c].tower); }
/** 图鉴塔种的平均 baseDps / perLv（先消先得可选任意 N 座，用均值做预算） */
function avgPanel(keys) {
  const arr = keys.map((k) => T.TOWERS[k]);
  return {
    base: arr.reduce((s, t) => s + t.baseDps, 0) / arr.length,
    perLv: arr.reduce((s, t) => s + t.perLv, 0) / arr.length,
  };
}

const rows = [];
for (const ch of CHAPTERS) {
  const keys = towerKeysOf(ch.colors);
  const panel = avgPanel(keys);
  const total = ch.to - ch.from + 1;
  for (let w = ch.from; w <= ch.to; w++) {
    const t = total > 1 ? (w - ch.from) / (total - 1) : 1; // 章内进度 0→1
    const lv = +(ch.lvStart + (ch.lvEnd - ch.lvStart) * t).toFixed(2);
    const mult = +(ch.multStart + (ch.multEnd - ch.multStart) * t).toFixed(3);
    const linearDps = (panel.base + panel.perLv * (lv - 1)) * ch.slots;
    const dps = +(linearDps * mult).toFixed(1);
    const supply = Math.round(dps * SECONDS);
    const isFinal = w === ch.to;
    const p = isFinal ? ch.pFinal : ch.pNormal;
    rows.push({
      chapter: ch.id, wave: w, chapterWave: w - ch.from + 1,
      colors: ch.colors.length, slots: ch.slots,
      chargeColors: ch.colors.length - ch.slots,
      codexTowers: keys.join('/'), skillMode: ch.skill,
      towerLevel: lv, skillMult: mult, dps,
      supply, targetPressure: p,
      effHpBudget: Math.round(supply * p),
      Lv1Equivalent: +(supply * p / 250).toFixed(1),
    });
  }
}

const header = Object.keys(rows[0]);
const lines = [header.join(','), ...rows.map((r) => header.map((k) => r[k]).join(','))];
fs.writeFileSync(path.join(ROOT, 'docs', 'prologue-budget.csv'), lines.join('\n') + '\n');

console.log('=== 五章结构量（章末）===');
console.log('章  波次     色  塔位 充能色  图鉴塔种                          技能模式   章末DPS  章末血量预算');
for (const ch of CHAPTERS) {
  const r = rows.find((x) => x.wave === ch.to);
  console.log(
    String(ch.id).padStart(2),
    ('W' + ch.from + '–' + ch.to).padEnd(9),
    String(r.colors).padStart(2),
    String(r.slots).padStart(4),
    String(r.chargeColors).padStart(6),
    r.codexTowers.padEnd(38),
    r.skillMode.padEnd(10),
    String(r.dps).padStart(8),
    String(r.effHpBudget).padStart(12));
}

console.log('\n=== 章首 / 章末锚点（跨章连续性检查）===');
for (const ch of CHAPTERS) {
  const a = rows.find((x) => x.wave === ch.from);
  const b = rows.find((x) => x.wave === ch.to);
  const prev = rows.find((x) => x.wave === ch.from - 1);
  const jump = prev ? ' (较上章末 ×' + (a.dps / prev.dps).toFixed(2) + ')' : '';
  console.log('第' + ch.id + '章 W' + ch.from + ': DPS=' + a.dps + ' 预算HP=' + a.effHpBudget +
              ' Lv1等效怪=' + a.Lv1Equivalent + jump +
              '  |  W' + ch.to + ': DPS=' + b.dps + ' 预算HP=' + b.effHpBudget +
              ' Lv1等效怪=' + b.Lv1Equivalent);
}

console.log('\n=== 毕业 → 圣坛裂痕衔接 ===');
const grad = rows.find((x) => x.wave === 40);
const six = ['red','blue','green','yellow','purple','orange'];
const p6 = avgPanel(towerKeysOf(six));
const riftStartDps = +(p6.base * 4).toFixed(1); // 正式战场 4 塔 Lv1、0 技能的 rough 基线
console.log('序章 W40 毕业 DPS = ' + grad.dps);
console.log('圣坛裂痕 W1 基线 DPS ≈ ' + riftStartDps + '（4 塔 Lv1 / 0 技能；上一轮模拟 real 口径 W1 约 97.7）');
console.log('局内成长重置落差 ≈ ×' + (grad.dps / riftStartDps).toFixed(1) + ' → 必须在毕业结算页明确说明，并用局外永久解锁补偿');
console.log('圣坛裂痕结构：6 色 / 6 图鉴塔 / 4 塔位 / 2 充能色（现状原样）');
console.log('\nCSV: docs/prologue-budget.csv（40 关逐关）');
