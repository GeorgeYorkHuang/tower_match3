/**
 * mail-list.js —— 邮件列表外观：绘制独立列表底框、滚动条和上下边缘渐隐提示。
 * 所有布局数据取自 mail-ui，保持显示位置与滚动交互一致。
 */
'use strict';
const UI = require('../../config/mail-ui.js');
const { fillRoundRect, strokeRoundRect } = require('../ui.js');

function shell(ctx) {
  const b = UI.listFrame;
  ctx.save();
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, 'rgba(10,28,18,.96)');
  g.addColorStop(0.5, 'rgba(22,47,30,.92)');
  g.addColorStop(1, 'rgba(10,28,18,.96)');
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 16, g);
  strokeRoundRect(ctx, b.x, b.y, b.w, b.h, 16, '#a28b55', 1.6);
  strokeRoundRect(ctx, b.x + 5, b.y + 5, b.w - 10, b.h - 10, 12, 'rgba(189,177,123,.24)', 1);
  ctx.beginPath();
  ctx.moveTo(b.x + 22, b.y + 10);
  ctx.lineTo(b.x + b.w - 22, b.y + 10);
  ctx.strokeStyle = 'rgba(225,207,146,.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// 短列表显示低对比完整滑块；可滚动时用金色突出，并响应拖动中的高亮状态。
function rail(ctx, mails, offset, held) {
  const m = UI.scrollbar(mails, offset),
    b = m.track,
    t = m.thumb;
  ctx.save();
  fillRoundRect(ctx, b.x - 3, b.y - 2, b.w + 6, b.h + 4, 8, '#0c2015');
  strokeRoundRect(ctx, b.x - 3, b.y - 2, b.w + 6, b.h + 4, 8, '#536648', 1);
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 5, '#223e2a');
  const g = ctx.createLinearGradient(t.x, 0, t.x + t.w, 0);
  g.addColorStop(0, m.max > 0 ? (held ? '#f2d995' : '#c4a864') : '#53664d');
  g.addColorStop(1, m.max > 0 ? (held ? '#c69f4d' : '#8d733c') : '#3c543e');
  fillRoundRect(ctx, t.x, t.y, t.w, t.h, 5, g);
  strokeRoundRect(ctx, t.x, t.y, t.w, t.h, 5, m.max > 0 ? '#e0c47d' : '#738369', 1);
  if (m.max > 0) {
    ctx.strokeStyle = '#624d25';
    ctx.lineWidth = 1;
    for (const dy of [-5, 0, 5]) {
      ctx.beginPath();
      ctx.moveTo(t.x + 3, t.y + t.h / 2 + dy);
      ctx.lineTo(t.x + t.w - 3, t.y + t.h / 2 + dy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 仅在相应方向还有内容时绘制渐隐，提示列表可以继续滑动。
function fades(ctx, mails, offset) {
  const vp = UI.viewport,
    max = UI.maximum(mails);
  ctx.save();
  if (offset > 0) {
    const g = ctx.createLinearGradient(0, vp.y, 0, vp.y + 13);
    g.addColorStop(0, 'rgba(10,28,18,.8)');
    g.addColorStop(1, 'rgba(10,28,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(vp.x, vp.y, vp.w, 13);
  }
  if (offset < max) {
    const g = ctx.createLinearGradient(0, vp.y + vp.h - 13, 0, vp.y + vp.h);
    g.addColorStop(0, 'rgba(10,28,18,0)');
    g.addColorStop(1, 'rgba(10,28,18,.8)');
    ctx.fillStyle = g;
    ctx.fillRect(vp.x, vp.y + vp.h - 13, vp.w, 13);
  }
  ctx.restore();
}

module.exports = { shell, rail, fades };
