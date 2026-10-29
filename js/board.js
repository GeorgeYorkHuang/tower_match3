/**
 * board.js —— 三消棋盘核心逻辑（纯逻辑，无渲染依赖）
 * =====================================================================
 * 数据约定：
 *   grid[row][col] = 颜色 key（'red'|'blue'|'green'|'yellow'|'purple'|'orange'）或 null
 *   v5.2 特殊方块：格子值为 { c: 颜色key|null, s: 'row'|'col'|'cross'|'split'|'rand'|'rainbow', sub?: true }
 *     （sub=true 为分裂雷次级块，爆炸不再派生）
 *   row 0 为棋盘顶部（靠塔位区），col 0 为左侧
 *
 * 依赖：config.js（唯一数值源）
 * 能力：加权生成（难度活跃色/无初始三消）、交换判定、匹配分组（含 L/T 形合并）、
 *       特殊方块（四连技遗留/五连技面板/彩虹块）、消除→重力下落→补棋→连锁、无解检测与重排
 * 使用：new Board(cfg) → init() → trySwap(r1,c1,r2,c2)
 *       trySwap 返回 {ok, resolved, steps}；resolved.matches = [{size, cells, shape}]
 *       shape：'3'|'4'(直4)|'L5'(L形5)|'5'(直5)|'6+'
 * 特殊方块挂钩：cfg.hooks = { onMatch4(cells, kept, color, step), onMatch5(cells, color, shape, step) }
 *       onMatch4 返回四连技类型 id（config.MATCH_SKILL.match4[].id）；onMatch5 返回 'rainbow'|'scan'|'recolor'|'seed'
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
  this.hooks = cfg.hooks || {};
  this.stats = { genCount: 0, regenCount: 0, cascadeTotal: 0, swapCount: 0 };
}

/* ---------- 特殊方块工具（v5.2） ---------- */

/** 格子颜色值：普通块返回自身，特殊块返回其 c 字段 */
function cellColor(v) { return v !== null && typeof v === 'object' ? v.c : v; }
/** 是否特殊块 */
function isSpecial(v) { return v !== null && typeof v === 'object'; }
/** 特殊块类型 */
function specialType(v) { return isSpecial(v) ? v.s : null; }
/** 特殊块是否次级（分裂雷） */
function isSubSpecial(v) { return isSpecial(v) && v.sub === true; }
/** 生成特殊块格子值 */
Board.prototype._makeSpecial = function _makeSpecial(color, s, sub) {
  const o = { c: color, s: s };
  if (sub) o.sub = true;
  return o;
};
/** 随机特殊爆炸块类型（四连技 5 款随机抽取，用于随机播种/乱数派生） */
Board.prototype._randomSpecialId = function _randomSpecialId() {
  const ids = CONFIG.MATCH_SKILL.match4.map((m) => m.id);
  return ids[Math.floor(Math.random() * ids.length)];
};


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
 * 找出全部匹配组：横向/纵向连续 ≥3（普通块按颜色值比较，特殊块不参与普通 run），
 * 相交组（L/T 形）合并为复合组；彩虹块单独成组（配同色两格）。
 * 返回 [{size, cells, color, shape, rainbow?}]：shape ∈ '3' | '4' | 'L5' | '5' | '6+'
 */
Board.prototype.findMatches = function findMatches() {
  const h = [], v = [];
  // 横向：特殊块（除无色彩虹块）按颜色值参与 run，占据一格
  for (let r = 0; r < this.rows; r++) {
    let c = 0;
    while (c < this.cols) {
      const v0 = this.grid[r][c];
      if (v0 === null) { c++; continue; }
      const color = cellColor(v0);
      if (!color || specialType(v0) === 'rainbow') { c++; continue; }  // 无色/彩虹块不参与普通 run
      let end = c;
      while (end + 1 < this.cols) {
        const nv = this.grid[r][end + 1];
        if (nv === null || !cellColor(nv)) break;
        if (specialType(nv) === 'rainbow') break;
        if (cellColor(nv) !== color) break;
        end++;
      }
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
      const v0 = this.grid[r][c];
      if (v0 === null) { r++; continue; }
      const color = cellColor(v0);
      if (!color || specialType(v0) === 'rainbow') { r++; continue; }
      let end = r;
      while (end + 1 < this.rows) {
        const nv = this.grid[end + 1][c];
        if (nv === null || !cellColor(nv)) break;
        if (specialType(nv) === 'rainbow') break;
        if (cellColor(nv) !== color) break;
        end++;
      }
      if (end - r + 1 >= 3) {
        const cells = [];
        for (let i = r; i <= end; i++) cells.push([i, c]);
        v.push({ cells, color });
      }
      r = end + 1;
    }
  }
  // 彩虹块：配任意颜色（相邻两同色格）成组——每彩虹格至多一组，命中即记录
  for (let r = 0; r < this.rows; r++) {
    for (let c = 0; c < this.cols; c++) {
      const v0 = this.grid[r][c];
      if (specialType(v0) !== 'rainbow') continue;
      const pair = this._rainbowPair(r, c);
      if (!pair) continue;
      const { cells, color } = pair;
      h.push({ cells, color, rainbow: true });
      c += 2; // 跳过该彩虹格已用掉的配对（本行继续）
    }
  }
  return mergeCross(h, v);
};

