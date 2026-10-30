/* 战斗表现配置（js/config/combat-presentation.js）验收：
 *   血条开关契约 / 六塔配色完整性 / 伤害数字参数合理性 / 来源过滤 / 取值 helper
 * 运行：node tools/_test_combat_presentation.cjs
 */
'use strict';
const P = require('../js/config/combat-presentation.js');
const CONFIG = require('../js/config.js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.error('FAIL ' + msg + (extra === undefined ? '' : ' → ' + extra)); } };
const eq = (a, b, msg) => ok(Object.is(a, b), msg, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const HEX = /^#[0-9a-f]{6}$/i;

/* ---------- 1. 版本与结构 ---------- */
ok(typeof P.version === 'string' && P.version.length > 0, '有版本号（便于接线时对表）');
ok(P.enemyBars && typeof P.enemyBars === 'object', 'enemyBars 节存在');
ok(P.damageNumbers && typeof P.damageNumbers === 'object', 'damageNumbers 节存在');

/* ---------- 2. 血条：只做显示，逻辑字段不可删 ---------- */
eq(P.enemyBars.keepLogic, true, '契约锁：血条逻辑（hp/maxHp/delayHp/掉落）与显示开关解耦');
ok(typeof P.enemyBars.show === 'boolean', 'show 为布尔');
ok(typeof P.enemyBars.showBoss === 'boolean' && typeof P.enemyBars.showElite === 'boolean', 'Boss/精英可单独开关');
ok(typeof P.enemyBars.tail === 'boolean', '延迟尾条开关存在');

/* ---------- 3. 六塔配色：与 CONFIG.TOWERS 一一对应 ---------- */
{
  const towers = Object.keys(CONFIG.TOWERS);
  const pal = P.damageNumbers.palette;
  const missing = towers.filter((k) => !pal[k]);
  const extra = Object.keys(pal).filter((k) => towers.indexOf(k) < 0 && k !== 'unknown');
  eq(missing.length, 0, '六塔全部有配色', missing.join(','));
  eq(extra.length, 0, '没有多余塔键（unknown 除外）', extra.join(','));
  const badHex = Object.keys(pal).filter((k) => !HEX.test(pal[k]));
  eq(badHex.length, 0, '所有配色为 #rrggbb', badHex.join(','));
  // 任务单指定的六个表现色
  const want = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
  Object.keys(want).forEach((k) => eq(pal[k], want[k], `${k} 配色 = ${want[k]}`));
  ok(HEX.test(pal.unknown), '未知来源中性色合法');
  ok(pal.unknown !== pal.fire, '未知来源不能用火色（不猜塔）');
}

/* ---------- 4. 伤害数字参数合理性 ---------- */
{
  const d = P.damageNumbers;
  eq(d.enabled, true, '默认开启');
  ok(d.size.base > d.size.dot, '普通伤害字号 > DoT 字号（DoT 更弱化）', `${d.size.base}/${d.size.dot}`);
  ok(d.size.crit >= d.size.big && d.size.big > d.size.base, '暴击 ≥ 大伤害 > 普通');
  ok(d.life.base > 0 && d.life.dot > 0 && d.life.big > 0, '生命周期均为正');
  ok(d.life.dot <= d.life.base, 'DoT 数字存活不长于普通伤害');
  ok(d.rise > 0 && d.drift >= 0, '上飘距离为正、横向漂移非负');
  ok(d.stack.step > 0 && d.stack.max >= 2, '纵向错位参数有效');
  ok(d.merge.window > 0 && Array.isArray(d.merge.kinds) && d.merge.kinds.length > 0, '合并窗口与合并类型有效');
  eq(d.merge.kinds.indexOf('hit') < 0, true, '直伤不在合并类型内（单次爆发要看得清）');
  ok(d.bigAt >= 1, 'bigAt 阈值有效');
  ok(d.format.wanAt >= 1000 && d.format.wanDigits >= 0, '万位格式化参数有效');
  ok(d.maxActive >= 10 && d.maxActive <= 200, '表现上限在合理区间（性能与可读性平衡）', d.maxActive);
  ok(d.fadeIn >= 0 && d.fadeIn < d.life.base, '淡入时长小于生命周期');
}

/* ---------- 5. 来源过滤与取值 helper ---------- */
{
  eq(P.damageNumbers.sources, null, '默认 sources=null 表示全部来源可见（含 DoT / 测试号）');
  eq(P.allowsSource('fire'), true, 'null 配置下任意来源都可见');
  eq(P.allowsSource(undefined), true, '未传来源时也可见（不静默吞掉）');
  eq(P.colorOf('fire'), P.damageNumbers.palette.fire, 'colorOf 取塔色');
  eq(P.colorOf('unknown_key'), P.damageNumbers.palette.unknown, 'colorOf 未知键回退中性色');
  eq(P.colorOf(undefined), P.damageNumbers.palette.unknown, 'colorOf(undefined) 回退中性色');

  const snapshot = P.damageNumbers.sources;
  P.damageNumbers.sources = ['fire'];
  eq(P.allowsSource('fire'), true, '白名单命中可见');
  eq(P.allowsSource('ice'), false, '白名单外不可见');
  P.damageNumbers.sources = snapshot;
}

/* ---------- 6. 与现有 UI 口径一致（不引入第二套塔色） ---------- */
{
  const RENDER_TINT = { fire: '#ff7043', ice: '#7fd4ff', poison: '#7ee2a8', electric: '#f4d03f', boomerang: '#c39bd3', cannon: '#d89e63' };
  const diff = Object.keys(RENDER_TINT).filter((k) => P.TOWER_TINT[k] !== RENDER_TINT[k]);
  eq(diff.length, 0, 'TOWER_TINT 与 UI 现有塔色一致（避免两套色）', diff.join(','));
}

console.log(`\n================ ${pass} PASS / ${fail} FAIL ================`);
process.exit(fail ? 1 : 0);
