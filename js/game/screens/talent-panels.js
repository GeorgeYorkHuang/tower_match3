/**
 * talent-panels.js —— 天赋弹窗绘制：分发红卡槽操作、节点详情、测试配置、镶嵌和羁绊自选界面。
 * 复用统一主题背景，登记弹窗边界与按钮供点击交互层处理。
 */
'use strict';
const T = require('../../talents/model.js'),
  Board = require('./talent-board.js'),
  RelicCard = require('./relic-card.js');
const L = require('./talent-layout.js'),
  Gallery = require('./talent-gallery.js');
const { wrap, button } = require('./talent-art.js');
const { fillRoundRect, strokeRoundRect, text } = require('../ui.js');

function frame(ctx, push, drawImg, b, title) {
  ctx.fillStyle = 'rgba(5,15,11,0.68)';
  ctx.fillRect(0, 0, 750, 1626);
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 20, '#193a2b');
  drawImg(ctx, 'assets/images/interface/cards/relic-detail-v1.png', b.x, b.y, b.w, b.h);
  strokeRoundRect(ctx, b.x, b.y, b.w, b.h, 20, '#d4bd7c', 2);
  // 边界供交互层识别点击弹窗外关闭，防止关闭操作误触下层控件。
  push('panelBounds', null, b.x, b.y, b.w, b.h);
  text(ctx, title, b.x + 28, b.y + 34, 25, '#ffe3a1', 'left');
}

