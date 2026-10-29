/**
 * match3.js —— 三消控制器：交换触发 + 两阶段动画（交换→消除）+ 逐级连锁状态机 + 收益提示
 * 动画数据挂 game.anim（渲染层 sceneState/board 读取），本模块只管理其生命周期。
 * 棋盘算法（匹配/消除/下落/连锁结算）在 board.js，结算在 run.js。
 */
const CONFIG = require('./config.js');

class Match3Controller {
  constructor(game) {
    this.game = game;
  }

  /** 滑动到相邻格触发交换：有效则装配连锁动画并返回 true，无效返回 false */
  trySwap(r1, c1, r2, c2) {
    const g = this.game;
    const oldGrid = g.run.board.grid.map((row) => row.slice()); // 动画用：交换前的棋盘
    const ret = g.run.trySwap(r1, c1, r2, c2);
    if (!ret.ok) return false;
    g.swapped = true;
    g.selected = null;
    this._assemble(ret, oldGrid, r1, c1, r2, c2);
    // 三消联动：圣物经验补差 + 塔额外攻击（多消不同特效）
    if (g.onMatchBonus) g.onMatchBonus(ret);
    return true;
  }

  /** 由 trySwap 结果装配两阶段 + 逐级连锁动画 */
  _assemble(ret, oldGrid, r1, c1, r2, c2) {
    const g = this.game;
    const swapGrid = oldGrid.map((row) => row.slice());
    const tmp = swapGrid[r1][c1]; swapGrid[r1][c1] = swapGrid[r2][c2]; swapGrid[r2][c2] = tmp;
    const steps = ret.stepList; // run.trySwap 透传的每级连锁快照
    const first = steps[0];
    g.anim = {
      phase: 'swap', swap: [r1, c1, r2, c2], swapGrid,
      progress: 0, durSwap: 0.3,   // v5.6.3 交换动画 0.3s
      base: swapGrid, // 当前步下落前的棋盘（第 1 步 = 交换后棋盘）
      cleared: new Set(first.clearedCells.map(([r, c]) => r + ',' + c)),
      final: first.gridAfter, // 当前步下落补格后的棋盘
      durClear: 0.5, durFall: 0.4,   // v5.6.3 消除段 0.5s 串行下落段 0.4s
      cascade: { steps, index: 0, settledByStep: ret.settledByStep },
    };
    this.cascadeToast(0); // 第 1 步消除收益提示
    this._specialsFx(first); // v1.17.29 特殊块生成/引爆特效 + 震动
    this._burst(first.clearedCells, first.matches); // 消除迸发反馈
    // 无解重排
    if (!g.run.board.isSolvable()) {
      g.run.board.regen();
      g.toast('棋盘重排', '#9fb2c3');
    }
  }

  /** 每帧推进动画状态机：交换 → 消除 → 下落 → 逐级连锁，直到棋盘稳定
   *  v5.6.3 消除与下落拆为串行两段：clear 0.5s 淡出 → fall 0.4s 匀速下落 */
  update(dt) {
    const g = this.game;
    if (!g.anim) return;
    const a = g.anim;
    a.progress += dt / (a.phase === 'swap' ? a.durSwap : (a.phase === 'clear' ? a.durClear : a.durFall));
    if (a.phase === 'swap' && a.progress >= 1) {
      a.phase = 'clear';
      a.progress = 0;
      if (!a.cleared.size) g.anim = null; // 无消除：交换完即结束
    } else if (a.phase === 'clear' && a.progress >= 1) {
      a.phase = 'fall'; // 消除淡出完成 → 进入下落段
      a.progress = 0;
    } else if (a.phase === 'fall' && a.progress >= 1) {
      const cs = a.cascade;
      cs.index++;
      if (cs.index < cs.steps.length) {
        // 下落稳定 → 进入下一级连锁：重新消除 + 重新下落
        const st = cs.steps[cs.index];
        a.base = cs.steps[cs.index - 1].gridAfter;
        a.cleared = new Set(st.clearedCells.map(([r, c]) => r + ',' + c));
        a.final = st.gridAfter;
        a.durClear = 0.5; a.durFall = 0.4;
        a.progress = 0;
        a.phase = 'clear'; // 新一级从消除段开始
        this._specialsFx(st); // v1.17.29 连锁级特殊块特效
        this.cascadeToast(cs.index);
        this._burst(st.clearedCells, st.matches); // 连锁级消除反馈
      } else {
        g.anim = null; // 连锁结束，棋盘稳定
      }
    }
  }

