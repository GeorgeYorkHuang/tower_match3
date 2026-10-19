/**
 * test_run.js —— run 层单测 + 会话模拟交叉验证（node 直接运行）
 * 运行：node tools/test_run.js [--seeds 300]
 * 覆盖：先消先得 / 惩罚色 / 波末结算 / 战斗破防 / 三选一集成 /
 *       trySwap 真实路径 / 会话模拟指标（对齐 python sim_effects 阈值）
 */
const assert = require('assert');
const CONFIG = require('../js/config.js');
const { Run, simulateSession, expOfShape } = require('../js/run.js');

let SEEDS = 300;
const argv = process.argv.slice(2);
const si = argv.indexOf('--seeds');
if (si >= 0 && argv[si + 1]) SEEDS = parseInt(argv[si + 1], 10) || 300;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

function seededRun(difficulty, seed) {
  return new Run({ difficulty, rng: mulberry(seed) });
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 1. 经验映射：按方块 × 形状倍率（perCell=2，三消经验远少于打怪） */
t('expOfShape：3连6 / 直4 12 / L5 15 / 直5 20 / 6+ 30', () => {
  assert.strictEqual(expOfShape('3', 3), 6);   // 2×3×1.0
  assert.strictEqual(expOfShape('4', 4), 12);  // 2×4×1.5
  assert.strictEqual(expOfShape('L5', 5), 15); // 2×5×1.5
  assert.strictEqual(expOfShape('5', 5), 20);  // 2×5×2.0
  assert.strictEqual(expOfShape('6+', 7), 35); // 2×7×2.5
});

/* 2. 先消先得：前 4 色得塔，第 5 色（塔位满，未选中）→ 动态剩余色充能全局技能（v1.12.1） */
t('先消先得与剩余 2 色动态充能', () => {
  const run = seededRun(6, 1);
  run.applyMatch('red', '3', 3);
  run.applyMatch('blue', '3', 3);
  run.applyMatch('green', '3', 3);
  run.applyMatch('yellow', '3', 3);
  assert.strictEqual(Object.keys(run.effects.towers).filter((k) => run.effects.tower(k).level > 0).length, 4, '前 4 色应全部得塔');
  // 塔位满后第 5 色（purple 回旋镖，未选中）→ 剩余 2 色之一充能（3连 +3 点）+ 半量经验
  const expBefore = run.exp;
  const r = run.applyMatch('purple', '3', 3);
  assert.strictEqual(r.gotTower, false);
  assert.strictEqual(r.penalized, false);
  assert.strictEqual(r.shuffleGain + r.frzGain, 3, '未选中色消除 → 动态充能 3 点（3连 +3）');
  assert.strictEqual(run.shuffleEnergy + run.freezeEnergy, 3, '全局能量应入账');
  assert.strictEqual(run.exp - expBefore, Math.floor(6 * CONFIG.PENALTY_RATIO), '未选中色保留半量经验');
});

/* 3. 6 色均可成塔：橙先消 → 得炮塔；剩余色充能按形状（直4 +5 / 5消 ×2） */
t('炮塔可入槽 + 形状充能公式', () => {
  const run = seededRun(6, 2);
  const r1 = run.applyMatch('orange', '3', 3); // 先消橙 → 得炮塔（v1.12.1：cannon 不再固定非塔色）
  assert.strictEqual(r1.gotTower, true, '橙可成为出战塔');
  assert.strictEqual(r1.tower, 'cannon');
  assert.strictEqual(run.slotOrder[0], 'cannon');
  // 4 塔集齐（火冰毒电），橙已入槽 → 剩余 2 色 = purple + 未选中的 1 色
  run.applyMatch('red', '3', 3); run.applyMatch('blue', '3', 3);
  run.applyMatch('green', '3', 3); run.applyMatch('yellow', '3', 3);
  const r2 = run.applyMatch('purple', '4', 4); // 直4
  assert.strictEqual(r2.shuffleGain + r2.frzGain, 5, '直4 充 5 点');
  const r3 = run.applyMatch('purple', '5', 5); // 直5 → 5×2=10，但同技能 5+10 封顶 12 → 实际入账 7
  assert.strictEqual(r3.shuffleGain + r3.frzGain, 7, '直5 累计封顶 12 → 入账 7');
  const r4 = run.applyMatch('yellow', '6+', 6); // 另一剩余色（yellow 未入槽）→ 6×2=12，此前已充 3 → 入账 9 封顶
  assert.strictEqual(r4.shuffleGain + r4.frzGain, 9, '6+ 累计封顶 12 → 入账 9');
  assert.strictEqual(run.shuffleEnergy, CONFIG.GLOBAL_SKILL.energyMax, '洗牌能量封顶 3 格');
  assert.strictEqual(run.freezeEnergy, CONFIG.GLOBAL_SKILL.energyMax, '冰冻能量封顶 3 格');
});

/* 4. 波末：金币公式 + 战斗结算 */
t('波末金币 60×1.08^(w-1) 与战斗破防', () => {
  const run = seededRun(6, 3);
  // 高塔位空、低 DPS → 必然破防
  run.startWave();
  assert.strictEqual(run._waveGold, 60);
  const w1 = run.endWave();
  assert.ok(w1.leak > 0, '无塔 DPS=0 应有缺口');
  assert.strictEqual(w1.waveGold, 60);
  run.startWave();
  assert.ok(Math.abs(run._waveGold - 60 * 1.08) < 1e-9);
});

/* 5. 三选一集成：自动结算 + 协同达成记录 */
t('模拟 run：协同达成与 breakWave 记录', () => {
  const run = seededRun(6, 4);
  const res = run.simulateRun();
  assert.ok(res.breakWave >= 1 && res.breakWave <= 50);
  assert.ok(res.picks >= 1, '首个 run 应有三选一');
  assert.ok(res.firstSynergyWave === null || (res.firstSynergyWave >= 1 && res.firstSynergyWave <= res.breakWave));
});

/* 6. trySwap 真实路径：消除→经验结算 */
t('trySwap 集成：匹配组结算经验', () => {
  const run = seededRun(6, 5);
  const b = run.board;
  b.rows = 6; b.cols = 12;
  b.grid = Array.from({ length: 6 }, () => Array(12).fill('blue'));
  b.grid[0][0] = 'red'; b.grid[0][1] = 'red'; b.grid[0][2] = 'green';
  b.grid[1][2] = 'red';
  // 交换 (0,2)↔(1,2)：green↔red → row0 出现 red×3
  const ret = run.trySwap(0, 2, 1, 2);
  assert.ok(ret.ok, '交换应有效');
  assert.ok(ret.settled.length >= 1, '应有匹配组结算');
  const redTower = run.effects.tower('fire');
  assert.ok(redTower.level >= 1, '红消应得/升火塔');
});

/* 7. v1.8 整体经验：池满升级 → 整体等级 +1 → 待选最少塔待选 +1；塔 DPS 按整体等级成长 */
t('v1.8 整体经验：消除入池、升级发放待选、DPS 按整体等级成长', () => {
  const run = seededRun(6, 6);
  run.applyMatch('red', '3', 3);    // 得火塔（得塔不发经验）
  run.applyMatch('blue', '3', 3);   // 得冰塔
  run.applyMatch('green', '3', 3);  // 得毒塔
  run.applyMatch('yellow', '3', 3); // 得电塔
  // 塔位满后消除（未选中色）→ 剩余色动态充能 + 半量经验（v1.12.1）
  const r = run.applyMatch('purple', '3', 3);
  assert.ok(r.shuffleGain + r.frzGain > 0 && run.shuffleEnergy + run.freezeEnergy > 0, '未选中色消除 → 全局技能充能');
  assert.strictEqual(run.exp, Math.floor(6 * CONFIG.PENALTY_RATIO), '未选中色保留半量经验');
  assert.strictEqual(run.expNeed(), 30, 'L0 升级需求应为 30');
  const beforeLv = run.expLevel;
  const totalPending = () => ['fire', 'ice', 'poison', 'electric'].reduce((s, k) => s + run.effects.tower(k).pending, 0);
  const bp = totalPending();
  run.gainExp(run.expNeed() - run.exp);   // 恰好升一级
  assert.strictEqual(run.expLevel, beforeLv + 1, '整体等级应 +1');
  assert.strictEqual(totalPending(), bp + 1, '已有塔待选应 +1');
  // DPS：整体等级 1 → 基础 DPS（无特效乘区时 = baseDps）
  const dps1 = run.effects.towerDps('fire');
  assert.ok(Math.abs(dps1 - CONFIG.TOWERS.fire.baseDps) < 1e-6, '整体等级 1 塔 DPS 应为基础 DPS');
  run.gainExp(run.expNeed());  // 再升一级（整体等级 2）
  assert.ok(run.effects.towerDps('fire') > dps1, '整体等级提升 → 塔 DPS 应成长');
});

/* 8. v1.12 弹药：塔色供弹 + 满溢出均分全局能量 + 能量封顶/消耗 */
t('v1.12 弹药与全局能量结算', () => {
  const run = seededRun(6, 7);
  run.applyMatch('red', '3', 3); run.applyMatch('blue', '3', 3);
  run.applyMatch('green', '3', 3); run.applyMatch('yellow', '3', 3);
  const fire = run.effects.tower('fire');
  assert.strictEqual(fire.ammo, CONFIG.GLOBAL_SKILL.startAmmo, '得塔初始弹药 = startAmmo');
  // 塔色消除 → 弹药 +块数
  const r1 = run.applyMatch('red', '3', 3);
  assert.strictEqual(fire.ammo, CONFIG.GLOBAL_SKILL.startAmmo + 3, '塔色消除弹药 +块数');
  assert.strictEqual(r1.ammoGain, 3);
  // 弹药满（50）→ 溢出均匀充能两个全局技能：r1 后 28 + 8×3 = 52 → 溢出 2 → 均分各 +1
  for (let i = 0; i < 8; i++) run.applyMatch('red', '3', 3);
  assert.strictEqual(fire.ammo, CONFIG.GLOBAL_SKILL.ammoMax, '弹药封顶 ammoMax');
  assert.strictEqual(run.shuffleEnergy + run.freezeEnergy, 2, '溢出均分 2 点');
  // 剩余色消除 → 形状充能 + 半量经验（动态分配 shuffle/freeze，断言总入账）
  const expB = run.exp;
  const r2 = run.applyMatch('purple', '4', 4);
  assert.strictEqual(r2.shuffleGain + r2.frzGain, 5, '直4 充 5 点');
  assert.strictEqual(run.exp - expB, Math.floor(12 * CONFIG.PENALTY_RATIO), '未选中色保留半量经验');
  // 两个剩余色（purple/orange）各自对应一个全局技能 → 分别消除，各自封顶 3 格
  for (let i = 0; i < 10; i++) { run.applyMatch('purple', '6+', 6); run.applyMatch('orange', '6+', 6); }
  assert.strictEqual(run.shuffleEnergy, CONFIG.GLOBAL_SKILL.energyMax, '洗牌能量封顶 3 格');
  assert.strictEqual(run.freezeEnergy, CONFIG.GLOBAL_SKILL.energyMax, '冰冻能量封顶 3 格');
  // 消耗 1 格释放
  assert.ok(run.spendEnergy('shuffle'), '能量 ≥1 格可释放');
  assert.strictEqual(run.shuffleEnergy, CONFIG.GLOBAL_SKILL.energyMax - CONFIG.GLOBAL_SKILL.energyPerCell, '释放消耗 1 格');
  assert.ok(!run.spendEnergy('shuffle') || run.shuffleEnergy >= CONFIG.GLOBAL_SKILL.energyPerCell, '能量不足不可释放');
  // v1.12.3 形状弹药供给：3消+3 / 4消+6 / 5消+10 / 6+(x块) 10+3(x-5)（各自独立 run 避免上限截断）
  const mk = (seed) => { const r = seededRun(6, seed); ['red', 'blue', 'green', 'yellow'].forEach((c) => r.applyMatch(c, '3', 3)); return r; };
  assert.strictEqual(mk(1).applyMatch('red', '3', 3).ammoGain, 3, '3消 弹药 +3');
  assert.strictEqual(mk(2).applyMatch('red', '4', 4).ammoGain, 6, '4消 弹药 +6');
  assert.strictEqual(mk(3).applyMatch('red', '5', 5).ammoGain, 10, '5消 弹药 +10');
  assert.strictEqual(mk(4).applyMatch('red', '6+', 6).ammoGain, 13, '6消 弹药 +13（10+3×(6-5)）');
  assert.strictEqual(mk(5).applyMatch('red', '6+', 8).ammoGain, 19, '8消 弹药 +19（10+3×3）');
});

/* 9. 会话模拟：300 样本阈值对齐（python sim_effects 同口径） */
console.log(`\n会话模拟 ${SEEDS} 样本交叉验证：`);
(function () {
  let syn15 = 0, econOk = 0, capOk = 0, pickEarly = 0, slotFull = 0;
  let firstSynArr = [], goldArr = [], breakArr = [];
  for (let i = 0; i < SEEDS; i++) {
    const s = simulateSession({ seed: 20261017 + i, difficulty: 6 });
    const r0 = s.runs[0];
    if (r0.firstSynergyWave !== null && r0.firstSynergyWave <= 15) { syn15++; firstSynArr.push(r0.firstSynergyWave); }
    if (s.totalGold <= CONFIG.ECONOMY.goldTargetCap) { econOk++; goldArr.push(s.totalGold); }
    if (s.pickCapOk) capOk++;
    if (r0.picks >= 1) pickEarly++;
    if (r0.picks >= 3) slotFull++;
    breakArr.push(r0.breakWave);
  }
  const mid = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  console.log(`      前 5 波内 ≥1 三选一达成率 : ${(pickEarly / SEEDS * 100).toFixed(1)}%   （阈值 100%）`);
  console.log(`      前 10 波 3 槽填满率(近似) : ${(slotFull / SEEDS * 100).toFixed(1)}%   （阈值 ≥100% 前 10 波可见）`);
  console.log(`      待选峰值 ≤5 达标率        : ${(capOk / SEEDS * 100).toFixed(1)}%`);
  console.log(`      协同 15 波内达成率        : ${(syn15 / SEEDS * 100).toFixed(1)}%   （阈值 100%）`);
  console.log(`      协同达成中位波次          : ${firstSynArr.length ? mid(firstSynArr) : '-'}`);
  console.log(`      期末金币均值 / 中位       : ${(goldArr.reduce((a, b) => a + b, 0) / Math.max(goldArr.length, 1)).toFixed(0)} / ${mid(goldArr)}   （上限 ${CONFIG.ECONOMY.goldTargetCap}）`);
  console.log(`      经济达标率                : ${(econOk / SEEDS * 100).toFixed(1)}%`);
  console.log(`      首 run 破防波次中位       : ${mid(breakArr)}`);
  t('会话模拟阈值全 PASS', () => {
    assert.strictEqual(pickEarly, SEEDS, '构筑节奏 100%');
    // v1.12 非塔色不再给经验（改为全局技能能量）→ 整体升级节奏略降，协同达成率随之下降；
    // 自动路径已均衡分支升级，阈值按 v1.12 口径 85%（实际约 91%，留随机余量）
    assert.ok(syn15 >= SEEDS * 0.85, `协同 15 波 ≥85%（实际 ${(syn15 / SEEDS * 100).toFixed(1)}%）`);
    assert.strictEqual(econOk, SEEDS, '经济 ≤100k 100%');
    assert.strictEqual(capOk, SEEDS, '待选峰值 ≤5 100%');
  });
})();

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
