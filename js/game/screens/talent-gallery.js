/**
 * talent-gallery.js —— 天赋滚动弹窗：绘制红卡镶嵌卡片列表和按塔汇总的整体加成。
 * 负责内容裁剪、可见按钮命中及滚动条显示，不直接修改装配存档。
 */
'use strict';
const T = require('../../talents/model.js'),
  L = require('./talent-layout.js');
const { mini, wrap, button } = require('./talent-art.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

// 只登记按钮当前可见的部分，滚出弹窗后不能继续响应点击。
function clipHit(push, vp, key, data, x, y, w, h) {
  const left = Math.max(x, vp.x),
    top = Math.max(y, vp.y),
    right = Math.min(x + w, vp.x + vp.w),
    bottom = Math.min(y + h, vp.y + vp.h);
  if (right > left && bottom > top) push(key, data, left, top, right - left, bottom - top);
}

function drawCard(ctx, s, def, x, y, push, drawImg, vp) {
  const { w, h } = L.card,
    current = s.talent.state.slots[s.panel.slot] === def.id,
    star = T.owned(s.talentMeta, def.id);
  fillRoundRect(ctx, x, y, w, h, 14, '#ecdfb6');
  drawImg(ctx, 'assets/images/interface/cards/relic-detail-v1.png', x, y, w, h);
  strokeRoundRect(ctx, x, y, w, h, 14, current ? '#ffe6a1' : '#ba725a', current ? 3 : 1.5);
  fillRoundRect(ctx, x + 10, y + 12, w - 20, 180, 10, 'rgba(20,45,32,.92)');
  drawImg(ctx, def.icon, x + 18, y + 20, 116, 116);
  mini(ctx, def, x + 114, y + 68, 90);
  text(ctx, def.name, x + w / 2, y + 157, 19, '#ffe6b1', 'center');
  text(ctx, '★'.repeat(star), x + w - 15, y + 29, 17, '#f0cb6e', 'right');
  if (s.testProfile)
    [2, 3].forEach((level, i) =>
      button(
        ctx,
        (key, data, bx, by, bw, bh) => clipHit(push, vp, key, data, bx, by, bw, bh),
        'talentTestStar',
        { id: def.id, star: level },
        level + '星',
        x + w - 78,
        y + 64 + i * 42,
        61,
        34,
        star !== level
      )
    );
  const shade = 'rgba(245,235,202,.96)';
  fillRoundRect(ctx, x + 10, y + 199, w - 20, h - 209, 9, shade);
  if (def.purple.icon) drawImg(ctx, def.purple.icon, x + 17, y + 209, 28, 28);
  text(ctx, def.purple.name, x + 53, y + 224, 20, '#694091', 'left');
  wrap(ctx, def.purple.desc, x + 19, y + 254, w - 38, 17, '#293e32');
  if (def.gold.icon) drawImg(ctx, def.gold.icon, x + 17, y + 315, 28, 28);
  text(ctx, def.gold.name, x + 53, y + 330, 20, '#846019', 'left');
  wrap(ctx, def.gold.desc, x + 19, y + 361, w - 38, 17, '#293e32');
  button(
    ctx,
    (key, data, bx, by, bw, bh) => clipHit(push, vp, key, data, bx, by, bw, bh),
    'talentEquip',
    { slot: s.panel.slot, id: def.id },
    current ? '已镶嵌' : '镶嵌',
    x + 19,
    y + h - 54,
    w - 38,
    40,
    !current
  );
}

function gallery(ctx, s, push, drawImg, frame) {
  const p = s.panel,
    b = L.gallery,
    vp = L.galleryViewport,
    list = L.galleryList(s.talentMeta, p.slot),
    metrics = L.scroll(s.talentMeta, p),
    offset = Math.max(0, Math.min(metrics.max, p.scrollY || 0));
  frame(ctx, push, drawImg, b, '镶嵌圣遗物');
  button(ctx, push, 'talentClose', null, '返回', b.x + b.w - 125, b.y + 13, 104, 42);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  // 两列布局，内容只在固定视口内滚动，不移动弹窗标题与边框。
  list.forEach((d, i) => {
    const x = vp.x + (i % 2) * (L.card.w + L.card.gap),
      y = vp.y + Math.floor(i / 2) * (L.card.h + L.card.rowGap) - offset;
    if (y + L.card.h > vp.y && y < vp.y + vp.h) drawCard(ctx, s, d, x, y, push, drawImg, vp);
  });
  if (!list.length) text(ctx, '暂无可镶嵌的圣遗物', 375, vp.y + 100, 24, '#e4ddc2', 'center');
  ctx.restore();
  if (metrics.max > 0) {
    const track = vp.h,
      thumb = Math.max(44, (track * track) / (track + metrics.max));
    fillRoundRect(ctx, b.x + b.w - 14, vp.y, 4, track, 2, '#52654c');
    fillRoundRect(
      ctx,
      b.x + b.w - 14,
      vp.y + ((track - thumb) * offset) / metrics.max,
      4,
      thumb,
      2,
      '#dfc87f'
    );
  }
}
// 布尔值区分百分比与直接数值；负面时长在汇总中单独以秒显示。
const statLabels = [
  ['attack', '攻击力', false],
  ['speed', '攻速', true],
  ['charge', '三消充能', true],
  ['damage', '伤害', true],
  ['skill', '技能伤害', true],
  ['dot', '负面效果', true],
  ['duration', '负面时长', false],
];

function summary(ctx, s, push, drawImg, frame) {
  const b = L.summary,
    vp = L.summaryViewport,
    metrics = L.scroll(s.talentMeta, s.panel),
    offset = Math.max(0, Math.min(metrics.max, s.panel.scrollY || 0));
  frame(ctx, push, drawImg, b, '天赋整体加成');
  ctx.save();
  ctx.beginPath();
  ctx.rect(vp.x, vp.y, vp.w, vp.h);
  ctx.clip();
  let y = vp.y - offset;
  L.summaryItems(s.talentMeta).forEach((item) => {
    if (y + item.h > vp.y && y < vp.y + vp.h) {
      text(ctx, item.name, vp.x + 18, y + 28, 26, '#ffe3a1', 'left');
      statLabels.forEach(([key, label, percent], i) => {
        const value = item.bonus[key] || 0,
          amount = percent
            ? Math.round(value * 1000) / 10 + '%'
            : key === 'duration'
              ? Math.round(value * 100) / 100 + '秒'
              : value;
        text(
          ctx,
          label + ' +' + amount,
          vp.x + 18 + (i % 2) * 286,
          y + 68 + Math.floor(i / 2) * 31,
          19,
          '#e5edcf',
          'left'
        );
      });
      let py = y + 214;
      item.lines.forEach((line) => {
        text(
          ctx,
          line.name,
          vp.x + 18,
          py,
          20,
          line.kind === 'gold' ? '#f2cc72' : '#d8b0fc',
          'left'
        );
        py = wrap(ctx, line.desc, vp.x + 18, py + 31, vp.w - 36, 18, '#e1e8d0') + 12;
      });
    }
    y += item.h + 18;
  });
  ctx.restore();
  if (metrics.max > 0) {
    const thumb = (vp.h * vp.h) / (vp.h + metrics.max);
    fillRoundRect(ctx, 682, vp.y, 4, vp.h, 2, '#52654c');
    fillRoundRect(ctx, 682, vp.y + ((vp.h - thumb) * offset) / metrics.max, 4, thumb, 2, '#dfc87f');
  }
}

module.exports = { gallery, summary };
