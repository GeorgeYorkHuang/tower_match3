/* 连消全格弹道模块（js/skills/chain-attacks.js）验收：
 *   阈值 / 全格覆盖 / 同步去重 / 跨步重发 / 彩虹无色 / 未出战塔充能回退 /
 *   视觉预算不丢伤害 / 行优先确定序 / 输入不可变 / 不消耗逻辑随机数 / 契约锁
 * 运行：node tools/_test_chain_attacks.cjs
 */
'use strict';
const CA = require('../js/skills/chain-attacks.js');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { if (cond) pass++; else { fail++; console.error('FAIL ' + msg + (extra === undefined ? '' : ' → ' + extra)); } };
const eq = (a, b, msg) => ok(Object.is(a, b), msg, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const S = (cells, color, extra) => Object.assign({ clearedDetails: cells.map(([r, c]) => ({ r, c, color })) }, extra || {});

/* ---------- 1. 阈值：第 4 组起算 ---------- */
{
  const steps = [S([[0, 0], [0, 1], [0, 2]], 'red'), S([[1, 0], [1, 1], [1, 2]], 'red'), S([[2, 0], [2, 1], [2, 2]], 'red')];
  const p = CA.plan({ steps });
  eq(p.shots.length, 0, '前 3 组不发射连消弹道');
  eq(p.shotsByStep.length, 3, 'shotsByStep 与 steps 等长（逐级动画可按索引取）');
  ok(p.shotsByStep.every((a) => a.length === 0), '前 3 组各级数组为空');

  const p4 = CA.plan({ steps: steps.concat([S([[3, 0], [3, 1], [3, 2]], 'red')]) });
  eq(p4.shots.length, 3, '第 4 组发射 3 发');
  eq(p4.shotsByStep[3].length, 3, '第 4 级数组含 3 发（动画阶段按级取）');
  ok(p4.shots.every((s) => s.group === 4), '组号标记为 4');
}

/* ---------- 2. 三消 / 四消 / 五消 全格覆盖 ---------- */
{
  const p = CA.plan({ steps: [S([[0, 0], [0, 1], [0, 2]], 'red'), S([[0, 0], [0, 1], [0, 2]], 'red'),
    S([[0, 0], [0, 1], [0, 2]], 'red'), S([[2, 3], [2, 4], [2, 5], [2, 6]], 'blue'),
    S([[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]], 'green'), S([[6, 0], [6, 1], [6, 2], [6, 3], [6, 4]], 'red')] });
  eq(p.shots.length, 14, '第 4~6 组全部格都发射（4+5+5=14，前 3 组不计）', p.stats);
  eq(p.shots.filter((s) => s.towerKey === 'ice').length, 4, '蓝 4 消 → 冰塔 4 发');
  eq(p.shots.filter((s) => s.towerKey === 'poison').length, 5, '绿 5 消 → 毒塔 5 发');
  eq(p.shots.filter((s) => s.towerKey === 'fire').length, 5, '红 5 消 → 火塔 5 发');
}

/* ---------- 3. 同步内去重（匹配组 ∩ 爆炸波及） ---------- */
{
  const step = {
    clearedDetails: [{ r: 1, c: 1, color: 'red' }, { r: 1, c: 2, color: 'red' }, { r: 1, c: 1, color: 'red' }, { r: 1, c: 3, color: null }],
  };
  const p = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), step] });
  eq(p.shots.length, 3, '重复格只发一次（1,1 重复记录被去重）');
  eq(p.perStep[p.perStep.length - 1].duplicate, 1, '去重计数 = 1');
  eq(p.stats.duplicate, 1, 'stats.duplicate = 1');
  ok(p.shots.every((s) => !(s.row === 1 && s.col === 1) || s.seq === p.shots[0].seq), '去重保留首次出现的那条');
}

