'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
// No Run/Meta retention; purchase handling remains in the battle action route.
function createBattleShop({ drawImg, IMG_SRC, fmtNum }) {
  function battleShop(ctx, s) {
    if (!s.shopOpen) return;
    let shopPanelRect, shopItemRects, shopCloseRect;
    // 面板（居中偏上，避开灵动岛/微信胶囊）
    const w = 560, h = 640, x = (750 - w) / 2, y = (LOGIC_H - h) / 2 - 80;
    shopPanelRect = { x, y, w, h };
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 18, '#232a34');
    strokeRoundRect(ctx, x, y, w, h, 18, '#3a6ea5', 3);
    text(ctx, '🛒 局内商店', x + w / 2, y + 58, 34, '#ffffff', 'center');
    // v1.17 局内商店消耗银币（局内临时货币）
    if (!drawImg(ctx, IMG_SRC.silver, x + w / 2 - 170, y + 84, 34, 34)) text(ctx, '🪙', x + w / 2 - 170 + 17, y + 84 + 17, 26, '#c9d6e4', 'center');
    text(ctx, `银币 ${fmtNum(s.gold)}`, x + w / 2 - 128, y + 108, 24, '#c9d6e4', 'left');
    const items = (CONFIG.STORE.items || []);
    const gw = 236, gh = 182, gx0 = x + 24, gy0 = y + 138, gGap = 40;
    shopItemRects = [];
    items.forEach((it, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const gx = gx0 + col * (gw + gGap), gy = gy0 + row * (gh + 46);
      const bought = (s.store && s.store[it.id]) || 0;
      const maxed = bought >= it.max;
      const cost = it.cost[Math.min(bought, it.cost.length - 1)];
      const afford = s.gold >= cost;
      shopItemRects.push({ x: gx, y: gy, w: gw, h: gh });
      fillRoundRect(ctx, gx, gy, gw, gh, 14, maxed ? 'rgba(255,255,255,0.04)' : afford ? 'rgba(247,201,72,0.08)' : 'rgba(22,29,40,0.9)');
      strokeRoundRect(ctx, gx, gy, gw, gh, 14, maxed ? '#3a4553' : afford ? '#f7c948' : '#3a4553', maxed ? 1 : 1.4);
      text(ctx, it.icon, gx + 30, gy + 36, 24, '#ffffff', 'center');
      text(ctx, it.name, gx + 58, gy + 38, 22, '#ffffff', 'left');
      text(ctx, it.desc, gx + 26, gy + 80, 16, '#9fb2c3', 'left');
      text(ctx, `🪙 ${cost} · 已购 ${bought}/${it.max}`, gx + 26, gy + 116, 17, maxed ? '#5a6c80' : afford ? '#c9d6e4' : '#a05a3c', 'left');
      text(ctx, maxed ? '已达上限' : (afford ? '点击购买' : '银币不足'), gx + 26, gy + 158, 17, maxed ? '#5a6c80' : afford ? '#7ef0a3' : '#ff6b6b', 'left');
    });
    // 关闭
    shopCloseRect = { x: x + w / 2 - 90, y: y + h - 76, w: 180, h: 54 };
    fillRoundRect(ctx, shopCloseRect.x, shopCloseRect.y, 180, 54, 12, '#3a6ea5');
    text(ctx, '关闭', x + w / 2, shopCloseRect.y + 36, 24, '#ffffff', 'center');
    return { shopPanelRect, shopItemRects, shopCloseRect };
  }
  return { battleShop };
}
module.exports = { createBattleShop };
