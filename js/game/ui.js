/**
 * ui.js —— 绘制原语（逻辑坐标 750×1334 画布内使用）CommonJS
 */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function text(ctx, str, x, y, size, color, align) {
  ctx.fillStyle = color || '#ffffff';
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

/** 进度条：x,y,w,h 区域，ratio 0~1 */
function progressBar(ctx, x, y, w, h, ratio, fg, bg) {
  fillRoundRect(ctx, x, y, w, h, h / 2, bg || 'rgba(0,0,0,0.45)');
  if (ratio > 0) fillRoundRect(ctx, x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2, fg);
}

/** 按钮：返回命中检测函数 */
function button(ctx, x, y, w, h, label, opts) {
  opts = opts || {};
  fillRoundRect(ctx, x, y, w, h, 12, opts.bg || '#3a3f4b');
  if (opts.stroke) strokeRoundRect(ctx, x, y, w, h, 12, opts.stroke, 2);
  text(ctx, label, x + w / 2, y + h / 2, opts.fontSize || 28, opts.color || '#ffffff', 'center');
  return { hit: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h };
}

module.exports = { roundRect, fillRoundRect, strokeRoundRect, text, progressBar, button };
