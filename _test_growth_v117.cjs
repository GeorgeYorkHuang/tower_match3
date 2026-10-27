/* v1.17 成长重构验证：怪物代际占比表 / 总血量口径 / 塔线性 DPS
 * 运行：node _test_growth_v117.mjs
 */
const { createRequire } = require('module');
const req = createRequire(__filename);
const CONFIG = req('./js/config.js');
const { TowerBuild } = req('./js/effects.js');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), `${name} = ${JSON.stringify(a)}`); }

/* 1. levelMix 占比抽查（与确认表一致） */
console.log('[1] 每波代际占比');
eq(CONFIG.ENEMY.levelMix(1), [1], '波1 全 Lv1');
eq(CONFIG.ENEMY.levelMix(3), [1, 1, 1, 1, 2], '波3 Lv1 80% + Lv2 20%');
eq(CONFIG.ENEMY.levelMix(4), [1, 1, 2, 2, 3], '波4 Lv1 40% + Lv2 40% + Lv3 20%');
eq(CONFIG.ENEMY.levelMix(5), [2, 2, 2, 3, 3], '波5 Lv2 60% + Lv3 40%');
eq(CONFIG.ENEMY.levelMix(10), [2, 3, 3, 4, 4], '波10 Lv2 20% + Lv3 40% + Lv4 40%');
eq(CONFIG.ENEMY.levelMix(11), [3, 3, 4, 4, 4], '波11 Lv3 40% + Lv4 60%');
eq(CONFIG.ENEMY.levelMix(19), [4, 5, 5, 5, 6], '波19 Lv4 20% + Lv5 60% + Lv6 20%');
eq(CONFIG.ENEMY.levelMix(20), [4, 5, 5, 6, 6], '波20 Lv4 20% + Lv5 40% + Lv6 40%');
eq(CONFIG.ENEMY.levelMix(29), [6, 7, 7, 7, 8], '波29 Lv6 20% + Lv7 60% + Lv8 20%');
eq(CONFIG.ENEMY.levelMix(30), [6, 7, 7, 8, 8], '波30 Lv6 20% + Lv7 40% + Lv8 40%');
eq(CONFIG.ENEMY.levelMix(39), [8, 9, 9, 9, 10], '波39 Lv8 20% + Lv9 60% + Lv10 20%');
eq(CONFIG.ENEMY.levelMix(40), [9, 9, 9, 10, 10], '波40 Lv9 60% + Lv10 40%');
eq(CONFIG.ENEMY.levelMix(41), [9, 9, 9, 10, 10], '波41 与40波同比例（首轮不升代）');
eq(CONFIG.ENEMY.levelMix(46), [10, 10, 10, 11, 11], '波46 整体 +1 代');

/* 2. mainLevel 主等级（精英/Boss 基准） */
console.log('[2] 主等级');
ok(CONFIG.ENEMY.mainLevel(1) === 1, '波1 主 = Lv1');
ok(CONFIG.ENEMY.mainLevel(4) === 2, '波4 并列取新代 = Lv2');
ok(CONFIG.ENEMY.mainLevel(5) === 2, '波5 主 = Lv2');
ok(CONFIG.ENEMY.mainLevel(11) === 4, '波11 主 = Lv4');
ok(CONFIG.ENEMY.mainLevel(40) === 9, '波40 主 = Lv9');

/* 3. levelOf 超界生成（Lv9/Lv10） */
console.log('[3] 超界等级生成');
const l9 = CONFIG.ENEMY.levelOf(9), l10 = CONFIG.ENEMY.levelOf(10);
ok(l9.type === 'tank' && l9.hp === 2380, `Lv9 重坦 hp=2380 实际 ${l9.type}/${l9.hp}`);
ok(l10.type === 'normal' && l10.hp === 1700, `Lv10 普 hp=1700 实际 ${l10.type}/${l10.hp}`);

/* 4. waveTotalHp 手算对照（无诅咒） */
console.log('[4] 本波总血量');
function expectTotal(w) {
  const count = (6 + 3 * w) * 2;
  const hasBoss = w >= 5 && w % 5 === 0;
  const normalCount = count - (hasBoss ? 1 : 0) - 1;
  const mix = CONFIG.ENEMY.levelMix(w);
  const main = CONFIG.ENEMY.mainLevel(w);
  let hp = 0;
  for (let i = 0; i < normalCount; i++) hp += CONFIG.ENEMY.levelOf(mix[i % mix.length]).hp;
  hp += CONFIG.ENEMY.levelOf(main).hp * 4;
  if (hasBoss) hp += CONFIG.ENEMY.levelOf(main).hp * 8;
  return hp;
}
for (const w of [1, 3, 5, 10, 15, 20, 29, 40]) {
  const exp = expectTotal(w);
  const act = CONFIG.ENEMY.waveTotalHp(w, 1);
  ok(Math.abs(exp - act) < 1e-6, `波${w} 总血量 ${act}（期望 ${exp}）`);
}
/* 诅咒口径 */
const curseHp = CONFIG.ENEMY.waveTotalHp(5, Math.pow(1.15, 2));
ok(Math.abs(curseHp - expectTotal(5) * 1.15 * 1.15) < 1e-6, `波5 诅咒2层 总血量 ${curseHp}`);

/* 5. 塔线性 DPS（已确认 v1：火 L5/L10/L20 = 72/122/222） */
console.log('[5] 塔线性 DPS');
const fire = new TowerBuild('fire');
function dpsAt(b, lv) { b.level = 1; return Math.round(b.dps(false, lv)); }
ok(dpsAt(fire, 1) === 32, `火 L1 DPS=32 实际 ${dpsAt(fire, 1)}`);
ok(dpsAt(fire, 5) === 72, `火 L5 DPS=72 实际 ${dpsAt(fire, 5)}`);
ok(dpsAt(fire, 10) === 122, `火 L10 DPS=122 实际 ${dpsAt(fire, 10)}`);
ok(dpsAt(fire, 20) === 222, `火 L20 DPS=222 实际 ${dpsAt(fire, 20)}`);
const expect = { ice: [52, 92, 172], poison: [61, 106, 196], electric: [59, 104, 194], boomerang: [58, 103, 193], cannon: [78, 128, 228] };
Object.keys(expect).forEach((k) => {
  const b = new TowerBuild(k);
  const got = [dpsAt(b, 5), dpsAt(b, 10), dpsAt(b, 20)];
  ok(JSON.stringify(got) === JSON.stringify(expect[k]), `${k} L5/L10/L20=${got}（期望 ${expect[k]}）`);
});
/* perLv 字段已生效、grow 已移除 */
ok(fire.perLv === 10, `火 perLv=10 实际 ${fire.perLv}`);
ok(!('grow' in fire), 'TowerBuild 无 grow 字段');

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
