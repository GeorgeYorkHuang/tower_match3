/**
 * talent-art.js —— 天赋通用绘图：提供六边形、自动换行、按钮和红卡覆盖范围缩略图。
 * 缩略图与实际天赋盘共用形状计算，保证卡片预览的方向一致。
 */
'use strict';
const T = require('../../talents/model.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');
const colors = {
  white: '#d6d4c6',
  green: '#75d58c',
  purple: '#bd91f3',
  slot: '#ee7b72',
  gold: '#f0ca66',
};

function hex(ctx, x, y, r, fill, edge, width = 1.5) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((i * 60 - 30) * Math.PI) / 180,
      px = x + Math.cos(a) * r,
      py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = width;
  ctx.stroke();
}

function wrap(ctx, value, x, y, width, size = 23, color = '#e6e8dd') {
  ctx.font = size + 'px sans-serif';
  let line = '',
    row = 0;
  for (const ch of String(value || '')) {
    if (ch === '\n' || ctx.measureText(line + ch).width > width) {
      text(ctx, line, x, y + row * (size + 11), size, color, 'left');
      line = ch === '\n' ? '' : ch;
      row++;
    } else line += ch;
  }
  if (line) text(ctx, line, x, y + row * (size + 11), size, color, 'left');
  return y + (row + 1) * (size + 11);
}

function button(ctx, push, key, data, label, x, y, w, h, enabled = true) {
  fillRoundRect(ctx, x, y, w, h, 12, enabled ? '#365c45' : '#39423e');
  strokeRoundRect(ctx, x, y, w, h, 12, enabled ? '#c7ae70' : '#666c66', 1.5);
  text(ctx, label, x + w / 2, y + h / 2, 23, enabled ? '#ffebbd' : '#8c9790', 'center');
  if (enabled) push(key, data, x, y, w, h);
}

// 颜色表示首次覆盖该格的星级：一星绿、二星紫、三星金。
// 直接复用模型的固定朝向，避免预览与实际镶嵌形状不一致。
function mini(ctx, def, x, y, w) {
  const s = w / 9,
    cx = x + w / 2,
    cy = y + w / 2,
    tiers = [1, 2, 3].map((k) => new Set(T.shapeOffsets(def, k).map((p) => p.join(','))));
  for (let q = -2; q <= 2; q++)
    for (let r = -2; r <= 2; r++)
      if (Math.abs(q + r) <= 2) {
        const key = q + ',' + r,
          level = tiers.findIndex((t) => t.has(key)),
          col =
            level === 0
              ? colors.green
              : level === 1
                ? colors.purple
                : level === 2
                  ? colors.gold
                  : '#6a756c';
        hex(
          ctx,
          cx + Math.sqrt(3) * s * (q + r / 2),
          cy + 1.5 * s * r,
          s * 0.87,
          level < 0 ? '#25372c' : col,
          '#203428',
          1
        );
      }
  hex(ctx, cx, cy, s * 0.8, '#bd6158', '#ffe0b0', 1.2);
}

module.exports = { hex, wrap, mini, button, colors };
