/**
 * relic-pick.js —— 三选一卡片的品质边框与揭示动效。
 * 用弹出后的毫秒数直接计算粒子位置，不创建战斗粒子实体、不使用随机数、不循环发射。
 */
'use strict';
const Styles = require('../../config/relic-pick-ui.js');
const { roundRect, strokeRoundRect } = require('../ui.js');

// 固定采样只在模块初始化时创建，绘制阶段不积累粒子或计时器。
const MOTES = Array.from({ length: 48 }, (_, i) => ({
  angle: i * 2.399963229728653,
  speed: 58 + (i * 37 % 93),
  size: 1.6 + (i * 13 % 18) / 10,
  delay: (i % 7) * 16,
}));

function style(rarity) { return Styles[rarity] || Styles.r; }

function frame(ctx, box, rarity) {
  const s = style(rarity), { x, y, w, h } = box;
  strokeRoundRect(ctx, x, y, w, h, 16, s.edge, rarity === 'ssr' ? 3 : 2.2);
  strokeRoundRect(ctx, x + 5, y + 5, w - 10, h - 10, 12, s.inner, 1);
  // 四角短折线强化完整卡框的品质颜色，避免只靠图标底框区分。
  ctx.save();
  ctx.strokeStyle = s.light;
  ctx.lineWidth = rarity === 'ssr' ? 2 : 1.4;
  for (const [xx, yy, dx, dy] of [[x + 9, y + 9, 1, 1], [x + w - 9, y + 9, -1, 1],
    [x + 9, y + h - 9, 1, -1], [x + w - 9, y + h - 9, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(xx, yy + dy * 16); ctx.lineTo(xx, yy); ctx.lineTo(xx + dx * 16, yy); ctx.stroke();
  }
  ctx.restore();
}

function reveal(ctx, box, age, rarity) {
  const s = style(rarity);
  if (!s.particles || age <= 0 || age >= s.duration) return;
  const { x, y, w } = box, cx = x + w / 2, cy = y + 76;
  ctx.save();
  // 特效限制在当前卡片上半部，不能跨到旁边卡框或覆盖下方说明与按钮。
  roundRect(ctx, x - 6, y - 6, w + 12, 155, 16);
  ctx.clip();
  if (age < s.flashMs) {
    const pulse = Math.sin(Math.PI * age / s.flashMs);
    const flash = ctx.createRadialGradient(cx, cy, 3, cx, cy, rarity === 'ssr' ? 138 : 90);
    flash.addColorStop(0, s.light);
    flash.addColorStop(0.35, s.glow);
    flash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha *= pulse * (rarity === 'ssr' ? 0.95 : 0.4);
    ctx.fillStyle = flash;
    ctx.fillRect(x - 6, y - 6, w + 12, 155);
    // 单次扩散光环；结束后不再绘制。
    ctx.strokeStyle = s.light;
    ctx.lineWidth = rarity === 'ssr' ? 2.5 : 1;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + 82 * age / s.flashMs, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const alpha = ctx.globalAlpha;
  for (let i = 0; i < s.particles; i++) {
    const p = MOTES[i], live = age - p.delay;
    if (live < 0) continue;
    const t = live / 1000, fade = 1 - age / s.duration;
    const px = cx + Math.cos(p.angle) * (18 + p.speed * t);
    const py = cy + Math.sin(p.angle) * (12 + p.speed * t * 0.7) + 38 * t * t;
    ctx.globalAlpha = alpha * fade * (rarity === 'ssr' ? 0.95 : 0.6);
    ctx.fillStyle = i % 3 === 0 ? s.light : s.edge;
    if (i % 4 === 0) {
      // 稀疏十字星点，其余为细小圆粒：金色的数量为紫色的六倍。
      ctx.strokeStyle = s.light; ctx.lineWidth = 1.2;
      const len = p.size * 1.8;
      ctx.beginPath(); ctx.moveTo(px - len, py); ctx.lineTo(px + len, py);
      ctx.moveTo(px, py - len); ctx.lineTo(px, py + len); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(px, py, p.size * (0.5 + fade * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

module.exports = { style, frame, reveal };
