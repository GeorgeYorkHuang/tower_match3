/**
 * talent-socket.js —— 天赋六边形凹槽：绘制中央、紫色、金色和红卡槽的凹陷底座与镶嵌图标。
 * 红槽使用独立的红色材质；其余槽位采用相近的石质结构。
 */
'use strict';
// 中央、紫色、金色槽共用凹陷结构，红槽保留独立的红色材质。
const palettes = {
  center: { rim: '#b1b9a5', dark: '#151f1c', wall: '#465347', light: '#bdc7b3', accent: '#9ac3b3' },
  purple: { rim: '#a69aaf', dark: '#1d1926', wall: '#51475c', light: '#c9bad5', accent: '#b993e1' },
  gold: { rim: '#b6a178', dark: '#241e14', wall: '#645235', light: '#dfc899', accent: '#e3bc63' },
  red: { rim: '#b56a62', dark: '#291318', wall: '#743b40', light: '#e0a38a', accent: '#ef7168' },
};

function points(x, y, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 30) * Math.PI) / 180;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  });
}

function path(ctx, p) {
  ctx.beginPath();
  p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function polygon(ctx, p, fill, edge, width = 1) {
  path(ctx, p);
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function draw(ctx, x, y, r, kind, active, src, drawImg) {
  const p = palettes[kind] || palettes.center,
    red = kind === 'red',
    outer = points(x, y, r),
    mouth = points(x, y, r * 0.86),
    floor = points(x, y + r * 0.025, r * 0.71);
  ctx.save();
  ctx.shadowBlur = 0;
  polygon(ctx, outer, red ? '#593034' : '#444b43', '#121a16', 2.2);
  // 上沿压暗、下沿提亮，形成向内凹陷而非向外凸起的视觉。
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6,
      lower = (outer[i][1] + outer[j][1]) / 2 > y;
    polygon(ctx, [outer[i], outer[j], mouth[j], mouth[i]], lower ? p.light : p.wall);
  }
  polygon(ctx, mouth, p.dark, active ? p.accent : p.rim, 1.3);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6,
      lower = (mouth[i][1] + mouth[j][1]) / 2 > y;
    polygon(ctx, [mouth[i], mouth[j], floor[j], floor[i]], lower ? p.wall : '#090f0e');
  }
  polygon(ctx, floor, p.dark, '#080e0c', 1);
  // 紫槽允许未激活时插入灰色图标；其他槽位只在激活后显示镶嵌图。
  if ((active || kind === 'purple') && src && drawImg) {
    ctx.save();
    path(ctx, points(x, y, r * 0.82));
    ctx.clip();
    drawImg(ctx, src, x - r * 0.94 * 0.9, y - r * 0.94 * 0.9, r * 1.88 * 0.9, r * 1.88 * 0.9);
    ctx.restore();
    // 图标裁进六边形内部，再叠加内阴影和细边，表现嵌入凹槽的深度。
    const a = points(x, y, r * 0.83);
    ctx.beginPath();
    ctx.moveTo(...a[3]);
    ctx.lineTo(...a[4]);
    ctx.lineTo(...a[5]);
    ctx.lineTo(...a[0]);
    ctx.strokeStyle = 'rgba(0,0,0,.66)';
    ctx.lineWidth = r * 0.075;
    ctx.stroke();
    path(ctx, a);
    ctx.strokeStyle = active ? p.accent : '#7b827b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    const small = points(x, y + r * 0.025, r * 0.34);
    path(ctx, small);
    ctx.strokeStyle = red ? '#813f45' : p.wall;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, y + r * 0.12);
    ctx.lineTo(x + r * 0.15, y + r * 0.12);
    ctx.strokeStyle = '#0a100d';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (red) {
    for (let i = 0; i < 6; i += 2) {
      const [px, py] = outer[i];
      polygon(
        ctx,
        points(x + (px - x) * 0.94, y + (py - y) * 0.94, r * 0.065),
        active ? '#ffd0a0' : '#a65b58'
      );
    }
  }
  ctx.restore();
}

module.exports = { draw, palettes };