/* ---------- 4. 同格在后续另一步可再次发射 ---------- */
{
  const p = CA.plan({
    steps: [S([], 'red'), S([], 'red'), S([], 'red'),
      S([[5, 5], [5, 6], [5, 7]], 'red'), S([[5, 5], [5, 6], [5, 7]], 'red')],
  });
  eq(p.shots.length, 6, '同一批格子在第 4、5 组各发 3 发（跨步可重发）');
  eq(p.shots.filter((s) => s.row === 5 && s.col === 5).length, 2, '(5,5) 两个不同步骤各一发');
}

/* ---------- 5. 彩虹自身无色：默认跳过，不默认成红塔 ---------- */
{
  const rainbowStep = {
    matches: [{ cells: [[0, 0], [0, 1], [0, 2], [0, 3]], rainbow: true, color: 'red' }],
    clearedDetails: [{ r: 0, c: 0, color: 'red' }, { r: 0, c: 1, color: 'red' }, { r: 0, c: 2, color: 'red' }, { r: 0, c: 3, color: 'red' }],
  };
  const base = [S([], 'red'), S([], 'red'), S([], 'red')];
  const pSkip = CA.plan({ steps: base.concat([rainbowStep]) });
  eq(pSkip.shots.length, 0, '彩虹组默认不发弹（不猜颜色）');
  eq(pSkip.stats.skippedRainbow, 4, '跳过计数 = 4 格');

  const pNeutral = CA.plan({ steps: base.concat([rainbowStep]), policy: { rainbow: 'neutral' } });
  eq(pNeutral.shots.length, 4, 'policy=neutral 时彩虹 4 格发通用表现弹');
  ok(pNeutral.shots.every((s) => s.kind === 'neutral' && s.color === null && s.towerKey === null), '通用表现弹无塔色/无塔归属');
}

/* ---------- 6. 未出战颜色塔 / 未知颜色 → 保留旧充能回退 ---------- */
{
  const base = [S([], 'red'), S([], 'red'), S([], 'red')];
  const step = S([[0, 0], [0, 1], [0, 2]], 'blue');
  const pCharge = CA.plan({ steps: base.concat([step]), activeTowers: ['fire', 'poison'] });
  eq(pCharge.shots.length, 3, '未出战蓝塔的格子仍然产出条目（不静默丢）');
  ok(pCharge.shots.every((s) => s.kind === 'charge' && s.towerKey === null), 'kind=charge（由 Run 侧回退充能，保持旧行为）');
  eq(pCharge.stats.charge, 3, 'charge 计数 = 3');

  const pSkip = CA.plan({ steps: base.concat([step]), activeTowers: ['fire'], policy: { inactiveColor: 'skip' } });
  eq(pSkip.shots.length, 0, 'policy=skip 时未出战颜色不发射');

  const pUnknown = CA.plan({ steps: base.concat([{ clearedDetails: [{ r: 2, c: 2, color: null }, { r: 2, c: 3, color: 'pink' }] }]) });
  eq(pUnknown.shots.length, 2, '未知颜色同样产出条目');
  ok(pUnknown.shots.every((s) => s.kind === 'charge'), '未知颜色走 charge 策略（不静默丢、不乱猜塔）');
}

/* ---------- 7. 视觉预算：只打标记，不丢真实伤害 ---------- */
{
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 30; c++) cells.push([r, c]);   // 150 格
  const p = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), S(cells, 'red')] });
  eq(p.shots.length, 150, '150 格全部产出条目（伤害不能静默丢）');
  eq(p.shots.filter((s) => s.overflow).length, 30, '超出 120 预算的 30 条标记 overflow');
  eq(p.overflowBatches.length, 1, '产生 1 个溢出批次');
  eq(p.overflowBatches[0].count, 30, '溢出批次计数 = 30（供聚合成一次齐射表现）');
  eq(p.stats.overflow, 30, 'stats.overflow = 30');
}

