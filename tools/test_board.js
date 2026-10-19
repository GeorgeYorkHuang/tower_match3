/**
 * test_board.js —— 棋盘模块单测（node 直接运行）
 * 运行：node tools/test_board.js
 * 覆盖：初始无三消 / 交换判定 / 3·4·5 消 / 连锁 / 无解重排 / 权重分布 / 难度色数
 */
const assert = require('assert');
const Board = require('../js/board.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  [PASS] ${name}`); }
  catch (e) { fail++; console.log(`  [FAIL] ${name}: ${e.message}`); }
}

/* 1. 生成：无初始三消 + 格子满 */
t('init 后无初始三消且满格', () => {
  const b = new Board({ difficulty: 6 });
  b.init();
  assert.strictEqual(b.findMatches().length, 0, '初始棋盘不应有匹配');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) assert.ok(b.grid[r][c], '格子不应为空');
});

/* 2. 交换：不可消交换回滚 */
t('不可消交换回滚且棋盘不变', () => {
  const b = new Board({ difficulty: 6 });
  b.init();
  const before = JSON.stringify(b.grid);
  let tried = false;
  outer:
  for (let r = 0; r < 6; r++) for (let c = 0; c < 11; c++) {
    const a = b.grid[r][c], d = b.grid[r][c + 1];
    b.grid[r][c] = d; b.grid[r][c + 1] = a;
    if (!b.findMatches().length) {
      b.grid[r][c] = a; b.grid[r][c + 1] = d;
      const ret = b.trySwap(r, c, r, c + 1);
      assert.strictEqual(ret.ok, false, '该交换应无效');
      assert.strictEqual(JSON.stringify(b.grid), before, '失败交换不得改变棋盘');
      tried = true;
      break outer;
    }
    b.grid[r][c] = a; b.grid[r][c + 1] = d;
  }
  assert.ok(tried, '至少应存在一个无效交换样本');
});

/* 3. 构造 3/4/5 消：直接写盘验证 findMatches 与 resolve */
t('横/竖 3·4·5 消分组正确', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 12;
  b.grid = Array.from({ length: 6 }, () => Array(12).fill(null));
  // 横 3：row0 col0-2 = red
  b.grid[0][0] = b.grid[0][1] = b.grid[0][2] = 'red';
  // 横 4：row1 col0-3 = blue
  b.grid[1][0] = b.grid[1][1] = b.grid[1][2] = b.grid[1][3] = 'blue';
  // 纵 5：col5 row0-4 = green
  for (let r = 0; r < 5; r++) b.grid[r][5] = 'green';
  const m = b.findMatches();
  const sizes = m.map((g) => g.size).sort((x, y) => x - y);
  assert.deepStrictEqual(sizes, [3, 4, 5], `应检出 3/4/5 消，实际 ${JSON.stringify(sizes)}`);
});

t('4 消 resolve 后全部清除', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 12;
  b.grid = Array.from({ length: 6 }, () => Array(12).fill(null));
  b.grid[2][2] = b.grid[2][3] = b.grid[2][4] = b.grid[2][5] = 'red';
  const r = b.resolve();
  assert.strictEqual(r.cleared, 4);
  assert.ok(r.matches.some((m) => m.size === 4));
});

/* 3.5 L 形合并：横3+竖3 交叉 → 复合组 L5（5 块，非两条独立 3 连） */
t('L 形 5：横3+竖3 交叉合并为一组 L5', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 12;
  b.grid = Array.from({ length: 6 }, () => Array(12).fill(null));
  // 横3：row2 col2-4 = purple；竖3：col2 row0-2 = purple（共享 (2,2)）→ 共 5 块
  b.grid[2][2] = b.grid[2][3] = b.grid[2][4] = 'purple';
  b.grid[0][2] = b.grid[1][2] = 'purple';
  const m = b.findMatches();
  assert.strictEqual(m.length, 1, `应合并为 1 组，实际 ${m.length}`);
  assert.strictEqual(m[0].size, 5, `L5 应 5 块，实际 ${m[0].size}`);
  assert.strictEqual(m[0].shape, 'L5', `形状应为 L5，实际 ${m[0].shape}`);
  const r = b.resolve();
  assert.strictEqual(r.cleared, 5, 'L5 应清除 5 格');
});

/* 3.6 直4 / 直5 形状识别 */
t('直线组形状：直4 / 直5', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 12;
  b.grid = Array.from({ length: 6 }, () => Array(12).fill(null));
  b.grid[1][0] = b.grid[1][1] = b.grid[1][2] = b.grid[1][3] = 'blue';   // 直4
  for (let r = 0; r < 5; r++) b.grid[r][8] = 'green';                    // 直5
  const m = b.findMatches();
  const byShape = (s) => m.find((g) => g.shape === s);
  assert.ok(byShape('4'), '应检出直4');
  assert.ok(byShape('5'), '应检出直5');
  assert.strictEqual(byShape('4').size, 4);
  assert.strictEqual(byShape('5').size, 5);
});