/** 彩虹块配对：返回 {cells:[彩虹格, 两同色格], color} 或 null（同列/同行 三种相邻形态） */
Board.prototype._rainbowPair = function _rainbowPair(r, c) {
  const same = (x, y) => {
    const v = this.grid[x] && this.grid[x][y];
    if (v === null || isSpecial(v)) return null;
    return cellColor(v);
  };
  const colC = same(r, c - 1), colD = same(r, c - 2);
  if (colC && colC === colD) return { cells: [[r, c], [r, c - 1], [r, c - 2]], color: colC };
  const colA = same(r, c + 1), colB = same(r, c + 2);
  if (colA && colA === colB) return { cells: [[r, c], [r, c + 1], [r, c + 2]], color: colA };
  if (colC && colC === colA) return { cells: [[r, c], [r, c - 1], [r, c + 1]], color: colC };
  const rowC = same(r - 1, c), rowD = same(r - 2, c);
  if (rowC && rowC === rowD) return { cells: [[r, c], [r - 1, c], [r - 2, c]], color: rowC };
  const rowA = same(r + 1, c), rowB = same(r + 2, c);
  if (rowA && rowA === rowB) return { cells: [[r, c], [r + 1, c], [r + 2, c]], color: rowA };
  if (rowC && rowC === rowA) return { cells: [[r, c], [r - 1, c], [r + 1, c]], color: rowC };
  return null;
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
 * 执行一轮消除：匹配组 →（特殊块爆炸 + 四消/高连播种）→ 清空 → 重力下落 → 顶部补棋 → 重复直到无匹配
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
    matches.forEach((m) => { m.color = cellColor(this.grid[m.cells[0][0]][m.cells[0][1]]); });
    const toClear = this._markMatrix(false);
    matches.forEach((m) => m.cells.forEach(([r, c]) => { toClear[r][c] = true; }));

    // —— 特殊块爆炸：匹配组内每格若为特殊块 → 展开爆炸（迭代处理波及的特殊块）——
    const queue = [];
    matches.forEach((m) => m.cells.forEach(([r, c]) => queue.push([r, c])));
    const handled = new Set();
    const splitSeeds = [];      // 分裂雷占位 {r, c, color}
    const rainbowClear = [];    // 彩虹块待清颜色
    // v1.17.29 特效数据透传：匹配组自身格 / 本步遗留特殊块（生成特效）/ 特殊块引爆波及格（爆炸特效）
    const matchCells = new Set();
    const stepPlanted = [];
    const blastList = [], blastSet = new Set();
    matches.forEach((m) => m.cells.forEach(([r, c]) => matchCells.add(r + ',' + c)));
    const markBlast = (rr, cc, s, color) => {
      const k = rr + ',' + cc;
      if (matchCells.has(k) || blastSet.has(k)) return;
      blastSet.add(k);
      blastList.push({ r: rr, c: cc, s, color: color || null });
    };
    while (queue.length) {
      const [r, c] = queue.shift();
      const v = this.inRange(r, c) ? this.grid[r][c] : null;
      if (!isSpecial(v) || handled.has(r + ',' + c)) continue;
      handled.add(r + ',' + c);
      const st = v.s;
      const sub = v.sub === true;
      if (st === 'rainbow') {
        // 配任意色消除：清全盘该色普通块
        const color = cellColor(v);
        if (color) rainbowClear.push(color);
      } else if (st === 'split') {
        // 3×3 十字 5 格（中心 + 上下左右）；次级分裂雷不再派生四角分裂雷
        const offs = CONFIG.MATCH_SKILL.splitCells.concat([[0, 0]]);
        offs.forEach(([dr, dc]) => {
          const rr = r + dr, cc = c + dc;
          if (!this.inRange(rr, cc)) return;
          toClear[rr][cc] = true;
          markBlast(rr, cc, 'split', cellColor(v));
          queue.push([rr, cc]);
        });
        if (!sub) {
          CONFIG.MATCH_SKILL.splitCorners.forEach(([dr, dc]) => {
            const rr = r + dr, cc = c + dc;
            if (!this.inRange(rr, cc)) return;
            splitSeeds.push({ r: rr, c: cc, color: cellColor(v) });
          });
        }
      } else if (st === 'rand') {
        // 乱数方块：随机消除 5 块（当次生效；不含特殊块与已标记格）
        const cands = [];
        for (let rr = 0; rr < this.rows; rr++)
          for (let cc = 0; cc < this.cols; cc++)
            if (!toClear[rr][cc] && !isSpecial(this.grid[rr][cc])) cands.push([rr, cc]);
        for (let i = 0; i < CONFIG.MATCH_SKILL.randCount && cands.length; i++) {
          const idx = Math.floor(Math.random() * cands.length);
          const [rr, cc] = cands.splice(idx, 1)[0];
          toClear[rr][cc] = true;
          markBlast(rr, cc, 'rand', null);
        }
      } else if (st === 'row' || st === 'col') {
        if (st === 'row') {
          for (let cc = 0; cc < this.cols; cc++) { toClear[r][cc] = true; markBlast(r, cc, 'row', cellColor(v)); queue.push([r, cc]); }
        } else {
          for (let rr = 0; rr < this.rows; rr++) { toClear[rr][c] = true; markBlast(rr, c, 'col', cellColor(v)); queue.push([rr, c]); }
        }
      } else if (st === 'cross') {
        // 5×5 十字 13 格
        CONFIG.MATCH_SKILL.crossCells.forEach(([dr, dc]) => {
          const rr = r + dr, cc = c + dc;
          if (!this.inRange(rr, cc)) return;
          toClear[rr][cc] = true;
          markBlast(rr, cc, 'cross', cellColor(v));
          queue.push([rr, cc]);
        });
      }
    }
    // 彩虹块清色（配任意色消除 → 清全盘该色普通块）
    rainbowClear.forEach((color) => {
      for (let rr = 0; rr < this.rows; rr++)
        for (let cc = 0; cc < this.cols; cc++)
          if (!toClear[rr][cc] && !isSpecial(this.grid[rr][cc]) && cellColor(this.grid[rr][cc]) === color) {
            toClear[rr][cc] = true;
            markBlast(rr, cc, 'rainbow', color);
          }
    });
    // 分裂雷落位（四角：有其他特殊块则跳过，普通块被替换，空位直接放；占位格取消清除）
    splitSeeds.forEach(({ r, c, color }) => {
      if (!this.inRange(r, c)) return;
      if (isSpecial(this.grid[r][c])) return;
      this.grid[r][c] = this._makeSpecial(color, 'split', true);
      toClear[r][c] = false;
      stepPlanted.push({ r, c, s: 'split', color, sub: true });
    });

    // —— 播种：四消遗留（先消先留）与高连面板/彩虹块 ——
    const plants = [];          // 本步产生的遗留特殊块 {r, c, v}
    for (const m of matches) {
      if (m.rainbow || m._noPlant) continue;          // 彩虹块/面板操作产物不再播种（防递归）
      const shape = m.shape;
      if (shape === '4' && this.hooks.onMatch4) {
        // 交互四消：玩家交换落格（_movedCell）优先保留；自然四消随机 4 格取 1
        let kept = null;
        const mc = this._movedCell;
        if (mc && m.cells.some(([r, c]) => r === mc[0] && c === mc[1])) kept = mc;
        if (!kept) kept = m.cells[Math.floor(Math.random() * m.cells.length)];
        const sid0 = this.hooks.onMatch4(m.cells, kept, m.color, steps - 1);
        // v5.2 随机 5 款：配置 'random' 时每次四消从 5 款四连技中随机抽取一款
        const sid = sid0 === 'random' ? this._randomSpecialId() : sid0;
        if (sid && CONFIG.MATCH_SKILL.match4.some((s) => s.id === sid)) {
          toClear[kept[0]][kept[1]] = false;
          plants.push({ r: kept[0], c: kept[1], v: this._makeSpecial(m.color, sid, false) });
          if (this.hooks.extraMatch4 && this.hooks.extraMatch4()) {
            const second=m.cells.find(([rr,cc])=>rr!==kept[0]||cc!==kept[1]);
            if(second){toClear[second[0]][second[1]]=false;plants.push({r:second[0],c:second[1],v:this._makeSpecial(m.color,sid,false)});}
          }
        }
      } else if (shape !== '3' && this.hooks.onMatch5) {
        const op = this.hooks.onMatch5(m.cells, m.color, shape, steps - 1);
        if (op === 'rainbow') {
          // 组中心格转彩虹块（不进清除）
          const center = this._centerCell(m.cells);
          toClear[center[0]][center[1]] = false;
          plants.push({ r: center[0], c: center[1], v: this._makeSpecial(null, 'rainbow', false) });
        } else if (op === 'scan') {
          // 自动扫描：每种颜色各匹配一次三消，统一并入本步清除
          this._scanAllColors(matches, toClear);
        } else if (op === 'recolor') {
          // 染色：随机 10 个非该色普通块变该色（避开清除区），染色后该色新产生的匹配并入本步
          this._recolorBoard(m.color, toClear);
          const extra = this.findMatches().filter((mm) => !mm.rainbow
            && cellColor(this.grid[mm.cells[0][0]][mm.cells[0][1]]) === m.color);
          extra.forEach((mm) => {
            mm._noPlant = true;   // 面板产物不再触发播种
            matches.push(mm);
            mm.cells.forEach(([r, c]) => { toClear[r][c] = true; });
          });
        } else if (op === 'seed') {
          // 随机播种：随机 4 个普通块变特殊爆炸块（5 款随机，避开清除区）
          this._seedSpecials(m.color, toClear);
        }
      }
    }
    // 播种落位（清空前原地替换，清空过程跳过这些格）
    plants.forEach(({ r, c, v }) => {
      this.grid[r][c] = v;
      stepPlanted.push({ r, c, s: v.s, color: v.c, sub: v.sub === true });
    });

    const clearedCells = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (toClear[r][c]) { this.grid[r][c] = null; cleared++; clearedCells.push([r, c]); }
    this._movedCell = null;   // 交互落格仅对第一步四消生效
    this.gravity();
    stepList.push({ matches, clearedCells, gridAfter: this.grid.map((row) => row.slice()), planted: stepPlanted, blasts: blastList });
    all.push(...matches);
  }
  this.stats.cascadeTotal += steps;
  return { matches: all, steps, cleared, stepList };
};

