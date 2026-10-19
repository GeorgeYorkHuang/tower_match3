/**
 * board.js —— 三消棋盘核心逻辑（纯逻辑，无渲染依赖）
 * =====================================================================
 * 数据约定：
 *   grid[row][col] = 颜色 key（'red'|'blue'|'green'|'yellow'|'purple'|'orange'）或 null
 *   row 0 为棋盘顶部（靠塔位区），col 0 为左侧
 *   cols=12, rows=6（72 格，60×60rpx/格）
 *
 * 依赖：config.js（唯一数值源）
 * 能力：加权生成（难度活跃色/无初始三消）、交换判定、匹配分组（含 L/T 形合并）、
 *       消除→重力下落→补棋→连锁、无解检测与重排
 * 使用：new Board(cfg) → init() → trySwap(r1,c1,r2,c2)
 *       trySwap 返回 {ok, resolved, steps}；resolved.matches = [{size, cells, shape}]
 *       shape：'3'|'4'(直4)|'L5'(L形5)|'5'(直5)|'6+'
 * 经验计算不在此模块（由 run 层按 EXP 形状倍率累计）。
 */
const CONFIG = require('./config.js');

function Board(cfg) {
  cfg = cfg || {};
  this.cols = cfg.cols || CONFIG.LAYOUT.boardCell.cols;   // 12
  this.rows = cfg.rows || CONFIG.LAYOUT.boardCell.rows;   // 6
  this.difficulty = cfg.difficulty || CONFIG.DIFFICULTY.default; // 4|5|6
  this.activeColors = (CONFIG.DIFFICULTY.activeColors[this.difficulty] || []).slice();
  this.weights = normalizeWeight(CONFIG.COLOR_WEIGHT, this.activeColors);
  this.grid = null;
  this.stats = { genCount: 0, regenCount: 0, cascadeTotal: 0, swapCount: 0 };
}

/* ---------- 工具 ---------- */

function normalizeWeight(weightMap, activeKeys) {
  const total = activeKeys.reduce((s, k) => s + (weightMap[k] || 0), 0);
  const out = {};
  activeKeys.forEach((k) => { out[k] = (weightMap[k] || 0) / total; });
  return out;
}

/** 按权重抽一个活跃颜色 */
Board.prototype.pickColor = function pickColor(exclude) {
  exclude = exclude || {};
  let keys = this.activeColors.filter((k) => !exclude[k]);
  if (!keys.length) keys = this.activeColors; // 极端兜底：全部排除时回到全集
  const w = this.weights;
  let r = Math.random() * keys.reduce((s, k) => s + w[k], 0);
  for (let i = 0; i < keys.length; i++) {
    r -= w[keys[i]];
    if (r <= 0) return keys[i];
  }
  return keys[keys.length - 1];
};

/** 相邻性：仅上下左右 */
Board.prototype.adjacent = function adjacent(r1, c1, r2, c2) {
  const dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
};

/** 生成新棋盘（无初始三消） */
Board.prototype.genBoard = function genBoard() {
  const g = [];
  for (let r = 0; r < this.rows; r++) {
    g[r] = [];
    for (let c = 0; c < this.cols; c++) g[r][c] = this._genCell(g, r, c);
  }
  return g;
};

/** 单个格子生成：避开左2/上2 造成的三连 */
Board.prototype._genCell = function _genCell(g, r, c) {
  const exclude = {};
  if (c >= 2 && g[r][c - 1] === g[r][c - 2]) exclude[g[r][c - 1]] = true;
  if (r >= 2 && g[r - 1][c] === g[r - 2][c]) exclude[g[r - 1][c]] = true;
  return this.pickColor(exclude);
};

/** 初始化棋盘 */
Board.prototype.init = function init() {
  this.grid = this.genBoard();
  this.stats.genCount++;
  return this;
};

/* ---------- 匹配 ---------- */

/**
 * 找出全部匹配组：横向/纵向连续 ≥3，相交组（L/T 形）合并为复合组。
 * 返回 [{size, cells, shape}]：shape ∈ '3'(三连) | '4'(直4) | 'L5'(L形5) | '5'(直5) | '6+'(超大)
 */
