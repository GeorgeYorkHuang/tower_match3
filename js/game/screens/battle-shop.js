'use strict';
const CONFIG = require('../../config.js');
const Shop = require('../../economy/battle-shop.js');
const { shopItemIcon } = require('../icons/shop-items.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
function createBattleShop({ drawImg, IMG_SRC, fmtNum }) {
  function battleShop(ctx, s) {
    if (!s.shopOpen) return;
    const w = 650, h = 1000, x = 50, y = (LOGIC_H - h) / 2 - 40;
    const shopPanelRect = { x, y, w, h }, shopItemRects = [];
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 24, '#18252e');
    strokeRoundRect(ctx, x, y, w, h, 24, '#bca66d', 2);
    text(ctx, '战地补给', 375, y + 42, 32, '#fff0c5', 'center');
    if (!drawImg(ctx, IMG_SRC.silver, 283, y + 67, 28, 28)) text(ctx, '银', 297, y + 81, 22, '#d3e1ed', 'center');
    text(ctx, fmtNum(s.gold), 323, y + 81, 26, '#d3e1ed', 'left');
    const cw = 284, ch = 250, gap = 22, top = y + 120;
    CONFIG.STORE.items.forEach((item, i) => {
      const cx = x + 30 + (i % 2) * (cw + gap), cy = top + Math.floor(i / 2) * (ch + 20);
      const offer = Shop.offer({ store: s.store, storeCooldowns: s.storeCooldowns }, item), afford = s.gold >= offer.cost, cooling = offer.cooldown > 0;
      shopItemRects.push({ x: cx, y: cy, w: cw, h: ch });
      fillRoundRect(ctx, cx, cy, cw, ch, 18, offer.sold ? '#222b31' : cooling ? '#202d33' : '#233641');
      strokeRoundRect(ctx, cx, cy, cw, ch, 18, offer.sold || cooling ? '#52616b' : item.color, 1.5);
      ctx.save(); ctx.globalAlpha = offer.sold || cooling ? 0.42 : 1;
      shopItemIcon(ctx, item.id, cx + (cw - 116) / 2, cy + 5, 116, item.color); ctx.restore();
      if (item.duration) text(ctx, item.duration + '秒', cx + cw - 34, cy + 22, 21, item.color, 'center');
      // 上半张卡为图标区，下半张为名称、功能与价格；正文不小于21px。
      text(ctx, item.name, cx + cw / 2, cy + 141, 25, offer.sold ? '#88949b' : '#ffffff', 'center');
      text(ctx, item.desc, cx + cw / 2, cy + 173, 23, '#d4e3e9', 'center');
      const timer = s.storeTimers && s.storeTimers[item.id] || 0;
      const sub = offer.sold ? '本局已售罄' : item.max === 1 ? '本局限购1次' : cooling ? '冷却 ' + Math.ceil(offer.cooldown) + '秒' : timer > 0 ? '剩余' + Math.ceil(timer) + '秒' : '可重复购买';
      text(ctx, sub, cx + cw / 2, cy + 201, 21, offer.sold || cooling ? '#81929e' : item.max === 1 ? '#ffe1a0' : '#a9c0cc', 'center');
      text(ctx, offer.sold ? '已购买' : offer.cost + ' 银币', cx + cw / 2, cy + 231, 25, offer.sold || cooling ? '#81929e' : afford ? '#ffe2a0' : '#ffad9a', 'center');
    });
    const shopCloseRect = { x: 280, y: y + h - 66, w: 190, h: 48 };
    fillRoundRect(ctx, shopCloseRect.x, shopCloseRect.y, 190, 48, 24, '#bca66d');
    text(ctx, '关闭', 375, shopCloseRect.y + 24, 25, '#202a2b', 'center');
    return { shopPanelRect, shopItemRects, shopCloseRect };
  }
  return { battleShop };
}
module.exports = { createBattleShop };