/** 高连技·自动扫描：每种颜色各匹配一次三消（跳过与既有组重复的组），并入本步 matches 与清除标记 */
Board.prototype._scanAllColors = function _scanAllColors(matches, toClear) {
  const known = new Set();
  matches.forEach((m) => m.cells.forEach(([r, c]) => known.add(r + ',' + c)));
  const seenColor = new Set();
  for (const color of this.activeColors) {
    if (seenColor.has(color)) continue;
    // 遍历该色全部组，取第一个与既有组坐标不重复的
    let g = null;
    const all = this.findMatches().filter((m) => !m.rainbow
      && cellColor(this.grid[m.cells[0][0]][m.cells[0][1]]) === color);
    for (const cand of all) {
      if (cand.cells.some(([r, c]) => known.has(r + ',' + c))) continue;
      g = cand;
      break;
    }
    if (g) {
      seenColor.add(color);
      g._noPlant = true;      // 面板产物不再触发播种（防 scan 递归）
      matches.push(g);
      g.cells.forEach(([r, c]) => {
        known.add(r + ',' + c);
        toClear[r][c] = true;
      });
    }
  }
};

/** 高连技·染色：随机 n 个非该色普通块变为该色（避开清除区） */
Board.prototype._recolorBoard = function _recolorBoard(color, toClear) {
  const cands = [];
  for (let r = 0; r < this.rows; r++)
    for (let c = 0; c < this.cols; c++)
      if (!toClear[r][c] && !isSpecial(this.grid[r][c]) && cellColor(this.grid[r][c]) !== color) cands.push([r, c]);
  const n = Math.min(CONFIG.MATCH_SKILL.recolorCount, cands.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * cands.length);
    const [r, c] = cands.splice(idx, 1)[0];
    this.grid[r][c] = color;
  }
};

