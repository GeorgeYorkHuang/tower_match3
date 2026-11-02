'use strict';
const CONFIG = require('../../config.js');
const { roundRect, fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// Presentation only: dependencies are shared helpers, never a player save.
const RAR_NAME = { r: '蓝', sr: '紫', ssr: '金', ur: '红' };
const SLOT_NAME = { match4: '四连技', match5: '高连技', chain: '连消技', global: '全局技能' };

function createMenuShopScreen({ drawImg, relicIconSrc, IMG_SRC, skillOwned, panelShell, wrapText }) {
  function menuShop(ctx, s, push) {
    // —— 1. 每日圣遗物碎片精选（0 点刷新，金币购买碎片）——
    text(ctx, '每日碎片精选 · 0 点刷新', 55, 226, 26, '#ffffff', 'left');
    const picks = (s.daily && s.daily.picks) || [];
    const cw = 200, ch = 200, gap = 12;
    picks.slice(0, 3).forEach((p, i) => {
      const cx = 55 + i * (cw + gap);
      const def = CONFIG.relicRunDef(p.relic) || { id: p.relic, name: p.relic, icon: '📿' };
      const rar = p.rar || CONFIG.relicRarity(p.relic);
      const rc = CONFIG.GO.RARITY[rar] || '#4aa3ff';
      fillRoundRect(ctx, cx, 252, cw, ch, 16, '#161d28');
      strokeRoundRect(ctx, cx, 252, cw, ch, 16, rc, 1.4);
      const isz = 76;
      const src = relicIconSrc(p.relic);
      ctx.beginPath(); ctx.arc(cx + cw / 2, 252 + 52, 40, 0, Math.PI * 2);
      ctx.fillStyle = rc; ctx.globalAlpha = 0.16; ctx.fill(); ctx.globalAlpha = 1;
      if (!(src && drawImg(ctx, src, cx + cw / 2 - isz / 2, 252 + 52 - isz / 2, isz, isz))) text(ctx, def.icon || '📿', cx + cw / 2, 252 + 54, 40, '#d9c2ff', 'center');
      text(ctx, def.name || p.relic, cx + cw / 2, 252 + 110, 17, '#ffffff', 'center');
      const shN = p.shards || CONFIG.DAILY.shards[p.rar || CONFIG.relicRarity(p.relic)] || 1;
      text(ctx, `碎片 ×${shN}`, cx + cw / 2, 252 + 136, 16, rc, 'center');
      push('shopShard', { relic: p.relic, shards: shN, price: p.price, icon: def.icon, name: def.name }, cx + cw / 2 - 70, 252 + 150, 140, 40);
      fillRoundRect(ctx, cx + cw / 2 - 70, 252 + 150, 140, 40, 10, '#2c3542');
      strokeRoundRect(ctx, cx + cw / 2 - 70, 252 + 150, 140, 40, 10, '#f7c948', 1.2);
      if (!drawImg(ctx, IMG_SRC.coin, cx + cw / 2 - 52, 252 + 160, 22, 22)) text(ctx, '🪙', cx + cw / 2 - 39, 252 + 171, 18, '#f7c948', 'center');
      text(ctx, `${p.price}`, cx + cw / 2 - 14, 252 + 175, 18, '#f7c948', 'left');
    });
    // —— 2. 圣遗物宝箱（金币购买随机碎片，每日限购；蓝/紫/金 3 档稀有度）——
    text(ctx, '圣遗物宝箱', 55, 500, 26, '#ffffff', 'left');
    const chests = [CONFIG.SHOP_CHEST.blue, CONFIG.SHOP_CHEST.purple, CONFIG.SHOP_CHEST.gold];
    const cbw = 205, cbh = 176, cgap = 12;
    chests.forEach((cd, i) => {
      const cx = 55 + i * (cbw + cgap), cy = 528;
      const left = (s.shopLeft && s.shopLeft[cd.key] !== undefined) ? s.shopLeft[cd.key] : cd.daily;
      const cImg = cd.key === 'blue' ? IMG_SRC.chestBronze : cd.key === 'purple' ? IMG_SRC.chestSilver : IMG_SRC.chestGold;
      push('shopChest', { key: cd.key }, cx, cy, cbw, cbh);
      fillRoundRect(ctx, cx, cy, cbw, cbh, 16, '#1b2230');
      strokeRoundRect(ctx, cx, cy, cbw, cbh, 16, cd.color, 1.5);
      if (!drawImg(ctx, cImg, cx + cbw / 2 - 40.8, cy + 8, 81.6, 81.6)) text(ctx, cd.icon, cx + cbw / 2, cy + 49, 55.2, cd.color, 'center');
      text(ctx, cd.name, cx + cbw / 2, cy + 108, 17, '#ffffff', 'center');
      text(ctx, `随机 ${cd.shards.join('~')} 个碎片 · 剩 ${left}/${cd.daily}`, cx + cbw / 2, cy + 132, 12, left > 0 ? '#9fb2c3' : '#ff6b6b', 'center');
      if (left > 0) {
        fillRoundRect(ctx, cx + cbw / 2 - 45, cy + 142, 90, 32, 9, '#2c3542');
        strokeRoundRect(ctx, cx + cbw / 2 - 45, cy + 142, 90, 32, 9, '#f7c948', 1.2);
        if (!drawImg(ctx, IMG_SRC.coin, cx + cbw / 2 - 38, cy + 149, 16, 16)) text(ctx, '🪙', cx + cbw / 2 - 32, cy + 156, 14, '#f7c948', 'center');
        text(ctx, `${cd.price}`, cx + cbw / 2 - 16, cy + 160, 16, '#f7c948', 'left');
      } else {
        text(ctx, `明日再来 ${left}/${cd.daily}`, cx + cbw / 2, cy + 160, 13, '#ff6b6b', 'center');
      }
    });
    // —— 3. 技能解锁（三消 2 组 + 全局 2 款，金币购买；v1.17.45 连消技配置下架，不再售卖）——
    text(ctx, '技能解锁', 55, 722, 26, '#ffffff', 'left');
    const groups = [
      { slot: 'match4', label: '四连技', items: CONFIG.MATCH_SKILL.match4 },
      { slot: 'match5', label: '高连技', items: CONFIG.MATCH_SKILL.match5 },
      { slot: 'global', label: '全局', items: [
        { id: 'shuffle', name: CONFIG.GLOBAL_SKILL.shuffleSkill.name, mark: CONFIG.GLOBAL_SKILL.shuffleSkill.icon, color: CONFIG.GLOBAL_SKILL.shuffleSkill.color },
        { id: 'refill', name: CONFIG.GLOBAL_SKILL.refillSkill.name, mark: CONFIG.GLOBAL_SKILL.refillSkill.icon, color: CONFIG.GLOBAL_SKILL.refillSkill.color },
      ] },
    ];
    const gcw = 149, gch = 108, ggap = 12, gx0 = 55, gy0 = 752;
    let gi = 0;
    groups.forEach((g) => {
      g.items.forEach((it) => {
        const col = gi % 4, row = Math.floor(gi / 4);
        const cx = gx0 + col * (gcw + ggap), cy = gy0 + row * (gch + 12);
        const owned = skillOwned(s, g.slot, it.id);
        push('shopSkill', { slot: g.slot, id: it.id }, cx, cy, gcw, gch);
        fillRoundRect(ctx, cx, cy, gcw, gch, 12, owned ? '#141d2a' : '#1a1410');
        strokeRoundRect(ctx, cx, cy, gcw, gch, 12, owned ? it.color : '#6b4a2a', owned ? 1.3 : 1);
        text(ctx, it.mark || it.icon || '', cx + gcw / 2, cy + 34, 30, owned ? it.color : '#8f6a45', 'center');
        text(ctx, it.name, cx + gcw / 2, cy + 62, 14, owned ? '#ffffff' : '#b58a5a', 'center');
        if (owned) text(ctx, '已解锁 ✓', cx + gcw / 2, cy + 88, 13, '#7ef0a3', 'center');
        else text(ctx, `🔒 ${CONFIG.SKILL_UNLOCK.price[g.slot]}`, cx + gcw / 2, cy + 88, 14, '#ffb84d', 'center');
        gi++;
      });
    });
  }

  // 商品详情弹窗：展示图标 / 品类标签 / 效果描述 / 价格，确认购买按钮（限购 / 已解锁则置灰说明）
  function shopDetail(ctx, s, push) {
    const p = s.panel;
    const item = p && p.item;
    if (!item) return;
    const oy = panelShell(ctx, s, push, item.name || '商品详情', 780, true);

    // —— 图标 ——
    const icx = 375, icy = oy + 150, dia = 120;
    let drew = false;
    if (p.kind === 'shard') {
      const src = relicIconSrc(item.relic);
      if (src) drew = drawImg(ctx, src, icx - dia / 2, icy - dia / 2, dia, dia);
    } else if (p.kind === 'chest') {
      const cImg = item.key === 'blue' ? IMG_SRC.chestBronze : item.key === 'purple' ? IMG_SRC.chestSilver : IMG_SRC.chestGold;
      drew = drawImg(ctx, cImg, icx - dia / 2, icy - dia / 2, dia, dia);
    }
    if (!drew) {
      ctx.beginPath(); ctx.arc(icx, icy, dia / 2, 0, Math.PI * 2);
      ctx.fillStyle = item.color || '#3a4553'; ctx.globalAlpha = 0.18; ctx.fill(); ctx.globalAlpha = 1;
      text(ctx, item.icon || '❔', icx, icy + 2, 56, '#ffffff', 'center');
    }

    // —— 品类标签 ——
    const tagColor = item.color || '#f7c948';
    let tagText;
    if (p.kind === 'shard') tagText = `◆ ${(item.rar || 'r').toUpperCase()} 圣遗物碎片`;
    else if (p.kind === 'chest') tagText = `随机 ${item.rarName || ''} 碎片宝箱 · 每日限购`;
    else tagText = `${SLOT_NAME[item.slot] || '技能'} · 永久解锁`;
    text(ctx, tagText, 375, oy + 250, 18, tagColor, 'center');

    // —— 效果描述（换行，最多 3 行）——
    const lines = (wrapText ? wrapText(ctx, item.desc || '', 520, 21) : [item.desc || '']).slice(0, 3);
    const descY = oy + 300;
    lines.forEach((ln, i) => text(ctx, ln, 375, descY + i * 28, 21, '#b9c4cf', 'center'));

    // —— 价格行 ——
    const priceY = oy + 470;
    text(ctx, '价格', 375 - 190, priceY, 20, '#8ea3b8', 'left');
    if (!drawImg(ctx, IMG_SRC.coin, 375 - 150, priceY - 12, 24, 24)) text(ctx, '🪙', 375 - 138, priceY, 20, '#f7c948', 'center');
    text(ctx, `${item.price}`, 375 - 118, priceY, 22, '#f7c948', 'left');
    let extra = '';
    if (p.kind === 'shard') extra = `获得碎片 ×${item.shards}`;
    else if (p.kind === 'chest') extra = `今日剩余 ${item.left} 次`;
    text(ctx, extra, 375 + 190, priceY, 20, '#9fb2c3', 'right');

    // —— 确认购买 / 状态 ——
    const bw = 480, bh = 76, bx = 375 - bw / 2, by = oy + 560;
    const disabled = (p.kind === 'chest' && item.left <= 0) || (p.kind === 'skill' && item.owned);
    if (disabled) {
      text(ctx, p.kind === 'chest' ? '今日已售罄，明日再来' : '已解锁', 375, by + bh / 2, 24, '#5a6c80', 'center');
    } else {
      push('shopBuy', null, bx, by, bw, bh);
      const bg = ctx.createLinearGradient(0, by, 0, by + bh);
      bg.addColorStop(0, '#f7c948'); bg.addColorStop(1, '#d99e16');
      fillRoundRect(ctx, bx, by, bw, bh, 20, bg);
      strokeRoundRect(ctx, bx, by, bw, bh, 20, 'rgba(255,255,255,0.4)', 2);
      text(ctx, '确认购买', 375, by + bh / 2, 28, '#3a2600', 'center');
    }
    if (p.kind === 'shard') text(ctx, '碎片用于解锁或提升圣遗物星级', 375, by + bh + 34, 17, '#5a6c80', 'center');
  }

  return { menuShop, shopDetail };
}
module.exports = { createMenuShopScreen };
