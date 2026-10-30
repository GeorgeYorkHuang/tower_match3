const RelicScroll = require('./relic-scroll.js');
'use strict';
// One gesture lifetime shared by wx and canvas channels; caller injects the main canvas.
function bindTouch(game, c) {
    let startCell = null, lastCell = null;
    let gestureUsed = false;
    game.pickCell = null; // 点击交换：当前选中格（渲染高亮，直到下次点击/滑动）
    let moved = false;    // 是否已发生滑动（点击 vs 滑动判定）
    // 触摸处理（wx 全局通道与 canvas 事件通道共用；坐标在 toLogic 内做自适应归一化）
    const touchPoint = (e) => {
      const t = e && ((e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]));
      if (!t) return null;
      const x = Number.isFinite(t.clientX) ? t.clientX : t.x;
      const y = Number.isFinite(t.clientY) ? t.clientY : t.y;
      return Number.isFinite(x) && Number.isFinite(y) ? game.toLogic(x, y) : null;
    };
    const onStart = (e) => {
      const p = touchPoint(e);
      if (!p) return;
      RelicScroll.stop(game);
      // Menu input must never be gated by the board gesture lock.
      if (game.state === 'menu' && !(game.menuTab === 'relic' && !game.menuPanel)) {
        game.dispatchTouch(p);
        return;
      }
      if (e.touches && e.touches.length > 1) return;
      gestureUsed = false;
      // v1.16.82 圣遗物页滑动浏览：延迟点击判定到 touchend（拖动不触发卡点）
      if (game.state === 'menu' && game.menuTab === 'relic' && !game.menuPanel) {
        RelicScroll.begin(game, p);
        return;
      }
      // 状态/弹层/按钮命中分发（模块化 v1.13.11：dispatchTouch 独立方法）
      if (game.dispatchTouch(p)) return;
      // 棋盘点击/滑动准备
      startCell = game.cellAt(p);
      lastCell = startCell;
      game.selected = startCell;
      game.swapped = false;
      moved = false;
      game._touchStart = { x: p.x, y: p.y };
    };
    const onMove = (e) => {
      const p = touchPoint(e);
      // v1.16.82 圣遗物页拖动滚动
      if (game._relicDrag && p) {
        RelicScroll.move(game, p);
        return;
      }
      if (game.towerInfo) return; // 详情弹层打开时锁定交换
      if (game.funcLayer) return; // 功能弹层打开时锁定交换
      if (gestureUsed || game.state !== 'fighting' || !startCell || game.swapped) return;
      if (game.anim) return; // 三消动画进行中锁定交换
      if (!p) return;
      // 移动超过阈值视为滑动手势：取消点击选中，进入滑动交换
      if (game._touchStart && Math.hypot(p.x - game._touchStart.x, p.y - game._touchStart.y) > 8) {
        moved = true;
        game.pickCell = null;
      }
      const cell = game.cellAt(p);
      if (!cell) return;
      const [r1, c1] = startCell, [r2, c2] = cell;
      const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
      if (adjacent && (!lastCell || lastCell[0] !== r2 || lastCell[1] !== c2)) {
        // Consume even invalid swaps; animation completion must not unlock game gesture.
        gestureUsed = true;
        moved = true;
        game.pickCell = null;
        game.match3.trySwap(r1, c1, r2, c2);
      }
      lastCell = cell;
    };
    const onEnd = (e) => {
      // Always release on end: adapters may include the ending touch in touches.
      gestureUsed = false;
      // v1.16.82 圣遗物页：未拖动 → 补发点击；已拖动 → 吞掉
      if (game._relicDrag) {
        const d = RelicScroll.end(game);
        game._touchStart = null; moved = false; startCell = null; lastCell = null; game.selected = null;
        if (!d.moved && game.state === 'menu') game.dispatchTouch(d.p);
        return;
      }
      // 点击交换：无滑动 + 战斗态 + 无动画 → 选中/交换/取消
      if (!moved && startCell && game.state === 'fighting' && !game.anim && !game.swapped) {
        const [r, c] = startCell;
        if (game.pickCell) {
          const [pr, pc] = game.pickCell;
          if (pr === r && pc === c) {
            game.pickCell = null; // 点同一格：取消选中
          } else if (Math.abs(pr - r) + Math.abs(pc - c) === 1) {
            game.match3.trySwap(pr, pc, r, c); // 相邻：点击交换
            game.pickCell = null;
          } else {
            game.pickCell = startCell; // 不相邻：重选
          }
        } else {
          game.pickCell = startCell; // 首次点击：选中
        }
      }
      if (game.state !== 'fighting') game.pickCell = null; // 非战斗态点击结束清选中
      startCell = null; lastCell = null;
      game.selected = null;
      moved = false;
      game._touchStart = null;
    };
    const onCancel = () => {
      gestureUsed = false;
      startCell = null; lastCell = null;
      moved = false;
      RelicScroll.cancel(game);
      game._touchStart = null;
      game.selected = null;
      game.pickCell = null;
    };
    // 真机/官方推荐通道：wx 全局触摸事件（坐标=逻辑像素，与 windowWidth 同尺度）。
    // 小游戏主画布 canvas.addEventListener 在真机非同层渲染下可能不派发触摸事件，
    // 且其坐标可能为 canvas 物理像素系；故优先使用 wx 通道，canvas 仅作回退。
    if (typeof wx !== 'undefined' && wx.onTouchStart) {
      try {
        game._touchSpace = 'window';
        wx.onTouchStart(onStart);
        wx.onTouchMove(onMove);
        wx.onTouchEnd(onEnd);
        if (wx.onTouchCancel) wx.onTouchCancel(onCancel);
        return;
      } catch (e) { /* 回退 canvas 通道 */ }
    }
    if (!c || !c.addEventListener) return;
    game._touchSpace = 'canvas';
    c.addEventListener('touchstart', onStart);
    c.addEventListener('touchmove', onMove);
    c.addEventListener('touchend', onEnd);
    c.addEventListener('touchcancel', onCancel);
}
module.exports = { bindTouch };