/** 高连技·随机播种：随机 n 个普通块变为随机特殊爆炸块（5 款随机抽取，避开清除区） */
Board.prototype._seedSpecials = function _seedSpecials(color, toClear) {
  const cands = [];
  for (let r = 0; r < this.rows; r++)
    for (let c = 0; c < this.cols; c++)
      if (!toClear[r][c] && !isSpecial(this.grid[r][c])) cands.push([r, c]);
  const n = Math.min(CONFIG.MATCH_SKILL.seedCount, cands.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * cands.length);
    const [r, c] = cands.splice(idx, 1)[0];
    const base = cellColor(this.grid[r][c]);
    this.grid[r][c] = this._makeSpecial(base || color, this._randomSpecialId(), false);
  }
};

/** 取组几何中心格（彩虹块生成位）：按行列排序取中位 */
Board.prototype._centerCell = function _centerCell(cells) {
  const rs = cells.slice().sort((a, b) => a[0] - b[0]);
  const cs = cells.slice().sort((a, b) => a[1] - b[1]);
  return [rs[Math.floor(rs.length / 2)][0], cs[Math.floor(cs.length / 2)][1]];
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
  this._movedCell = [r1, c1];   // v5.2 交互四消保留格：玩家落格优先（resolve 内消费后置 null）
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
