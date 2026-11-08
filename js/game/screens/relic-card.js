/**
 * relic-card.js —— 圣遗物通用卡片：绘制主题卡底、图标、名称、星级及底部进度条。
 * 复用于圣遗物图鉴和天赋自选；由调用方提供卡片数据、位置及展示状态。
 */
'use strict';
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

function rarityColor(r) {
  return { ur: '#ff5a3c', ssr: '#f7c948', sr: '#a86bff', r: '#5dade2' }[r] || '#b6c5cf';
}

// 绘制胶囊进度条；小比例保留圆头所需宽度，文字独立居中显示。
function capsule(ctx, x, y, w, h, ratio, label, top, bottom) {
  fillRoundRect(ctx, x, y, w, h, h / 2, '#0b0f16');
  strokeRoundRect(ctx, x, y, w, h, h / 2, 'rgba(255,255,255,0.16)', 1);
  if (ratio > 0) {
    const fw = Math.max(h, w * Math.min(1, ratio)),
      g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    fillRoundRect(ctx, x, y, fw, h, h / 2, g);
    fillRoundRect(ctx, x + 4, y + 3, Math.max(h / 2, fw - 8), 5, 2.5, 'rgba(255,255,255,0.45)');
  }
  text(ctx, label, x + w / 2, y + h / 2 + 1, 17, '#ffffff', 'center');
}

// d 为圣遗物数据，b 为卡片位置尺寸，o 为星级、碎片进度或自选状态。
function content(ctx, d, b, o, drawImg, relicIconSrc) {
  const { x, y, w, h } = b,
    star = o.star || 1,
    rc = rarityColor(o.rarity),
    cx = x + w / 2,
    cy = y + 70,
    src = relicIconSrc && relicIconSrc(d.id);
  // 图标尚未加载或绘制失败时，用配置符号兜底，保持卡片内容可辨认。
  if (!(src && drawImg(ctx, src, cx - 52, cy - 52, 104, 104))) {
    ctx.beginPath();
    ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fillStyle = rc;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    text(ctx, d.icon, cx, cy + 2, 44, '#ffffff', 'center');
  }
  text(ctx, '★'.repeat(Math.min(star, 3)), x + w - 10, y + 16, 18, rc, 'right');
  ctx.font = 'bold 24px sans-serif';
  const size = Math.min(24, (24 * (w - 12)) / Math.max(1, ctx.measureText(d.name).width));
  text(ctx, d.name, cx, y + 150, size, '#ffffff', 'center');
  let ratio, label, top, bottom;
  // 自选模式用底条表达选择状态；图鉴模式显示满级、可升星或碎片进度。
  if (o.selection) {
    ratio = o.selected ? 1 : 0;
    label = o.selected ? '当前自选' : '点击选择';
    top = '#f6d67c';
    bottom = '#c48a1a';
  } else {
    const need = (o.nextCost && o.nextCost.shards) || 0,
      sh = o.shards || 0;
    if (star >= 3) {
      ratio = 1;
      label = '已满级';
      top = '#f6d67c';
      bottom = '#c48a1a';
    } else if (need > 0 && sh >= need) {
      ratio = 1;
      label = '可升星';
      top = '#f6d67c';
      bottom = '#c48a1a';
    } else {
      ratio = need > 0 ? Math.min(1, sh / need) : 0;
      label = sh + '/' + need;
      top = '#8fb6ff';
      bottom = '#5b86d6';
    }
  }
  capsule(ctx, x + 12, y + 170, w - 24, 32, ratio, label, top, bottom);
}

// 完整卡片入口：先绘制主题底图和品质边框，再绘制内容；选中状态加亮边框。
function draw(ctx, d, b, o, drawImg, relicIconSrc) {
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 12, '#141d2a');
  drawImg(ctx, 'assets/images/interface/cards/relic-card-v1.png', b.x, b.y, b.w, b.h);
  strokeRoundRect(
    ctx,
    b.x,
    b.y,
    b.w,
    b.h,
    12,
    o.selected ? '#fff0a3' : rarityColor(o.rarity),
    o.selected ? 3 : 1.5
  );
  content(ctx, d, b, o, drawImg, relicIconSrc);
}

module.exports = { draw, content, capsule, rarityColor };
