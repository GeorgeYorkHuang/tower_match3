/**
 * mail-footer.js —— 邮箱底部按钮：绘制一键领取和删除已领取按钮，以及按下和禁用状态。
 * 按钮仅负责显示和登记点击范围，实际奖励处理由邮箱业务层执行。
 */
'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

function icon(ctx, kind, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'claim') {
    ctx.moveTo(-10, -1);
    ctx.lineTo(-10, 9);
    ctx.lineTo(10, 9);
    ctx.lineTo(10, -1);
    ctx.moveTo(0, -11);
    ctx.lineTo(0, 3);
    ctx.moveTo(-5, -2);
    ctx.lineTo(0, 3);
    ctx.lineTo(5, -2);
  } else {
    ctx.moveTo(-8, -6);
    ctx.lineTo(-7, 10);
    ctx.lineTo(7, 10);
    ctx.lineTo(8, -6);
    ctx.moveTo(-11, -7);
    ctx.lineTo(11, -7);
    ctx.moveTo(-4, -7);
    ctx.lineTo(-4, -11);
    ctx.lineTo(4, -11);
    ctx.lineTo(4, -7);
    ctx.moveTo(-3, -2);
    ctx.lineTo(-3, 5);
    ctx.moveTo(3, -2);
    ctx.lineTo(3, 5);
  }
  ctx.stroke();
  ctx.restore();
}

// 按下时下移并压暗按钮；命中区域保持原位，避免视觉位移影响抬手判定。
function draw(ctx, s, push, key, label, b, enabled, kind) {
  const held = !!(s.mailPressed && s.mailPressed.key === key),
    dy = held ? 3 : 0,
    y = b.y + dy,
    primary = kind === 'claim';
  ctx.save();
  ctx.shadowBlur = 0;
  if (enabled && !held)
    fillRoundRect(ctx, b.x, b.y + 5, b.w, b.h, 13, primary ? '#594720' : '#10251a');
  const gradient = ctx.createLinearGradient(0, y, 0, y + b.h),
    top = !enabled
      ? '#34473a'
      : held
        ? primary
          ? '#bc954d'
          : '#203c2b'
        : primary
          ? '#f2d696'
          : '#476f50',
    bottom = !enabled
      ? '#293b30'
      : held
        ? primary
          ? '#9b7734'
          : '#183122'
        : primary
          ? '#b58b3b'
          : '#284b35';
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  fillRoundRect(ctx, b.x, y, b.w, b.h, 13, gradient);
  strokeRoundRect(
    ctx,
    b.x,
    y,
    b.w,
    b.h,
    13,
    enabled ? (primary ? '#f3dca3' : '#baaa72') : '#5d705c',
    1.6
  );
  if (enabled)
    strokeRoundRect(
      ctx,
      b.x + 4,
      y + 4,
      b.w - 8,
      b.h - 8,
      10,
      held ? 'rgba(0,0,0,.20)' : 'rgba(255,243,204,.24)',
      1
    );
  const ink = !enabled ? '#8b9e85' : primary ? '#30432c' : '#f3e2b7';
  icon(ctx, kind, b.x + 30, y + b.h / 2, ink);
  text(ctx, label, b.x + b.w / 2 + 12, y + b.h / 2, 25, ink, 'center');
  ctx.restore();
  if (enabled) push(key, null, b.x, b.y, b.w, b.h);
}

module.exports = { draw };
