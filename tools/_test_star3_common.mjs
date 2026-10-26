/**
 * _test_star3_common.mjs —— v1.16.96 通用 16 条 3★ 圣遗物行为冒烟测试（run.js 层）
 * 覆盖：relic3 判定 / cm_power 叠层 / cm_triple 连锁 / cm_ammobox 存借 / cm_charge 溢出
 *       cm_exp 返还 / cm_vault 无伤 / cm_wall 背水 / cm_guard 截断 / cm_regen 护盾 / cm_bounty 必掉
 * 运行：node tools/_test_star3_common.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CONFIG = require('../js/config.js');
const { Run } = require('../js/run.js');
const { EffectManager } = require('../js/effects.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
  else console.log('PASS:', msg);
}

// wx mock（effects.js 内部使用）
const store = {};
global.wx = {
  createInnerAudioContext() { return { src: '', loop: false, volume: 1, play() {}, stop() {} }; },
  getStorageSync(k) { return store[k]; }, setStorageSync(k, v) { store[k] = v; },
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 3 }; },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {},
};

const STAR3_SAVE = CONFIG.STAR3_ENABLED;
CONFIG.STAR3_ENABLED = true;   // 测试期开启，测试完恢复

function newRun() {
  const run = new Run({ rng: () => 0, seed: 1 });   // rng()=0：概率必触发
  run.metaRef = { starOf: () => 3 };                // 全部按 3★
  return run;
}
const run = newRun();

// ---- 1. relic3 判定 ----
assert(run.relic3('cm_power') === false, '未拥有 → relic3 false');
run.runRelic['cm_power'] = 1;
assert(run.relic3('cm_power') === true, '拥有+3★+开启 → relic3 true');
CONFIG.STAR3_ENABLED = false;
assert(run.relic3('cm_power') === false, '开关关闭 → relic3 false');
CONFIG.STAR3_ENABLED = true;
run.metaRef = { starOf: () => 1 };
assert(run.relic3('cm_power') === false, '1★ → relic3 false');
run.metaRef = { starOf: () => 3 };

// ---- 2. cm_power：4连消叠层 ----
run.applyMatch('red', '3', 3);                       // 3连：不叠
assert(Math.abs(run.cmPower3 - 0) < 1e-9, '3连不叠层 cmPower3=' + run.cmPower3);
run.applyMatch('red', '4', 4);                       // 直4：+0.5
assert(Math.abs(run.cmPower3 - 0.5) < 1e-9, '直4叠层 0.5% cmPower3=' + run.cmPower3);
run.applyMatch('red', '5', 5);                       // 直5：+0.5
assert(Math.abs(run.cmPower3 - 1.0) < 1e-9, '直5再叠 cmPower3=' + run.cmPower3);

// ---- 3. cm_triple：连锁×2 经验再 +50%（直接验证 _relicExp 开关） ----
run.runRelic['cm_triple'] = 1;
const tripleN = run.relicNum('cm_triple');      // 3★ 文本仍取 desc 末数字（45）
const e0 = run._relicExp(100);
assert(Math.abs(e0 - Math.round(100 * (1 + tripleN / 100))) < 1e-9, '非连锁 _relicExp(100)=' + e0 + '（含基础+' + tripleN + '%）');
run._triple3 = true;
const e1 = run._relicExp(100);
assert(Math.abs(e1 - Math.round(100 * (1 + tripleN / 100) * 1.5)) < 1e-9, '连锁×2 _relicExp(100)=' + e1 + '（再+50%）');
run._triple3 = false;

// ---- 4. cm_ammobox：三消能量溢出存备用库 + 普攻借库 ----
run.runRelic['cm_ammobox'] = 1;
const tRed = run.effects.tower(CONFIG.COLORS.red && CONFIG.COLORS.red.tower);
const cap = run.armoryEnergyMax();
tRed.energy = cap - 2;
run.applyMatch('red', '3', 3);   // 得塔分支再给 energy，溢出 ≥2 → 50% 概率(rng=0 必存) 存 bank
assert(run.energyBank >= 2, '溢出存备用库 energyBank=' + run.energyBank);
tRed.energy = 0.1;
run.spendAttackEnergy(tRed);     // 借库补足 0.5
assert(tRed.energy === 0, '借库后仍耗 0.5（不足归零）energy=' + tRed.energy);
assert(run.energyBank >= 0.4, '借库消耗后余额 energyBank=' + run.energyBank);

// ---- 5. cm_charge：全局充能溢出 → 技能伤 +10% ----
run.runRelic['cm_charge'] = 1;
const GS = CONFIG.GLOBAL_SKILL;
run.shuffleAmmo = GS.energyMaxGS;
const got = run._chargeAmmo('shuffle', 5);   // 已满再充 5 → 溢出 5
assert(got === 0, '溢出部分不入充能 got=' + got);
assert(run.chargeSkillBoost === 10, '溢出 → 技能伤 +10% boost=' + run.chargeSkillBoost);

// ---- 6. cm_exp：升级 20% 概率返还本级经验 50%（rng=0 必触发） ----
run.runRelic['cm_exp'] = 1;
run.expLevel = 0; run.exp = 0;
const need0 = run.expNeed();
const ups = run.gainExp(need0 + 100);
assert(ups >= 1, '升级发生 ups=' + ups);
assert(run.exp >= Math.round(need0 * 0.5), '返还本级经验 50% exp=' + run.exp);

// ---- 7. cm_vault：波末无伤金币 +30% ----
run.runRelic['cm_vault'] = 1;
const g0 = run.gold;
run.startWave();
run.endWave(true);
assert(run.gold - g0 > 0, '无伤波末金币+30%（wave1 基础+额外）goldΔ=' + (run.gold - g0));
// 受伤波：startWave 之后扣血 → 无30%额外（仅基础）
run.lineHp = Math.max(1, run.lineHp - 100);
const g1 = run.gold;
run.startWave();
run.lineHp = Math.max(0, run.lineHp - 50);   // 波内掉血
run.endWave(true);
const d2 = run.gold - g1;
const vaultN = run.relicNum('cm_vault');
const baseWave = CONFIG.ECONOMY.goldPerWaveBase * Math.pow(CONFIG.ECONOMY.goldPerWaveGrowth, run.wave - 1);
assert(Math.abs(d2 - Math.round(baseWave * (1 + vaultN / 100))) < 1e-9, '受伤波无30%额外（仅基础）Δ=' + d2 + '，基础=' + Math.round(baseWave * (1 + vaultN / 100)));

// ---- 8. cm_wall：城墙每损失10%血全塔攻击 +1%（上限10%） ----
run.runRelic['cm_wall'] = 1;
run.lineMaxHp = CONFIG.LINE.hp;
run.lineHp = CONFIG.LINE.hp;
assert(run.wallAtkBonus() === 0, '满血 0% bonus=' + run.wallAtkBonus());
run.lineHp = Math.floor(CONFIG.LINE.hp * 0.5);
assert(run.wallAtkBonus() === 5, '半血 +5% bonus=' + run.wallAtkBonus());
run.lineHp = 0;
assert(run.wallAtkBonus() === 10, '濒死 +10%（封顶）bonus=' + run.wallAtkBonus());

// ---- 9. cm_guard：单次超10%最大血 → 超出部分减免50% ----
run.runRelic['cm_guard'] = 1;
const maxHp = CONFIG.LINE.hp;
const dSmall = maxHp * 0.05;
assert(Math.abs(run.applyWallDamage(dSmall) - dSmall) < 1e-9, '小额伤害全额通过');
const dBig = maxHp * 0.2;
const expectBig = maxHp * 0.1 + (dBig - maxHp * 0.1) * 0.5;
assert(Math.abs(run.applyWallDamage(dBig) - expectBig) < 1e-9, '大额伤害截断 15%maxHp');

// ---- 10. cm_regen：回复溢出转护盾 + 护盾优先抵扣 ----
run.runRelic['cm_regen'] = 1;
run.lineHp = maxHp - 1;            // 回复 20% 溢出
run.endWave(true);
assert(run.wallShield > 0, '回复溢出转盾 wallShield=' + run.wallShield);
const shieldBefore = run.wallShield;
const dHit = maxHp * 0.03;
run.applyWallDamage(dHit);
assert(run.wallShield < shieldBefore, '护盾抵扣伤害 wallShield=' + run.wallShield + '（前=' + shieldBefore + '）');

// ---- 11. cm_bounty：连续3波无宝箱 → 第4波必掉 ----
run.runRelic['cm_bounty'] = 1;
run._waveChestDropped = false;
assert(run.bountyGuarantee() === false, 'streak=0 不保证');
run.startWave(); run.startWave(); run.startWave();   // 3 波无宝箱 → streak=3
assert(run._bountyStreak === 3, '3波无宝箱 streak=' + run._bountyStreak);
assert(run.bountyGuarantee() === true, '第4波必掉 guarantee=true');
assert(run.bountyGuarantee() === false, '必掉消费后重置 false');

// ---- 12. 全量文本核验：27 条 3★ 文案仍在库（回归防线，遍历 RELIC_RUN 查找） ----
const RELIC = CONFIG.RELIC_RUN;
const flat = [];
Object.values(RELIC.tower || {}).forEach((arr) => (Array.isArray(arr) ? arr : []).forEach((r) => flat.push(r)));
(Array.isArray(RELIC.common) ? RELIC.common : []).forEach((r) => flat.push(r));
const byId = {};
flat.forEach((r) => { byId[r.id] = r; });
const star3Ids = ['fire_seed','fire_inferno','fire_hasten','ice_pierce','ice_blizzard','ice_domain',
  'ice_frostburst','ice_wallshift','ice_avalanche','ice_glacier','poison_vine','poison_corrode',
  'elec_storm','elec_fast','elec_magnet','boo_blood','boo_trail','boo_hunt','boo_cyclone',
  'can_pierce','can_minefield','can_powder','can_incend','can_mine','cm_vault','cm_wall','cm_freeze'];
const missing = star3Ids.filter((id) => !byId[id] || !byId[id].star3);
assert(missing.length === 0, '27 条 3★ 文案在库' + (missing.length ? ' 缺失=' + missing.join(',') : ''));

CONFIG.STAR3_ENABLED = STAR3_SAVE;
if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
console.log('\nALL PASS');