/* ---------- 8. 确定序：行优先，与输入顺序无关 ---------- */
{
  const shuffled = { clearedDetails: [{ r: 3, c: 4, color: 'red' }, { r: 1, c: 2, color: 'red' }, { r: 3, c: 1, color: 'red' }, { r: 1, c: 9, color: 'red' }] };
  const ordered = { clearedDetails: [{ r: 1, c: 2, color: 'red' }, { r: 1, c: 9, color: 'red' }, { r: 3, c: 1, color: 'red' }, { r: 3, c: 4, color: 'red' }] };
  const a = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), shuffled] });
  const b = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), ordered] });
  eq(JSON.stringify(a.shots.map((s) => [s.row, s.col])), JSON.stringify(b.shots.map((s) => [s.row, s.col])), '不同输入顺序得到同一弹道序列');
  eq(a.shots.map((s) => s.row + ',' + s.col).join('|'), '1,2|1,9|3,1|3,4', '行优先排序');
}

/* ---------- 9. 几何：格心坐标 ---------- */
{
  const p = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), S([[0, 0], [6, 10]], 'red')] });
  const [a, b] = p.shots;
  eq(a.x, 45 + 0 * 60 + 30, 'x = originX + col*cell + cell/2');
  eq(a.y, 1089 + 0 * 60 + 30, 'y = originY + row*cell + cell/2');
  eq(b.x, 675, '末列格心 x = 675');
  eq(b.y, 1479, '末行格心 y = 1479');

  const p2 = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), S([[1, 1]], 'red')], layout: { cols: 7, cell: 96, originY: 1200 } });
  eq(p2.shots[0].x, Math.round((750 - 7 * 96) / 2) + 96 + 48, '自定义布局（不传 originX 时按 cols/cell 居中推导）');
  eq(p2.shots[0].y, 1200 + 96 + 48, '自定义 originY 生效');
}

/* ---------- 10. 输入不可变 + 不消耗随机数 ---------- */
{
  const input = { steps: [S([], 'red'), S([], 'red'), S([], 'red'), S([[0, 0], [0, 1], [0, 2]], 'red')], activeTowers: ['fire'] };
  const snapshot = JSON.stringify(input);
  const orig = Math.random;
  let rngCalls = 0;
  Math.random = () => { rngCalls++; return orig(); };
  CA.plan(input);
  CA.plan(input);
  Math.random = orig;
  eq(rngCalls, 0, 'plan 不调用 Math.random（不打乱逻辑 RNG 顺序）');
  eq(JSON.stringify(input), snapshot, 'plan 不修改入参（stepList 快照只读）');
}

/* ---------- 11. 契约锁 ---------- */
{
  const inv = CA.plan({ steps: [] }).invariants;
  ok(inv.replacesLegacyChainAttack === true, '契约：替换旧连消攻击');
  ok(inv.keepsExp === true, '契约：保留经验');
  ok(inv.keepsCharge === true, '契约：保留充能');
  ok(inv.dedupePerStep === true && inv.crossStepRefire === true, '契约：步内去重 + 跨步可重发');
  ok(inv.rngFree === true && inv.damageAtHitOnly === true, '契约：无随机数 + 仅命结算');
  eq(CA.DEFAULT_START_GROUP, 4, '默认阈值沿用现行第 4 组（不夹带改门槛）');
}

/* ---------- 12. stats 自洽 ---------- */
{
  const p = CA.plan({ steps: [S([], 'red'), S([], 'red'), S([], 'red'), S([[0, 0], [0, 1], [0, 2], [0, 3]], 'red')] });
  eq(p.stats.emitted, p.shots.length, 'stats.emitted = shots.length');
  eq(p.stats.cleared, 4, 'stats.cleared = 4');
  eq(p.perStep.length, 1, 'perStep 只含计入连消的步骤');
  eq(p.perStep[0].emitted, 4, 'perStep.emitted = 4');
}

console.log(`\n================ ${pass} PASS / ${fail} FAIL ================`);
process.exit(fail ? 1 : 0);
