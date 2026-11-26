const PressUI = require('../ui.js');
const CardDraft = require('../screens/card-draft.js');
const ShopScroll = require('./shop-scroll.js');
const TalentGestures = require('./talent-gestures.js');
const RelicScroll = require('./relic-scroll.js');
const PanelScroll = require('./panel-scroll.js');
const MailButtons = require('./mail-buttons.js');
const MailRail = require('./mail-rail.js');
'use strict';
// One gesture lifetime shared by wx and canvas channels; caller injects the main canvas.
function bindTouch(game, c) {
    let pendingButton = null, starting = false;
    const dispatch = game.dispatchTouch.bind(game);
    game.dispatchTouch = (point) => {
      if (!starting) return dispatch(point);
      pendingButton = { point, state: game.state, tab: game.menuTab, panel: game.menuPanel, stage:game.menuStage, menuHit:game.state==='menu'?(game.menuHits||[]).find(h=>h.hit(point.x,point.y)):null, cancelled: false };
      return true;
    };
    let startCell = null, lastCell = null;
    let gestureUsed = false;
    game.pickCell = null; // 点击交换：当前选中格（渲染高亮，直到下次点击/滑动）
    let moved = false;    // 是否已发生滑动（点击 vs 滑动判定）
    // 触摸处理（wx 全局通道与 canvas 事件通道共用；坐标在 toLogic 内做自适应归一化）
    const touchPoint = (e) => {
      if (game._bootFailed) return null; // 启动错误页的重试触摸不交给旧游戏界面。
      const t = e && ((e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]));
      if (!t) return null;
      const x = Number.isFinite(t.clientX) ? t.clientX : t.x;
      const y = Number.isFinite(t.clientY) ? t.clientY : t.y;
      return Number.isFinite(x) && Number.isFinite(y) ? game.toLogic(x, y) : null;
    };
    const handleStart = (e) => {
      const p = touchPoint(e);
      if (!p) return;
      if(game.relicDetail&&!game.relicDetailHits.tip){
        const vp=game.relicDetailHits.viewport;
        if(vp&&p.x>=vp.x&&p.x<=vp.x+vp.w&&p.y>=vp.y&&p.y<=vp.y+vp.h){
          game._battleRelicDrag={p,start:p.y,scroll:game.relicDetailHits.scroll||0,moved:false};return;
        }
      }
      if(game.state==='menu'&&!game.menuPanel&&(game.menuHits||[]).some(it=>it.key==='tab'&&it.hit(p.x,p.y))){game.dispatchTouch(p);return;}
      if(MailRail.begin(game,p,e.touches?e.touches.length:1)){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;return;}
      if(MailButtons.begin(game,p,e.touches?e.touches.length:1)){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;return;}
      if(TalentGestures.begin(game,e)){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;return;}
      if (game.state === 'gameover' && game.gameoverSkip && p.y >= 552 && p.y <= 926) {
        game._lootDrag = { y: p.y, start: p.y, scroll: game._lootScroll || 0, moved: false };
        game._touchStart = { x: p.x, y: p.y }; return;
      }
      if (game.state === 'fighting') { game._boardIdleTime = 0; game.boardHint = null; }
      ShopScroll.stop(game);
      if (game.state === 'menu' && game.menuTab === 'shop' && !game.menuPanel && p.y >= 288 && p.y < 1492) { ShopScroll.begin(game, p); return; }
      RelicScroll.stop(game);
      PanelScroll.stop(game);
      // Menu input must never be gated by the board gesture lock.
      if (game.state === 'menu' && !(game.menuTab === 'relic' && !game.menuPanel)) {
        // 全局技能面板：视口内触摸 → 进入滚动拖拽（点击延迟到 touchend 补发，拖动不触发卡点）
        if (PanelScroll.begin(game, p)) return;
        game.dispatchTouch(p);
        return;
      }
      if (e.touches && e.touches.length > 1) return;
      gestureUsed = false;
      // 圣遗物页滑动浏览：延迟点击判定到 touchend（拖动不触发卡点）
      if (game.state === 'menu' && game.menuTab === 'relic' && !game.menuPanel) {
        RelicScroll.begin(game, p);
        return;
      }
      // 状态/弹层/按钮命中分发（模块化 ：dispatchTouch 独立方法）
      const boardCell = game.state === 'testfield' && !game.funcLayer && !game.towerInfo && !game.towerSkill && !game.shopOpen && game.cellAt(p);
      if (!boardCell && game.dispatchTouch(p)) return;
      // 棋盘点击/滑动准备
      startCell = game.cellAt(p);
      lastCell = startCell;
      game.selected = startCell;
      game.swapped = false;
      moved = false;
      game._touchStart = { x: p.x, y: p.y };
    };
    const actionAt=(p)=>{
      if(!p)return null;
      const hits=game.state==='reviveOffer'?game._reviveAdHits:game.state==='gameover'&&game.gameoverSkip?game.restartBtn:null;
      if(!hits)return null;
      for(const key of Object.keys(hits))if(typeof hits[key]==='function'&&hits[key](p.x,p.y))return key;
      return null;
    };
    const onStart = (e) => {
      if (e.touches && e.touches.length > 1) { pendingButton = null; PressUI.setPressPoint(null); return; }
      if (CardDraft.begin(game,touchPoint(e))) { PressUI.setPressPoint(touchPoint(e)); return; }
      game._settlementPress=actionAt(touchPoint(e));
      PressUI.setPressPoint(touchPoint(e));
      starting = true;
      try { handleStart(e); } finally { starting = false; }
    };
    const onMove = (e) => {
      if(game._cardFullPrompt){PressUI.setPressPoint(touchPoint(e));return;}
      if (game._cardDrag) { game._cardDrag.p=touchPoint(e)||game._cardDrag.p; return; }
      const press = touchPoint(e);
      if (pendingButton && press && Math.hypot(press.x-pendingButton.point.x, press.y-pendingButton.point.y)>12) pendingButton.cancelled=true;
      PressUI.setPressPoint(pendingButton && pendingButton.cancelled ? null : press);
      if(MailRail.move(game,touchPoint(e)))return;
      if(MailButtons.move(game,touchPoint(e)))return;
      if(TalentGestures.move(game,e))return;
      const p = touchPoint(e);
      if(game._battleRelicDrag&&p){
        const d=game._battleRelicDrag;if(Math.abs(p.y-d.start)>6)d.moved=true;
        if(d.moved)game.relicDetailHits.scroll=Math.max(0,Math.min(game.relicDetailHits.maxScroll||0,d.scroll+d.start-p.y));
        return;
      }
      if (game._lootDrag && p) {
        const d = game._lootDrag, count = Object.keys((game.runSummary && game.runSummary.shardDetail) || {}).filter(id => game.runSummary.shardDetail[id] > 0).length;
        const max = Math.max(0, Math.ceil(count / 5) * 185 - 374);
        if (Math.abs(p.y - d.start) > 6) d.moved = true;
        game._lootScroll = Math.max(0, Math.min(max, d.scroll + d.start - p.y)); d.y = p.y; return;
      }
      if (game._shopDrag && p) { ShopScroll.move(game, p); if(game._shopDrag&&game._shopDrag.moved)PressUI.setPressPoint(null); return; }
      // 圣遗物页拖动滚动
      if (game._relicDrag && p) {
        RelicScroll.move(game, p);
        if(game._relicDrag&&game._relicDrag.moved)PressUI.setPressPoint(null);
        return;
      }
      // 全局技能面板拖动滚动
      if (game._panelDrag && p) {
        PanelScroll.move(game, p);
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
      if (CardDraft.end(game,touchPoint(e))) return;
      PressUI.setPressPoint(null);
      if (pendingButton) {
        const button = pendingButton; pendingButton = null;
        const end = touchPoint(e);
        const action=game._settlementPress;game._settlementPress=null;
        if(action&&actionAt(end)!==action)return;
        if(button.menuHit&&(!end||!button.menuHit.hit(end.x,end.y)||game.menuStage!==button.stage))return;
        if (!button.cancelled && end && game.state === button.state && game.menuTab === button.tab && game.menuPanel === button.panel && Math.hypot(end.x-button.point.x,end.y-button.point.y)<=12) dispatch(button.point);
        return;
      }
      if(game._battleRelicDrag){const d=game._battleRelicDrag;game._battleRelicDrag=null;if(!d.moved)game.dispatchTouch(d.p);return;}
      if(MailRail.end(game,touchPoint(e))){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;game.selected=null;return;}
      if(MailButtons.end(game,touchPoint(e))){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;game.selected=null;return;}
      if(TalentGestures.end(game,e)){startCell=null;lastCell=null;moved=false;gestureUsed=false;game._touchStart=null;game.selected=null;return;}
      if (game._lootDrag) { const d = game._lootDrag; game._lootDrag = null; game._touchStart = null; if (d.moved) return; game.dispatchTouch(touchPoint(e) || { x: 0, y: 0 }); return; }
      if (game._shopDrag) { const d = ShopScroll.end(game); if (d && !d.moved && game.state === 'menu') {const end=touchPoint(e);if(end&&Math.hypot(end.x-d.p.x,end.y-d.p.y)<=12)game.dispatchTouch(end);} return; }
      // Always release on end: adapters may include the ending touch in touches.
      gestureUsed = false;
      // 圣遗物页：未拖动 → 补发点击；已拖动 → 吞掉
      if (game._relicDrag) {
        const d = RelicScroll.end(game);
        game._touchStart = null; moved = false; startCell = null; lastCell = null; game.selected = null;
        if (!d.moved && game.state === 'menu' && touchPoint(e) && Math.hypot(touchPoint(e).x-d.p.x,touchPoint(e).y-d.p.y)<=12) game.dispatchTouch(d.p);
        return;
      }
      // 全局技能面板：未拖动 → 补发点击；已拖动 → 吞掉
      if (game._panelDrag) {
        const d = PanelScroll.end(game);
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
      pendingButton = null; PressUI.setPressPoint(null);
      game._cardDrag=null;
      game._battleRelicDrag=null;
      MailRail.cancel(game);
      MailButtons.cancel(game);
      TalentGestures.cancel(game);
      game._lootDrag = null;
      gestureUsed = false;
      startCell = null; lastCell = null;
      moved = false;
      ShopScroll.cancel(game);
      RelicScroll.cancel(game);
      PanelScroll.cancel(game);
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
