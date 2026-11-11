'use strict';
const CONFIG = require('../../config.js');
const Shop = require('../../economy/battle-shop.js');
const { shopItemIcon } = require('../icons/shop-items.js');
const { roundRect, fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const LOGIC_H = CONFIG.DESIGN.H;
function createBattleShop({ drawImg, IMG_SRC, fmtNum }) {
  function battleShop(ctx, s) {
    if (!s.shopOpen || s.showBattleShop === false) return;
    const w = 650, h = 1000, x = 50, y = (LOGIC_H - h) / 2 - 40;
    const shopPanelRect = { x, y, w, h }, shopItemRects = [];
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, 750, LOGIC_H);
    fillRoundRect(ctx, x, y, w, h, 24, '#18252e');
    drawImg(ctx, 'assets/images/interface/cards/battle-shop-panel-v1.png', x, y, w, h);
    if (!drawImg(ctx, IMG_SRC.battleSupply, 263, y + 21, 72, 72)) text(ctx, '✦', 299, y + 57, 38, '#f7c948', 'center');
    text(ctx, '战地补给', 429, y + 59, 44, '#fff0c5', 'center');
    if (!drawImg(ctx, IMG_SRC.silver, x + 22, y + 78, 28, 28)) text(ctx, '银', x + 36, y + 92, 22, '#d3e1ed', 'center');
    text(ctx, fmtNum(s.gold), x + 60, y + 92, 26, '#d3e1ed', 'left');
    const cw = 284, ch = 250, gap = 22, top = y + 120;
    CONFIG.STORE.items.forEach((item, i) => {
      const cx = x + 30 + (i % 2) * (cw + gap), cy = top + Math.floor(i / 2) * (ch + 20);
      const offer = Shop.offer({ store: s.store, storeCooldowns: s.storeCooldowns }, item), afford = s.gold >= offer.cost, cooling = offer.cooldown > 0;
      const timer = s.storeTimers && s.storeTimers[item.id] || 0;
      const inactive = cooling || (offer.sold && timer <= 0);
      shopItemRects.push({ x: cx, y: cy, w: cw, h: ch });
      fillRoundRect(ctx, cx, cy, cw, ch, 18, inactive ? '#222b31' : '#233641');
      drawImg(ctx, 'assets/images/interface/cards/battle-shop-card-v1.png', cx, cy, cw, ch);
      strokeRoundRect(ctx, cx, cy, cw, ch, 18, inactive ? '#52616b' : item.color, 1.5);
      ctx.save(); ctx.globalAlpha = inactive ? 0.42 : 1;
      shopItemIcon(ctx, item.id, cx + (cw - 116) / 2, cy + 5, 116, item.color, drawImg); ctx.restore();
      if (item.duration && !cooling && timer <= 0 && !offer.sold) text(ctx, item.duration + '秒', cx + cw - 34, cy + 22, 21, item.color, 'center');
      // 上半张卡为图标区，下半张为名称、功能与价格；正文不小于21px。
      text(ctx, item.name, cx + cw / 2, cy + 151, 25, inactive ? '#88949b' : '#ffffff', 'center');
      text(ctx, item.desc, cx + cw / 2, cy + 188, 23, '#d4e3e9', 'center');
      if (item.max > 0) text(ctx, '限购'+item.max+'次（'+offer.bought+'/'+item.max+'）', cx + 15, cy + 24, 19, '#ffe1a0', 'left');
      // Transient state belongs in the top corner, keeping the description area uncluttered.
      const state = cooling ? '冷却' + Math.ceil(offer.cooldown) + '秒'
        : timer > 0 ? '剩余' + Math.ceil(timer) + '秒' : offer.sold ? '已售罄' : '';
      if (state) text(ctx, state, cx + cw - 12, cy + 24, 19, '#d4e3e9', 'right');
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