  /** 第 idx 级连锁的消除收益提示（直4 / L5 / 直5 / 获得塔） */
  cascadeToast(idx) {
    const g = this.game;
    const a = g.anim;
    if (!a || !a.cascade) return;
    const step = a.cascade.steps[idx];
    if (!step) return;
    // v1.17.29 消除音效分层：连消 / 5消+ / 4消 / 普通3消
    if (g.playSfx) {
      const shapes = (step.matches || []).map((m) => m.shape);
      if (idx + 1 >= CONFIG.MATCH_SKILL.chainStart) g.playSfx('combo', 0.35);
      else if (shapes.some((s) => s === '5' || s === '6+' || s === 'L5')) g.playSfx('match5', 0.35);
      else if (shapes.some((s) => s === '4')) g.playSfx('match4', 0.35);
      else g.playSfx('match3', 0.12);
    }
    const ss = a.cascade.settledByStep[idx] || [];
    const msgs = [];
    const SHAPE_NAME = { '4': '直4', L5: 'L5', '5': '直5', '6+': '大消' };
    const special = step.matches.filter((m) => m.shape !== '3');
    if (special.length) msgs.push(special.map((m) => SHAPE_NAME[m.shape] || m.shape).join('、'));
    const got = ss.filter((s) => s.gotTower);
    if (got.length) msgs.push(`获得 ${got.map((s) => CONFIG.COLORS[CONFIG.TOWERS[s.tower].color].name).join('、')}`);
    if (msgs.length) g.toast(msgs.join(' '), got.length ? '#7ef0a3' : '#f7c948');
  }

  /** v5.6 特殊块特效：引爆分型级联（主爆优先，波及格按距中心棋盘距离延迟）+ 生成降临 + 全屏爆闪 + 震动 */
  _specialsFx(st) {
    const g = this.game;
    if (!g || !g.fx) return;
    const { boardX, boardY, cell } = g.ly;
    const blasts = st.blasts || [];
    const main = blasts[0] || null;
    blasts.forEach((b, i) => {
      const dist = main ? Math.max(Math.abs(b.r - main.r), Math.abs(b.c - main.c)) : 0;
      g.fx.push({
        type: 'specialBlast', s: b.s, sub: b.sub,
        x: boardX + b.c * cell + cell / 2, y: boardY + b.r * cell + cell / 2,
        color: b.color, main: i === 0, t: -dist * 0.035, dur: 0.8, cell,   // 特殊块引爆 0.8s（预告25%+爆发75%）
        parts: i === 0 ? this._blastParts(b.s) : null,
      });
    });
    (st.planted || []).forEach((p) => {
      g.fx.push({
        type: 'specialSpawn', s: p.s, sub: p.sub,
        x: boardX + p.c * cell + cell / 2, y: boardY + p.r * cell + cell / 2,
        color: p.color, t: 0, dur: 0.4, cell,   // v5.6.3 特殊块生成降临 0.4s（原 0.9）
      });
    });
    if (blasts.length && g.vibrate) g.vibrate(blasts.length >= 6 ? 2 : 1);
    if (blasts.length) g.fx.push({ type: 'screenFlash', t: 0, dur: 0.24 });   // v5.6.2 全屏爆闪仅 +0.1s（0.14→0.24，超过 0.3s 会长时间白屏伤观感）
  }

  /** v5.6 主爆粒子参数：按分型生成飞散碎片（渲染层按 t 推进） */
  _blastParts(s) {
    const n = { row: 16, col: 16, cross: 20, split: 20, rand: 12, rainbow: 24 }[s] || 14;
    const base = s === 'rainbow'
      ? ['#ff6174', '#ffad54', '#ffe36a', '#7ee4a1', '#78c8ff', '#c09aff']
      : s === 'rand' ? '#c69aff' : s === 'split' ? '#ff4d5e'
        : s === 'cross' ? '#ffd24a' : '#ff8a4d';
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 150;
      parts.push({
        dx: Math.cos(a), dy: Math.sin(a), sp,
        col: Array.isArray(base) ? base[i % base.length] : base,
        sz: 3 + Math.random() * 4, rot: Math.random() * Math.PI,
      });
    }
    return parts;
  }

  /** 消除迸发反馈：每个被消除的方块中心爆出彩色星芒（0.8s，v5.6.3 原 0.62s，渲染层绘制） */
  _burst(cells, matches) {
    const g = this.game;
    const { boardX, boardY, cell } = g.ly;
    const src = g.anim ? g.anim.base : g.run.board.grid;
    // 形状颜色：取该步第一个匹配组颜色（同组同色），逐格配色
    const colorOf = {};
    (matches || []).forEach((m) => {
      m.cells.forEach(([r, c]) => { if (colorOf[r + ',' + c] === undefined) colorOf[r + ',' + c] = m.color; });
    });
    cells.forEach(([r, c]) => {
      const color = colorOf[r + ',' + c] || (src && src[r] ? src[r][c] : null);
      g.fx.push({
        type: 'match',
        x: boardX + c * cell + cell / 2,
        y: boardY + r * cell + cell / 2,
        color,
        t: 0, dur: 0.8,   // v5.6.3 消除迸发星芒 0.8s（原 0.62）
      });
    });
  }
}

module.exports = { Match3Controller };