function nodeBackground(ctx, drawImg, b, kind) {
  fillRoundRect(ctx, b.x, b.y, b.w, b.h, 12, '#203b2a');
  ctx.save();
  ctx.beginPath();
  require('../ui.js').roundRect(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.clip();
  drawImg(ctx, 'assets/images/interface/cards/relic-detail-v1.png', b.x, b.y, b.w, b.h);
  ctx.restore();
  strokeRoundRect(
    ctx,
    b.x,
    b.y,
    b.w,
    b.h,
    12,
    { white: '#a0a68a', green: '#5a9b6d', purple: '#aa7dcd', gold: '#c49a45' }[kind] || '#bdaa71',
    2
  );
}

function lineCount(ctx, value, width, size) {
  ctx.font = size + 'px sans-serif';
  let line = '',
    n = 1;
  for (const ch of String(value)) {
    if (ch === '\n' || ctx.measureText(line + ch).width > width) {
      n++;
      line = ch === '\n' ? '' : ch;
    } else line += ch;
  }
  return n;
}

function draw(ctx, s, push, drawImg, relicIconSrc) {
  const a = s.talent,
    p = s.panel;
  if (!p) return;
  if (p.type === 'talentSlot') {
    const anchor = p.anchor || Board.slotAnchor(s, p.slot),
      b = L.tooltip({ anchor }, 300, 180),
      id = a.state.slots[p.slot],
      def = T.get(id);
    fillRoundRect(ctx, b.x, b.y, b.w, b.h, 14, '#1d3629');
    drawImg(ctx, 'assets/images/interface/cards/relic-detail-v1.png', b.x, b.y, b.w, b.h);
    strokeRoundRect(ctx, b.x, b.y, b.w, b.h, 14, '#bdad76', 2);
    push('panelBounds', null, b.x, b.y, b.w, b.h);
    if (def) text(ctx, def.name, b.x + 150, b.y + 25, 19, '#f2e1b3', 'center');
    button(ctx, push, 'talentUnequip', p.slot, '卸载圣遗物', b.x + 12, b.y + 48, 276, 56, !!id);
    button(ctx, push, 'talentDetails', p.slot, '镶嵌', b.x + 12, b.y + 114, 276, 56);
    return;
  }
  if (p.type === 'talentTest') {
    const b = { x: 105, y: 550, w: 540, h: 480 };
    frame(ctx, push, drawImg, b, '圣庭红卡测试');
    wrap(
      ctx,
      '选择星级，将六张圣庭红卡按原位装配，方便比较覆盖范围和实际战斗加成。',
      135,
      650,
      480,
      22
    );
    [1, 2, 3].forEach((star, i) =>
      button(ctx, push, 'talentTestPreset', star, '配置' + star + '星', 133 + i * 162, 765, 150, 56)
    );
    text(ctx, '仅修改独立测试档，不影响正常档案', 375, 880, 20, '#d9d7bd', 'center');
    button(ctx, push, 'talentClose', null, '返回', 275, 952, 200, 46);
    return;
  }
  // 按节点类型决定基础尺寸，再根据实际换行数量增高，避免长描述溢出。
  if (p.type === 'talentNode') {
    const kind = p.kind || 'purple',
      w = { white: 180, green: 270, purple: 370, gold: 410 }[kind] || 270,
      base = { white: 84, green: 114, purple: 154, gold: 190 }[kind] || 114,
      h = Math.max(
        base,
        50 + lineCount(ctx, p.description, w - 36, 21) * 32 + (p.cardName ? 42 : 0)
      ),
      b = L.tooltip(p, w, h);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 14;
    nodeBackground(ctx, drawImg, b, kind);
    ctx.shadowBlur = 0;
    push('panelBounds', null, b.x, b.y, b.w, b.h);
    if (p.cardName) text(ctx, p.cardName, b.x + 18, b.y + 27, 19, '#ffe1a1', 'left');
    wrap(ctx, p.description, b.x + 18, b.y + (p.cardName ? 69 : 36), w - 36, 21, '#edf0dc');
    ctx.restore();
    return;
  }
  if (p.type === 'talentSummary') {
    Gallery.summary(ctx, s, push, drawImg, frame);
    return;
  }
  if (p.type === 'talentPicker') {
    Gallery.gallery(ctx, s, push, drawImg, frame);
    return;
  }
  if (p.type === 'talentCenter') {
    center(ctx, s, push, drawImg, relicIconSrc);
    return;
  }
}

// 候选由交互层按解锁状态过滤，复用图鉴卡片并展示其当前星级。
function center(ctx, s, push, drawImg, relicIconSrc) {
  const b = { x: 50, y: 235, w: 650, h: 1190 },
    p = s.panel,
    list = s.talentCenterCandidates || [],
    perPage = T.C.centerPageSize || 12,
    last = Math.max(0, Math.ceil(list.length / perPage) - 1),
    page = Math.max(0, Math.min(last, p.page || 0));
  frame(ctx, push, drawImg, b, '圣庭羁绊 · 圣遗物自选');
  if (!s.talent.rank) {
    wrap(ctx, '同时镶嵌2件圣庭红卡开放R自选；4件开放SR；6件开放SSR。', 100, 440, 550, 25);
    return;
  }
  text(ctx, '选择已解锁圣遗物 · 按当前星级开局生效', 375, 340, 21, '#d1d6bd', 'center');
  const cw = 149,
    ch = 210,
    gap = 24,
    x0 = (750 - (cw * 3 + gap * 2)) / 2;
  if (!list.length) {
    wrap(ctx, '暂无符合羁绊品质的已解锁圣遗物', 100, 440, 550, 25);
    return;
  }
  list.slice(page * perPage, page * perPage + perPage).forEach((d, i) => {
    const x = x0 + (i % 3) * (cw + gap),
      y = 390 + Math.floor(i / 3) * 226;
    RelicCard.draw(
      ctx,
      d,
      { x, y, w: cw, h: ch },
      { star: d.star, rarity: d.rarity, selection: true, selected: s.talent.state.center === d.id },
      drawImg,
      relicIconSrc
    );
    push('talentCenterPick', d.id, x, y, cw, ch);
  });
  button(ctx, push, 'talentPage', -1, '上一页', 95, 1330, 170, 55, page > 0);
  button(ctx, push, 'talentPage', 1, '下一页', 485, 1330, 170, 55, page < last);
  text(ctx, page + 1 + ' / ' + (last + 1), 375, 1358, 23, '#eee0ba', 'center');
}

module.exports = { draw };
