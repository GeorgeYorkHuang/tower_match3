'use strict';
const CONFIG = require('../../config.js');
const UI = require('../../config/chest-rewards.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

function rewardsFor(gain) {
  const entries = Object.entries(gain.shardDetail || {}).filter(([, n]) => Number(n) > 0)
    .map(([id, n]) => ({ kind: 'relic', id, count: Number(n) }));
  if (gain.dust > 0) entries.push({ kind: 'dust', count: gain.dust });
  if (gain.diamond > 0) entries.push({ kind: 'diamond', count: gain.diamond });
  if (gain.gold > 0) entries.push({ kind: 'gold', count: gain.gold }); // Coins always land last.
  return entries;
}
function geometry(count) {
  const rows = Math.max(1, Math.ceil(count / UI.columns));
  const h = 252 + rows * UI.rowStep;
  return { x: (CONFIG.DESIGN.W - UI.panelW) / 2, y: (CONFIG.DESIGN.H - h) / 2, w: UI.panelW, h, rows };
}
function createChestRewards({ drawImg, IMG_SRC, relicIconSrc, now = () => Date.now() }) {
  function draw(ctx, panel, push) {
    const entries = rewardsFor(panel.gain || {}), box = geometry(entries.length);
    const elapsed = typeof panel.openedAt === 'number' ? Math.max(0, now() - panel.openedAt) : Infinity;
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,16,0.78)'; ctx.fillRect(0, 0, CONFIG.DESIGN.W, CONFIG.DESIGN.H);
    fillRoundRect(ctx, box.x, box.y, box.w, box.h, 24, '#17202c');
    strokeRoundRect(ctx, box.x, box.y, box.w, box.h, 24, '#d6ad56', 2);
    const glow = ctx.createLinearGradient(0, box.y, 0, box.y + 150);
    glow.addColorStop(0, 'rgba(250,204,95,0.20)'); glow.addColorStop(1, 'rgba(250,204,95,0)');
    ctx.fillStyle = glow; ctx.fillRect(box.x + 2, box.y + 2, box.w - 4, 148);
    push('panelBounds', null, box.x, box.y, box.w, box.h);
    const tiers = { scarlet:require('../../economy/diamond-shop.js').OFFERS.scarlet.icon, wood: IMG_SRC.chestWood, bronze: IMG_SRC.chestBronze, silver: IMG_SRC.chestSilver, gold: IMG_SRC.chestGold, star: IMG_SRC.chestStar };
    if (!drawImg(ctx, tiers[panel.tier] || IMG_SRC.chestOpen, 339, box.y + 22, 72, 72)) text(ctx, '宝箱', 375, box.y + 57, 25, '#ffdc80', 'center');
    text(ctx, '宝箱收益', 375, box.y + 119, UI.titleSize, '#ffe3a1', 'center');
    const rewardY = box.y + 152;
    fillRoundRect(ctx, box.x + 22, rewardY, box.w - 44, UI.rowStep * box.rows, 18, '#101824');
    strokeRoundRect(ctx, box.x + 22, rewardY, box.w - 44, UI.rowStep * box.rows, 18, 'rgba(222,189,117,0.24)', 1);
    entries.forEach((en, i) => {
      const p = Math.max(0, Math.min(1, (elapsed - UI.revealDelay - i * UI.revealGap) / UI.popMs));
      if (p <= 0) return;
      const row = Math.floor(i / UI.columns), col = i % UI.columns;
      const count = Math.min(UI.columns, entries.length - row * UI.columns);
      const rowW = count * UI.cardW + (count - 1) * UI.gap;
      const x = (CONFIG.DESIGN.W - rowW) / 2 + col * (UI.cardW + UI.gap), y = rewardY + 20 + row * UI.rowStep;
      const q = p - 1, scale = 1 + 2.70158 * q * q * q + 1.70158 * q * q;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 3);
      ctx.translate(x + UI.cardW / 2, y + UI.cardH / 2 - 28 * (1 - p) * (1 - p));
      ctx.scale(Math.max(0.05, scale), Math.max(0.05, scale));
      ctx.translate(-UI.cardW / 2, -UI.cardH / 2);
      if (en.kind === 'relic') {
        const def = CONFIG.relicRunDef(en.id), rarity = CONFIG.relicRarity(en.id);
        const tint = CONFIG.GO.RARITY[rarity] || '#bf93ff';
        fillRoundRect(ctx, 0, 0, UI.cardW, UI.cardH, 12, '#263141');
        strokeRoundRect(ctx, 0, 0, UI.cardW, UI.cardH, 12, tint, 2.2);
        const src = relicIconSrc(en.id), ix = (UI.cardW - UI.iconSize) / 2;
        if (!src || !drawImg(ctx, src, ix, 8, UI.iconSize, UI.iconSize)) {
          fillRoundRect(ctx, ix, 8, UI.iconSize, UI.iconSize, 15, '#35465e');
          text(ctx, def ? def.name.charAt(0) : '✦', UI.cardW / 2, 59, 43, tint, 'center');
        }
        const name = def ? def.name : en.id;
        const font = Math.min(UI.nameSize, (UI.cardW - 12) / Math.max(1, name.length));
        text(ctx, name, UI.cardW / 2, UI.cardH - 19, font, '#f3f6fc', 'center');
      } else if (en.kind === 'gold') {
        const halo = ctx.createRadialGradient(UI.cardW / 2, 72, 8, UI.cardW / 2, 72, 75);
        halo.addColorStop(0, 'rgba(255,211,76,0.35)'); halo.addColorStop(1, 'rgba(255,211,76,0)');
        ctx.fillStyle = halo; ctx.fillRect(-13, -3, UI.cardW + 26, UI.cardH);
        if (!drawImg(ctx, IMG_SRC.coin, (UI.cardW - UI.coinSize) / 2, 14, UI.coinSize, UI.coinSize)) {
          ctx.fillStyle = '#f7c948'; ctx.beginPath(); ctx.arc(UI.cardW / 2, 72, 48, 0, Math.PI * 2); ctx.fill();
          text(ctx, '金', UI.cardW / 2, 72, 38, '#7a4d12', 'center');
        }
      } else if (en.kind === 'dust') {
        text(ctx, '✦', UI.cardW / 2, 67, 76, '#dfbdff', 'center');
        text(ctx, '圣物粉尘', UI.cardW / 2, UI.cardH - 19, UI.nameSize, '#dfbdff', 'center');
      } else {
        text(ctx, en.kind === 'diamond' ? '💎' : '✪', UI.cardW / 2, 67, 76, en.kind === 'diamond' ? '#8fdcff' : '#d2b0ff', 'center');
        text(ctx, en.kind === 'diamond' ? '钻石' : '钻石', UI.cardW / 2, UI.cardH - 19, UI.nameSize, '#dbe5f3', 'center');
      }
      text(ctx, '×' + en.count.toLocaleString('en-US'), UI.cardW / 2, UI.cardH + 20, UI.countSize, en.kind === 'gold' ? '#ffe08a' : '#e5d9ff', 'center');
      ctx.restore();
    });
    if (!entries.length) text(ctx, '暂无收益', 375, rewardY + 98, 22, '#9cabc0', 'center');
    const by = box.y + box.h - 78;
    fillRoundRect(ctx, 250, by, 250, 54, 27, '#d2ad5f');
    text(ctx, '收 下', 375, by + 27, 25, '#29221a', 'center');
    push('panelClose', null, 250, by, 250, 54);
    ctx.restore();
  }
  return { draw };
}
module.exports = { createChestRewards, rewardsFor, geometry };