Board.prototype.findMatches = function findMatches() {
  const h = [], v = [];
  // 横向
  for (let r = 0; r < this.rows; r++) {
    let c = 0;
    while (c < this.cols) {
      const color = this.grid[r][c];
      if (!color) { c++; continue; }
      let end = c;
      while (end + 1 < this.cols && this.grid[r][end + 1] === color) end++;
      if (end - c + 1 >= 3) {
        const cells = [];
        for (let i = c; i <= end; i++) cells.push([r, i]);
        h.push({ cells, color });
      }
      c = end + 1;
    }
  }
  // 纵向
  for (let c = 0; c < this.cols; c++) {
    let r = 0;
    while (r < this.rows) {
      const color = this.grid[r][c];
      if (!color) { r++; continue; }
      let end = r;
      while (end + 1 < this.rows && this.grid[end + 1][c] === color) end++;
      if (end - r + 1 >= 3) {
        const cells = [];
        for (let i = r; i <= end; i++) cells.push([i, c]);
        v.push({ cells, color });
      }
      r = end + 1;
    }
  }
  return mergeCross(h, v);
};

/** 相交合并：横/纵组共享格 → 合并为复合组（L/T 形），并标形状 */
function mergeCross(h, v) {
  const groups = h.map((g) => ({ cells: g.cells.slice(), dir: 'h' }))
    .concat(v.map((g) => ({ cells: g.cells.slice(), dir: 'v' })));
  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (shareCell(groups[i].cells, groups[j].cells)) {
          const a = groups[i].cells;
          const merged = a.concat(groups[j].cells.filter(([x, y]) => !a.some(([u, w]) => u === x && w === y)));
          groups[i] = { cells: merged, dir: 'x' };
          groups.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return groups.map((g) => {
    const size = g.cells.length;
    // 复合组（含横+纵交叉）= L/T 形；直线组按长度分类
    const shape = (g.dir === 'x') ? (size >= 6 ? '6+' : 'L5') : (size >= 6 ? '6+' : String(size));
    return { size, cells: g.cells, shape };
  });
}

/** 两个格组是否共享至少一个格子 */
function shareCell(a, b) {
  for (let i = 0; i < a.length; i++) {
    const [r, c] = a[i];
    for (let j = 0; j < b.length; j++) {
      if (b[j][0] === r && b[j][1] === c) return true;
    }
  }
  return false;
}

/** 标记矩阵（用于去重/清空） */
Board.prototype._markMatrix = function _markMatrix(val) {
  const m = [];
  for (let r = 0; r < this.rows; r++) { m[r] = []; for (let c = 0; c < this.cols; c++) m[r][c] = val; }
  return m;
};

/* ---------- 消除连锁 ---------- */

/**
 * 执行一轮消除：清空匹配格 → 重力下落 → 顶部补棋 → 重复直到无匹配
 * 返回 {matches: [组...], steps: 连锁步数, cleared: 清除格总数,
 *        stepList: [{matches, clearedCells, gridAfter}] 每步中间快照（供逐级连锁动画）}
 */
Board.prototype.resolve = function resolve() {
  const all = []; let steps = 0, cleared = 0;
  const stepList = [];
  for (;;) {
    const matches = this.findMatches();
    if (!matches.length) break;
    steps++;
    // 记录本步匹配组颜色（清空前取色，避免连锁后棋盘移动导致取错色）
    matches.forEach((m) => { m.color = this.grid[m.cells[0][0]][m.cells[0][1]]; });
    const toClear = this._markMatrix(false);
    matches.forEach((m) => m.cells.forEach(([r, c]) => { toClear[r][c] = true; }));
    const clearedCells = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (toClear[r][c]) { this.grid[r][c] = null; cleared++; clearedCells.push([r, c]); }
    this.gravity();
    stepList.push({ matches, clearedCells, gridAfter: this.grid.map((row) => row.slice()) });
    all.push(...matches);
  }
  this.stats.cascadeTotal += steps;
  return { matches: all, steps, cleared, stepList };
};

/** 重力下落 + 顶部补棋（补棋避开与已落定格构成三连） */
Board.prototype.gravity = function gravity() {
  for (let c = 0; c < this.cols; c++) {
    // 下落：从下往上压缩非空格
    let write = this.rows - 1;
    for (let r = this.rows - 1; r >= 0; r--) {
      if (this.grid[r][c] !== null) {
        if (write !== r) { this.grid[write][c] = this.grid[r][c]; this.grid[r][c] = null; }
        write--;
      }
    }
    // 顶部补棋：从 write 位置向上逐格填
    for (let r = write; r >= 0; r--) this.grid[r][c] = this._genDropCell(c, r);
  }
};

/** 补棋生成：避开下方两格、以及左右已定格构成的三连 */
Board.prototype._genDropCell = function _genDropCell(c, r) {
  const exclude = {};
  // 下两格（已落定）
  if (r + 2 < this.rows && this.grid[r + 1][c] === this.grid[r + 2][c]) exclude[this.grid[r + 1][c]] = true;
  // 左两格 / 右两格
  if (c >= 2 && this.grid[r][c - 1] === this.grid[r][c - 2]) exclude[this.grid[r][c - 1]] = true;
  if (c + 2 < this.cols && this.grid[r][c + 1] === this.grid[r][c + 2]) exclude[this.grid[r][c + 1]] = true;
  // 左右各一（与自身构成 左-自-右）
  if (c >= 1 && c + 1 < this.cols && this.grid[r][c - 1] && this.grid[r][c - 1] === this.grid[r][c + 1])
    exclude[this.grid[r][c - 1]] = true;
  return this.pickColor(exclude);
};

/* ---------- 交换 ---------- */

/**
 * 尝试交换两格：可消则执行并返回结果，不可消回滚
 * @returns {{ok:boolean, resolved?:{matches,steps,cleared}}}
 */
Board.prototype.trySwap = function trySwap(r1, c1, r2, c2) {
  if (!this.inRange(r1, c1) || !this.inRange(r2, c2)) return { ok: false };
  if (!this.adjacent(r1, c1, r2, c2)) return { ok: false };
  const a = this.grid[r1][c1], b = this.grid[r2][c2];
  if (a === null || b === null) return { ok: false };
  this.grid[r1][c1] = b; this.grid[r2][c2] = a;
  const matches = this.findMatches();
  if (!matches.length) {
    this.grid[r1][c1] = a; this.grid[r2][c2] = b; // 回滚
    return { ok: false };
  }
  this.stats.swapCount++;
  const resolved = this.resolve();
  return { ok: true, resolved };
};

Board.prototype.inRange = function inRange(r, c) {
  return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
};

/** 取格子颜色（越界返回 null） */
Board.prototype.colorAt = function colorAt(r, c) {
  return this.inRange(r, c) ? this.grid[r][c] : null;
};

/* ---------- 无解检测与重排 ---------- */

/** 是否存在至少一个可消交换（暴力：72 格相邻对） */
Board.prototype.isSolvable = function isSolvable() {
  for (let r = 0; r < this.rows; r++) {
    for (let c = 0; c < this.cols; c++) {
      const pairs = [];
      if (c + 1 < this.cols) pairs.push([r, c, r, c + 1]);       // 右
      if (r + 1 < this.rows) pairs.push([r, c, r + 1, c]);       // 下
      for (const [r1, c1, r2, c2] of pairs) {
        const a = this.grid[r1][c1], b = this.grid[r2][c2];
        if (a === null || b === null) continue;
        this.grid[r1][c1] = b; this.grid[r2][c2] = a;
        const has = this.findMatches().length > 0;
        this.grid[r1][c1] = a; this.grid[r2][c2] = b; // 回滚
        if (has) return true;
      }
    }
  }
  return false;
};

/** 无解时重排（重新生成无初始三消棋盘） */
Board.prototype.regen = function regen() {
  this.grid = this.genBoard();
  this.stats.regenCount++;
  return this;
};

module.exports = Board;