/* 4. 连锁：消除后下落补棋，可能产生后续匹配 */
t('消除触发下落与补棋（存在连锁路径）', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 3;
  // 构造竖直三连在 col0 底部，触发下落补棋
  b.grid = [
    ['red', 'blue', 'green'],
    ['red', 'blue', 'green'],
    ['red', 'blue', 'green'],
    ['green', 'red', 'blue'],
    ['blue', 'green', 'red'],
    ['blue', 'green', 'red'],
  ];
  // col1: blue×3（row0-2）→ 消后 col1 三格下落到 row3-5（blue,green,red）
  const r = b.resolve();
  assert.ok(r.cleared >= 3, '至少清除首轮 3 格');
  // 棋盘无残留匹配（resolve 保证稳态）
  assert.strictEqual(b.findMatches().length, 0, 'resolve 后应无残留匹配');
});

/* 5. 无解检测与重排 */
t('isSolvable 无初始三消时可能为假或真，重排保持无匹配', () => {
  const b = new Board({ difficulty: 6 });
  b.init();
  const s = b.isSolvable();
  assert.strictEqual(typeof s, 'boolean');
  if (!s) {
    b.regen();
    assert.strictEqual(b.findMatches().length, 0, '重排后不得有初始匹配');
    assert.strictEqual(b.stats.regenCount, 1);
  }
});

/* 6. 难度：活跃色数与权重 */
t('难度 4/5/6 活跃色正确', () => {
  const d4 = new Board({ difficulty: 4 }); d4.init();
  const d5 = new Board({ difficulty: 5 }); d5.init();
  const d6 = new Board({ difficulty: 6 }); d6.init();
  const used = (b) => { const s = new Set(); b.grid.forEach((row) => row.forEach((v) => s.add(v))); return s; };
  assert.ok(used(d4).size <= 4 && used(d4).size >= 2, `d4 用色 ${used(d4).size}`);
  assert.ok(used(d5).size <= 5);
  assert.ok(used(d6).size <= 6);
  // 6 色下橙色可能不出现（权重 3%），允许 ≤6；4 色不得出现 purple/orange
  assert.ok(!used(d4).has('purple') && !used(d4).has('orange'), 'd4 不应出现紫/橙');
});

/* 7. 权重分布：6 色均等（用户定稿：各色出现概率平均） */
t('权重分布：6 色均等 ±8%', () => {
  const b = new Board({ difficulty: 6 });
  const counter = { red: 0, blue: 0, green: 0, yellow: 0, purple: 0, orange: 0 };
  for (let i = 0; i < 200; i++) {
    b.init();
    b.grid.forEach((row) => row.forEach((v) => counter[v]++));
  }
  const total = Object.values(counter).reduce((s, x) => s + x, 0);
  const pct = (k) => counter[k] / total;
  for (const k of Object.keys(counter)) {
    assert.ok(Math.abs(pct(k) - 1 / 6) < 0.08, `${k}=${(pct(k) * 100).toFixed(1)}% 偏离均等 >8%`);
  }
  console.log(`      红/绿/蓝/黄/紫/橙 = ${['red', 'green', 'blue', 'yellow', 'purple', 'orange'].map((k) => (pct(k) * 100).toFixed(1) + '%').join(' / ')}`);
});

/* 8. trySwap 有效交换：正常路径能消且返回分组 */
t('有效交换返回匹配分组', () => {
  const b = new Board({ difficulty: 6 });
  b.rows = 6; b.cols = 12;
  // 构造：row3 col0-2=red，row2 col2=green；交换 row2col2(row3下方) 使纵向? 简单构造：
  // row3: red red red；将 row2 col0 从其它色换成 red → 纵向 red×? 需要 row0/row1 也 red。
  // 改用最简单：row0 col0-2=red，row1 col0=red → 交换 row1 col0 与 row1 col1 不影响。
  // 直接构造可消交换：row0: red red green；row1 col2 = red → 交换 row0col2(row1col2) 形成横3。
  b.grid = Array.from({ length: 6 }, () => Array(12).fill('blue'));
  b.grid[0][0] = 'red'; b.grid[0][1] = 'red'; b.grid[0][2] = 'green';
  b.grid[1][2] = 'red';
  const ret = b.trySwap(0, 2, 1, 2);
  assert.strictEqual(ret.ok, true, '交换应有效');
  assert.ok(ret.resolved.matches.some((m) => m.size >= 3));
  assert.ok(ret.resolved.steps >= 1);
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
