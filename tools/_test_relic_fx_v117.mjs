// v1.17 回归测试：圣遗物生效触发飘字（★星级+名称+圣遗物色 / 节流 / 触发点冒烟）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CONFIG = require('../js/config.js');
const { Run } = require('../js/run.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

// 星级表：金库 2★、力量符 1★、连锁反应 1★（其余默认 0）
const starMap = { cm_vault: 2, cm_power: 1, cm_combo: 1, fire_seed: 1 };
const metaRef = { starOf: (id) => starMap[id] || 0, relicBonus: () => ({}) };
const fxArr = []; // 飘字承接（等价 main.game.fx）

function freshRun(extra) {
  const r = new Run(Object.assign({ difficulty: CONFIG.DIFFICULTY.default, seed: 12345 }, extra || {}));
  r.metaRef = metaRef;
  r.fxTarget = fxArr;
  return r;
}
function resetFx() { fxArr.length = 0; }

/* ---------- ① relicFx 基础 ---------- */
console.log('[1] relicFx 基础');
const r1 = freshRun();
r1.runRelic = { cm_vault: 1 }; // 拥有金库
ok(r1.relicFx('cm_vault', '波末金币 +45%') === true, '拥有圣遗物时返回 true');
ok(fxArr.length === 1, '生成 1 条飘字');
const f0 = fxArr[0];
ok(f0.type === 'floatText', 'fx 类型 floatText');
ok(f0.text === '★2 金库 波末金币 +45%', `文案含星级+名称+触发文字 → "${f0.text}"`);
ok(f0.color === '#f7c948', '通用圣遗物金色 #f7c948');
ok(f0.x === 375 && f0.y === 240, '缺省位置 375,240');
ok(f0.dur === 1.0 && f0.size === 20, '时长 1s 字号 20');

/* ---------- ② 节流（同款 0.8s 内只显示一次） ---------- */
console.log('[2] 节流');
ok(r1.relicFx('cm_vault', '再来一次') === false, '同 id 0.8s 内第二次被节流');
ok(fxArr.length === 1, '节流后仍只有 1 条');

/* ---------- ③ 未拥有不提示 ---------- */
console.log('[3] 未拥有');
resetFx();
const r3 = freshRun();
ok(r3.relicFx('cm_triple', 'x') === false, '未拥有不提示');
ok(fxArr.length === 0, '无飘字');

/* ---------- ④ 无 fxTarget（模拟层）静默 ---------- */
console.log('[4] 模拟层静默');
const r4 = freshRun();
r4.fxTarget = null;
r4.runRelic = { cm_vault: 1 };
ok(r4.relicFx('cm_vault', 'x') === false, '无 fxTarget 返回 false 不抛错');

/* ---------- ⑤ 塔圣遗物颜色 ---------- */
console.log('[5] 塔圣遗物颜色');
resetFx();
const r5 = freshRun();
r5.runRelic = { fire_seed: 1 };
ok(r5.relicFx('fire_seed', '灼烧 +80%') === true, '火塔圣遗物可提示');
ok(fxArr.length === 1 && fxArr[0].color === '#e74c3c', `火塔色 #e74c3c → ${fxArr[0].color}`);
ok(fxArr[0].text === '★1 火种 灼烧 +80%', `塔圣遗物文案 → "${fxArr[0].text}"`);

/* ---------- ⑥ 3★ 测试注入显示 ★3 ---------- */
console.log('[6] 3★ 测试注入');
resetFx();
const r6 = freshRun();
r6.runRelic = { cm_freeze: 1 };
r6._testStar3Mode = true;
r6._testStar3 = { cm_freeze: true };
ok(r6.relicFx('cm_freeze', '首敌冻结 6 秒') === true, '3★ 注入可提示');
ok(fxArr.length === 1 && fxArr[0].text === '★3 冻结时刻 首敌冻结 6 秒', `3★ 文案 → "${fxArr[0].text}"`);

/* ---------- ⑦ 触发点冒烟：startWave 洗牌 / endWave 回复+金库 / applyMatch 4连 / 3★ 升级返还 ---------- */
console.log('[7] 触发点冒烟');
// startWave：战术转移每波免费洗牌提示
const r7 = freshRun();
r7.runRelic = { cm_shuffle: 1 };
resetFx();
r7.startWave();
ok(fxArr.some((f) => f.text.includes('免费洗牌 +1')), 'startWave 洗牌提示');
// endWave：生命回复 + 金库（starMap 中金库为 2★ → 显示 ★2）
resetFx();
r7.runRelic = { cm_regen: 1, cm_vault: 1, cm_shuffle: 1 };
r7.startWave(); // 洗牌提示（忽略）
resetFx();
r7.endWave();
ok(fxArr.some((f) => f.text.includes('城墙回复 5%')), 'endWave 生命回复提示');
ok(!fxArr.some((f) => f.text.includes('★2 金库')), '金库 1-2★ 为被动加成，波末无事件提示（获得时已提示生效）');
// 金库 3★ 无伤额外
resetFx();
const r7b = freshRun();
r7b.runRelic = { cm_vault: 1 };
starMap.cm_vault = 3; // 该表为 metaRef 引用，直接改 → 3★
r7b._waveStartHp = 100; r7b.lineHp = 100;
r7b._waveGold = 100;
r7b.endWave();
ok(fxArr.some((f) => f.text === '★3 金库 无伤金币 +30%'), '金库3★ 无伤提示');
starMap.cm_vault = 2;
// applyMatch 4连触发（rng 固定 < 1% 保证触发）
resetFx();
const r7c = freshRun({ seed: 999, rng: () => 0.001 });
r7c.runRelic = { cm_combo: 1 };
r7c.applyMatch('red', '3', 3);
ok(fxArr.some((f) => f.text.includes('4连触发 +10%')), 'applyMatch 4连触发提示');
// gainExp 3★ 经验返还 + 智慧典籍（构造 expLevel 满级前，强制多次升级）
resetFx();
const r7d = freshRun();
r7d.runRelic = { cm_exp: 1, cm_tome: 1 };
r7d._testStar3Mode = true;
r7d._testStar3 = { cm_exp: true, cm_tome: true };
// 手动触发升级（exp 压满）
r7d.exp = r7d.expNeed();
r7d.expLevel = 0;
r7d.gainExp(1000);
ok(fxArr.some((f) => f.text.includes('升级返还 50% 经验') || f.text.includes('升级攻速 +20%')), '3★ 升级返还/攻速提示（二选一由随机决定）');

/* ---------- ⑧ config 辅助 ---------- */
console.log('[8] config 辅助');
ok(CONFIG.relicColor('cm_triple') === '#f7c948', '通用金色');
ok(CONFIG.relicColor('ice_spike') === '#5dade2', '冰塔色');
ok(CONFIG.relicColor('can_heavy') === '#b5651d', '炮塔色');
ok(CONFIG.relicDef('cm_vault').name === '金库', 'relicDef 查到金库');
ok(CONFIG.relicDef('fire_seed').name === '火种', 'relicDef 查到火种');
ok(CONFIG.relicDef('nope') === null, '未知 id 返回 null');

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
