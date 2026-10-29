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
      progress: 0, durSwap: 0.16,
      base: swapGrid, // 当前步下落前的棋盘（第 1 步 = 交换后棋盘）
      cleared: new Set(first.clearedCells.map(([r, c]) => r + ',' + c)),
      final: first.gridAfter, // 当前步下落补格后的棋盘
      durClear: this._stepDur(),
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

  /** 每帧推进动画状态机：交换 → 消除 → 逐级连锁，直到棋盘稳定 */
  update(dt) {
    const g = this.game;
    if (!g.anim) return;
    const a = g.anim;
    a.progress += dt / (a.phase === 'swap' ? a.durSwap : a.durClear);
    if (a.phase === 'swap' && a.progress >= 1) {
      a.phase = 'clear';
      a.progress = 0;
      if (!a.cleared.size) g.anim = null; // 无消除：交换完即结束
    } else if (a.progress >= 1) {
      const cs = a.cascade;
      cs.index++;
      if (cs.index < cs.steps.length) {
        // 下落稳定 → 进入下一级连锁：重新消除 + 重新下落
        const st = cs.steps[cs.index];
        a.base = cs.steps[cs.index - 1].gridAfter;
        a.cleared = new Set(st.clearedCells.map(([r, c]) => r + ',' + c));
        a.final = st.gridAfter;
        a.durClear = this._stepDur();
        a.progress = 0;
        this._specialsFx(st); // v1.17.29 连锁级特殊块特效
        this.cascadeToast(cs.index);
        this._burst(st.clearedCells, st.matches); // 连锁级消除反馈
      } else {
        g.anim = null; // 连锁结束，棋盘稳定
      }
    }
  }

  /** 每级下落动画时长：固定 0.5s（全局统一速度 840px/s = (行数+1)×格宽/0.5，恢复原节奏） */
  _stepDur() {
    return 0.5;
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

  /** v1.17.29 特殊块特效：引爆分型（blasts 每格小闪 + 首格主爆）+ 生成彩环（planted）+ 消除震动 */
  _specialsFx(st) {
    const g = this.game;
    if (!g || !g.fx) return;
    const { boardX, boardY, cell } = g.ly;
    (st.blasts || []).forEach((b, i) => {
      g.fx.push({
        type: 'specialBlast', s: b.s, sub: b.sub,
        x: boardX + b.c * cell + cell / 2, y: boardY + b.r * cell + cell / 2,
        color: b.color, main: i === 0, t: 0, dur: 0.45,
      });
    });
    (st.planted || []).forEach((p) => {
      g.fx.push({
        type: 'specialSpawn', s: p.s, sub: p.sub,
        x: boardX + p.c * cell + cell / 2, y: boardY + p.r * cell + cell / 2,
        color: p.color, t: 0, dur: 0.5,
      });
    });
    if (st.blasts && st.blasts.length && g.vibrate) g.vibrate(st.blasts.length >= 6 ? 2 : 1);
  }

  /** 消除迸发反馈：每个被消除的方块中心爆出彩色星芒（0.32s，渲染层绘制） */
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
        t: 0, dur: 0.32,
      });
    });
  }
}

module.exports = { Match3Controller };
