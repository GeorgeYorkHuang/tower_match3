'use strict';
const CONFIG = require('../../config.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');


function createMenuShopScreen({ drawImg, relicIconSrc, IMG_SRC, panelShell, wrapText }) {
  const chestBounds = {"gold":{"y":45,"x":17,"w":231,"h":177},"bronze":{"y":47,"x":18,"w":223,"h":183},"star":{"y":69,"x":54,"w":151,"h":131},"silver":{"y":53,"x":27,"w":208,"h":165},"wood":{"y":65,"x":43,"w":172,"h":132}};
  function drawChest(ctx, key, src, cx, cy, size) {
    const tier = { blue: 'bronze', purple: 'silver' }[key] || key;
    const crop = chestBounds[tier];
    if (!crop) return false;
    const scale = size / Math.max(crop.w, crop.h);
    const w = crop.w * scale, h = crop.h * scale;
    return drawImg(ctx, src, cx - w / 2, cy - h / 2, w, h, crop);
  }
  function menuShop(ctx, s, push) {
    // 每日碎片精选
    text(ctx, '每日碎片精选', 55, 226, 26, '#ffffff', 'left');
    text(ctx, '每日刷新', 695, 226, 17, '#a9bbce', 'right');
    const picks = (s.daily && s.daily.picks) || [];
    const cw = 200, ch = 268.8, gap = 12, dailyY = 252;
    picks.slice(0, 6).forEach((p, i) => {
      const x = 55 + (i % 3) * (cw + gap);
      const y0 = dailyY + Math.floor(i / 3) * (ch + 16);
      const def = CONFIG.relicRunDef(p.relic) || { id: p.relic, name: p.relic, icon: '📿' };
      const rar = p.rar || CONFIG.relicRarity(p.relic);
      const accent = CONFIG.GO.RARITY[rar] || '#4aa3ff';
      const shN = p.shards || CONFIG.DAILY.shards[rar] || 1;
      const bg = ctx.createLinearGradient(x, y0, x + cw, y0 + ch);
      bg.addColorStop(0, '#293649'); bg.addColorStop(0.55, '#1a2637'); bg.addColorStop(1, '#111a28');
      ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 8;
      fillRoundRect(ctx, x, y0, cw, ch, 17, bg); ctx.shadowBlur = 0;
      drawImg(ctx, 'assets/images/interface/shop/card-background-v1.png', x, y0, cw, ch);
      strokeRoundRect(ctx, x, y0, cw, ch, 17, accent, 2);
      strokeRoundRect(ctx, x + 5, y0 + 5, cw - 10, ch - 10, 13, 'rgba(255,255,255,0.11)', 1);
      ctx.restore();
      push('shopShard', { relic: p.relic, shards: shN, price: p.price, icon: def.icon, name: def.name }, x, y0, cw, ch);

      ctx.save(); ctx.globalAlpha = 0.24; ctx.beginPath(); ctx.arc(x + cw / 2, y0 + 66, 49, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill(); ctx.restore();
      const isz = 94, src = relicIconSrc(p.relic);
      if (!(src && drawImg(ctx, src, x + cw / 2 - isz / 2, y0 + 19, isz, isz))) {
        text(ctx, def.icon || '📿', x + cw / 2, y0 + 66, 42, '#ffffff', 'center');
      }
      text(ctx, def.name || p.relic, x + cw / 2, y0 + 137, 21, '#f5f7ff', 'center');
      text(ctx, `碎片 ×${shN}`, x + cw / 2, y0 + 174, 16, accent, 'center');

      const bx = x + 14, by = y0 + 211, bw = cw - 28, bh = 42;
      const button = ctx.createLinearGradient(0, by, 0, by + bh);
      button.addColorStop(0, '#f8d76e'); button.addColorStop(1, '#b67b1e');
      fillRoundRect(ctx, bx, by, bw, bh, 11, button);
      strokeRoundRect(ctx, bx, by, bw, bh, 11, '#fff0b5', 1.4);
      if (!drawImg(ctx, IMG_SRC.coin, bx + 49, by + 11, 20, 20)) text(ctx, '🪙', bx + 59, by + 21, 16, '#fff3c4', 'center');
      text(ctx, `${p.price}`, bx + 77, by + 19, 19, '#382600', 'left');
    });

    // 圣遗物宝箱
    text(ctx, '圣遗物宝箱', 55, 835, 26, '#ffffff', 'left');
    const chests = [CONFIG.SHOP_CHEST.wood, CONFIG.SHOP_CHEST.blue, CONFIG.SHOP_CHEST.purple, CONFIG.SHOP_CHEST.gold, CONFIG.SHOP_CHEST.star];
    const cbw = 205, cbh = 228, cgap = 12, chestY = 863;
    chests.forEach((cd, i) => {
      const x = 55 + (i % 3) * (cbw + cgap);
      const cy = chestY + Math.floor(i / 3) * (cbh + 18);
      const left = (s.shopLeft && s.shopLeft[cd.key] !== undefined) ? s.shopLeft[cd.key] : cd.daily;
      const cImg = { wood: IMG_SRC.chestWood, blue: IMG_SRC.chestBronze, purple: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar }[cd.key];
      const bg = ctx.createLinearGradient(x, cy, x + cbw, cy + cbh);
      bg.addColorStop(0, '#2a3442'); bg.addColorStop(0.55, '#1d2837'); bg.addColorStop(1, '#111a27');
      ctx.save(); ctx.shadowColor = cd.color; ctx.shadowBlur = 7;
      fillRoundRect(ctx, x, cy, cbw, cbh, 16, bg); ctx.shadowBlur = 0;
      drawImg(ctx, 'assets/images/interface/shop/card-background-v1.png', x, cy, cbw, cbh);
      strokeRoundRect(ctx, x, cy, cbw, cbh, 16, cd.color, 1.8);
      strokeRoundRect(ctx, x + 5, cy + 5, cbw - 10, cbh - 10, 12, 'rgba(255,255,255,0.10)', 1);
      ctx.restore();
      push('shopChest', { key: cd.key }, x, cy, cbw, cbh);
      if (!drawChest(ctx, cd.key, cImg, x + cbw / 2, cy + 63, 98)) text(ctx, cd.icon, x + cbw / 2, cy + 54, 54, cd.color, 'center');
      text(ctx, cd.name, x + cbw / 2, cy + 122, 20, '#f5f7ff', 'center');

      text(ctx, `剩余 ${left}/${cd.daily}`, x + cbw / 2, cy + 158, 16, left > 0 ? '#a8e6bd' : '#ff8e8e', 'center');

      const by = cy + 183, bh = 34, bx = x + 26, bw = cbw - 52;
      const button = ctx.createLinearGradient(0, by, 0, by + bh);
      button.addColorStop(0, left > 0 ? '#f8d76e' : '#5c626b');
      button.addColorStop(1, left > 0 ? '#b67b1e' : '#393f48');
      fillRoundRect(ctx, bx, by, bw, bh, 10, button);
      strokeRoundRect(ctx, bx, by, bw, bh, 10, left > 0 ? '#fff0b5' : '#727984', 1.2);
      if (!drawImg(ctx, IMG_SRC.coin, bx + 40, by + 7, 18, 18)) text(ctx, '🪙', bx + 49, by + 16, 14, '#fff3c4', 'center');
      text(ctx, `${cd.price}`, bx + 66, by + 16, 17, left > 0 ? '#382600' : '#e3e6eb', 'left');
    });
  }

  // 统一窄长详情弹窗：上半展示商品，下半展示说明、价格与购买操作。
  function shopDetail(ctx, s, push) {
    const p = s.panel, item = p && p.item;
    if (!item) return;
    const w = 400, h = 600, x = (750 - w) / 2, y = Math.round((CONFIG.DESIGN.H - h) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, 750, CONFIG.DESIGN.H);
    push('panelBounds', null, x, y, w, h);
    const accent = item.color || '#f7c948';
    const cardBg = ctx.createLinearGradient(x, y, x, y + h);
    cardBg.addColorStop(0, '#29384b'); cardBg.addColorStop(1, '#151f2d');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
    fillRoundRect(ctx, x, y, w, h, 20, cardBg);
    ctx.shadowBlur = 0;
    drawImg(ctx, 'assets/images/interface/shop/detail-background-v2.png', x, y, w, h);
    ctx.restore();
    push('panelClose', null, x + w - 50, y + 10, 40, 40);
    text(ctx, '×', x + w - 30, y + 30, 28, '#d8c397', 'center');
    let drew = false;
    if (p.kind === 'shard') {
      const src = relicIconSrc(item.relic);
      if (src) drew = drawImg(ctx, src, x + w / 2 - 69, y + 45, 138, 138);
    } else if (p.kind === 'chest') {
      const cImg = { wood: IMG_SRC.chestWood, blue: IMG_SRC.chestBronze, purple: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar }[item.key];
      drew = drawChest(ctx, item.key, cImg, x + w / 2, y + 116, 142);
    }
    if (!drew) text(ctx, item.icon || '❔', x + w / 2, y + 116, 78, '#ffffff', 'center');
    const titleLines = (wrapText ? wrapText(ctx, item.name || '商品', w - 52, 30) : [item.name || '商品']).slice(0, 2);
    const titleY = titleLines.length > 1 ? y + 205 : y + 221;
    titleLines.forEach((ln, i) => text(ctx, ln, x + w / 2, titleY + i * 34, 30, '#ffffff', 'center'));

    const chest = p.kind === 'chest' ? CONFIG.SHOP_CHEST[item.key] : null;
    const shardRange = chest ? [...new Set(chest.shards)].join('～') : '';
    const desc = p.kind === 'shard'
      ? '圣遗物碎片，可用于解锁或提升星级。'
      : (p.kind === 'chest'
        ? `随机获得 ${shardRange} 个${item.rarName || ''}色圣遗物碎片。`
        : (item.desc || ''));
    const lines = (wrapText ? wrapText(ctx, desc, w - 64, 24) : [desc]).slice(0, 3);
    lines.forEach((ln, i) => text(ctx, ln, x + w / 2, y + 300 + i * 32, 24, '#e0e8f3', 'center'));
    const extra = p.kind === 'shard' ? `碎片 ×${item.shards}　金币 ${item.price}`
      : (p.kind === 'chest' ? `剩余 ${item.left} 次　金币 ${item.price}` : `金币 ${item.price}`);
    text(ctx, extra, x + w / 2, y + 442, 22, '#d8e5f2', 'center');

    const bw = w - 64, bh = 62, bx = x + 32, by = y + 512;
    const disabled = (p.kind === 'chest' && item.left <= 0) || (p.kind === 'skill' && item.owned);
    const buy = ctx.createLinearGradient(0, by, 0, by + bh);
    buy.addColorStop(0, disabled ? '#69717b' : '#ffe17a');
    buy.addColorStop(1, disabled ? '#3c444e' : '#c48616');
    fillRoundRect(ctx, bx, by, bw, bh, 13, buy);
    strokeRoundRect(ctx, bx, by, bw, bh, 13, disabled ? '#87909b' : '#fff1b4', 1.6);
    if (disabled) {
      text(ctx, p.kind === 'chest' ? '今日已售罄' : '已解锁', bx + bw / 2, by + bh / 2, 30, '#d6dce3', 'center');
    } else {
      push('shopBuy', null, bx, by, bw, bh);
      text(ctx, '确认购买', bx + bw / 2, by + bh / 2, 32, '#382600', 'center');
    }
  }

  return { menuShop, shopDetail };
}
module.exports = { createMenuShopScreen };
