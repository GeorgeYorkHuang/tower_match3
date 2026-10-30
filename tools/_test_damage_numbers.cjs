/* 伤害数字表现模块（js/game/fx/damage-numbers.js）验收：
 *   格式化 / 来源配色 / 生命周期 / DoT 合并窗口 / 纵向错位 / 表现上限 /
 *   不消耗 Math.random / 确定性 / 绘制契约
 * 运行：node tools/_test_damage_numbers.cjs
 */
'use strict';
const DN = require('../js/game/fx/damage-numbers.js');
const PRES = require('../js/config/combat-presentation.js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.error('FAIL ' + msg + (extra === undefined ? '' : ' → ' + extra)); } };
const eq = (a, b, msg) => ok(Object.is(a, b), msg, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

/* ---------- 1. 数字格式化 ---------- */
eq(DN.formatAmount(0), '1', '0 伤害不显示 0（最小 1）');
eq(DN.formatAmount(0.4), '1', '0.4 四舍五入到 1');
eq(DN.formatAmount(7), '7', '个位数原样');
eq(DN.formatAmount(1234), '1234', '万以下原样（不缩写成 1.2k）');
eq(DN.formatAmount(9999), '9999', '9999 不转万');
eq(DN.formatAmount(12000), '1.2万', '12000 → 1.2万');
eq(DN.formatAmount(999999), '100万', '近百万取整（不出现 100.0万）');
eq(DN.formatAmount(12345678), '1235万', '千万级取整');
eq(DN.formatAmount(1e9), '9999万+', '超大值兜底上限文案');

/* ---------- 2. 来源配色 ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 1, x: 100, y: 200, sourceKey: 'fire', amount: 30, kind: 'hit' });
  dn.push({ enemyId: 2, x: 100, y: 200, sourceKey: 'nonsense', amount: 30, kind: 'hit' });
  const v = dn.visible();
  eq(v[0].color, PRES.damageNumbers.palette.fire, '火塔用火色 #ff7043');
  eq(v[1].color, PRES.damageNumbers.palette.unknown, '未知来源用中性色（不猜塔）');
}

/* ---------- 3. 生命周期 ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 1, x: 100, y: 200, sourceKey: 'ice', amount: 10, kind: 'hit' });
  eq(dn.visible().length, 1, '入队即可见');
  dn.step(PRES.damageNumbers.life.base * 0.5);
  eq(dn.visible().length, 1, '半程仍可见');
  dn.step(PRES.damageNumbers.life.base * 0.6);
  eq(dn.visible().length, 0, '超过生命周期后移除');
  eq(dn.stats().expired, 1, 'expired 计数 = 1');
}

/* ---------- 4. 上飘与淡出 ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 1, x: 100, y: 500, sourceKey: 'poison', amount: 10, kind: 'hit' });
  const y0 = dn.visible()[0].y;
  dn.step(PRES.damageNumbers.life.base * 0.5);
  const mid = dn.visible()[0];
  ok(mid.y < y0, '数值随时间向上飘', `y0=${y0} mid=${mid.y}`);
  ok(mid.alpha <= 1 && mid.alpha >= 0, 'alpha 在 [0,1]', mid.alpha);
  dn.step(PRES.damageNumbers.life.base * 0.35);
  ok(dn.visible()[0].alpha < 1, '末段（>75% 生命周期）淡出');
}

/* ---------- 5. DoT 合并（短窗口内同敌人同来源） ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 7, x: 10, y: 10, sourceKey: 'fire', amount: 5, kind: 'dot' });
  const r = dn.push({ enemyId: 7, x: 10, y: 10, sourceKey: 'fire', amount: 5, kind: 'dot' });
  eq(r.merged, true, '窗口内同敌人同来源 DoT 合并');
  eq(dn.visible().length, 1, '只留一条视觉');
  eq(dn.visible()[0].text, '10', '合并后显示累计伤害 10');
  eq(dn.stats().merged, 1, 'merged 计数 = 1');

  // 不同来源不合并
  dn.push({ enemyId: 7, x: 10, y: 10, sourceKey: 'poison', amount: 5, kind: 'dot' });
  eq(dn.visible().length, 2, '不同来源不合并');

  // 超出窗口后不合并
  const dn2 = DN.create();
  dn2.push({ enemyId: 8, x: 10, y: 10, sourceKey: 'fire', amount: 5, kind: 'dot' });
  dn2.step(PRES.damageNumbers.merge.window + 0.01);
  const r2 = dn2.push({ enemyId: 8, x: 10, y: 10, sourceKey: 'fire', amount: 5, kind: 'dot' });
  eq(r2.merged, false, '超出合并窗口后各自显示');
  eq(dn2.visible().length, 2, '两条独立条目');

  // 直伤不合并
  const dn3 = DN.create();
  dn3.push({ enemyId: 9, x: 10, y: 10, sourceKey: 'fire', amount: 30, kind: 'hit' });
  const r3 = dn3.push({ enemyId: 9, x: 10, y: 10, sourceKey: 'fire', amount: 40, kind: 'hit' });
  eq(r3.merged, false, '直伤不合并（避免看不清单次爆发）');
  eq(dn3.visible().length, 2, '两次直伤两条数字');
}

/* ---------- 6. 同敌人纵向错位 ---------- */
{
  const dn = DN.create();
  for (let i = 0; i < 3; i++) dn.push({ enemyId: 5, x: 100, y: 400, sourceKey: 'cannon', amount: 12 + i, kind: 'hit' });
  const v = dn.visible();
  const offs = v.map((it) => Math.round((400 - it.y) / PRES.damageNumbers.stack.step));
  eq(offs.join(','), '0,1,2', '同敌人三条按 stack.step 逐条上移');
  const dn2 = DN.create();
  for (let i = 0; i < 8; i++) dn2.push({ enemyId: 6, x: 100, y: 400, sourceKey: 'cannon', amount: 10, kind: 'hit' });
  const maxOff = (400 - dn2.visible()[7].y) / PRES.damageNumbers.stack.step;
  ok(maxOff <= PRES.damageNumbers.stack.max - 1 + 1e-6, '错位不超过 stack.max 上限', maxOff);
}

/* ---------- 7. 表现上限：只丢表现，不丢结算 ---------- */
{
  const dn = DN.create();
  const cap = PRES.damageNumbers.maxActive;
  for (let i = 0; i < cap + 25; i++) dn.push({ enemyId: i, x: 10, y: 10, sourceKey: 'fire', amount: 10, kind: 'hit' });
  eq(dn.visible().length, cap, '活跃条目不超过 maxActive');
  eq(dn.stats().dropped, 25, '丢弃最旧 25 条并计数');
  eq(dn.stats().pushed, cap + 25, 'pushed 仍按真实事件计数（不影响逻辑层伤害）');
}

/* ---------- 8. 不消耗 Math.random + 确定性 ---------- */
{
  const orig = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return orig(); };
  const a = DN.create();
  const b = DN.create();
  for (let i = 0; i < 20; i++) {
    const ev = { enemyId: i % 3, x: 100 + i, y: 300, sourceKey: 'boomerang', amount: 11 + i, kind: 'hit' };
    a.push(ev); b.push(ev);
    a.step(0.05); b.step(0.05);
  }
  Math.random = orig;
  eq(calls, 0, 'push/step 不调用 Math.random（不打乱逻辑 RNG 顺序）');
  eq(JSON.stringify(a.visible()), JSON.stringify(b.visible()), '同输入两次运行的可见条目完全一致（确定性漂移）');
}

/* ---------- 9. 绘制契约 / clear ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 1, x: 50, y: 60, sourceKey: 'electric', amount: 88, kind: 'hit' });
  const calls = [];
  const ctx = { globalAlpha: 1 };
  const n = dn.drawTo(ctx, { text: (c, str, x, y, size, color, align) => calls.push({ str, x, y, size, color, align }) });
  eq(n, 1, 'drawTo 返回绘制条数');
  eq(calls.length, 1, '调用注入的 text 一次');
  eq(calls[0].str, '88', '文案 = 格式化结果');
  eq(calls[0].color, PRES.damageNumbers.palette.electric, '颜色 = 电塔色');
  eq(calls[0].align, 'center', '居中对齐');
  eq(ctx.globalAlpha, 1, '绘制后恢复 globalAlpha');
  eq(dn.drawTo(ctx, {}), 0, '未注入 text 时静默跳过（不抛错）');

  dn.clear();
  eq(dn.visible().length, 0, 'clear 清空');
  eq(dn.stats().active, 0, 'stats.active = 0');
}

/* ---------- 10. 死亡边界：0/负伤害不显示 0 ---------- */
{
  const dn = DN.create();
  dn.push({ enemyId: 1, x: 0, y: 0, sourceKey: 'ice', amount: 0, kind: 'hit' });
  dn.push({ enemyId: 1, x: 0, y: 0, sourceKey: 'ice', amount: -5, kind: 'hit' });
  const v = dn.visible();
  ok(v.every((it) => it.text === '1'), '0 / 负数一律显示为 1（不出现 0 或负号）', v.map((it) => it.text));
}

console.log(`\n================ ${pass} PASS / ${fail} FAIL ================`);
process.exit(fail ? 1 : 0);
